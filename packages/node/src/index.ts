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
  createRequestSettings,
  getDefaultProxyGroups,
  getDefaultRulesetConfigs,
  getDefaultRulesets,
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
  /** Abort when the response body exceeds this many bytes. */
  maxBytes?: number;
}

/** Default cap for a single fetched body (mirrors the server limit). */
export const MAX_FETCH_BYTES = 5 * 1024 * 1024;

/**
 * Read a `Response` body as text while enforcing `maxBytes`.
 * Shared by `fetchSubscription` and the HTTP server so both entrypoints
 * enforce the same cap with the same semantics.
 */
export async function readCappedText(response: Response, maxBytes: number): Promise<string> {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader !== null) {
    const declared = Number.parseInt(lengthHeader.trim(), 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw Object.assign(new Error("Response body exceeds size limit"), { statusCode: 502 });
    }
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxBytes) {
      throw Object.assign(new Error("Response body exceeds size limit"), { statusCode: 502 });
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw Object.assign(new Error("Response body exceeds size limit"), { statusCode: 502 });
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
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
    return readCappedText(response, options.maxBytes ?? MAX_FETCH_BYTES);
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
  /**
   * When `false`, rules are stripped. Defaults to `true`: with no explicit
   * `rulesets`/`extraProxyGroup`, fall back to the bundled upstream-like
   * defaults (`ACL4SSR`). Maps to core `GenerateOptions.includeRules`.
   */
  includeRules?: boolean;
}

/** Resolved inputs for the core generation layer. */
export interface ConvertInput {
  nodes: Proxy[];
  target: TargetFormat;
  extraProxyGroup: ProxyGroupConfig[];
  rulesets: RulesetContent[];
  settings: ExtraSettings;
  includeRules?: boolean;
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
  if (url.startsWith("[]")) {
    content = url;
  } else if (url.startsWith("http://") || url.startsWith("https://")) {
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

/** Fetch/read every configured ruleset concurrently, skipping failures. */
export async function collectRulesets(
  configs: RulesetConfig[],
  options: LoadOptions = {},
): Promise<RulesetContent[]> {
  return Promise.all(
    configs.map(async (config) => {
      try {
        return await loadRuleset(config, options);
      } catch {
        return {
          content: "",
          ruleGroup: config.group,
          rulePath: config.url,
          rulePathTyped: config.url,
          ruleType: RulesetType.Surge,
          updateInterval: config.interval,
        };
      }
    }),
  );
}

const DEFAULT_RULESET_TTL_MS = 10 * 60 * 1000;
let cachedDefaultRulesets: { at: number; data: RulesetContent[] } | undefined;
let inflightDefaultRulesets: Promise<RulesetContent[]> | undefined;

/** Clear the cached default rulesets (tests only). */
export function clearDefaultRulesetCache(): void {
  cachedDefaultRulesets = undefined;
  inflightDefaultRulesets = undefined;
}

/**
 * Resolve the bundled upstream-like remote defaults, caching the result with
 * a TTL and single-flight so concurrent conversions share one fetch batch.
 * Falls back to the bundled offline rules when fetching fails.
 */
export async function getCachedDefaultRulesets(): Promise<RulesetContent[]> {
  const now = Date.now();
  if (cachedDefaultRulesets && now - cachedDefaultRulesets.at < DEFAULT_RULESET_TTL_MS) {
    return cachedDefaultRulesets.data;
  }
  if (inflightDefaultRulesets) {
    return inflightDefaultRulesets;
  }
  inflightDefaultRulesets = (async () => {
    try {
      const fetched = await collectRulesets(getDefaultRulesetConfigs(), { timeoutMs: 15000 });
      const data = fetched.some((entry) => entry.content !== "") ? fetched : getDefaultRulesets();
      cachedDefaultRulesets = { at: Date.now(), data };
      return data;
    } catch {
      const data = getDefaultRulesets();
      cachedDefaultRulesets = { at: Date.now(), data };
      return data;
    } finally {
      inflightDefaultRulesets = undefined;
    }
  })();
  return inflightDefaultRulesets;
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
  const includeRules = request.includeRules ?? true;
  const extraProxyGroup =
    includeRules !== false && (!request.extraProxyGroup || request.extraProxyGroup.length === 0)
      ? getDefaultProxyGroups()
      : (request.extraProxyGroup ?? []);
  let rulesets: RulesetContent[];
  if (includeRules === false) {
    rulesets = [];
  } else if (request.rulesets && request.rulesets.length > 0) {
    rulesets = await collectRulesets(request.rulesets);
  } else {
    // Prefer the full upstream-like remote lists (cached with TTL), falling
    // back to the bundled offline rules when fetching fails (e.g. offline CI).
    rulesets = await getCachedDefaultRulesets();
  }
  return {
    extraProxyGroup,
    includeRules,
    nodes: await collectNodes(request.sources),
    rulesets,
    settings: { ...createExtraSettings(), ...request.settings },
    target: request.target,
  };
}

export {
  collectRequestUrls,
  contentTypeForTarget,
  convertSubRequest,
  createSubServer,
  fetchSubscriptionDetailed,
  fetchUserinfoHeader,
  splitSubscriptionUrls,
  startServer,
  type ServeOptions,
  type SubConversion,
} from "./server";

/** Default {@link RequestSettings} derived from a conversion target. */
export function defaultRequestSettings(target: TargetFormat): RequestSettings {
  return {
    ...createRequestSettings(),
    target,
  };
}
