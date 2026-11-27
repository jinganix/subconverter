import {
  type RulesetConfig,
  type RulesetContent,
  RulesetType,
  getDefaultRulesetConfigs,
  getDefaultRulesets,
  parseRulesetSource,
} from "@subconverter/core";

import { type LoadOptions, fetchSubscription, readSubscriptionFile } from "./fetch";

/** Cap inline `[]` ruleset bodies (DoS mitigation, mirrors the server limit). */
export const MAX_RULESET_INLINE_CHARS = 10 * 1024;
/** Total cap across all ruleset bodies in one request (DoS mitigation). */
export const MAX_RULESET_COMBINED_CHARS = 200 * 1024;
/** Single ruleset fetch cap (smaller than subscription bodies). */
export const MAX_RULESET_FETCH_BYTES = 1 * 1024 * 1024;

/** Options for {@link collectRulesets} cap overrides (tests / trusted callers). */
export interface CollectRulesetsOptions extends LoadOptions {
  /** Override for {@link MAX_RULESET_COMBINED_CHARS}. */
  maxCombinedChars?: number;
  /** Override for {@link MAX_RULESET_INLINE_CHARS}. */
  maxInlineChars?: number;
}

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

/** Fetch or read a ruleset body and normalize it into a {@link RulesetContent}. */
export async function loadRuleset(
  config: RulesetConfig,
  options: CollectRulesetsOptions = {},
): Promise<RulesetContent> {
  const { type, url } = parseRulesetSource(config.url);
  const maxInline = options.maxInlineChars ?? MAX_RULESET_INLINE_CHARS;
  const maxSingle = options.maxBytes ?? MAX_RULESET_FETCH_BYTES;
  let content = "";
  if (url.startsWith("[]")) {
    if (url.length > maxInline) {
      throw Object.assign(
        new Error(`Ruleset exceeds size limit (max ${String(maxInline)} chars).`),
        { statusCode: 400 },
      );
    }
    content = url;
  } else if (/^https?:\/\//i.test(url)) {
    content = await fetchSubscription(url, { ...options, maxBytes: maxSingle });
  } else if (url !== "") {
    content = await readSubscriptionFile(url);
    if (content.length > maxSingle) {
      throw Object.assign(
        new Error(`Ruleset exceeds size limit (max ${String(maxSingle)} chars).`),
        { statusCode: 400 },
      );
    }
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

/**
 * Fetch/read every configured ruleset sequentially under a combined cap,
 * skipping failures. Size-cap violations (400) are rethrown so an evil
 * ruleset cannot silently bloat the request; other fetch failures resolve
 * to empty content. Sequential (not `Promise.all`) so one request never
 * holds 20x bodies at once.
 */
export async function collectRulesets(
  configs: RulesetConfig[],
  options: CollectRulesetsOptions = {},
): Promise<RulesetContent[]> {
  const results: RulesetContent[] = [];
  const maxCombined = options.maxCombinedChars ?? MAX_RULESET_COMBINED_CHARS;
  const signal = (options as { signal?: AbortSignal }).signal;
  let combined = 0;
  for (const config of configs) {
    if (signal?.aborted) {
      throwOverallTimeout();
    }
    try {
      const loaded = await loadRuleset(config, options);
      combined += loaded.content.length;
      if (combined > maxCombined) {
        throw Object.assign(
          new Error(`Too many ruleset characters (max ${String(maxCombined)}).`),
          { statusCode: 400 },
        );
      }
      results.push(loaded);
    } catch (error) {
      // Overall/client timeouts (504) must fail fast, not resolve to empty
      // content (200). Only upstream fetch failures (502 / non-ok) resolve
      // to empty; size-cap/SSRF (400) throws.
      if (signal?.aborted) {
        throwOverallTimeout();
      }
      const statusCode = (error as { statusCode?: unknown }).statusCode;
      if (statusCode === 504 || statusCode === 400) {
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

const DEFAULT_RULESET_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RULESET_FETCH_TIMEOUT_MS = 5000;
let cachedDefaultRulesets: { at: number; data: RulesetContent[] } | undefined;
let inflightDefaultRulesets: Promise<RulesetContent[]> | undefined;

/** Clear the cached default rulesets (tests only). */
export function clearDefaultRulesetCache(): void {
  cachedDefaultRulesets = undefined;
  inflightDefaultRulesets = undefined;
}

/**
 * Copy cached ruleset contents so callers cannot mutate the shared cache.
 * `[...data]` copies the array but shares the objects (S3): one caller
 * mutating `content` would poison every later conversion.
 */
function copyRulesetContents(data: RulesetContent[]): RulesetContent[] {
  return data.map((entry) => ({ ...entry }));
}

/** Independent 5s budget for default ruleset fetches, never the caller signal. */
function independentDefaultsSignal(): AbortSignal {
  return AbortSignal.timeout(DEFAULT_RULESET_FETCH_TIMEOUT_MS);
}

/**
 * Await shared default-ruleset work without aborting it when the caller
 * goes away: the race rejects with 504 on caller abort while the shared
 * promise continues for other callers. Listener is removed after settling.
 */
async function awaitSharedDefaults(
  shared: Promise<RulesetContent[]>,
  signal?: AbortSignal,
): Promise<RulesetContent[]> {
  if (signal?.aborted) {
    throwOverallTimeout();
  }
  if (!signal) {
    return shared;
  }
  let onAbort: (() => void) | undefined;
  try {
    const abortPromise = new Promise<never>((_, reject) => {
      onAbort = () => reject(Object.assign(new Error("Request timed out"), { statusCode: 504 }));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    abortPromise.catch(() => undefined);
    return await Promise.race([shared, abortPromise]);
  } finally {
    if (onAbort !== undefined) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

/**
 * Resolve the bundled upstream-like remote defaults, caching the result with
 * a TTL and single-flight so concurrent conversions share one fetch batch.
 * Falls back to the bundled offline rules when fetching fails.
 */
function throwOverallTimeout(): never {
  throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
}

/**
 * Resolve the bundled upstream-like remote defaults, caching the result with
 * a TTL and single-flight so concurrent conversions share one fetch batch.
 * Falls back to the bundled offline rules when fetching fails.
 * Returns a copy so callers cannot mutate the cached array or its objects.
 */
export async function getCachedDefaultRulesets(signal?: AbortSignal): Promise<RulesetContent[]> {
  const now = Date.now();
  if (signal?.aborted) {
    throwOverallTimeout();
  }
  if (cachedDefaultRulesets && now - cachedDefaultRulesets.at < DEFAULT_RULESET_TTL_MS) {
    return copyRulesetContents(cachedDefaultRulesets.data);
  }
  // Serve stale while revalidating: one slow upstream must not stall all
  // default conversions. The stale copy returns immediately while a
  // background refresh updates the cache with an independent timeout.
  // The refresh never uses the caller signal (M5): aborting one request
  // must not poison the shared inflight used by every other conversion.
  if (cachedDefaultRulesets) {
    if (!inflightDefaultRulesets) {
      const refreshSignal = independentDefaultsSignal();
      const refresh = (async () => {
        try {
          const fetched = await collectRulesets(getDefaultRulesetConfigs(), {
            signal: refreshSignal,
            timeoutMs: DEFAULT_RULESET_FETCH_TIMEOUT_MS,
          });
          const data = fetched.some((entry) => entry.content !== "")
            ? fetched
            : getDefaultRulesets();
          cachedDefaultRulesets = { at: Date.now(), data };
          return data;
        } catch {
          return cachedDefaultRulesets?.data ?? getDefaultRulesets();
        } finally {
          inflightDefaultRulesets = undefined;
        }
      })();
      inflightDefaultRulesets = refresh;
      // Surface background refresh errors without crashing the process; the
      // stale copy below is authoritative for this caller.
      inflightDefaultRulesets.catch(() => undefined);
    }
    return copyRulesetContents(cachedDefaultRulesets.data);
  }
  if (inflightDefaultRulesets) {
    const data = await awaitSharedDefaults(inflightDefaultRulesets, signal);
    if (signal?.aborted) {
      throwOverallTimeout();
    }
    return copyRulesetContents(data);
  }
  const fetchSignal = independentDefaultsSignal();
  inflightDefaultRulesets = (async () => {
    try {
      const fetched = await collectRulesets(getDefaultRulesetConfigs(), {
        signal: fetchSignal,
        timeoutMs: DEFAULT_RULESET_FETCH_TIMEOUT_MS,
      });
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
  try {
    const data = await awaitSharedDefaults(inflightDefaultRulesets, signal);
    if (signal?.aborted) {
      throwOverallTimeout();
    }
    return copyRulesetContents(data);
  } catch (error) {
    if (signal?.aborted) {
      throwOverallTimeout();
    }
    throw error;
  }
}
