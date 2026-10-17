import {
  type ExtraSettings,
  type ProxyGroupConfig,
  type RequestSettings,
  type RulesetConfig,
  type RulesetContent,
  type TargetFormat,
  RulesetType,
  convertUserinfo,
  createExtraSettings,
  createSelectGroup,
  generate,
  getAllUrlArgs,
  getDefaultProxyGroups,
  getUrlArg,
  inferUserinfoProviderFromUrl,
  parseExternalConfig,
  parseRulesetConfig,
  parseRequestSettings,
  parseSubscription,
  queryBoolFlag,
} from "@subconverter/core";
import { lookup as dnsLookup } from "node:dns/promises";
import { createServer as createHttpServer, type Server, type ServerResponse } from "node:http";

import {
  detectRulesetType,
  getCachedDefaultRulesets,
  MAX_FETCH_BYTES,
  parseRulesetSource,
  readCappedText,
} from "./index";

/** Options for {@link startServer}. */
export interface ServeOptions {
  /** Bind address (default `0.0.0.0` for Docker; use `127.0.0.1` locally). */
  host?: string;
  /** TCP port to listen on (default `25500`). */
  port?: number;
}

/** Result of converting one `/sub` HTTP request. */
export interface SubConversion {
  body: string;
  contentType: string;
  filename: string;
  profileUpdateInterval?: string;
  userinfo?: string;
}

const VALID_TARGETS = new Set<string>([
  "clash",
  "clashr",
  "surge",
  "surfboard",
  "quanx",
  "quan",
  "loon",
  "mellow",
  "v2ray",
  "trojan",
  "ssd",
  "ss",
  "sssub",
  "ssr",
  "singbox",
  "mixed",
  "nodelist",
]);

const TARGET_FILENAMES: Record<string, string> = {
  clash: "clash.yaml",
  clashr: "clashr.yaml",
  loon: "loon.conf",
  mellow: "mellow.conf",
  mixed: "mixed.txt",
  nodelist: "nodelist.txt",
  quan: "quan.conf",
  quanx: "quanx.conf",
  singbox: "singbox.json",
  ss: "ss.txt",
  ssd: "ssd.txt",
  ssr: "ssr.txt",
  sssub: "sssub.json",
  surfboard: "surfboard.conf",
  surge: "surge.conf",
  trojan: "trojan.txt",
  v2ray: "v2ray.txt",
};

/** Hard limits for the unauthenticated `/sub` endpoint (DoS mitigation). */
const MAX_SUBSCRIPTION_URLS = 5;
const MAX_RULESETS = 20;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15000;
/** Single-fetch body cap; shared with `fetchSubscription` via `MAX_FETCH_BYTES`. */
const MAX_BODY_BYTES = MAX_FETCH_BYTES;

/** Parse a dotted IPv4 hostname into a 32-bit int; `undefined` when not IPv4. */
function parseIPv4(host: string): number | undefined {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return undefined;
  }
  let value = 0;
  for (const part of parts) {
    if (part === undefined || part === "") {
      return undefined;
    }
    let base = 10;
    let digits = part;
    if (/^0x[0-9a-f]+$/i.test(part)) {
      base = 16;
      digits = part.slice(2);
    } else if (/^0[0-7]*$/.test(part) && part.length > 1) {
      base = 8;
    } else if (!/^\d+$/.test(part)) {
      return undefined;
    }
    const octet = Number.parseInt(digits, base);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return undefined;
    }
    value = value * 256 + octet;
  }
  return value;
}

/**
 * `true` when a 32-bit IPv4 int targets loopback, private, link-local,
 * CGNAT, multicast, or unspecified space — i.e. addresses that can reach
 * cloud metadata or the host itself. Documentation/benchmarking ranges are
 * deliberately *not* blocked (unroutable, harmless, and sandbox DNS often
 * maps test domains into them).
 */
