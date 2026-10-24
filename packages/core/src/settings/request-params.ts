import { parseRegexMatch } from "./config";
import type { RequestSettings } from "../types/settings";
import { TargetFormat } from "../types/settings";
import { parseTriBool, type TriBool } from "../types/tribool";
import { toInt } from "../utils/string";
import { getAllUrlArgs, getUrlArg } from "../utils/url";

const TARGETS = new Set<string>(Object.values(TargetFormat));

/**
 * `true` when `key` appears anywhere in the query string (`_`/`-`
 * equivalent). Delegates to `getAllUrlArgs` so presence checks share the
 * exact same decoding/precedence as value reads.
 */
function hasArg(query: string, key: string): boolean {
  return getAllUrlArgs(query, key).length > 0;
}

function boolArg(query: string, key: string): boolean {
  // A missing key means `false`; a bare `?flag` (no value) means `true`.
  if (!hasArg(query, key)) {
    return false;
  }
  const value = getUrlArg(query, key).toLowerCase();
  return value === "true" || value === "1" || value === "";
}

function triArg(query: string, key: string): TriBool {
  const value = getUrlArg(query, key);
  return value === "" ? undefined : parseTriBool(value);
}

function listArg(query: string, key: string): string[] {
  const value = getUrlArg(query, key);
  return value === "" ? [] : value.split(",");
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

/** Read the first non-empty value across underscore/hyphen aliases. */
function firstArg(query: string, ...keys: string[]): string {
  for (const key of keys) {
    const value = getUrlArg(query, key);
    if (value !== "") {
      return value;
    }
  }
  return "";
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
      const normalized = raw.trim().toLowerCase();
      if (normalized === "" || normalized === "true" || normalized === "1") {
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
    clashScript: false,
    classicalRuleset: false,
    dedupe: false,
    emoji: [],
    excludeRemarks: [],
    filterDeprecated: false,
    group: [],
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
  settings.includeRemarks = listArg(query, "include");
  settings.excludeRemarks = listArg(query, "exclude");
  settings.userinfoUrl = firstArg(query, "userinfo_url", "userinfo-url", "userinfo");
  settings.userinfoProvider = firstArg(
    query,
    "userinfo_provider",
    "userinfo-provider",
    "userinfo_type",
    "userinfo-type",
  );
  const renameRaw = getUrlArg(query, "rename");
  if (renameRaw !== "") {
    settings.rename = [parseRegexMatch(renameRaw, "@")];
  }
  // `name_regex` accepts the same `match@replacement` form as `rename` and may
  // be repeated; `name_remove` takes a comma-separated list of literals.
  settings.nameRegex = getAllUrlArgs(query, "name_regex")
    .flatMap((raw) => raw.split("\n"))
    .map((raw) => raw.trim())
    .filter((raw) => raw !== "")
    .map((raw) => parseRegexMatch(raw, "@"));
  settings.nameRemove = getAllUrlArgs(query, "name_remove")
    .flatMap((raw) => raw.split(","))
    .map((raw) => raw.trim())
    .filter((raw) => raw !== "");
  const emojiRaw = getUrlArg(query, "emoji");
  if (emojiRaw !== "") {
    settings.emoji = [parseRegexMatch(emojiRaw, ",")];
  }
  return settings;
}
