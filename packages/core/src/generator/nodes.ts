import type { Proxy } from "../types/proxy";
import { ProxyType } from "../types/proxy";
import type { RegexMatchConfig } from "../types/settings";
import { formatCountryRemark, hasRegionName, normalizeCountryCode } from "../utils/country";

/** Compiled remark/matcher regexes; rules repeat per node so cache them. */
const regexCache = new Map<string, RegExp | undefined>();

function cachedRegex(pattern: string): RegExp | undefined {
  const cached = regexCache.get(pattern);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const compiled = new RegExp(pattern);
    regexCache.set(pattern, compiled);
    return compiled;
  } catch {
    regexCache.set(pattern, undefined);
    return undefined;
  }
}

function toRegex(pattern: string): RegExp {
  return cachedRegex(pattern) ?? /$^/;
}

function regFind(value: string, pattern: string): boolean {
  return toRegex(pattern).test(value);
}

/**
 * Patterns known to blow up the regex engine (mirrors subconverter-rs
 * `REGEX_BLACK_LIST`); requests carrying them are rejected outright.
 */
export const REGEX_BLACKLIST: readonly string[] = ["(.*)*"];

/** `true` when `pattern` exactly matches a blacklisted catastrophic pattern. */
export function isBlacklistedPattern(pattern: string): boolean {
  return REGEX_BLACKLIST.includes(pattern);
}

function regMatch(value: string, pattern: string): boolean {
  const match = toRegex(pattern).exec(value);
  return match !== null && match[0] === value;
}

function regReplace(value: string, pattern: string, replacement: string): string {
  const key = `g \u0000 ${pattern} `;
  let compiled = regexCache.get(key);
  if (compiled === undefined && !regexCache.has(key)) {
    try {
      compiled = new RegExp(pattern, "g");
    } catch {
      // Malformed user-supplied pattern: skip it instead of failing the whole
      // conversion (rename/emoji rules come from configs and query params).
      compiled = undefined;
    }
    regexCache.set(key, compiled);
  }
  if (!compiled) {
    return value;
  }
  // Fresh global regexes start at `lastIndex` 0; the cached one is only
  // ever used synchronously here, but reset defensively for reuse safety.
  compiled.lastIndex = 0;
  return value.replace(compiled, replacement);
}

const TYPE_MATCH_NAMES: Partial<Record<ProxyType, string>> = {
  [ProxyType.AnyTLS]: "ANYTLS",
  [ProxyType.HTTP]: "HTTP",
  [ProxyType.HTTPS]: "HTTPS",
  [ProxyType.Hysteria]: "HYSTERIA",
  [ProxyType.Hysteria2]: "HYSTERIA2",
  [ProxyType.Shadowsocks]: "SS",
  [ProxyType.ShadowsocksR]: "SSR",
  [ProxyType.Snell]: "SNELL",
  [ProxyType.SOCKS5]: "SOCKS5",
  [ProxyType.Trojan]: "TROJAN",
  [ProxyType.TUIC]: "TUIC",
  [ProxyType.VLESS]: "VLESS",
  [ProxyType.VMess]: "VMESS",
  [ProxyType.WireGuard]: "WIREGUARD",
};

/** Parsed `matchRange` outcomes; group/port rules repeat per node. */
const rangeCache = new Map<string, boolean>();

/** Does `target` fall within a subconverter range expression like `1-5,8,!3`? */
export function matchRange(range: string, target: number): boolean {
  const cacheKey = JSON.stringify([range, target]);
  const cached = rangeCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const items = range.split(",");
  let match = false;
  for (const item of items) {
    if (/^-?\d+$/.test(item)) {
      if (Number.parseInt(item, 10) === target) {
        match = true;
      }
    } else if (/^(\d+)-(\d+)$/.test(item)) {
      const m = /^(\d+)-(\d+)$/.exec(item) as RegExpExecArray;
      const begin = Number.parseInt(m[1] as string, 10);
      const end = Number.parseInt(m[2] as string, 10);
      if (target >= begin && target <= end) {
        match = true;
      }
    } else if (/^!-?(\d+)$/.test(item)) {
      match = true;
      const m = /^!-?(\d+)$/.exec(item) as RegExpExecArray;
      if (Number.parseInt(m[1] as string, 10) === target) {
        match = false;
      }
    } else if (/^!(\d+)-(\d+)$/.test(item)) {
      match = true;
      const m = /^!(\d+)-(\d+)$/.exec(item) as RegExpExecArray;
      const begin = Number.parseInt(m[1] as string, 10);
      const end = Number.parseInt(m[2] as string, 10);
      if (target >= begin && target <= end) {
        match = false;
      }
    } else if (/^(\d+)-$/.test(item)) {
      const m = /^(\d+)-$/.exec(item) as RegExpExecArray;
      if (Number.parseInt(m[1] as string, 10) >= target) {
        match = true;
      }
    } else if (/^(\d+)\+$/.test(item)) {
      const m = /^(\d+)\+$/.exec(item) as RegExpExecArray;
      if (Number.parseInt(m[1] as string, 10) <= target) {
        match = true;
      }
    }
  }
  rangeCache.set(cacheKey, match);
  return match;
}

