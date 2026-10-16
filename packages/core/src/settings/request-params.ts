import { parseRegexMatch } from "./config";
import type { RequestSettings } from "../types/settings";
import { TargetFormat } from "../types/settings";
import { parseTriBool, type TriBool } from "../types/tribool";
import { toInt } from "../utils/string";
import { getUrlArg } from "../utils/url";

const TARGETS = new Set<string>(Object.values(TargetFormat));

function boolArg(query: string, key: string): boolean {
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

/** Base {@link RequestSettings} with subconverter's defaults. */
export function createRequestSettings(): RequestSettings {
  return {
    addEmoji: false,
    appendType: false,
    autoExtract: false,
    clashScript: false,
    classicalRuleset: false,
    emoji: [],
    excludeRemarks: [],
    filterDeprecated: false,
    group: [],
    includeRemarks: [],
    insert: false,
    interval: 0,
    list: false,
    mixin: "",
    newFieldName: false,
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
  settings.addEmoji = boolArg(query, "add_emoji");
  settings.removeEmoji = boolArg(query, "remove_emoji");
  settings.appendType = boolArg(query, "append_type");
  settings.filterDeprecated = boolArg(query, "filter_deprecated");
  settings.newFieldName = boolArg(query, "new_name") || boolArg(query, "new_field_name");
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
  const renameRaw = getUrlArg(query, "rename");
  if (renameRaw !== "") {
    settings.rename = [parseRegexMatch(renameRaw, "@")];
  }
  const emojiRaw = getUrlArg(query, "emoji");
  if (emojiRaw !== "") {
    settings.emoji = [parseRegexMatch(emojiRaw, ",")];
  }
  return settings;
}
