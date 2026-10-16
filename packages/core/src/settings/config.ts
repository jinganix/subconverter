import type { ProxyGroupConfig } from "../types/proxy-group";
import { BalanceStrategy, ProxyGroupType } from "../types/proxy-group";
import type { RulesetConfig } from "../types/ruleset";
import type { RegexMatchConfig } from "../types/settings";
import { parseIni } from "../utils/ini";
import { startsWith, toInt } from "../utils/string";

/** A parsed subconverter external configuration file. */
export interface ExternalConfig {
  groups: ProxyGroupConfig[];
  rulesets: RulesetConfig[];
  rename: RegexMatchConfig[];
  emoji: RegexMatchConfig[];
  includeRemarks: string[];
  excludeRemarks: string[];
  addEmoji: boolean;
  removeEmoji: boolean;
  enableRuleGenerator: boolean;
  overwriteOriginalRules: boolean;
  baseFiles: Record<string, string>;
  templatePath: string;
  templateVars: Record<string, string>;
}

const GROUP_TYPE_MAP: Record<string, ProxyGroupType> = {
  fallback: ProxyGroupType.Fallback,
  "load-balance": ProxyGroupType.LoadBalance,
  relay: ProxyGroupType.Relay,
  select: ProxyGroupType.Select,
  smart: ProxyGroupType.Smart,
  ssid: ProxyGroupType.SSID,
  "url-test": ProxyGroupType.URLTest,
};

/** Parse `interval[,timeout[,tolerance]]`, mirroring `parseGroupTimes`. */
export function parseGroupTimes(src: string): {
  interval: number;
  timeout: number;
  tolerance: number;
} {
  const [interval = "", timeout = "", tolerance = ""] = src.split(",");
  return {
    interval: toInt(interval),
    timeout: toInt(timeout),
    tolerance: toInt(tolerance),
  };
}

/** Parse a `name`type`rule...` INI proxy-group definition. */
export function parseCustomProxyGroup(value: string): ProxyGroupConfig | undefined {
  const parts = value.split("`");
  if (parts.length < 3) {
    return undefined;
  }
  const name = parts[0] as string;
  const typeName = parts[1] as string;
  const type = GROUP_TYPE_MAP[typeName];
  if (type === undefined) {
    return undefined;
  }
  const group: ProxyGroupConfig = {
    disableUdp: undefined,
    evaluateBeforeUse: undefined,
    interval: 0,
    lazy: undefined,
    name,
    persistent: undefined,
    proxies: [],
    strategy: BalanceStrategy.ConsistentHashing,
    timeout: 5,
    tolerance: 0,
    type,
    url: "",
    usingProvider: [],
  };
  let upperBound = parts.length;
  if (
    type === ProxyGroupType.URLTest ||
    type === ProxyGroupType.LoadBalance ||
    type === ProxyGroupType.Fallback
  ) {
    if (upperBound < 5) {
      return undefined;
    }
    upperBound -= 2;
    group.url = parts[upperBound] as string;
    const times = parseGroupTimes(parts[upperBound + 1] as string);
    group.interval = times.interval;
    group.timeout = times.timeout;
    group.tolerance = times.tolerance;
  }
  for (let i = 2; i < upperBound; i += 1) {
    const rule = parts[i] as string;
    if (startsWith(rule, "!!PROVIDER=")) {
      group.usingProvider.push(...rule.slice(11).split(","));
    } else {
      group.proxies.push(rule);
    }
  }
  return group;
}

/** Parse a `group,url[,interval]` or `group,[]RULE` INI ruleset definition. */
export function parseRulesetConfig(value: string): RulesetConfig | undefined {
  const pos = value.indexOf(",");
  if (pos === -1) {
    return undefined;
  }
  const group = value.slice(0, pos);
  const config: RulesetConfig = { group, interval: 86400, url: "" };
  if (value.slice(pos + 1, pos + 3) === "[]") {
    config.url = value.slice(pos + 1);
    return config;
  }
  const endPos = value.lastIndexOf(",");
  if (endPos !== pos) {
    config.interval = toInt(value.slice(endPos + 1));
    config.url = value.slice(pos + 1, endPos);
  } else {
    config.url = value.slice(pos + 1);
  }
  return config;
}

/** Parse a rename/emoji rule using a delimiter (mirrors `from_ini`). */
export function parseRegexMatch(value: string, delimiter: string): RegexMatchConfig {
  if (startsWith(value, "script:")) {
    return { match: "", replace: "", script: value.slice(7) };
  }
  const pos = value.lastIndexOf(delimiter);
  const match = pos === -1 ? value : value.slice(0, pos);
  const replace = pos !== -1 && pos < value.length - 1 ? value.slice(pos + 1) : "";
  return { match, replace, script: "" };
}

/** Parse a subconverter external configuration file. */
export function parseExternalConfig(content: string): ExternalConfig {
  const result: ExternalConfig = {
    addEmoji: false,
    baseFiles: {},
    emoji: [],
    enableRuleGenerator: true,
    excludeRemarks: [],
    groups: [],
    includeRemarks: [],
    overwriteOriginalRules: true,
    removeEmoji: false,
    rename: [],
    rulesets: [],
    templatePath: "",
    templateVars: {},
  };

  const doc = parseIni(content, { keepEmptyValues: true });
  for (const section of doc.sections) {
    if (section.name.toLowerCase() !== "template") {
      continue;
    }
    for (const [key, value] of section.items) {
      if (key.toLowerCase() === "template_path") {
        result.templatePath = value;
      } else {
        result.templateVars[key] = value;
      }
    }
  }
  const relevant = doc.sections.filter((section) => section.name.toLowerCase() === "custom");
  const sections = relevant.length > 0 ? relevant : [{ items: [...doc.isolated], name: "custom" }];

  for (const section of sections) {
    for (const [keyRaw, value] of section.items) {
      const key = keyRaw.toLowerCase();
      switch (key) {
        case "ruleset": {
          const parsed = parseRulesetConfig(value);
          if (parsed) {
            result.rulesets.push(parsed);
          }
          break;
        }
        case "custom_proxy_group": {
          const parsed = parseCustomProxyGroup(value);
          if (parsed) {
            result.groups.push(parsed);
          }
          break;
        }
        case "rename":
        case "rename_node":
          result.rename.push(parseRegexMatch(value, "@"));
          break;
        case "emoji":
        case "emojis":
          result.emoji.push(parseRegexMatch(value, ","));
          break;
        case "include_remarks":
        case "include":
          if (value !== "") {
            result.includeRemarks.push(value);
          }
          break;
        case "exclude_remarks":
        case "exclude":
          if (value !== "") {
            result.excludeRemarks.push(value);
          }
          break;
        case "add_emoji":
          result.addEmoji = value.toLowerCase() === "true";
          break;
        case "remove_old_emoji":
        case "remove_emoji":
          result.removeEmoji = value.toLowerCase() === "true";
          break;
        case "enable_rule_generator":
          result.enableRuleGenerator = value.toLowerCase() !== "false";
          break;
        case "overwrite_original_rules":
          result.overwriteOriginalRules = value.toLowerCase() !== "false";
          break;
        default:
          if (key.endsWith("_rule_base")) {
            result.baseFiles[key] = value;
          }
          break;
      }
    }
  }
  return result;
}
