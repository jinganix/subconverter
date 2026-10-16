import type { RulesetContent, RulesetType } from "../types/ruleset";
import { RulesetType as RulesetTypeEnum } from "../types/ruleset";

const BASIC_TYPES = [
  "DOMAIN",
  "DOMAIN-SUFFIX",
  "DOMAIN-KEYWORD",
  "IP-CIDR",
  "SRC-IP-CIDR",
  "GEOIP",
  "MATCH",
  "FINAL",
];

export const CLASH_RULE_TYPES = [
  ...BASIC_TYPES,
  "IP-CIDR6",
  "SRC-PORT",
  "DST-PORT",
  "PROCESS-NAME",
];

export const SURGE2_RULE_TYPES = [
  ...BASIC_TYPES,
  "IP-CIDR6",
  "USER-AGENT",
  "URL-REGEX",
  "PROCESS-NAME",
  "IN-PORT",
  "DEST-PORT",
  "SRC-IP",
];

export const SURGE_RULE_TYPES = [
  ...BASIC_TYPES,
  "IP-CIDR6",
  "USER-AGENT",
  "URL-REGEX",
  "AND",
  "OR",
  "NOT",
  "PROCESS-NAME",
  "IN-PORT",
  "DEST-PORT",
  "SRC-IP",
];

export const QUANX_RULE_TYPES = [
  ...BASIC_TYPES,
  "USER-AGENT",
  "HOST",
  "HOST-SUFFIX",
  "HOST-KEYWORD",
];

export const SURF_RULE_TYPES = [
  ...BASIC_TYPES,
  "IP-CIDR6",
  "PROCESS-NAME",
  "IN-PORT",
  "DEST-PORT",
  "SRC-IP",
];

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function stripComment(line: string): string {
  const idx = line.indexOf("//");
  return (idx >= 0 ? line.slice(0, idx) : line).trim();
}

function isRuleLine(line: string): boolean {
  return line.length > 0 && line[0] !== ";" && line[0] !== "#" && !line.startsWith("//");
}

/**
 * Convert a ruleset body into the common `TYPE,VALUE[,flag]` Surge dialect.
 * Mirrors ruleconvert.cpp `convertRuleset`.
 */