/**
 * Resolve a matcher rule against a node.
 *
 * Returns whether the rule's primary predicate matched; `realRule` receives the
 * remaining remark regex (empty means "match all").
 */
export function applyMatcher(rule: string, node: Proxy): { matched: boolean; realRule: string } {
  if (rule.startsWith("!!GROUP=")) {
    const m = /^!!(?:GROUP)=(.+?)(?:!!(.*))?$/.exec(rule);
    const target = m?.[1] ?? "";
    const realRule = m?.[2] ?? "";
    return { matched: regFind(node.group, target), realRule };
  }
  if (rule.startsWith("!!GROUPID=") || rule.startsWith("!!INSERT=")) {
    const m = /^!!(?:GROUPID|INSERT)=([\d\-+!,]+)(?:!!(.*))?$/.exec(rule);
    const target = m?.[1] ?? "";
    const realRule = m?.[2] ?? "";
    const dir = rule.startsWith("!!INSERT=") ? -1 : 1;
    return { matched: matchRange(target, dir * node.groupId), realRule };
  }
  if (rule.startsWith("!!TYPE=")) {
    const m = /^!!(?:TYPE)=(.+?)(?:!!(.*))?$/.exec(rule);
    const target = m?.[1] ?? "";
    const realRule = m?.[2] ?? "";
    if (node.type === ProxyType.Unknown) {
      return { matched: false, realRule };
    }
    const name = TYPE_MATCH_NAMES[node.type] ?? "";
    return { matched: regMatch(name, target), realRule };
  }
  if (rule.startsWith("!!PORT=")) {
    const m = /^!!(?:PORT)=(.+?)(?:!!(.*))?$/.exec(rule);
    const target = m?.[1] ?? "";
    const realRule = m?.[2] ?? "";
    return { matched: matchRange(target, node.port), realRule };
  }
  if (rule.startsWith("!!SERVER=")) {
    const m = /^!!(?:SERVER)=(.+?)(?:!!(.*))?$/.exec(rule);
    const target = m?.[1] ?? "";
    const realRule = m?.[2] ?? "";
    return { matched: regFind(node.hostname, target), realRule };
  }
  return { matched: true, realRule: rule };
}

/** `true` when a node should be filtered out by the include/exclude remarks. */
export function checkIgnore(
  node: Proxy,
  excludeRemarks: string[],
  includeRemarks: string[],
): boolean {
  const excluded = excludeRemarks.some((rule) => {
    const { matched, realRule } = applyMatcher(rule, node);
    if (!matched) {
      return false;
    }
    if (realRule === "") {
      return true;
    }
    return regFind(node.remark, realRule);
  });
  let included: boolean;
  if (includeRemarks.length > 0) {
    included = includeRemarks.some((rule) => {
      const { matched, realRule } = applyMatcher(rule, node);
      if (!matched) {
        return false;
      }
      if (realRule === "") {
        return true;
      }
      return regFind(node.remark, realRule);
    });
  } else {
    included = true;
  }
  return excluded || !included;
}

/** Remove excluded nodes and renumber the remaining ones in place. */
export function filterNodes(
  nodes: Proxy[],
  excludeRemarks: string[],
  includeRemarks: string[],
  groupId: number,
): void {
  let nodeIndex = 0;
  const kept: Proxy[] = [];
  for (const node of nodes) {
    if (checkIgnore(node, excludeRemarks, includeRemarks)) {
      continue;
    }
    node.id = nodeIndex;
    node.groupId = groupId;
    nodeIndex += 1;
    kept.push(node);
  }
  nodes.length = 0;
  nodes.push(...kept);
}

