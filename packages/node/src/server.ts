import {
  type ExtraSettings,
  type Proxy,
  type ProxyGroupConfig,
  type RequestSettings,
  type RulesetConfig,
  type RulesetContent,
  type TargetFormat,
  MAX_REQUEST_LIST_CHARS,
  MAX_REQUEST_LIST_ENTRIES,
  RulesetType,
  convertNodes,
  convertUserinfo,
  createExtraSettings,
  createSelectGroup,
  formatSubscriptionUserinfo,
  getAllUrlArgs,
  getDefaultProxyGroups,
  getFirstUrlArg,
  inferUserinfoProviderFromUrl,
  isBlacklistedPattern,
  normalizeQueryKey,
  parseExternalConfig,
  parseRulesetConfig,
  parseRequestSettings,
  parseRulesetSource,
  parseSubscription,
  parseSubscriptionUserinfo,
  queryBoolFlag,
  urlDecode,
} from "@subconverter/core";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import { MAX_NODES, buildCountryResolver } from "./convert";
import { MAX_FETCH_BYTES, readCappedText } from "./fetch";
import {
  MAX_RULESET_COMBINED_CHARS as RULESET_COMBINED_CHARS,
  MAX_RULESET_FETCH_BYTES as RULESET_FETCH_BYTES,
  MAX_RULESET_INLINE_CHARS as RULESET_INLINE_CHARS,
  detectRulesetType,
  getCachedDefaultRulesets,
} from "./ruleset-load";
import { assertHttpUrl, validateResolvedHost } from "./ssrf";

/** Options for {@link startServer}. */
export interface ServeOptions {
  /** Bind address (default `0.0.0.0` for Docker; use `127.0.0.1` locally). */
  host?: string;
  /** TCP port to listen on (default `25500`). */
  port?: number;
  /**
   * Local MaxMind `.mmdb` database enabling `auto_country` (GeoIP country
   * prefixed names). Local paths are only accepted here, never from a query.
   */
  geoipPath?: string;
  /**
   * Prefix (e.g. `https://example.com/`) for Surge-family `#!MANAGED-CONFIG`.
   */
  managedPrefix?: string;
}