function isBlockedIPv4Int(ipv4: number): boolean {
  const b0 = Math.floor(ipv4 / 16777216) % 256;
  const b1 = Math.floor(ipv4 / 65536) % 256;
  if (b0 === 127 || b0 === 0 || b0 >= 224) {
    return true;
  }
  if (b0 === 10) {
    return true;
  }
  if (b0 === 172 && b1 >= 16 && b1 <= 31) {
    return true;
  }
  if (b0 === 192 && b1 === 168) {
    return true;
  }
  if (b0 === 169 && b1 === 254) {
    return true;
  }
  if (b0 === 100 && b1 >= 64 && b1 <= 127) {
    return true;
  }
  return false;
}

/**
 * Extract the embedded IPv4 value from an IPv4-mapped IPv6 address
 * (`::ffff:1.2.3.4` or `::ffff:7f00:1`); `undefined` when not mapped.
 */
function mappedIPv4(host: string): number | undefined {
  if (!host.includes(":")) {
    return undefined;
  }
  if (host.includes(".")) {
    const dotted = host.slice(host.lastIndexOf(":") + 1);
    return parseIPv4(dotted);
  }
  if (!host.toLowerCase().startsWith("::ffff:")) {
    return undefined;
  }
  const tail = host.slice("::ffff:".length).split(":");
  if (tail.length !== 2) {
    return undefined;
  }
  const hi = Number.parseInt(tail[0] as string, 16);
  const lo = Number.parseInt(tail[1] as string, 16);
  if (
    !Number.isInteger(hi) ||
    !Number.isInteger(lo) ||
    hi < 0 ||
    hi > 0xffff ||
    lo < 0 ||
    lo > 0xffff
  ) {
    return undefined;
  }
  return hi * 65536 + lo;
}

/** `true` when a bare (bracket-stripped) IPv6 address is non-public. */
function isBlockedIPv6(host: string): boolean {
  if (host === "::1" || host === "::") {
    return true;
  }
  const mapped = mappedIPv4(host);
  if (mapped !== undefined) {
    return isBlockedIPv4Int(mapped);
  }
  // fc00::/7 (unique-local): first hextet fc00-fdff.
  if (host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }
  // fe80::/10 (link-local): first hextet fe80-febf.
  const firstHextet = host.split(":", 1)[0] as string;
  const first = Number.parseInt(firstHextet, 16);
  if (Number.isInteger(first) && first >= 0xfe80 && first <= 0xfebf) {
    return true;
  }
  // ff00::/8 (multicast).
  if (host.startsWith("ff")) {
    return true;
  }
  return false;
}

/** `true` when a hostname must never be fetched server-side (SSRF guard). */
function isBlockedHost(hostname: string): boolean {
  // `URL.hostname` preserves brackets for IPv6 literals; strip them so the
  // IPv4/IPv6 checks below see one normalized form.
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (host === "" || host === "localhost" || host === "metadata.google.internal") {
    return true;
  }
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) {
    return true;
  }
  const ipv4 = parseIPv4(host);
  if (ipv4 !== undefined) {
    return isBlockedIPv4Int(ipv4);
  }
  if (host.includes(":")) {
    return isBlockedIPv6(host);
  }
  return false;
}

/**
 * Resolve a non-literal hostname and reject it when any address is
 * non-public. Closes `*.nip.io`-style static rebinding; IP literals are
 * already covered by {@link isBlockedHost} so they skip DNS. A lookup
 * failure is fail-open (the subsequent `fetch` fails closed on its own
 * resolution), keeping offline/stubbed environments working.
 */
async function validateResolvedHost(hostname: string, param = "url"): Promise<void> {
  const host = hostname.trim().replace(/^\[|\]$/g, "");
  if (host === "" || parseIPv4(host.toLowerCase()) !== undefined || host.includes(":")) {
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await dnsLookup(host, { all: true });
  } catch {
    return;
  }
  for (const entry of addresses) {
    const address = entry.address.toLowerCase().replace(/^\[|\]$/g, "");
    if (isBlockedIPString(address)) {
      throw Object.assign(
        new Error(`Private or loopback ${param} host resolved for: ${hostname}`),
        { statusCode: 400 },
      );
    }
  }
}