/** Normalize a remark for output: `=`→`-`, optional CSV quoting, de-duplication. */
export function processRemark(remark: string, remarksList: string[], procComma = true): string {
  // `=` breaks the `name = value` split of every Surge-family format, and a
  // line break would end the line early (injecting config lines).
  let result = remark.replace(/=/g, "-").replace(/[\r\n]+/g, " ");
  if (procComma && result.includes(",")) {
    // These formats have no escape for quotes, so an inner quote would end
    // the name early and swallow the value.
    result = `"${result.replace(/"/g, "'")}"`;
  }
  let tempRemark = result;
  let count = 2;
  while (remarksList.includes(tempRemark)) {
    tempRemark = `${result} ${count}`;
    count += 1;
  }
  return tempRemark;
}

/** Expand a proxy-group `proxies` rule into concrete node remarks. */
export function groupGenerate(
  rule: string,
  nodeList: Proxy[],
  filteredNodeList: string[],
  addDirect: boolean,
): void {
  if (rule.startsWith("[]") && addDirect) {
    filteredNodeList.push(rule.slice(2));
    return;
  }
  for (const node of nodeList) {
    const { matched, realRule } = applyMatcher(rule, node);
    if (
      matched &&
      (realRule === "" || regFind(node.remark, realRule)) &&
      !filteredNodeList.includes(node.remark)
    ) {
      filteredNodeList.push(node.remark);
    }
  }
}

/** Strip leading astral emoji from a remark (mirrors subconverter's byte check). */
export function removeEmoji(originalRemark: string): string {
  let index = 0;
  while (index < originalRemark.length) {
    const code = originalRemark.codePointAt(index) as number;
    if (code >= 0x1f000 && code <= 0x1ffff) {
      index += code > 0xffff ? 2 : 1;
    } else {
      break;
    }
  }
  const remark = originalRemark.slice(index).trim();
  return remark === "" ? originalRemark : remark;
}

/** Prefix an emoji chosen by the emoji rules. */
export function addEmoji(node: Proxy, emojiArray: RegexMatchConfig[]): string {
  for (const rule of emojiArray) {
    if (rule.replace === "") {
      continue;
    }
    const { matched, realRule } = applyMatcher(rule.match, node);
    if (matched && realRule !== "" && regFind(node.remark, realRule)) {
      return `${rule.replace} ${node.remark}`;
    }
  }
  return node.remark;
}

/** Replace every match of the user-supplied regex rules in a node's remark. */
export function nodeNameRegex(node: Proxy, rules: RegexMatchConfig[]): void {
  const original = node.remark;
  for (const rule of rules) {
    if (rule.script !== "" || rule.match === "") {
      continue;
    }
    node.remark = regReplace(node.remark, rule.match, rule.replace);
  }
  if (node.remark === "") {
    node.remark = original;
  }
}

const NAME_SEPARATOR_EDGES = /^[-_.\s]+|[-_.\s]+$/g;
const NAME_SEPARATOR_RUN = /([-_.\s])[-_.\s]+/g;

/**
 * Remove literal fragments from a node's remark (e.g. `foo.server1.bar` with
 * `["foo", "bar"]` -> `server1`). Separators left at the edges or doubled by
 * the removal are collapsed.
 */
export function nodeNameRemove(node: Proxy, removeList: string[]): void {
  const original = node.remark;
  let remark = node.remark;
  let removed = false;
  for (const fragment of removeList) {
    if (fragment === "" || !remark.includes(fragment)) {
      continue;
    }
    remark = remark.split(fragment).join("");
    removed = true;
  }
  if (removed) {
    remark = remark.replace(NAME_SEPARATOR_EDGES, "").replace(NAME_SEPARATOR_RUN, "$1");
  }
  node.remark = remark === "" ? original : remark;
}

/** Apply rename rules to a node's remark (script rules are ignored). */
export function nodeRename(node: Proxy, renameArray: RegexMatchConfig[]): void {
  const original = node.remark;
  for (const rule of renameArray) {
    if (rule.script !== "") {
      continue;
    }
    const { matched, realRule } = applyMatcher(rule.match, node);
    if (matched && realRule !== "") {
      node.remark = regReplace(node.remark, realRule, rule.replace);
    }
  }
  if (node.remark === "") {
    node.remark = original;
  }
}

/**
 * Prefix a node's remark with its ISO server country when the remark does
 * not already mention one (e.g. `server1` -> `US-server1`).
 *
 * `resolve` returns an ISO 3166-1 alpha-2 code; a missing/unknown code leaves
 * the remark untouched. Mirrors the request `auto_country` switch.
 */
export function addCountryPrefix(
  node: Proxy,
  resolve: (node: Proxy) => string | undefined,
): string {
  const remark = node.remark.trim();
  if (hasRegionName(remark)) {
    return node.remark;
  }
  const code = resolve(node);
  if (code === undefined || code === "") {
    return node.remark;
  }
  return formatCountryRemark(remark, code);
}

