import type { ProxyGroupConfig } from "../types/proxy-group";
import { BalanceStrategy, ProxyGroupType } from "../types/proxy-group";
import type { RulesetConfig } from "../types/ruleset";
import { RulesetType } from "../types/ruleset";
import type { RegexMatchConfig } from "../types/settings";
import { parseIni } from "../utils/ini";
import { startsWith, toInt } from "../utils/string";

/** `ruleset=` dialect prefixes (`surge:`, `quanx:`, `clash-domain:`, …). */
export const RULESET_TYPE_PREFIXES: ReadonlyArray<readonly [string, RulesetType]> = [
  ["surge:", RulesetType.Surge],
  ["quanx:", RulesetType.QuantumultX],
  ["quantumultx:", RulesetType.QuantumultX],
  ["clash-domain:", RulesetType.ClashDomain],
  ["clash-ipcidr:", RulesetType.ClashIpCidr],
  ["clash-classic:", RulesetType.ClashClassical],
  ["clash:", RulesetType.ClashClassical],
];

/** Split a ruleset source into its dialect prefix plus the bare URL/content. */
export function parseRulesetSource(source: string): { url: string; type?: RulesetType } {
  for (const [prefix, type] of RULESET_TYPE_PREFIXES) {
    if (source.toLowerCase().startsWith(prefix)) {
      return { type, url: source.slice(prefix.length) };
    }
  }
  return { url: source };
}

