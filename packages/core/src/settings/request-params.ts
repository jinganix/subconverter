import { parseRegexMatch } from "./config";
import { isBlacklistedPattern } from "../generator/nodes";
import type { RegexMatchConfig, RequestSettings } from "../types/settings";
import { parseClashFlavor } from "../types/settings";
import { TargetFormat } from "../types/settings";
import { parseTriBool, type TriBool } from "../types/tribool";
import { isUnsafeRegexPattern, toInt } from "../utils/string";
import { getAllUrlArgs, getFirstUrlArg, getUrlArg } from "../utils/url";

/** Every known target format name (including `auto`, the server default). */
export const TARGETS = new Set<string>(Object.values(TargetFormat));

/**
 * `true` when `key` appears anywhere in the query string (`_`/`-`
 * equivalent). Delegates to `getAllUrlArgs` so presence checks share the
 * exact same decoding/precedence as value reads.
 */
function hasArg(query: string, key: string): boolean {
  return getAllUrlArgs(query, key).length > 0;
}

/**
 * `true` for the documented affirmative literals (`true`/`1`/`yes`/`on`,
 * plus a bare `?flag`). Shared by `boolArg` and `queryBoolFlag` so every
 * boolean switch accepts the same values the README documents.
 *
 * Exported so the CLI reuses the exact same accepted literals instead of
 * maintaining a divergent copy.
 */