/** Options shared by the server conversion helpers. */
export interface SubServerOptions {
  geoipPath?: string;
  /**
   * Prefix (e.g. `https://example.com/`) prepended to the `#!MANAGED-CONFIG`
   * URL for Surge-family targets, mirroring upstream `managed_config_prefix`.
   */
  managedPrefix?: string;
  /**
   * Client-disconnect signal: aborts the internal overall-deadline
   * controller when the HTTP connection drops. Wired by `handleSubRequest`
   * from `req` `close`; library callers may pass their own signal.
   */
  signal?: AbortSignal;
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
export const MAX_SUBSCRIPTION_URLS = 5;
export const MAX_RULESETS = 20;
export const MAX_GROUPS = 20;
// Ruleset caps live in `./ruleset-load` (single source of truth shared with
// the library/CLI `collectRulesets` path); re-exported here for API compat.
// Declared as `export const` (not `export { X }`) so `scripts/gen-api-docs.mjs`
// — which scans top-level exported declarations — can resolve them.
export const MAX_RULESET_COMBINED_CHARS = RULESET_COMBINED_CHARS;
export const MAX_RULESET_FETCH_BYTES = RULESET_FETCH_BYTES;
export const MAX_RULESET_INLINE_CHARS = RULESET_INLINE_CHARS;
/** Cap sanitized `filename` values (oversized header mitigation). */
export const MAX_FILENAME_CHARS = 100;
/** Cap the percent-encoded `filename*` value (non-ASCII expands ~12x). */
export const MAX_FILENAME_ENCODED_CHARS = 512;
export const MAX_REDIRECTS = 3;
/** Cap raw query strings before any `getAllUrlArgs` fan-out (alloc mitigation). */
export const MAX_QUERY_CHARS = 32 * 1024;
/** Cap raw `&`-separated params before fan-out (loop mitigation). */
export const MAX_QUERY_PARAMS = 1000;
/** Cap any single `url`/`config`/`base`/`ruleset` value (alloc mitigation). */
export const MAX_URL_CHARS = 4 * 1024;
const FETCH_TIMEOUT_MS = 15000;
/** Cap reflected `subscription-userinfo` / `profile-update-interval` headers (header-bloat mitigation). */
export const MAX_SUBSCRIPTION_HEADER_CHARS = 4096;
/** Cap `userinfo_url` bodies: quota JSON is tiny; 64KB fails fast on 5MB dumps before sync JSON.parse. */
const MAX_USERINFO_BYTES = 64 * 1024;
/** Overall budget for one `/sub` conversion (sequential fetches must not hold a slot for minutes). */
export const OVERALL_TIMEOUT_MS = 30000;
/** Single-fetch body cap; shared with `fetchSubscription` via `MAX_FETCH_BYTES`. */
const MAX_BODY_BYTES = MAX_FETCH_BYTES;
/** Total cap across all subscription bodies in one request (DoS mitigation). */
const MAX_COMBINED_BYTES = MAX_FETCH_BYTES;
/** Cap concurrent `/sub` conversions (DoS mitigation). */
const MAX_CONCURRENT_REQUESTS = 20;
let activeConversions = 0;

/**
 * Fetch text server-side with redirect re-validation, a timeout, and a
 * streaming byte cap (avoids buffering multi-GB bodies before enforcing
 * `MAX_BODY_BYTES`). Returns the final body plus selected headers.
 */
async function fetchCappedText(
  url: string,
  param = "url",
  timeoutMs = FETCH_TIMEOUT_MS,
  maxBytes = MAX_BODY_BYTES,
  outerSignal?: AbortSignal,
): Promise<{ body: string; headers: Headers }> {
  let current = url.trim();
  assertUrlSize(current, param);
  let headers = new Headers();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (outerSignal?.aborted) {
      throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
    }
    assertHttpUrl(current, param);
    await validateResolvedHost(new URL(current).hostname, param, outerSignal);
    const controller = new AbortController();
    const onOuterAbort = (): void => controller.abort();
    outerSignal?.addEventListener("abort", onOuterAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, {
        headers: { "User-Agent": "subconverter-ts" },
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) {
          throw Object.assign(new Error(`Redirect without location: ${current.slice(0, 200)}`), {
            statusCode: 502,
          });
        }
        // S1: cap the raw Location before parsing so a 100KB attacker
        // header cannot force a huge allocation via `new URL`.
        if (location.length > MAX_URL_CHARS) {
          throw Object.assign(
            new Error(`Redirect location exceeds size limit: ${current.slice(0, 200)}`),
            {
              statusCode: 502,
            },
          );
        }
        try {
          current = new URL(location, current).toString();
        } catch {
          throw Object.assign(new Error(`Invalid redirect location: ${current.slice(0, 200)}`), {
            statusCode: 502,
          });
        }
        // S1: the resolved URL bypassed the 4KB entry-point cap; enforce it
        // every hop (assertUrlSize throws 400 like the initial `url=` check).
        assertUrlSize(current, param);
        continue;
      }
      if (!response.ok) {
        // Release the socket before throwing: otherwise the unconsumed body
        // holds the FD until GC (same as `fetchSubscription`).
        await response.body?.cancel().catch(() => undefined);
        throw new Error(
          `Failed to fetch ${current.slice(0, 200)}: ${response.status} ${response.statusText}`,
        );
      }
      // Re-validate after headers arrive: a TTL-0 rebinding attack must now
      // win the race twice (pre-connect and pre-body) to exfiltrate, and a
      // flipped answer discards the body before it is ever used.
      try {
        await validateResolvedHost(new URL(current).hostname, param, outerSignal);
      } catch (error) {
        await response.body?.cancel().catch(() => undefined);
        throw error;
      }
      headers = response.headers;
      try {
        return {
          body: await readCappedText(
            response,
            maxBytes,
            outerSignal ? AbortSignal.any([controller.signal, outerSignal]) : controller.signal,
          ),
          headers,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          (error as { statusCode?: unknown }).statusCode === 502 &&
          error.message === "Response body exceeds size limit"
        ) {
          throw Object.assign(
            new Error(`Response body exceeds size limit: ${current.slice(0, 200)}`),
            {
              statusCode: 502,
            },
          );
        }
        throw error;
      }
    } catch (error) {
      if (outerSignal?.aborted) {
        throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw Object.assign(new Error(`Fetch timed out: ${current.slice(0, 200)}`), {
          statusCode: 504,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      outerSignal?.removeEventListener("abort", onOuterAbort);
    }
  }
  throw Object.assign(new Error(`Too many redirects: ${url.slice(0, 200)}`), { statusCode: 502 });
}

/**
 * Reject oversized queries before any `getAllUrlArgs` fan-out. Counts `&`
 * without allocating a split array so a 2MB `ruleset=a&...` query fails fast
 * on `rawQuery.length` instead of looping 200k times before the 400.
 */
function assertQuerySize(rawQuery: string): void {
  if (rawQuery.length > MAX_QUERY_CHARS) {
    throw Object.assign(
      new Error(`Query exceeds size limit (max ${String(MAX_QUERY_CHARS)} chars).`),
      { statusCode: 400 },
    );
  }
  let params = 1;
  for (let index = 0; index < rawQuery.length; index += 1) {
    if (rawQuery[index] === "&") {
      params += 1;
      if (params > MAX_QUERY_PARAMS) {
        throw Object.assign(
          new Error(`Too many query parameters (max ${String(MAX_QUERY_PARAMS)}).`),
          { statusCode: 400 },
        );
      }
    }
  }
}

/** Reject an oversized single URL/config/base/ruleset value before fetching. */
function assertUrlSize(value: string, param = "url"): void {
  if (value.length > MAX_URL_CHARS) {
    throw Object.assign(
      new Error(`${param} exceeds size limit (max ${String(MAX_URL_CHARS)} chars).`),
      { statusCode: 400 },
    );
  }
}

/**
 * Read every occurrence of a query parameter without percent-decoding the
 * values, so callers can split on a literal separator before decoding.
 * Mirrors core `getAllUrlArgs` key matching (case-insensitive, `_`/`-`
 * equivalent) but returns the raw (still-encoded) slices.
 */
function getRawUrlArgs(query: string, key: string): string[] {
  if (query === "") {
    return [];
  }
  const hashCut = query.split("#", 1)[0] as string;
  const qIndex = hashCut.indexOf("?");
  const rawQuery = qIndex >= 0 ? hashCut.slice(qIndex + 1) : hashCut;
  const normalized = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;
  const values: string[] = [];
  const target = normalizeQueryKey(key);
  for (const part of normalized.split("&")) {
    if (part === "") {
      continue;
    }
    const eq = part.indexOf("=");
    const rawKey = eq >= 0 ? part.slice(0, eq) : part;
    if (normalizeQueryKey(urlDecode(rawKey)) !== target) {
      continue;
    }
    values.push(eq >= 0 ? part.slice(eq + 1) : "");
  }
  return values;
}

/** Split a decoded `url` value on newlines or `|` before another `http(s)` URL. */
export function splitSubscriptionUrls(raw: string): string[] {
  // Operates on an already-decoded value: split literal `|` only when it
  // starts another `http(s)` URL, otherwise a `|` inside a token
  // (e.g. `?token=a|b`) stays intact. `\r\n` covers line-delimited lists.
  return raw
    .split(/[\r\n]+|\|(?=https?:\/\/)/i)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/**
 * Collect every `url` value from the raw query string, splitting `|`
 * lists. Decodes first, then splits on newlines or a literal `|` only
 * before another `http(s)` URL (same as `splitSubscriptionUrls` and
 * `parseRulesetParams`), so both literal `|` and encoded `%7C`
 * separators split while `?token=a|b` stays intact. Repeatable `url=`
 * params are all collected. `+`/`%2B`/case variants decode exactly as
 * the rest of the request path does.
 */
export function collectRequestUrls(rawQuery: string): string[] {
  assertQuerySize(rawQuery);
  const urls: string[] = [];
  for (const raw of getRawUrlArgs(rawQuery, "url")) {
    for (const part of urlDecode(raw).split(/[\r\n]+|\|(?=https?:\/\/)/i)) {
      const trimmed = part.trim();
      if (trimmed !== "") {
        assertUrlSize(trimmed, "url");
        urls.push(trimmed);
        if (urls.length > MAX_SUBSCRIPTION_URLS) {
          throw Object.assign(
            new Error(`Too many subscription urls (max ${String(MAX_SUBSCRIPTION_URLS)}).`),
            { statusCode: 400 },
          );
        }
      }
    }
  }
  return urls;
}

/** Fetch a subscription body while capturing quota/refresh headers. */
export async function fetchSubscriptionDetailed(
  url: string,
  signal?: AbortSignal,
): Promise<{ body: string; profileUpdateInterval?: string; userinfo?: string }> {
  const { body, headers } = await fetchCappedText(
    url,
    "url",
    FETCH_TIMEOUT_MS,
    MAX_BODY_BYTES,
    signal,
  );
  const rawUserinfo = headers.get("subscription-userinfo")?.trim() || undefined;
  const rawInterval = headers.get("profile-update-interval")?.trim() || undefined;
  // Upstream headers are reflected into the response: drop oversized values
  // outright (typical values are <100 chars) and only forward a userinfo
  // value that parses as `subscription-userinfo` plus a numeric interval.
  // Re-serialize the parsed counters instead of reflecting the raw value so
  // control bytes or duplicates cannot smuggle response-splitting content.
  let userinfo: string | undefined;
  const parsedUpstreamUserinfo =
    rawUserinfo !== undefined &&
    rawUserinfo.length <= MAX_SUBSCRIPTION_HEADER_CHARS &&
    /^[\x20-\x7e]*$/.test(rawUserinfo)
      ? parseSubscriptionUserinfo(rawUserinfo)
      : undefined;
  if (parsedUpstreamUserinfo !== undefined) {
    userinfo = formatSubscriptionUserinfo(parsedUpstreamUserinfo);
  }
  let profileUpdateInterval: string | undefined;
  if (
    rawInterval !== undefined &&
    rawInterval.length <= MAX_SUBSCRIPTION_HEADER_CHARS &&
    /^\d+$/.test(rawInterval)
  ) {
    profileUpdateInterval = rawInterval;
  }
  return {
    body,
    profileUpdateInterval,
    userinfo,
  };
}

/**
 * Fetch a `userinfo_url` endpoint and convert it into a
 * `subscription-userinfo` header value (`jms` handles Just-My-Socks JSON).
 */
export async function fetchUserinfoHeader(
  userinfoUrl: string,
  provider?: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const { body } = await fetchCappedText(
    userinfoUrl,
    "userinfo_url",
    FETCH_TIMEOUT_MS,
    MAX_USERINFO_BYTES,
    signal,
  );
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
  assertQuerySize(rawQuery);
  const configs: RulesetConfig[] = [];
  const seen = new Set<string>();
  for (const raw of [
    ...getAllUrlArgs(rawQuery, "ruleset"),
    ...getAllUrlArgs(rawQuery, "rulesets"),
  ]) {
    // Like subscription URLs, only split `|` before another `http(s)` URL so
    // `?x=a|b` inside a ruleset URL survives instead of truncating the URL.
    for (const part of raw.split(/[\r\n]+|\|(?=https?:\/\/)/i)) {
      const trimmed = part.trim();
      if (trimmed === "" || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      const parsed = parseRulesetConfig(trimmed);
      if (parsed) {
        // Remote ruleset URLs stay at 4KB; inline `[]` bodies keep their own
        // 10KB cap so valid inline lists are not rejected by the URL cap.
        if (parsed.url.startsWith("[]")) {
          if (parsed.url.length > MAX_RULESET_INLINE_CHARS) {
            throw Object.assign(
              new Error(
                `Ruleset exceeds size limit (max ${String(MAX_RULESET_INLINE_CHARS)} chars).`,
              ),
              { statusCode: 400 },
            );
          }
        } else {
          assertUrlSize(parsed.url, "ruleset");
        }
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
  const filtered = names.map((name) => name.trim()).filter((name) => name !== "");
  if (filtered.length > MAX_GROUPS) {
    throw Object.assign(new Error(`Too many groups (max ${String(MAX_GROUPS)}).`), {
      statusCode: 400,
    });
  }
  for (const name of filtered) {
    // Reuses MAX_FILENAME_CHARS: group names are reflected into every output
    // line, so the same 100-char header-bloat cap applies (no separate
    // MAX_GROUP_NAME_CHARS to keep the unauthenticated surface minimal).
    if (name.length > MAX_FILENAME_CHARS) {
      throw Object.assign(
        new Error(`Group name exceeds size limit (max ${String(MAX_FILENAME_CHARS)} chars).`),
        { statusCode: 400 },
      );
    }
  }
  return filtered.map((name) => createSelectGroup(name));
}

/** Enforce core 50-entry/2000-char caps on merged external-config lists. */
function assertMergedListCap(
  entries: readonly string[] | readonly { match: string; replace: string }[],
  name: string,
): void {
  if (entries.length > MAX_REQUEST_LIST_ENTRIES) {
    throw Object.assign(new Error(`Too many ${name} (max ${String(MAX_REQUEST_LIST_ENTRIES)}).`), {
      statusCode: 400,
    });
  }
  let chars = 0;
  for (const entry of entries) {
    chars += typeof entry === "string" ? entry.length : entry.match.length + entry.replace.length;
  }
  if (chars > MAX_REQUEST_LIST_CHARS) {
    throw Object.assign(
      new Error(`${name} exceeds size limit (max ${String(MAX_REQUEST_LIST_CHARS)} chars).`),
      { statusCode: 400 },
    );
  }
}

/** Merge parsed query flags into core generation settings. */
function toExtraSettings(request: RequestSettings, rawQuery: string): ExtraSettings {
  const base = createExtraSettings();
  return {
    ...base,
    addEmoji: request.addEmoji,
    appendProxyType: request.appendType,
    autoCountry: request.autoCountry,
    clashClassicalRuleset: request.classicalRuleset,
    clashFlavor: request.clashFlavor,
    clashNewFieldName: request.newFieldName,
    clashProxiesStyle: request.proxiesStyle || "flow",
    clashProxyGroupsStyle: request.proxyGroupsStyle || "flow",
    clashScript: request.clashScript,
    dedupe: queryBoolFlag(rawQuery, "dedupe", "deduplicate") ?? false,
    emojiArray: request.emoji,
    excludeCountries: request.excludeCountries,
    excludeRemarks: request.excludeRemarks,
    expandRulesets: request.expand,
    filterDeprecated: request.filterDeprecated,
    includeCountries: request.includeCountries,
    includeRemarks: request.includeRemarks,
    nameRegexArray: request.nameRegex,
    nameRemove: request.nameRemove,
    nodeList: request.nodeList,
    quanxDevId: request.devId,
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
async function loadExternalConfig(configParam: string, signal?: AbortSignal): Promise<string> {
  const trimmed = configParam.trim();
  assertUrlSize(trimmed, "config");
  if (/^https?:\/\//i.test(trimmed)) {
    const { body } = await fetchCappedText(
      trimmed,
      "config",
      FETCH_TIMEOUT_MS,
      MAX_RULESET_FETCH_BYTES,
      signal,
    );
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
 * local files. Fetches run sequentially under a combined cap so one
 * request cannot hold 20 concurrent 5MB bodies at once. Failures resolve
 * to empty content, matching `collectRulesets` (size-cap violations throw).
 */
async function loadServerRulesets(
  configs: RulesetConfig[],
  assertDeadline?: () => void,
  signal?: AbortSignal,
): Promise<RulesetContent[]> {
  const results: RulesetContent[] = [];
  let combined = 0;
  const assertCombined = (chars: number): void => {
    combined += chars;
    if (combined > MAX_RULESET_COMBINED_CHARS) {
      throw Object.assign(
        new Error(`Too many ruleset characters (max ${String(MAX_RULESET_COMBINED_CHARS)}).`),
        { statusCode: 400 },
      );
    }
  };
  for (const config of configs) {
    if (signal?.aborted) {
      throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
    }
    assertDeadline?.();
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
        if (url.length > MAX_RULESET_INLINE_CHARS) {
          throw Object.assign(
            new Error(
              `Ruleset exceeds size limit (max ${String(MAX_RULESET_INLINE_CHARS)} chars).`,
            ),
            { statusCode: 400 },
          );
        }
        assertCombined(url.length);
        results.push({ ...empty, content: url, ruleType: type ?? detectRulesetType(url) });
        continue;
      }
      if (!/^https?:\/\//i.test(url.trim())) {
        results.push(empty);
        continue;
      }
      const { body } = await fetchCappedText(
        url,
        "ruleset",
        FETCH_TIMEOUT_MS,
        MAX_RULESET_FETCH_BYTES,
        signal,
      );
      assertCombined(body.length);
      results.push({ ...empty, content: body, ruleType: type ?? detectRulesetType(body) });
    } catch (error) {
      // Overall/client aborts (signal aborted) must fail fast, not resolve
      // to empty content (200). Per-fetch timeouts (504 without an overall
      // abort) fall back to empty like upstream failures; 400 throws.
      if (signal?.aborted) {
        throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
      }
      const statusCode = (error as { statusCode?: unknown }).statusCode;
      if (statusCode === 400) {
        throw error;
      }
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

async function buildRulesets(
  rulesetConfigs: RulesetConfig[],
  includeRules: boolean | undefined,
  assertDeadline?: () => void,
  signal?: AbortSignal,
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
    return loadServerRulesets(rulesetConfigs, assertDeadline, signal);
  }
  return getCachedDefaultRulesets(signal);
}

/**
 * Convert one `/sub` query into a response body plus headers.
 * Pure against `fetch` (stubbed in tests); the HTTP layer only maps it.
 */
export async function convertSubRequest(
  rawQuery: string,
  _searchParams: URLSearchParams,
  options: SubServerOptions = {},
): Promise<SubConversion> {
  // Fail fast on oversized queries before taking a concurrency slot: a 2MB
  // query must not hold one of the 20 slots while it is rejected.
  assertQuerySize(rawQuery);
  if (activeConversions >= MAX_CONCURRENT_REQUESTS) {
    throw Object.assign(new Error("Server busy: too many concurrent requests"), {
      statusCode: 503,
    });
  }
  activeConversions += 1;
  // Overall deadline threaded through every fetch/DNS phase below: the timer
  // aborts the signal so in-flight work fails fast with 504. The slot is held
  // until the aborted work settles (no early `Promise.race` release that
  // would let timed-out work continue uncounted in the background). 30s.
  const controller = new AbortController();
  // Client disconnects abort the same controller (M3): `handleSubRequest`
  // passes `req` close as `options.signal`.
  const clientSignal = options.signal;
  const onClientAbort = (): void => controller.abort();
  if (clientSignal?.aborted) {
    controller.abort();
  } else {
    clientSignal?.addEventListener("abort", onClientAbort, { once: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    timer = setTimeout(() => controller.abort(), OVERALL_TIMEOUT_MS);
    try {
      return await convertSubRequestInner(rawQuery, _searchParams, options, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
      }
      throw error;
    }
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    // Abort the concurrent `userinfoTask` when an early throw skips its
    // `await` below (M2): abort-after-response is a no-op on the success
    // path, but stops a still-pending quota fetch from outliving the slot.
    clientSignal?.removeEventListener("abort", onClientAbort);
    controller.abort();
    activeConversions -= 1;
  }
}

async function convertSubRequestInner(
  rawQuery: string,
  _searchParams: URLSearchParams,
  options: SubServerOptions = {},
  outerSignal?: AbortSignal,
): Promise<SubConversion> {
  // Overall deadline for the sequential fetch phases below: abort issuing
  // new fetches once the budget is spent. The outer `AbortController` in
  // `convertSubRequest` aborts `outerSignal` after `OVERALL_TIMEOUT_MS`, and
  // every fetch/DNS helper below threads that signal so in-flight work fails
  // fast instead of continuing uncounted after the slot is released.
  const startedAt = Date.now();
  const assertOverallDeadline = (): void => {
    if (outerSignal?.aborted || Date.now() - startedAt > OVERALL_TIMEOUT_MS) {
      throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
    }
  };
  // Reject oversized queries before any parsing/allocation: `parseRequestSettings`
  // and the `getAllUrlArgs` fan-out below must not loop 200k times first.
  assertQuerySize(rawQuery);
  // `rawQuery` is the single source of truth for every param (core
  // `parseRequestSettings` plus the `raw*` helpers below share `getUrlArg`
  // decoding/precedence); `_searchParams` is kept for signature compat.
  const request = parseRequestSettings(rawQuery);
  // Check raw `include`/`exclude` args too: core may already filter
  // blacklisted patterns out of `request`, which would hide them here.
  const rawFilters = [...getAllUrlArgs(rawQuery, "include"), ...getAllUrlArgs(rawQuery, "exclude")];
  const hasBlacklistedRaw = rawFilters.some((raw) =>
    raw
      .split(",")
      .map((part) => part.trim())
      .some((part) => part !== "" && isBlacklistedPattern(part)),
  );
  if (
    hasBlacklistedRaw ||
    request.includeRemarks.some(isBlacklistedPattern) ||
    request.excludeRemarks.some(isBlacklistedPattern)
  ) {
    throw Object.assign(new Error("Invalid regex in request!"), { statusCode: 400 });
  }

  const targetParam = getFirstUrlArg(rawQuery, "target").trim().toLowerCase();
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
    assertUrlSize(request.userinfoUrl, "userinfo_url");
    const provider =
      request.userinfoProvider !== ""
        ? request.userinfoProvider
        : inferUserinfoProviderFromUrl(request.userinfoUrl);
    if (provider !== undefined && provider !== "") {
      userinfoProvider = provider;
      userinfoTask = fetchUserinfoHeader(request.userinfoUrl, provider, outerSignal);
      userinfoTask.catch(() => undefined);
    }
  }

  const failures: string[] = [];
  const nodes: Proxy[] = [];
  let upstreamUserinfo: string | undefined;
  let upstreamInterval: string | undefined;
  let combinedLength = 0;
  let succeeded = 0;
  // Fetch sequentially and parse incrementally so one request never holds
  // all bodies at once; the total is capped at one single-fetch cap.
  for (let index = 0; index < urls.length; index += 1) {
    assertOverallDeadline();
    const url = urls[index] as string;
    try {
      const fetched = await fetchSubscriptionDetailed(url, outerSignal);
      combinedLength += Buffer.byteLength(fetched.body, "utf-8") + 1;
      if (combinedLength > MAX_COMBINED_BYTES) {
        throw Object.assign(new Error("Combined subscription body exceeds size limit"), {
          statusCode: 502,
        });
      }
      // Parse each source separately: upstream tags the Nth `url` with group
      // id N so `!!GROUPID=`/`!!INSERT=` rules can select a subscription.
      // The trailing newline keeps `explodeSub` on its line-delimited path.
      nodes.push(...parseSubscription(`${fetched.body}\n`, index));
      succeeded += 1;
      upstreamUserinfo ??= fetched.userinfo;
      upstreamInterval ??= fetched.profileUpdateInterval;
    } catch (error) {
      if (
        error instanceof Error &&
        (error as { statusCode?: unknown }).statusCode === 502 &&
        error.message === "Combined subscription body exceeds size limit"
      ) {
        throw error;
      }
      // Overall/client timeouts must fail fast instead of collapsing
      // into a per-URL failure (-> 502 "All subscriptions failed").
      // Per-fetch timeouts without an overall abort still allow partial
      // success, so only the overall-abort case throws here; the outer
      // `convertSubRequest` maps an aborted controller to 504 regardless.
      if (outerSignal?.aborted) {
        throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
      }
      // In-parse node-cap violations (statusCode 400) must fail fast instead
      // of collapsing into a per-URL failure (-> 502 "All subscriptions failed").
      if ((error as { statusCode?: unknown })?.statusCode === 400) {
        throw error;
      }
      failures.push(
        `${url.slice(0, 200)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // Fail fast outside the `try` so the cap is never swallowed into `failures`.
    if (nodes.length > MAX_NODES) {
      throw Object.assign(new Error(`Too many proxy nodes (max ${String(MAX_NODES)}).`), {
        statusCode: 400,
      });
    }
  }
  if (succeeded === 0) {
    throw Object.assign(new Error(`All subscriptions failed. ${failures.join("; ")}`), {
      statusCode: 502,
    });
  }
  if (nodes.length === 0) {
    throw Object.assign(new Error("No proxy nodes found in the subscription."), {
      statusCode: 400,
    });
  }

  const groups = buildGroups(getAllUrlArgs(rawQuery, "group"));
  const rulesetConfigs = parseRulesetParams(rawQuery).filter((config) =>
    isServerRulesetUrl(config.url),
  );
  const configParam = getFirstUrlArg(rawQuery, "config");
  if (configParam !== "") {
    assertUrlSize(configParam, "config");
  }
  const templateVars: Record<string, string> = {};
  // `[custom]` switches from an external config apply to the server too, so a
  // `config=` URL behaves exactly like the CLI `--config` flag.
  let configRules: { enableRuleGenerator: boolean; overwriteOriginalRules: boolean } | undefined;
  if (configParam !== "" && !configParam.startsWith("[]")) {
    assertOverallDeadline();
    // A broken `config=` URL is surfaced like a broken subscription (upstream
    // fails the request too) instead of silently falling back to defaults.
    const raw = await loadExternalConfig(configParam, outerSignal);
    if (raw !== "") {
      const external = parseExternalConfig(raw);
      groups.push(...external.groups);
      if (groups.length > MAX_GROUPS) {
        throw Object.assign(new Error(`Too many groups (max ${String(MAX_GROUPS)}).`), {
          statusCode: 400,
        });
      }
      // `buildGroups` caps `?group=` names, but external `custom_proxy_group`
      // entries bypass it: a 5KB `select` name would bloat every output.
      for (const group of groups) {
        if (group.name.length > MAX_FILENAME_CHARS) {
          throw Object.assign(
            new Error(`Group name exceeds size limit (max ${String(MAX_FILENAME_CHARS)} chars).`),
            { statusCode: 400 },
          );
        }
      }
      // Apply the same server-side filter to config-provided rulesets so a
      // malicious config cannot pull local files via `loadRuleset`.
      rulesetConfigs.push(...external.rulesets.filter((config) => isServerRulesetUrl(config.url)));
      if (rulesetConfigs.length > MAX_RULESETS) {
        throw Object.assign(new Error(`Too many rulesets (max ${String(MAX_RULESETS)}).`), {
          statusCode: 400,
        });
      }
      request.rename.push(...external.rename);
      request.emoji.push(...external.emoji);
      request.nameRegex.push(...external.nameRegex);
      request.nameRemove.push(...external.nameRemove);
      request.includeRemarks.push(...external.includeRemarks);
      request.excludeRemarks.push(...external.excludeRemarks);
      request.includeCountries.push(...external.includeCountries);
      request.excludeCountries.push(...external.excludeCountries);
      // External INI lists bypass core `parseRequestSettings` caps, so an
      // evil `config=` with 100k `rename` lines would hang the request.
      assertMergedListCap(request.rename, "rename");
      assertMergedListCap(request.emoji, "emoji");
      assertMergedListCap(request.nameRegex, "name_regex");
      assertMergedListCap(request.nameRemove, "name_remove");
      assertMergedListCap(request.includeRemarks, "include");
      assertMergedListCap(request.excludeRemarks, "exclude");
      assertMergedListCap(request.includeCountries, "include_country");
      assertMergedListCap(request.excludeCountries, "exclude_country");
      if (external.addEmoji) {
        request.addEmoji = true;
      }
      if (external.removeEmoji) {
        request.removeEmoji = true;
      }
      if (external.autoCountry) {
        request.autoCountry = true;
      }
      Object.assign(templateVars, external.templateVars);
      assertMergedListCap(
        Object.entries(templateVars).map(([match, replace]) => ({ match, replace })),
        "templateVars",
      );
      configRules = {
        enableRuleGenerator: external.enableRuleGenerator,
        overwriteOriginalRules: external.overwriteOriginalRules,
      };
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
  settings.templateVars = templateVars;
  if (configRules !== undefined) {
    settings.enableRuleGenerator = configRules.enableRuleGenerator;
    settings.overwriteOriginalRules = configRules.overwriteOriginalRules;
  }
  // A configured database turns country prefixes on by default, so mounting a
  // `.mmdb` is enough to get `US-server1`; `auto_country=false` opts out.
  // Country filters (`include_country`/`exclude_country`) also need the
  // database. The path is CLI-only, never accepted from the query.
  const autoCountryFlag = queryBoolFlag(rawQuery, "auto_country", "auto-country");
  if (autoCountryFlag !== undefined) {
    settings.autoCountry = autoCountryFlag;
  } else if (options.geoipPath !== undefined) {
    settings.autoCountry = true;
  }
  const needsCountry =
    settings.autoCountry ||
    settings.includeCountries.length > 0 ||
    settings.excludeCountries.length > 0;

  const surgeVersionRaw = getFirstUrlArg(
    rawQuery,
    "surge_version",
    "surge-version",
    "ver",
    "version",
  );
  const surgeVersion = surgeVersionRaw === "" ? 5 : Number.parseInt(surgeVersionRaw, 10) || 5;

  let baseConf = "";
  const baseParam = getFirstUrlArg(rawQuery, "base");
  if (baseParam !== "") {
    assertUrlSize(baseParam, "base");
  }
  assertOverallDeadline();
  if (baseParam !== "") {
    // Server mode only allows remote base configs; local paths are ignored.
    if (/^https?:\/\//i.test(baseParam.trim())) {
      try {
        baseConf = (
          await fetchCappedText(
            baseParam.trim(),
            "base",
            FETCH_TIMEOUT_MS,
            MAX_RULESET_FETCH_BYTES,
            outerSignal,
          )
        ).body;
      } catch (error) {
        // Overall/client aborts (outerSignal aborted) must fail fast, not
        // fall back to an empty base (200). Per-fetch timeouts (504 without
        // an overall abort) use empty like upstream failures; 400 throws.
        if (outerSignal?.aborted) {
          throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
        }
        const statusCode = (error as { statusCode?: unknown }).statusCode;
        if (statusCode === 400) {
          throw error;
        }
        baseConf = "";
      }
    }
  }

  const rulesets = await buildRulesets(
    rulesetConfigs,
    includeRules,
    assertOverallDeadline,
    outerSignal,
  );
  let resolvedGroups = groups;
  if (includeRules !== false && resolvedGroups.length === 0) {
    resolvedGroups = getDefaultProxyGroups();
  }

  if (needsCountry) {
    if (options.geoipPath === undefined) {
      throw Object.assign(
        new Error(
          "auto_country and country filters require a GeoIP database: start the server with --geoip <mmdb path>.",
        ),
        { statusCode: 400 },
      );
    }
    try {
      settings.countryResolver = await buildCountryResolver(nodes, options.geoipPath, outerSignal);
    } catch (error) {
      throw Object.assign(
        new Error(
          `Failed to load GeoIP database ${options.geoipPath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
        { statusCode: 500 },
      );
    }
  }

  const converted = convertNodes(nodes, {
    baseConf,
    groups: resolvedGroups,
    includeRules,
    rulesets,
    settings,
    surgeVersion,
    target: target as TargetFormat,
  });
  let finalBody = converted.output;
  if ((target === "surge" || target === "surfboard") && options.managedPrefix) {
    const interval = request.interval > 0 ? request.interval : 86400;
    finalBody =
      `#!MANAGED-CONFIG ${options.managedPrefix}sub?target=${target}&url=${urls.join("|")}` +
      ` interval=${String(interval)} strict=${request.strict ? "true" : "false"}\n\n${converted.output}`;
  }
  if (converted.nodes.length === 0) {
    throw Object.assign(new Error("No proxy nodes left after include/exclude filtering."), {
      statusCode: 400,
    });
  }

  // Await the quota fetch kicked off alongside the subscriptions above;
  // without `userinfo_url` (or with an unknown shape and no explicit
  // provider) the upstream header passes through untouched.
  let userinfo = upstreamUserinfo;
  if (userinfoTask && userinfoProvider !== undefined && userinfoProvider !== "") {
    let converted: string | undefined;
    try {
      converted = await userinfoTask;
    } catch (error) {
      if (outerSignal?.aborted) {
        throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
      }
      if ((error as { statusCode?: unknown })?.statusCode === 504) {
        throw error;
      }
      throw Object.assign(
        new Error(
          `Failed to fetch userinfo from ${request.userinfoUrl.slice(0, 200)}: ${error instanceof Error ? error.message : String(error)}`,
        ),
        { statusCode: 502 },
      );
    }
    if (!converted) {
      throw Object.assign(
        new Error(
          `Unable to convert userinfo from ${request.userinfoUrl.slice(0, 200)} (provider: ${userinfoProvider}).`,
        ),
        { statusCode: 502 },
      );
    }
    userinfo = converted;
  }

  const profileUpdateInterval = request.interval > 0 ? String(request.interval) : upstreamInterval;
  const filename =
    request.filename !== ""
      ? request.filename.replace(/["\r\n]/g, "").slice(0, MAX_FILENAME_CHARS)
      : (TARGET_FILENAMES[target] ?? `subconverter.${target}.txt`);
  return {
    body: finalBody,
    contentType: contentTypeForTarget(target),
    filename,
    profileUpdateInterval,
    userinfo,
  };
}

/** Create (but do not start) the subconverter HTTP server. */
export function createSubServer(options: SubServerOptions = {}): Server {
  return createHttpServer((req, res) => {
    void handleSubRequest(req.url ?? "/", req.method ?? "GET", res, options, req);
  });
}

/** `Content-Disposition` value; non-ASCII names also get RFC 5987 `filename*`. */
function contentDisposition(filename: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = filename.replace(/[\x00-\x1F\x7F]/g, "");
  const ascii = clean.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const base = `attachment; filename="${ascii}"`;
  const isAscii = [...clean].every((char) => char.charCodeAt(0) < 0x80);
  if (isAscii) {
    return base;
  }
  // N2: `filename` is already capped to `MAX_FILENAME_CHARS`, but non-ASCII
  // expands up to 12x via `encodeURIComponent` (100 CJK/emoji chars -> ~1KB
  // header). Cap the encoded `filename*` on a character boundary so a
  // `%XX` sequence is never split; the value stays a valid prefix.
  let encoded = "";
  for (const char of clean) {
    const part = encodeURIComponent(char);
    if (encoded.length + part.length > MAX_FILENAME_ENCODED_CHARS) {
      break;
    }
    encoded += part;
  }
  return `${base}; filename*=UTF-8''${encoded}`;
}

async function handleSubRequest(
  url: string,
  method: string,
  res: ServerResponse,
  options: SubServerOptions,
  _req?: IncomingMessage,
): Promise<void> {
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
  let parsed: URL;
  try {
    parsed = new URL(url, "http://localhost");
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Invalid request path\n");
    return;
  }
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
  // N1: HEAD validation-only fast-path. A HEAD must not run the full
  // conversion (upstream fetches + GeoIP + convert) just to discard the
  // body; validate params and return the deterministic headers only.
  // Dynamic upstream headers (`subscription-userinfo`,
  // `profile-update-interval`) are intentionally omitted on HEAD.
  if (method === "HEAD" && parsed.pathname === "/sub") {
    try {
      assertQuerySize(rawQuery);
      const targetParam = getFirstUrlArg(rawQuery, "target").trim().toLowerCase();
      const target = targetParam === "" ? "clash" : targetParam;
      if (!VALID_TARGETS.has(target)) {
        throw Object.assign(
          new Error(
            `Unknown target format: ${targetParam}. Valid: ${[...VALID_TARGETS].join(", ")}`,
          ),
          { statusCode: 400 },
        );
      }
      const urls = collectRequestUrls(rawQuery);
      if (urls.length === 0) {
        throw Object.assign(
          new Error("Missing url parameter. Example: /sub?target=clash&url=https://..."),
          { statusCode: 400 },
        );
      }
      for (const entry of urls) {
        assertHttpUrl(entry);
      }
      // S2: mirror cheap sync 400s so HEAD matches GET without I/O (DNS/fetch async may still differ).
      const headRequest = parseRequestSettings(rawQuery);
      if (
        [...getAllUrlArgs(rawQuery, "include"), ...getAllUrlArgs(rawQuery, "exclude")].some((raw) =>
          raw.split(",").some((part) => part.trim() !== "" && isBlacklistedPattern(part.trim())),
        ) ||
        headRequest.includeRemarks.some(isBlacklistedPattern) ||
        headRequest.excludeRemarks.some(isBlacklistedPattern)
      ) {
        throw Object.assign(new Error("Invalid regex in request!"), { statusCode: 400 });
      }
      buildGroups(getAllUrlArgs(rawQuery, "group"));
      parseRulesetParams(rawQuery);
      if (headRequest.userinfoUrl !== "") assertUrlSize(headRequest.userinfoUrl, "userinfo_url");
      if (getFirstUrlArg(rawQuery, "config") !== "")
        assertUrlSize(getFirstUrlArg(rawQuery, "config"), "config");
      if (getFirstUrlArg(rawQuery, "base") !== "")
        assertUrlSize(getFirstUrlArg(rawQuery, "base"), "base");
      const filenameRaw = getFirstUrlArg(rawQuery, "filename");
      const filename =
        filenameRaw !== ""
          ? filenameRaw.replace(/["\r\n]/g, "").slice(0, MAX_FILENAME_CHARS)
          : (TARGET_FILENAMES[target] ?? `subconverter.${target}.txt`);
      res.setHeader("Content-Type", contentTypeForTarget(target));
      res.setHeader("Content-Disposition", contentDisposition(filename));
      res.writeHead(200);
      res.end("");
    } catch (error) {
      const statusCode =
        typeof (error as { statusCode?: unknown }).statusCode === "number"
          ? ((error as { statusCode: number }).statusCode as number)
          : 500;
      res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`${error instanceof Error ? error.message : String(error)}\n`);
    }
    return;
  }
  // Abort the conversion when the client disconnects: `res` `close` alone is
  // authoritative (`req` `close` also fires on keep-alive reuse, aborting
  // unrelated work). Abort only while the response is still open
  // (`writableFinished` guard) so a normal post-`end` close is a no-op.
  // The listener is removed once the conversion settles so completed
  // requests do not leak.
  const disconnectController = new AbortController();
  const onDisconnect = (): void => {
    if (!res.writableFinished) {
      disconnectController.abort();
    }
  };
  res.once("close", onDisconnect);
  try {
    const result = await convertSubRequest(rawQuery, parsed.searchParams, {
      ...options,
      signal: disconnectController.signal,
    });
    if (disconnectController.signal.aborted || res.writableEnded || res.destroyed) {
      return;
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", contentDisposition(result.filename));
    if (result.userinfo) {
      res.setHeader("subscription-userinfo", result.userinfo);
    }
    if (result.profileUpdateInterval) {
      res.setHeader("profile-update-interval", result.profileUpdateInterval);
    }
    res.writeHead(200);
    res.end(method === "HEAD" ? "" : result.body);
  } catch (error) {
    if (disconnectController.signal.aborted || res.writableEnded || res.destroyed) {
      return;
    }
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? ((error as { statusCode: number }).statusCode as number)
        : 500;
    res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`${error instanceof Error ? error.message : String(error)}\n`);
  } finally {
    res.off("close", onDisconnect);
  }
}

/** Start the HTTP server and resolve once listening. */
export async function startServer(options: ServeOptions = {}): Promise<Server> {
  const port = options.port ?? 25500;
  const host = options.host ?? "0.0.0.0";
  const server = createSubServer({
    geoipPath: options.geoipPath,
    managedPrefix: options.managedPrefix,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}