/** A parsed subconverter external configuration file. */
export interface ExternalConfig {
  groups: ProxyGroupConfig[];
  rulesets: RulesetConfig[];
  rename: RegexMatchConfig[];
  emoji: RegexMatchConfig[];
  nameRegex: RegexMatchConfig[];
  nameRemove: string[];
  includeRemarks: string[];
  excludeRemarks: string[];
  includeCountries: string[];
  excludeCountries: string[];
  addEmoji: boolean;
  removeEmoji: boolean;
  autoCountry: boolean;
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

/** Per-group cap for `custom_proxy_group` rules (DoS mitigation). */
const MAX_GROUP_PROXY_ENTRIES = 100;
/** Total cap across all `custom_proxy_group` rules in one config. */
const MAX_GROUP_PROXY_TOTAL_ENTRIES = 200;
/** Cap for combined rule characters (per-group and total; mirrors request-params 2000). */
const MAX_GROUP_PROXY_CHARS = 2000;
/** Cap external-config ruleset entries (mirrors server `MAX_RULESETS`).
 * Local copy (not imported from `request-params`) to avoid a `config` <->
 * `request-params` import cycle (`request-params` imports `parseRegexMatch`).
 */
const MAX_EXTERNAL_RULESETS = 20;
/** Cap external-config group entries (mirrors server `MAX_GROUPS`). */
const MAX_EXTERNAL_GROUPS = 20;
/** Cap repeatable external-config lists (mirrors `request-params` 50/2000). */
const MAX_EXTERNAL_LIST_ENTRIES = 50;
const MAX_EXTERNAL_LIST_CHARS = 2000;

function throwBadRequest(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

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
  let proxyChars = 0;
  for (let i = 2; i < upperBound; i += 1) {
    const rule = parts[i] as string;
    if (startsWith(rule, "!!PROVIDER=")) {
      const providers = rule.slice(11).split(",");
      if (
        group.proxies.length + group.usingProvider.length + providers.length >
        MAX_GROUP_PROXY_ENTRIES
      ) {
        throwBadRequest(
          `Too many custom_proxy_group rules (max ${String(MAX_GROUP_PROXY_ENTRIES)} per group).`,
        );
      }
      proxyChars += rule.length;
      if (proxyChars > MAX_GROUP_PROXY_CHARS) {
        throwBadRequest(
          `custom_proxy_group exceeds size limit (max ${String(MAX_GROUP_PROXY_CHARS)} chars).`,
        );
      }
      group.usingProvider.push(...providers);
    } else {
      if (group.proxies.length + group.usingProvider.length + 1 > MAX_GROUP_PROXY_ENTRIES) {
        throwBadRequest(
          `Too many custom_proxy_group rules (max ${String(MAX_GROUP_PROXY_ENTRIES)} per group).`,
        );
      }
      proxyChars += rule.length;
      if (proxyChars > MAX_GROUP_PROXY_CHARS) {
        throwBadRequest(
          `custom_proxy_group exceeds size limit (max ${String(MAX_GROUP_PROXY_CHARS)} chars).`,
        );
      }
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
    autoCountry: false,
    baseFiles: {},
    emoji: [],
    enableRuleGenerator: true,
    excludeCountries: [],
    excludeRemarks: [],
    groups: [],
    includeCountries: [],
    includeRemarks: [],
    nameRegex: [],
    nameRemove: [],
    overwriteOriginalRules: true,
    removeEmoji: false,
    rename: [],
    rulesets: [],
    templatePath: "",
    templateVars: {},
  };

  const doc = parseIni(content, { keepEmptyValues: true });
  let templateChars = 0;
  for (const section of doc.sections) {
    if (section.name.toLowerCase() !== "template") {
      continue;
    }
    for (const [key, value] of section.items) {
      if (key.toLowerCase() === "template_path") {
        // Unused server-side but still capped so an evil config cannot stash
        // an unbounded path string here (same 2000-char budget as lists).
        if (value.length > MAX_EXTERNAL_LIST_CHARS) {
          throwBadRequest(
            `templatePath exceeds size limit (max ${String(MAX_EXTERNAL_LIST_CHARS)} chars).`,
          );
        }
        result.templatePath = value;
      } else {
        result.templateVars[key] = value;
        templateChars += key.length + value.length;
        if (Object.keys(result.templateVars).length > MAX_EXTERNAL_LIST_ENTRIES) {
          throwBadRequest(`Too many templateVars (max ${String(MAX_EXTERNAL_LIST_ENTRIES)}).`);
        }
        if (templateChars > MAX_EXTERNAL_LIST_CHARS) {
          throwBadRequest(
            `templateVars exceeds size limit (max ${String(MAX_EXTERNAL_LIST_CHARS)} chars).`,
          );
        }
      }
    }
  }
  // Per-list char budgets (mirrors `request-params` 50-entry/2000-char caps so
  // an evil config cannot force the server to allocate 100k entries before
  // the post-merge `assertMergedListCap` ever runs).
  let renameChars = 0;
  let emojiChars = 0;
  let nameRegexChars = 0;
  let nameRemoveChars = 0;
  let includeChars = 0;
  let excludeChars = 0;
  let includeCountryChars = 0;
  let excludeCountryChars = 0;
  let baseFilesChars = 0;
  const assertExternalListCap = (count: number, chars: number, name: string): void => {
    if (count > MAX_EXTERNAL_LIST_ENTRIES) {
      throwBadRequest(`Too many ${name} (max ${String(MAX_EXTERNAL_LIST_ENTRIES)}).`);
    }
    if (chars > MAX_EXTERNAL_LIST_CHARS) {
      throwBadRequest(`${name} exceeds size limit (max ${String(MAX_EXTERNAL_LIST_CHARS)} chars).`);
    }
  };
  const relevant = doc.sections.filter((section) => section.name.toLowerCase() === "custom");
  const sections = relevant.length > 0 ? relevant : [{ items: [...doc.isolated], name: "custom" }];
  let totalProxyEntries = 0;
  let totalProxyChars = 0;

  for (const section of sections) {
    for (const [keyRaw, value] of section.items) {
      const key = keyRaw.toLowerCase();
      switch (key) {
        case "ruleset": {
          const parsed = parseRulesetConfig(value);
          if (parsed) {
            if (result.rulesets.length >= MAX_EXTERNAL_RULESETS) {
              throwBadRequest(`Too many rulesets (max ${String(MAX_EXTERNAL_RULESETS)}).`);
            }
            result.rulesets.push(parsed);
          }
          break;
        }
        case "custom_proxy_group": {
          const parsed = parseCustomProxyGroup(value);
          if (parsed) {
            const entries = parsed.proxies.length + parsed.usingProvider.length;
            let chars = 0;
            for (const rule of parsed.proxies) {
              chars += rule.length;
            }
            for (const provider of parsed.usingProvider) {
              chars += provider.length;
            }
            totalProxyEntries += entries;
            totalProxyChars += chars;
            if (totalProxyEntries > MAX_GROUP_PROXY_TOTAL_ENTRIES) {
              throwBadRequest(
                `Too many custom_proxy_group rules (max ${String(MAX_GROUP_PROXY_TOTAL_ENTRIES)} total).`,
              );
            }
            if (totalProxyChars > MAX_GROUP_PROXY_CHARS) {
              throwBadRequest(
                `custom_proxy_group exceeds size limit (max ${String(MAX_GROUP_PROXY_CHARS)} chars total).`,
              );
            }
            if (result.groups.length >= MAX_EXTERNAL_GROUPS) {
              throwBadRequest(`Too many groups (max ${String(MAX_EXTERNAL_GROUPS)}).`);
            }
            result.groups.push(parsed);
          }
          break;
        }
        case "rename":
        case "rename_node": {
          const rule = parseRegexMatch(value, "@");
          result.rename.push(rule);
          renameChars += rule.match.length + rule.replace.length;
          assertExternalListCap(result.rename.length, renameChars, "rename");
          break;
        }
        case "name_regex": {
          const rule = parseRegexMatch(value, "@");
          result.nameRegex.push(rule);
          nameRegexChars += rule.match.length + rule.replace.length;
          assertExternalListCap(result.nameRegex.length, nameRegexChars, "name_regex");
          break;
        }
        case "name_remove":
          for (const fragment of value.split(",")) {
            const trimmed = fragment.trim();
            if (trimmed !== "") {
              result.nameRemove.push(trimmed);
              nameRemoveChars += trimmed.length;
              assertExternalListCap(result.nameRemove.length, nameRemoveChars, "name_remove");
            }
          }
          break;
        case "emoji":
        case "emojis": {
          const rule = parseRegexMatch(value, ",");
          result.emoji.push(rule);
          emojiChars += rule.match.length + rule.replace.length;
          assertExternalListCap(result.emoji.length, emojiChars, "emoji");
          break;
        }
        case "include_remarks":
        case "include":
          if (value !== "") {
            result.includeRemarks.push(value);
            includeChars += value.length;
            assertExternalListCap(result.includeRemarks.length, includeChars, "include");
          }
          break;
        case "include_country":
          for (const fragment of value.split(",")) {
            const trimmed = fragment.trim().toUpperCase();
            if (trimmed !== "") {
              result.includeCountries.push(trimmed);
              includeCountryChars += trimmed.length;
              assertExternalListCap(
                result.includeCountries.length,
                includeCountryChars,
                "include_country",
              );
            }
          }
          break;
        case "exclude_country":
          for (const fragment of value.split(",")) {
            const trimmed = fragment.trim().toUpperCase();
            if (trimmed !== "") {
              result.excludeCountries.push(trimmed);
              excludeCountryChars += trimmed.length;
              assertExternalListCap(
                result.excludeCountries.length,
                excludeCountryChars,
                "exclude_country",
              );
            }
          }
          break;
        case "exclude_remarks":
        case "exclude":
          if (value !== "") {
            result.excludeRemarks.push(value);
            excludeChars += value.length;
            assertExternalListCap(result.excludeRemarks.length, excludeChars, "exclude");
          }
          break;
        case "add_emoji":
          result.addEmoji = value.toLowerCase() === "true";
          break;
        case "auto_country":
        case "country":
          result.autoCountry = value.toLowerCase() === "true";
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
            // Unused server-side (`baseConf` only accepts remote URLs) but
            // still capped like every other repeatable list so an evil
            // config cannot stash 100k entries here.
            baseFilesChars += key.length + value.length;
            assertExternalListCap(
              Object.keys(result.baseFiles).length + 1,
              baseFilesChars,
              "baseFiles",
            );
            result.baseFiles[key] = value;
          }
          break;
      }
    }
  }
  return result;
}