/**
 * Drop nodes by GeoIP country: keep only `include` codes (unknown countries
 * never match, so they are dropped), then drop `exclude` codes (unknown
 * countries are kept). Invalid codes are ignored.
 */
export function filterNodesByCountry(
  nodes: Proxy[],
  resolve: ((node: Proxy) => string | undefined) | undefined,
  include: string[],
  exclude: string[],
): void {
  const includeSet = new Set(
    include.map((code) => normalizeCountryCode(code)).filter((code) => code !== undefined),
  );
  const excludeSet = new Set(
    exclude.map((code) => normalizeCountryCode(code)).filter((code) => code !== undefined),
  );
  if (includeSet.size === 0 && excludeSet.size === 0) {
    return;
  }
  const kept: Proxy[] = [];
  for (const node of nodes) {
    const code = resolve ? normalizeCountryCode(resolve(node) ?? "") : undefined;
    if (includeSet.size > 0 && (code === undefined || !includeSet.has(code))) {
      continue;
    }
    if (code !== undefined && excludeSet.has(code)) {
      continue;
    }
    kept.push(node);
  }
  nodes.length = 0;
  nodes.push(...kept);
}

export interface PreprocessOptions {
  removeEmoji: boolean;
  addEmoji: boolean;
  sortFlag: boolean;
  renameArray: RegexMatchConfig[];
  emojiArray: RegexMatchConfig[];
  /** User regex rewrites applied before every other naming rule. */
  nameRegexArray?: RegexMatchConfig[];
  /** Literal fragments stripped from names before every other naming rule. */
  nameRemove?: string[];
  autoCountry?: boolean;
  countryResolver?: (node: Proxy) => string | undefined;
  /** Keep only nodes whose GeoIP country is in this ISO code list. */
  includeCountries?: string[];
  /** Drop nodes whose GeoIP country is in this ISO code list. */
  excludeCountries?: string[];
  /** Keep only nodes matching one of these remark rules (empty keeps all). */
  includeRemarks?: string[];
  /** Drop nodes matching one of these remark rules. */
  excludeRemarks?: string[];
}

/** Apply name cleanup, emoji removal, renaming, emoji insertion, and optional sorting. */
export function preprocessNodes(nodes: Proxy[], options: PreprocessOptions): void {
  for (const node of nodes) {
    if (options.removeEmoji) {
      node.remark = removeEmoji(node.remark).trim();
    }
    if (options.nameRegexArray && options.nameRegexArray.length > 0) {
      nodeNameRegex(node, options.nameRegexArray);
    }
    if (options.nameRemove && options.nameRemove.length > 0) {
      nodeNameRemove(node, options.nameRemove);
    }
    nodeRename(node, options.renameArray);
    if (options.addEmoji) {
      node.remark = addEmoji(node, options.emojiArray);
    }
    if (options.autoCountry && options.countryResolver) {
      node.remark = addCountryPrefix(node, options.countryResolver);
    }
  }
  filterNodesByCountry(
    nodes,
    options.countryResolver,
    options.includeCountries ?? [],
    options.excludeCountries ?? [],
  );
  const includeRemarks = options.includeRemarks ?? [];
  const excludeRemarks = options.excludeRemarks ?? [];
  if (includeRemarks.length > 0 || excludeRemarks.length > 0) {
    const kept = nodes.filter((node) => !checkIgnore(node, excludeRemarks, includeRemarks));
    // Renumber without touching groupId (unlike `filterNodes`, which
    // reassigns a single group).
    kept.forEach((node, index) => {
      node.id = index;
    });
    nodes.length = 0;
    nodes.push(...kept);
  }
  if (options.sortFlag) {
    nodes.sort((a, b) => (a.remark < b.remark ? -1 : a.remark > b.remark ? 1 : 0));
  }
}

/** Remove duplicate nodes. Returns the count removed. */
export function dedupeNodes(nodes: Proxy[]): number {
  const seen = new Set<string>();
  const kept: Proxy[] = [];
  for (const node of nodes) {
    // Credentials are part of the key: two nodes on the same server/port
    // with different passwords or user ids are distinct subscriptions.
    const key = `${node.type}\u0000${node.hostname}\u0000${node.port}\u0000${node.remark}\u0000${node.encryptMethod}\u0000${node.password}\u0000${node.userId}\u0000${node.username}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(node);
  }
  const removed = nodes.length - kept.length;
  nodes.length = 0;
  nodes.push(...kept);
  return removed;
}
