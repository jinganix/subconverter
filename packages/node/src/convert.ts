import {
  type ExtraSettings,
  type Proxy,
  type ProxyGroupConfig,
  type RequestSettings,
  type RulesetConfig,
  type RulesetContent,
  type TargetFormat,
  createExtraSettings,
  createRequestSettings,
  getDefaultProxyGroups,
} from "@subconverter/core";

import { type SubscriptionSource, loadNodes } from "./fetch";
import { countryResolverFrom, getGeoIpDatabase, resolveNodeCountries } from "./geoip";
import { collectRulesets, getCachedDefaultRulesets } from "./ruleset-load";

/** A fully-resolved conversion request. */
export interface ConvertRequest {
  sources: SubscriptionSource[];
  target: TargetFormat;
  extraProxyGroup?: ProxyGroupConfig[];
  rulesets?: RulesetConfig[];
  settings?: Partial<ExtraSettings>;
  /**
   * Local MaxMind `.mmdb` database (GeoLite2/GeoIP2 Country or City) used to
   * prefix node names with their country when `settings.autoCountry` is on.
   */
  geoipPath?: string;
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

/** Load every source and merge the resulting nodes, tagging source N with group id N. */
export async function collectNodes(sources: SubscriptionSource[]): Promise<Proxy[]> {
  const all: Proxy[] = [];
  for (const [index, source] of sources.entries()) {
    all.push(...(await loadNodes(source, index)));
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
  const nodes = await collectNodes(request.sources);
  const settings: ExtraSettings = { ...createExtraSettings(), ...request.settings };
  const needsCountry =
    settings.autoCountry ||
    settings.includeCountries.length > 0 ||
    settings.excludeCountries.length > 0;
  if (needsCountry && settings.countryResolver === undefined) {
    if (request.geoipPath === undefined) {
      throw new Error(
        "autoCountry and country filters require a GeoIP database: pass `geoipPath` (a GeoLite2/GeoIP2 .mmdb file).",
      );
    }
    settings.countryResolver = await buildCountryResolver(nodes, request.geoipPath);
  }
  return {
    extraProxyGroup,
    includeRules,
    nodes,
    rulesets,
    settings,
    target: request.target,
  };
}

/**
 * GeoIP-resolve every node's country and return a synchronous resolver for
 * core preprocessing. A missing database is an error: silently dropping the
 * prefix would be confusing, so callers surface it.
 */
export async function buildCountryResolver(
  nodes: Proxy[],
  geoipPath: string,
): Promise<(node: Proxy) => string | undefined> {
  const database = await getGeoIpDatabase(geoipPath);
  return countryResolverFrom(await resolveNodeCountries(nodes, database));
}

/** Default {@link RequestSettings} derived from a conversion target. */
export function defaultRequestSettings(target: TargetFormat): RequestSettings {
  return {
    ...createRequestSettings(),
    target,
  };
}