export function convertRuleset(content: string, type: RulesetType): string {
  if (type === RulesetTypeEnum.Surge) {
    return content;
  }

  if (/^payload:\r?\n/.test(content)) {
    let output = content.replace(/payload:\r?\n/, "");
    output = output.replace(/^\s*-\s+(['"]?)(.*?)\1\s*$/gm, "$2");
    if (type === RulesetTypeEnum.ClashClassical) {
      return output;
    }
    const lines: string[] = [];
    for (let raw of output.split(/\r?\n/)) {
      raw = raw.trim();
      if (raw.includes("//")) {
        raw = stripComment(raw);
      }
      if (!isRuleLine(raw)) {
        continue;
      }
      let prefix: string;
      if (raw.includes("/")) {
        prefix = isIpv4(raw.slice(0, raw.indexOf("/"))) ? "IP-CIDR," : "IP-CIDR6,";
      } else if (raw.startsWith(".") || raw.startsWith("+.")) {
        let keyword = false;
        let value = raw;
        while (value.endsWith(".*")) {
          keyword = true;
          value = value.slice(0, -2);
        }
        prefix = keyword ? "DOMAIN-KEYWORD," : "DOMAIN-SUFFIX,";
        value = value.slice(value.startsWith("+.") ? 2 : value.startsWith(".") ? 1 : 0);
        lines.push(prefix + value);
        continue;
      } else {
        prefix = "DOMAIN,";
      }
      lines.push(prefix + raw);
    }
    return lines.join("\n");
  }

  // QuanX dialect.
  const lines: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    const normalized = line.replace(/^host/i, "DOMAIN").replace(/^ip6-cidr/i, "IP-CIDR6");
    const match =
      /^(DOMAIN(?:-(?:SUFFIX|KEYWORD))?|IP-CIDR6?|USER-AGENT),\s*?(\S*?)(?:,(?!no-resolve).*?)(,no-resolve)?$/i.exec(
        normalized,
      );
    if (match) {
      const ruleType = (match[1] as string).toUpperCase();
      const value = match[2] as string;
      lines.push(`${ruleType},${value}${match[3] ?? ""}`);
    } else {
      lines.push(normalized);
    }
  }
  return lines.join("\n");
}

/** Rewrite `TYPE,VALUE[,flag]` into `TYPE,VALUE,GROUP[,flag]`. */
export function transformRuleToCommon(input: string, group: string, noResolveOnly = false): string {
  const parts = input.split(",");
  if (parts.length < 2) {
    return `${parts[0] ?? ""},${group}`;
  }
  let line = `${parts[0]},${parts[1]},${group}`;
  if (parts.length > 2 && (!noResolveOnly || parts[2] === "no-resolve")) {
    line += `,${parts[2]}`;
  }
  return line;
}

function startsWithAny(line: string, types: string[]): boolean {
  return types.some((type) => line.startsWith(type));
}

function collectRuleLines(content: string, group: string, noResolveOnly: boolean): string[] {
  const converted = convertRuleset(content, RulesetTypeEnum.Surge);
  const out: string[] = [];
  for (const rawLine of converted.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!isRuleLine(line)) {
      continue;
    }
    if (line.includes("//")) {
      line = stripComment(line);
    }
    if (line === "") {
      continue;
    }
    out.push(transformRuleToCommon(line, group, noResolveOnly));
  }
  return out;
}

/** Convert rulesets into an ordered list of Clash rule strings. */
export function rulesetToClashRules(rulesets: RulesetContent[]): string[] {
  const rules: string[] = [];
  for (const ruleset of rulesets) {
    const content = ruleset.content;
    if (content === "") {
      continue;
    }
    const group = ruleset.ruleGroup;
    if (content.startsWith("[]")) {
      let line = content.slice(2);
      if (line.startsWith("FINAL")) {
        line = `MATCH${line.slice(5)}`;
      }
      rules.push(transformRuleToCommon(line, group));
      continue;
    }
    const converted = convertRuleset(content, ruleset.ruleType);
    for (const rawLine of converted.split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!isRuleLine(line)) {
        continue;
      }
      if (!startsWithAny(line, CLASH_RULE_TYPES)) {
        continue;
      }
      if (line.includes("//")) {
        line = stripComment(line);
      }
      rules.push(transformRuleToCommon(line, group));
    }
  }
  return rules;
}

export interface SurgeRulesetResult {
  section: string;
  lines: string[];
}

/** Convert rulesets into Surge/QuanX/Quan/Loon rule lines. */
export function rulesetToSurgeRules(
  rulesets: RulesetContent[],
  surgeVersion: number,
): SurgeRulesetResult {
  let section: string;
  let allowed: string[];
  let noResolveOnly = false;
  switch (surgeVersion) {
    case 0:
      section = "RoutingRule";
      allowed = SURGE_RULE_TYPES;
      break;
    case -1:
      section = "filter_local";
      allowed = QUANX_RULE_TYPES;
      noResolveOnly = true;
      break;
    case -2:
      section = "TCP";
      allowed = QUANX_RULE_TYPES;
      noResolveOnly = true;
      break;
    case -3:
      section = "Rule";
      allowed = SURF_RULE_TYPES;
      break;
    case -4:
      section = "Rule";
      allowed = SURGE_RULE_TYPES;
      break;
    default:
      section = "Rule";
      allowed = surgeVersion > 2 ? SURGE_RULE_TYPES : SURGE2_RULE_TYPES;
      break;
  }
  const lines: string[] = [];
  for (const ruleset of rulesets) {
    if (ruleset.content === "") {
      continue;
    }
    const group = ruleset.ruleGroup;
    if (ruleset.content.startsWith("[]")) {
      let line = ruleset.content.slice(2);
      if (line === "MATCH") {
        line = "FINAL";
      }
      if (surgeVersion === -1 || surgeVersion === -2) {
        line = transformRuleToCommon(line, group, true);
      } else if (!line.startsWith("AND") && !line.startsWith("OR") && !line.startsWith("NOT")) {
        line = transformRuleToCommon(line, group);
      }
      lines.push(line.replace(/,,/g, ","));
      continue;
    }
    for (const rawLine of collectRuleLines(ruleset.content, group, noResolveOnly)) {
      if (surgeVersion === -2 && rawLine.startsWith("IP-CIDR6")) {
        continue;
      }
      if (!startsWithAny(rawLine, allowed)) {
        continue;
      }
      const line =
        surgeVersion === -1 || surgeVersion === -2
          ? rawLine.replace(/^IP-CIDR6/, "IP6-CIDR")
          : rawLine;
      lines.push(line);
    }
  }
  return { lines, section };
}

