import {
  type ExtraSettings,
  type Proxy,
  type ProxyGroupConfig,
  type RequestSettings,
  type RulesetConfig,
  type RulesetContent,
  type TargetFormat,
  RulesetType,
  createExtraSettings,
  parseSubscription,
} from "@subconverter/core";
import { readFile, writeFile } from "node:fs/promises";

/** Options for {@link loadSubscription}. */
export interface LoadOptions {
  /** Optional request headers (e.g. `User-Agent`, `Authorization`). */
  headers?: Record<string, string>;
  /** Optional proxy to route the request through (not yet supported). */
  proxy?: string;
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
}

/** Fetch a remote subscription body as text. */
export async function fetchSubscription(url: string, options: LoadOptions = {}): Promise<string> {
  const controller = new AbortController();
  const timeout = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "subconverter-ts", ...options.headers },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

/** Read a local subscription/config file as text. */
export async function readSubscriptionFile(path: string): Promise<string> {
  return readFile(path, "utf-8");
}

/** Write generated output to a local file. */
export async function writeOutputFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf-8");
}

/** A subscription source: a URL, a local path, or an inline body. */
export type SubscriptionSource =
  | { kind: "url"; url: string; headers?: Record<string, string> }
  | { kind: "file"; path: string }
  | { kind: "text"; text: string };

/** Resolve any {@link SubscriptionSource} to raw text. */
export async function resolveSubscription(source: SubscriptionSource): Promise<string> {
  switch (source.kind) {
    case "url":
      return fetchSubscription(source.url, { headers: source.headers });
    case "file":
      return readSubscriptionFile(source.path);
    case "text":
      return source.text;
    default:
      throw new Error("Unknown subscription source");
  }
}

/** Load and parse a subscription source into proxy nodes. */
export async function loadNodes(source: SubscriptionSource): Promise<Proxy[]> {
  return parseSubscription(await resolveSubscription(source));
}

/** A fully-resolved conversion request. */
export interface ConvertRequest {
  sources: SubscriptionSource[];
  target: TargetFormat;
  extraProxyGroup?: ProxyGroupConfig[];
  rulesets?: RulesetConfig[];
  settings?: Partial<ExtraSettings>;
}

/** Resolved inputs for the core generation layer. */
export interface ConvertInput {
  nodes: Proxy[];
  target: TargetFormat;
  extraProxyGroup: ProxyGroupConfig[];
  rulesets: RulesetContent[];
  settings: ExtraSettings;
}

/** Resolved inputs for the core generation layer. */
export interface ConvertInput {
  nodes: Proxy[];
  target: TargetFormat;
  extraProxyGroup: ProxyGroupConfig[];
  settings: ExtraSettings;
}

const RULESET_TYPE_PREFIXES: Array<[string, RulesetType]> = [
  ["surge:", RulesetType.Surge],
  ["quanx:", RulesetType.QuantumultX],
  ["quantumultx:", RulesetType.QuantumultX],
  ["clash-domain:", RulesetType.ClashDomain],
  ["clash-ipcidr:", RulesetType.ClashIpCidr],
  ["clash-classic:", RulesetType.ClashClassical],
  ["clash:", RulesetType.ClashClassical],
];

/** Infer a ruleset dialect from content when no explicit hint is given. */
export function detectRulesetType(content: string): RulesetType {
  if (/^payload:\r?\n/.test(content.trim())) {
    return RulesetType.ClashDomain;
  }
  const first = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("#") && !line.startsWith(";"));
  if (first) {
    if (/^(host|host-suffix|host-keyword)/i.test(first)) {
      return RulesetType.QuantumultX;
    }
    if (/^ip6-cidr/i.test(first)) {
      return RulesetType.QuantumultX;
    }
  }
  return RulesetType.Surge;
}

/** Resolve a ruleset source string into a URL/path plus its dialect. */
export function parseRulesetSource(source: string): { url: string; type?: RulesetType } {
  for (const [prefix, type] of RULESET_TYPE_PREFIXES) {
    if (source.toLowerCase().startsWith(prefix)) {
      return { type, url: source.slice(prefix.length) };
    }
  }
  return { url: source };
}

/** Fetch or read a ruleset body and normalize it into a {@link RulesetContent}. */
export async function loadRuleset(
  config: RulesetConfig,
  options: LoadOptions = {},
): Promise<RulesetContent> {
  const { type, url } = parseRulesetSource(config.url);
  let content = "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    content = await fetchSubscription(url, options);
  } else if (url !== "") {
    content = await readSubscriptionFile(url);
  }
  return {
    content,
    ruleGroup: config.group,
    rulePath: config.url,
    rulePathTyped: config.url,
    ruleType: type ?? detectRulesetType(content),
    updateInterval: config.interval,
  };
}

/** Fetch/read every configured ruleset, skipping failures. */
export async function collectRulesets(
  configs: RulesetConfig[],
  options: LoadOptions = {},
): Promise<RulesetContent[]> {
  const results: RulesetContent[] = [];
  for (const config of configs) {
    try {
      results.push(await loadRuleset(config, options));
    } catch {
      results.push({
        content: "",
        ruleGroup: config.group,
        rulePath: config.url,
        rulePathTyped: config.url,
        ruleType: RulesetType.Surge,
        updateInterval: config.interval,
      });
    }
  }
  return results;
}

/** Load every source and merge the resulting nodes. */
export async function collectNodes(sources: SubscriptionSource[]): Promise<Proxy[]> {
  const all: Proxy[] = [];
  for (const source of sources) {
    all.push(...(await loadNodes(source)));
  }
  return all;
}

/** Build the generation input for a {@link ConvertRequest}. */
export async function prepareConversion(request: ConvertRequest): Promise<ConvertInput> {
  return {
    extraProxyGroup: request.extraProxyGroup ?? [],
    nodes: await collectNodes(request.sources),
    rulesets: await collectRulesets(request.rulesets ?? []),
    settings: { ...createExtraSettings(), ...request.settings },
    target: request.target,
  };
}

/** Default {@link RequestSettings} derived from a conversion target. */
export function defaultRequestSettings(target: TargetFormat): RequestSettings {
  return {
    addEmoji: false,
    appendType: false,
    autoExtract: false,
    clashScript: false,
    classicalRuleset: false,
    emoji: [],
    excludeRemarks: [],
    filterDeprecated: false,
    group: [],
    includeRemarks: [],
    insert: false,
    interval: 0,
    list: false,
    mixin: "",
    newFieldName: false,
    nodeList: false,
    proxiesStyle: "flow",
    proxyGroupsStyle: "flow",
    removeEmoji: false,
    rename: [],
    ruleset: [],
    script: "",
    scv: undefined,
    sort: false,
    target,
    tfo: undefined,
    tls13: undefined,
    udp: undefined,
    uploadPath: "",
    url: "",
  };
}