export function isAffirmative(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function boolArg(query: string, key: string): boolean {
  // A missing key means `false`; a bare `?flag` (no value) means `true`.
  if (!hasArg(query, key)) {
    return false;
  }
  return isAffirmative(getUrlArg(query, key));
}

function triArg(query: string, key: string): TriBool {
  const value = getUrlArg(query, key);
  return value === "" ? undefined : parseTriBool(value);
}

/** `true` when a user-supplied regex must be rejected before compiling. */
function isBlockedRegex(pattern: string): boolean {
  return isBlacklistedPattern(pattern) || isUnsafeRegexPattern(pattern);
}

/** Cap for repeatable filter/rule lists (`include`/`rename`/…); mirrors the
 * server-side `MAX_RULESETS` guard so one request cannot force millions of
 * per-node regex evaluations for everyone else. */
export const MAX_REQUEST_LIST_ENTRIES = 50;
/** Cap for the combined characters of a repeatable filter/rule list. */
export const MAX_REQUEST_LIST_CHARS = 2000;
/**
 * Cap parsed proxy nodes per conversion (DoS mitigation, shared with the
 * server/CLI). Parsers abort in-parse once `nodes.length` exceeds this so a
 * 5MB (~125k-link) body cannot build a full `Proxy[]` before throwing.
 * TODO: have node (`convert.ts`) and CLI import this instead of owning a
 * duplicate `MAX_NODES` constant.
 */
export const MAX_NODES = 3000;

function throwBadRequest(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

function assertListCap(entryCount: number, charCount: number, name: string): void {
  if (entryCount > MAX_REQUEST_LIST_ENTRIES) {
    throwBadRequest(`Too many ${name} (max ${String(MAX_REQUEST_LIST_ENTRIES)}).`);
  }
  if (charCount > MAX_REQUEST_LIST_CHARS) {
    throwBadRequest(`${name} exceeds size limit (max ${String(MAX_REQUEST_LIST_CHARS)} chars).`);
  }
}

/** Repeatable comma-separated remark filters (`?include=a&include=b,c`). */
function listAllArg(query: string, key: string): string[] {
  // Cap the RAW entries before dropping blocked ones: otherwise 100k
  // blocked patterns evaluate the guards yet count as 0 and bypass the cap.
  const rawEntries = getAllUrlArgs(query, key)
    .flatMap((raw) => raw.split(","))
    .map((raw) => raw.trim())
    .filter((raw) => raw !== "");
  assertListCap(
    rawEntries.length,
    rawEntries.reduce((total, entry) => total + entry.length, 0),
    key,
  );
  return rawEntries.filter((raw) => !isBlockedRegex(raw));
}

/** Repeatable `match@replacement` rules (`?rename=a@b&rename=c@d`). */
function parseRegexRules(query: string, key: string, delimiter: string): RegexMatchConfig[] {
  // Cap the RAW parts before dropping blocked ones: otherwise 100k blocked
  // patterns evaluate the guards yet `continue` past the cap (count stays 0).
  const rawParts = getAllUrlArgs(query, key).flatMap((raw) =>
    raw
      .split("\n")
      .map((part) => part.trim())
      .filter((part) => part !== ""),
  );
  assertListCap(
    rawParts.length,
    rawParts.reduce((total, part) => total + part.length, 0),
    key,
  );
  const rules: RegexMatchConfig[] = [];
  let chars = 0;
  for (const trimmed of rawParts) {
    const rule = parseRegexMatch(trimmed, delimiter);
    if (rule.script === "" && isBlockedRegex(rule.match)) {
      continue;
    }
    rules.push(rule);
    chars += rule.match.length + rule.replace.length;
    assertListCap(rules.length, chars, key);
  }
  return rules;
}

function countryListArg(query: string, key: string): string[] {
  const entries = getAllUrlArgs(query, key)
    .flatMap((raw) => raw.split(","))
    .map((raw) => raw.trim().toUpperCase())
    .filter((raw) => raw !== "");
  assertListCap(
    entries.length,
    entries.reduce((total, entry) => total + entry.length, 0),
    key,
  );
  return entries;
}

/**
 * Resolve the Clash field-name style. Defaults to the new `proxies` /
 * `proxy-groups` / `rules` keys; `legacy=true` (or an explicit
 * `new_name=false` / `new_field_name=false`) opts back into the legacy
 * `Proxy` / `Proxy Group` / `Rule` keys.
 *
 * Exported so the CLI reuses the exact same semantics instead of
 * maintaining a divergent copy.
 */
export function resolveNewFieldName(query: string): boolean {
  if (
    boolArg(query, "legacy") ||
    boolArg(query, "legacy_field_name") ||
    boolArg(query, "legacy-field-name")
  ) {
    return false;
  }
  if (
    hasArg(query, "new_name") ||
    hasArg(query, "new_field_name") ||
    hasArg(query, "new-name") ||
    hasArg(query, "new-field-name")
  ) {
    return (
      boolArg(query, "new_name") ||
      boolArg(query, "new_field_name") ||
      boolArg(query, "new-name") ||
      boolArg(query, "new-field-name")
    );
  }
  return true;
}

/**
 * Read a boolean flag across aliases. Returns `undefined` when no alias is
 * present; otherwise `true` when any occurrence is `true`/`1`/bare.
 * Shared by server-side flags (`dedupe`, `sort`, `no_rules`, …) so they
 * share one presence/OR semantic instead of per-callsite copies.
 */
export function queryBoolFlag(query: string, ...keys: string[]): boolean | undefined {
  let found = false;
  let result = false;
  for (const key of keys) {
    for (const raw of getAllUrlArgs(query, key)) {
      found = true;
      if (isAffirmative(raw)) {
        result = true;
      }
    }
  }
  return found ? result : undefined;
}

/** Base {@link RequestSettings} with subconverter's defaults. */
export function createRequestSettings(): RequestSettings {
  return {
    addEmoji: false,
    appendType: false,
    autoCountry: false,
    autoExtract: false,
    clashFlavor: "mihomo",
    clashScript: false,
    classicalRuleset: false,
    dedupe: false,
    devId: "",
    emoji: [],
    excludeCountries: [],
    excludeRemarks: [],
    expand: true,
    filename: "",
    filterDeprecated: false,
    group: [],
    includeCountries: [],
    includeRemarks: [],
    insert: false,
    interval: 0,
    list: false,
    mixin: "",
    nameRegex: [],
    nameRemove: [],
    newFieldName: true,
    nodeList: false,
    proxiesStyle: "flow",
    proxyGroupsStyle: "flow",
    removeEmoji: false,
    rename: [],
    ruleset: [],
    script: "",
    scv: undefined,
    sort: false,
    strict: false,
    target: TargetFormat.Auto,
    tfo: undefined,
    tls13: undefined,
    udp: undefined,
    uploadPath: "",
    url: "",
    userinfoProvider: "",
    userinfoUrl: "",
  };
}

/** Parse a request query string into {@link RequestSettings}. */
export function parseRequestSettings(query: string): RequestSettings {
  const settings = createRequestSettings();
  const target = getUrlArg(query, "target");
  if (TARGETS.has(target)) {
    settings.target = target as TargetFormat;
  }
  settings.url = getUrlArg(query, "url");
  settings.list = boolArg(query, "list");
  settings.nodeList = settings.list;
  // `sort_flag`/`sort-flag` are accepted alongside `sort` to match the
  // server-side `toExtraSettings` aliases (normalization alone cannot map
  // `sort` <-> `sort_flag` since they differ beyond `_`/`-`).
  settings.sort = queryBoolFlag(query, "sort", "sort_flag", "sort-flag") ?? false;
  settings.dedupe = queryBoolFlag(query, "dedupe", "deduplicate") ?? false;
  settings.addEmoji = boolArg(query, "add_emoji");
  settings.removeEmoji = boolArg(query, "remove_emoji");
  settings.autoCountry = boolArg(query, "auto_country");
  settings.appendType = boolArg(query, "append_type");
  settings.filterDeprecated = boolArg(query, "filter_deprecated");
  settings.newFieldName = resolveNewFieldName(query);
  settings.classicalRuleset = boolArg(query, "classical");
  settings.clashFlavor = parseClashFlavor(getFirstUrlArg(query, "flavor"));
  settings.expand = queryBoolFlag(query, "expand") ?? true;
  settings.strict = boolArg(query, "strict");
  settings.filename = getFirstUrlArg(query, "filename");
  settings.devId = getFirstUrlArg(query, "dev_id", "dev-id", "device_id", "device-id");
  settings.insert = getUrlArg(query, "insert") !== "";
  settings.clashScript = boolArg(query, "clash_script");
  settings.autoExtract = boolArg(query, "auto_extract");
  settings.tfo = triArg(query, "tfo");
  settings.udp = triArg(query, "udp");
  settings.scv = triArg(query, "scv");
  settings.tls13 = triArg(query, "tls13");
  settings.interval = toInt(getUrlArg(query, "interval"));
  settings.script = getUrlArg(query, "script");
  settings.mixin = getUrlArg(query, "mixin");
  settings.uploadPath = getUrlArg(query, "upload_path");
  settings.proxiesStyle = getUrlArg(query, "proxies_style") || "flow";
  settings.proxyGroupsStyle = getUrlArg(query, "proxy_groups_style") || "flow";
  settings.includeRemarks = listAllArg(query, "include");
  settings.excludeRemarks = listAllArg(query, "exclude");
  settings.includeCountries = countryListArg(query, "include_country");
  settings.excludeCountries = countryListArg(query, "exclude_country");
  settings.userinfoUrl = getFirstUrlArg(query, "userinfo_url", "userinfo-url", "userinfo");
  settings.userinfoProvider = getFirstUrlArg(
    query,
    "userinfo_provider",
    "userinfo-provider",
    "userinfo_type",
    "userinfo-type",
  );
  settings.rename = parseRegexRules(query, "rename", "@");
  // `name_regex` accepts the same `match@replacement` form as `rename` and may
  // be repeated; `name_remove` takes a comma-separated list of literals.
  settings.nameRegex = parseRegexRules(query, "name_regex", "@");
  settings.nameRemove = (() => {
    const entries = getAllUrlArgs(query, "name_remove")
      .flatMap((raw) => raw.split(","))
      .map((raw) => raw.trim())
      .filter((raw) => raw !== "");
    assertListCap(
      entries.length,
      entries.reduce((total, entry) => total + entry.length, 0),
      "name_remove",
    );
    return entries;
  })();
  settings.emoji = parseRegexRules(query, "emoji", ",");
  return settings;
}