export const SING_BOX_RULE_TYPES = [
  ...BASIC_TYPES,
  "IP-VERSION",
  "INBOUND",
  "PROTOCOL",
  "NETWORK",
  "GEOSITE",
  "SRC-GEOIP",
  "DOMAIN-REGEX",
  "PROCESS-NAME",
  "PROCESS-PATH",
  "PACKAGE-NAME",
  "PORT",
  "PORT-RANGE",
  "SRC-PORT",
  "SRC-PORT-RANGE",
  "USER",
  "USER-ID",
];

/** A sing-box `route` fragment produced from rulesets. */
export interface SingBoxRoute {
  rules: Record<string, unknown>[];
  final: string;
}

function toSingBoxKey(type: string): string {
  return type
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/ip_cidr6/g, "ip_cidr")
    .replace(/src_/g, "source_");
}

/**
 * Convert rulesets into a sing-box `route` fragment.
 * Mirrors ruleconvert.cpp `rulesetToSingBox`.
 */
export function rulesetToSingBoxRules(rulesets: RulesetContent[]): SingBoxRoute {
  const rules: Record<string, unknown>[] = [{ outbound: "dns-out", protocol: "dns" }];
  let final = "";

  for (const ruleset of rulesets) {
    const content = ruleset.content;
    if (content === "") {
      continue;
    }
    const group = ruleset.ruleGroup;
    if (content.startsWith("[]")) {
      const line = content.slice(2);
      if (line.startsWith("FINAL") || line.startsWith("MATCH")) {
        final = group;
        continue;
      }
      const parts = line.split(",");
      if (parts.length < 2) {
        continue;
      }
      const type = toSingBoxKey(parts[0] as string);
      const value = (parts[1] as string).toLowerCase();
      if (type === "match" || type === "final") {
        rules.push({ outbound: value });
      } else {
        rules.push({ outbound: group, [type]: value });
      }
      continue;
    }

    const converted = convertRuleset(content, ruleset.ruleType);
    const rule: Record<string, unknown> = {};
    for (const rawLine of converted.split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!isRuleLine(line)) {
        continue;
      }
      if (line.includes("//")) {
        line = stripComment(line);
      }
      const args = line.split(",");
      if (args.length < 2) {
        continue;
      }
      const rawType = args[0] as string;
      if (!SING_BOX_RULE_TYPES.includes(rawType)) {
        continue;
      }
      const key = toSingBoxKey(rawType);
      const value = (args[1] as string).toLowerCase();
      const bucket = (rule[key] as string[] | undefined) ?? [];
      bucket.push(value);
      rule[key] = bucket;
    }
    if (Object.keys(rule).length === 0) {
      continue;
    }
    rule.outbound = group;
    rules.push(rule);
  }

  return { final, rules };
}