/** `true` when a resolved address string (unbracketed) is non-public. */
function isBlockedIPString(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4 !== undefined) {
    return isBlockedIPv4Int(v4);
  }
  if (address.includes(":")) {
    return isBlockedIPv6(address);
  }
  return false;
}

/**
 * Reject non-`http(s)` URLs and private/loopback/link-local hosts before any
 * server-side fetch (SSRF mitigation). Every redirect hop must pass this too.
 */
function assertHttpUrl(url: string, param = "url"): void {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw Object.assign(new Error(`Only http(s) ${param} URLs are allowed: ${url}`), {
      statusCode: 400,
    });
  }
  let hostname = "";
  try {
    hostname = new URL(trimmed).hostname;
  } catch {
    throw Object.assign(new Error(`Invalid ${param} URL: ${url}`), { statusCode: 400 });
  }
  if (isBlockedHost(hostname)) {
    throw Object.assign(new Error(`Private or loopback ${param} hosts are not allowed: ${url}`), {
      statusCode: 400,
    });
  }
}

/**
 * Fetch text server-side with redirect re-validation, a timeout, and a
 * streaming byte cap (avoids buffering multi-GB bodies before enforcing
 * `MAX_BODY_BYTES`). Returns the final body plus selected headers.
 */
async function fetchCappedText(
  url: string,
  param = "url",
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<{ body: string; headers: Headers }> {
  let current = url.trim();
  let headers = new Headers();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertHttpUrl(current, param);
    await validateResolvedHost(new URL(current).hostname, param);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, {
        headers: { "User-Agent": "subconverter-ts" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) {
          throw Object.assign(new Error(`Redirect without location: ${current}`), {
            statusCode: 502,
          });
        }
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch ${current}: ${response.status} ${response.statusText}`);
      }
      // Re-validate after headers arrive: a TTL-0 rebinding attack must now
      // win the race twice (pre-connect and pre-body) to exfiltrate, and a
      // flipped answer discards the body before it is ever used.
      try {
        await validateResolvedHost(new URL(current).hostname, param);
      } catch (error) {
        await response.body?.cancel().catch(() => undefined);
        throw error;
      }
      headers = response.headers;
      try {
        return { body: await readCappedText(response, MAX_BODY_BYTES), headers };
      } catch (error) {
        if (
          error instanceof Error &&
          (error as { statusCode?: unknown }).statusCode === 502 &&
          error.message === "Response body exceeds size limit"
        ) {
          throw Object.assign(new Error(`Response body exceeds size limit: ${current}`), {
            statusCode: 502,
          });
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw Object.assign(new Error(`Fetch timed out: ${current}`), { statusCode: 504 });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw Object.assign(new Error(`Too many redirects: ${url}`), { statusCode: 502 });
}

/** Split a `url` query value into individual subscription URLs. */
export function splitSubscriptionUrls(raw: string): string[] {
  return raw
    .split(/[\r\n|]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/**
 * Collect every `url` value from the raw query string, splitting `|`
 * lists. Parses `rawQuery` with core `getAllUrlArgs` (not `URLSearchParams`)
 * so `+`/`%2B`/case variants decode exactly as the rest of the request
 * path does.
 */
export function collectRequestUrls(rawQuery: string): string[] {
  const urls: string[] = [];
  for (const raw of getAllUrlArgs(rawQuery, "url")) {
    urls.push(...splitSubscriptionUrls(raw));
  }
  return urls;
}

/** Fetch a subscription body while capturing quota/refresh headers. */
export async function fetchSubscriptionDetailed(
  url: string,
): Promise<{ body: string; profileUpdateInterval?: string; userinfo?: string }> {
  const { body, headers } = await fetchCappedText(url, "url");
  const userinfo = headers.get("subscription-userinfo") ?? undefined;
  const profileUpdateInterval = headers.get("profile-update-interval") ?? undefined;
  return {
    body,
    profileUpdateInterval: profileUpdateInterval?.trim() || undefined,
    userinfo: userinfo?.trim() || undefined,
  };
}

/**
 * Fetch a `userinfo_url` endpoint and convert it into a
 * `subscription-userinfo` header value (`jms` handles Just-My-Socks JSON).
 */
export async function fetchUserinfoHeader(
  userinfoUrl: string,
  provider?: string,
): Promise<string | undefined> {
  const { body } = await fetchCappedText(userinfoUrl, "userinfo_url");
  return convertUserinfo(body, provider);
}

/** Map a target to its response `Content-Type`. */
export function contentTypeForTarget(target: string): string {
  if (target === "singbox" || target === "sssub") {
    return "application/json; charset=utf-8";
  }
  if (target === "clash" || target === "clashr") {
    return "text/yaml; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

/**
 * Read a query value across underscore/hyphen aliases from the raw query
 * string, mirroring core `firstArg`/`getUrlArg` semantics exactly (first
 * non-empty alias wins; last occurrence wins per key; `+` preserved).
 * Parsing `rawQuery` instead of `URLSearchParams` keeps server and core in
 * agreement on decoding and precedence.
 */
function rawFirst(rawQuery: string, ...keys: string[]): string {
  for (const key of keys) {
    const value = getUrlArg(rawQuery, key);
    if (value !== "") {
      return value;
    }
  }
  return "";
}

/**
 * `true` when a ruleset URL is fetchable server-side (`http(s)` or inline).
 * Dialect prefixes (`surge:`, `clash:`, …) are stripped first so prefixed
 * remote/inline rulesets are not silently dropped.
 */
function isServerRulesetUrl(url: string): boolean {
  const { url: source } = parseRulesetSource(url);
  const trimmed = source.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("[]");
}

/** Parse `group,url[,interval]` ruleset params (repeatable, case-insensitive keys). */
function parseRulesetParams(rawQuery: string): RulesetConfig[] {
  const configs: RulesetConfig[] = [];
  const seen = new Set<string>();
  for (const raw of [
    ...getAllUrlArgs(rawQuery, "ruleset"),
    ...getAllUrlArgs(rawQuery, "rulesets"),
  ]) {
    for (const part of raw.split(/[\r\n|]+/)) {
      const trimmed = part.trim();
      if (trimmed === "" || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      const parsed = parseRulesetConfig(trimmed);
      if (parsed) {
        configs.push(parsed);
      }
      if (configs.length > MAX_RULESETS) {
        throw Object.assign(new Error(`Too many rulesets (max ${String(MAX_RULESETS)}).`), {
          statusCode: 400,
        });
      }
    }
  }
  return configs;
}

/** Build one select group per `group` param via shared core helper (same as CLI). */
function buildGroups(names: string[]): ProxyGroupConfig[] {
  return names
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .map((name) => createSelectGroup(name));
}

/** Merge parsed query flags into core generation settings. */
function toExtraSettings(request: RequestSettings, rawQuery: string): ExtraSettings {
  const base = createExtraSettings();
  return {
    ...base,
    addEmoji: request.addEmoji,
    appendProxyType: request.appendType,
    clashClassicalRuleset: request.classicalRuleset,
    clashNewFieldName: request.newFieldName,
    clashProxiesStyle: request.proxiesStyle || "flow",
    clashProxyGroupsStyle: request.proxyGroupsStyle || "flow",
    clashScript: request.clashScript,
    dedupe: queryBoolFlag(rawQuery, "dedupe", "deduplicate") ?? false,
    emojiArray: request.emoji,
    filterDeprecated: request.filterDeprecated,
    nodeList: request.nodeList,
    removeEmoji: request.removeEmoji,
    renameArray: request.rename,
    skipCertVerify: request.scv,
    sortFlag: queryBoolFlag(rawQuery, "sort", "sort_flag", "sort-flag") ?? false,
    tfo: request.tfo,
    tls13: request.tls13,
    udp: request.udp,
  };
}

/**
 * Resolve a `config` param in server mode. Only remote `http(s)` URLs are
 * fetched; local filesystem paths are rejected to prevent remote
 * local-file disclosure. (`[]` inline configs never reach here: the caller
 * skips them as a no-op since an INI external config has no inline form —
 * inline `[]RULE` content is only meaningful for `ruleset` params.)
 */
async function loadExternalConfig(configParam: string): Promise<string> {
  const trimmed = configParam.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const { body } = await fetchCappedText(trimmed, "config");
    return body;
  }
  throw Object.assign(new Error("Local config paths are disabled in server mode"), {
    statusCode: 400,
  });
}

/**
 * Load rulesets server-side without touching the filesystem: only `http(s)`
 * and `[]` inline sources are fetched (capped); anything else resolves to
 * empty content so a malicious `config`-provided path can never disclose
 * local files. Failures resolve to empty content, matching `collectRulesets`.
 */
async function loadServerRulesets(configs: RulesetConfig[]): Promise<RulesetContent[]> {
  return Promise.all(
    configs.map(async (config) => {
      const empty: RulesetContent = {
        content: "",
        ruleGroup: config.group,
        rulePath: config.url,
        rulePathTyped: config.url,
        ruleType: RulesetType.Surge,
        updateInterval: config.interval,
      };
      try {
        // Reuse the canonical source splitter/sniffer so server and CLI/node
        // classify the same body identically; only the fetch is server-side.
        const { type, url } = parseRulesetSource(config.url);
        if (url.startsWith("[]")) {
          return { ...empty, content: url, ruleType: type ?? detectRulesetType(url) };
        }
        if (!/^https?:\/\//i.test(url.trim())) {
          return empty;
        }
        const { body } = await fetchCappedText(url, "ruleset");
        return { ...empty, content: body, ruleType: type ?? detectRulesetType(body) };
      } catch {
        return empty;
      }
    }),
  );
}

async function buildRulesets(
  rulesetConfigs: RulesetConfig[],
  includeRules: boolean | undefined,
): Promise<RulesetContent[] | undefined> {
  if (includeRules === false) {
    return undefined;
  }
  if (rulesetConfigs.length > MAX_RULESETS) {
    throw Object.assign(new Error(`Too many rulesets (max ${String(MAX_RULESETS)}).`), {
      statusCode: 400,
    });
  }
  if (rulesetConfigs.length > 0) {
    return loadServerRulesets(rulesetConfigs);
  }
  return getCachedDefaultRulesets();
}

/**
 * Convert one `/sub` query into a response body plus headers.
 * Pure against `fetch` (stubbed in tests); the HTTP layer only maps it.
 */
export async function convertSubRequest(
  rawQuery: string,
  _searchParams: URLSearchParams,
): Promise<SubConversion> {
  // `rawQuery` is the single source of truth for every param (core
  // `parseRequestSettings` plus the `raw*` helpers below share `getUrlArg`
  // decoding/precedence); `_searchParams` is kept for signature compat.
  const request = parseRequestSettings(rawQuery);

  const targetParam = rawFirst(rawQuery, "target").trim().toLowerCase();
  const target = targetParam === "" ? "clash" : targetParam;
  if (!VALID_TARGETS.has(target)) {
    throw Object.assign(
      new Error(`Unknown target format: ${targetParam}. Valid: ${[...VALID_TARGETS].join(", ")}`),
      { statusCode: 400 },
    );
  }

  const urls = collectRequestUrls(rawQuery);
  if (urls.length === 0) {
    throw Object.assign(
      new Error("Missing url parameter. Example: /sub?target=clash&url=https://..."),
      {
        statusCode: 400,
      },
    );
  }
  if (urls.length > MAX_SUBSCRIPTION_URLS) {
    throw Object.assign(new Error(`Too many subscription urls (max ${MAX_SUBSCRIPTION_URLS}).`), {
      statusCode: 400,
    });
  }
  for (const url of urls) {
    assertHttpUrl(url);
  }

  // Kick off the quota endpoint concurrently with the subscription fetches
  // below (and the ruleset/config fetches further down) so the overall
  // latency is the max, not the sum. Provider selection is synchronous, so
  // an unknown shape without an explicit provider still skips the fetch.
  // The attached no-op catch avoids an unhandled rejection if the
  // subscriptions fail first; the error surfaces when awaited below.
  let userinfoTask: Promise<string | undefined> | undefined;
  let userinfoProvider: string | undefined;
  if (request.userinfoUrl !== "") {
    const provider =
      request.userinfoProvider !== ""
        ? request.userinfoProvider
        : inferUserinfoProviderFromUrl(request.userinfoUrl);
    if (provider !== undefined && provider !== "") {
      userinfoProvider = provider;
      userinfoTask = fetchUserinfoHeader(request.userinfoUrl, provider);
      userinfoTask.catch(() => undefined);
    }
  }

  const failures: string[] = [];
  const settled = await Promise.allSettled(urls.map(async (url) => fetchSubscriptionDetailed(url)));
  const ordered = settled.map((result, index) => ({ index, result }));
  const bodies: string[] = [];
  let upstreamUserinfo: string | undefined;
  let upstreamInterval: string | undefined;
  let combinedLength = 0;
  for (const { index, result } of ordered) {
    if (result.status === "fulfilled") {
      bodies.push(result.value.body);
      combinedLength += result.value.body.length + 1;
      if (combinedLength > MAX_BODY_BYTES * MAX_SUBSCRIPTION_URLS) {
        throw Object.assign(new Error("Combined subscription body exceeds size limit"), {
          statusCode: 502,
        });
      }
      upstreamUserinfo ??= result.value.userinfo;
      upstreamInterval ??= result.value.profileUpdateInterval;
    } else {
      const url = urls[index] as string;
      const error = result.reason;
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (bodies.length === 0) {
    throw Object.assign(new Error(`All subscriptions failed. ${failures.join("; ")}`), {
      statusCode: 502,
    });
  }
  const combined = bodies.join("\n");

  const nodes = parseSubscription(combined);
  if (nodes.length === 0) {
    throw Object.assign(new Error("No proxy nodes found in the subscription."), {
      statusCode: 400,
    });
  }

  const groups = buildGroups(getAllUrlArgs(rawQuery, "group"));
  const rulesetConfigs = parseRulesetParams(rawQuery).filter((config) =>
    isServerRulesetUrl(config.url),
  );
  const configParam = rawFirst(rawQuery, "config");
  if (configParam !== "" && !configParam.startsWith("[]")) {
    try {
      const raw = await loadExternalConfig(configParam);
      if (raw !== "") {
        const external = parseExternalConfig(raw);
        groups.push(...external.groups);
        // Apply the same server-side filter to config-provided rulesets so a
        // malicious config cannot pull local files via `loadRuleset`.
        rulesetConfigs.push(
          ...external.rulesets.filter((config) => isServerRulesetUrl(config.url)),
        );
        if (rulesetConfigs.length > MAX_RULESETS) {
          throw Object.assign(new Error(`Too many rulesets (max ${String(MAX_RULESETS)}).`), {
            statusCode: 400,
          });
        }
        request.rename.push(...external.rename);
        request.emoji.push(...external.emoji);
        if (external.addEmoji) {
          request.addEmoji = true;
        }
        if (external.removeEmoji) {
          request.removeEmoji = true;
        }
      }
    } catch (error) {
      failures.push(`config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const noRules = queryBoolFlag(rawQuery, "no_rules", "no-rules");
  const withRules = queryBoolFlag(rawQuery, "with_rules", "with-rules");
  let includeRules: boolean | undefined;
  if (noRules === true || withRules === false) {
    includeRules = false;
  } else {
    includeRules = true;
  }

  // `toExtraSettings` already carries the merged `request.rename`/`emoji`
  // (including external-config entries pushed above); do not append again.
  const settings = toExtraSettings(request, rawQuery);

  const surgeVersionRaw = rawFirst(rawQuery, "surge_version", "surge-version", "ver", "version");
  const surgeVersion = surgeVersionRaw === "" ? 5 : Number.parseInt(surgeVersionRaw, 10) || 5;

  let baseConf = "";
  const baseParam = rawFirst(rawQuery, "base");
  if (baseParam !== "") {
    // Server mode only allows remote base configs; local paths are ignored.
    if (/^https?:\/\//i.test(baseParam.trim())) {
      try {
        baseConf = (await fetchCappedText(baseParam.trim(), "base")).body;
      } catch {
        baseConf = "";
      }
    }
  }

  const rulesets = await buildRulesets(rulesetConfigs, includeRules);
  let resolvedGroups = groups;
  if (includeRules !== false && resolvedGroups.length === 0) {
    resolvedGroups = getDefaultProxyGroups();
  }

  const body = generate(nodes, {
    baseConf,
    groups: resolvedGroups,
    includeRules,
    rulesets,
    settings,
    surgeVersion,
    target: target as TargetFormat,
  });

  // Await the quota fetch kicked off alongside the subscriptions above;
  // without `userinfo_url` (or with an unknown shape and no explicit
  // provider) the upstream header passes through untouched.
  let userinfo = upstreamUserinfo;
  if (userinfoTask && userinfoProvider !== undefined && userinfoProvider !== "") {
    let converted: string | undefined;
    try {
      converted = await userinfoTask;
    } catch (error) {
      throw Object.assign(
        new Error(
          `Failed to fetch userinfo from ${request.userinfoUrl}: ${error instanceof Error ? error.message : String(error)}`,
        ),
        { statusCode: 502 },
      );
    }
    if (!converted) {
      throw Object.assign(
        new Error(
          `Unable to convert userinfo from ${request.userinfoUrl} (provider: ${userinfoProvider}).`,
        ),
        { statusCode: 502 },
      );
    }
    userinfo = converted;
  }

  const profileUpdateInterval = request.interval > 0 ? String(request.interval) : upstreamInterval;
  return {
    body,
    contentType: contentTypeForTarget(target),
    filename: TARGET_FILENAMES[target] ?? `subconverter.${target}.txt`,
    profileUpdateInterval,
    userinfo,
  };
}

/** Create (but do not start) the subconverter HTTP server. */
export function createSubServer(): Server {
  return createHttpServer((req, res) => {
    void handleSubRequest(req.url ?? "/", req.method ?? "GET", res);
  });
}

async function handleSubRequest(url: string, method: string, res: ServerResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.writeHead(204);
    res.end();
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed\n");
    return;
  }
  const parsed = new URL(url, "http://localhost");
  if (parsed.pathname === "/" || parsed.pathname === "/version") {
    const text =
      parsed.pathname === "/version"
        ? "subconverter-ts\n"
        : "subconverter-ts\nUsage: GET /sub?target=clash&url=<subscription-url>&userinfo_url=<quota-url>&userinfo_provider=jms\n";
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(method === "HEAD" ? "" : text);
    return;
  }
  if (parsed.pathname !== "/sub") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found. Use GET /sub?target=clash&url=...\n");
    return;
  }
  const rawQuery = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  try {
    const result = await convertSubRequest(rawQuery, parsed.searchParams);
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    if (result.userinfo) {
      res.setHeader("subscription-userinfo", result.userinfo);
    }
    if (result.profileUpdateInterval) {
      res.setHeader("profile-update-interval", result.profileUpdateInterval);
    }
    res.writeHead(200);
    res.end(method === "HEAD" ? "" : result.body);
  } catch (error) {
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? ((error as { statusCode: number }).statusCode as number)
        : 500;
    res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`${error instanceof Error ? error.message : String(error)}\n`);
  }
}

/** Start the HTTP server and resolve once listening. */
export async function startServer(options: ServeOptions = {}): Promise<Server> {
  const port = options.port ?? 25500;
  const host = options.host ?? "0.0.0.0";
  const server = createSubServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  process.stdout.write(`subconverter-ts listening on http://${host}:${port}/sub\n`);
  return server;
}
