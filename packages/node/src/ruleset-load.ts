import {
  type RulesetConfig,
  type RulesetContent,
  RulesetType,
  getDefaultRulesetConfigs,
  getDefaultRulesets,
  parseRulesetSource,
} from "@subconverter/core";

import { type LoadOptions, fetchSubscription, readSubscriptionFile } from "./fetch";

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
  options: LoadOptions = {},
): Promise<RulesetContent> {
  const { type, url } = parseRulesetSource(config.url);
  let content = "";
  if (url.startsWith("[]")) {
    content = url;
  } else if (/^https?:\/\//i.test(url)) {
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
