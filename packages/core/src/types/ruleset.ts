/** Ruleset source dialects, mirroring `ruleset_type` in ruleconvert.h. */
export enum RulesetType {
  Surge = "surge",
  QuantumultX = "quanx",
  ClashDomain = "clash-domain",
  ClashIpCidr = "clash-ipcidr",
  ClashClassical = "clash-classical",
}

/** One `ruleset=` entry resolved into a group + remote/local source. */
export interface RulesetConfig {
  group: string;
  url: string;
  interval: number;
}

/** A ruleset with its fetched content and resolved type. */
export interface RulesetContent {
  ruleGroup: string;
  rulePath: string;
  rulePathTyped: string;
  ruleType: RulesetType;
  content: string;
  updateInterval: number;
}

/** Create a ruleset config with subconverter's defaults. */
export function createRulesetConfig(): RulesetConfig {
  return { group: "", interval: 86400, url: "" };
}
