import type { Proxy } from "../types/proxy";
import { ProxyType } from "../types/proxy";
import type { RegexMatchConfig } from "../types/settings";
import { formatCountryRemark, hasRegionName } from "../utils/country";

function toRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch {
    return /$^/;
  }
}

function regFind(value: string, pattern: string): boolean {
  return toRegex(pattern).test(value);
}

function regMatch(value: string, pattern: string): boolean {
  const match = toRegex(pattern).exec(value);
  return match !== null && match[0] === value;
}

function regReplace(value: string, pattern: string, replacement: string): string {
  return value.replace(new RegExp(pattern, "g"), replacement);
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

/** Does `target` fall within a subconverter range expression like `1-5,8,!3`? */
export function matchRange(range: string, target: number): boolean {
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
  let result = remark.replace(/=/g, "-");
  if (procComma && result.includes(",")) {
    result = `"${result}"`;
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
    try {
      node.remark = node.remark.replace(new RegExp(rule.match, "g"), rule.replace);
    } catch {
      // Ignore malformed patterns instead of failing the whole conversion.
    }
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
 * Prefix a node's remark with its server country/region when the remark does
 * not already mention one (e.g. `server1` -> `美国-server1`).
 *
 * `resolve` returns an ISO 3166-1 alpha-2 code; a missing/unknown code leaves
 * the remark untouched. Mirrors the request `auto_country` switch.
 */
export function addCountryPrefix(
  node: Proxy,
  resolve: (node: Proxy) => string | undefined,
  locale = "zh-CN",
): string {
  const remark = node.remark.trim();
  if (hasRegionName(remark)) {
    return node.remark;
  }
  const code = resolve(node);
  if (code === undefined || code === "") {
    return node.remark;
  }
  return formatCountryRemark(remark, code, locale);
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
  countryLocale?: string;
  countryResolver?: (node: Proxy) => string | undefined;
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
      node.remark = addCountryPrefix(
        node,
        options.countryResolver,
        options.countryLocale ?? "zh-CN",
      );
    }
  }
  if (options.sortFlag) {
    nodes.sort((a, b) => (a.remark < b.remark ? -1 : a.remark > b.remark ? 1 : 0));
  }
}

/** Remove nodes that share a type, server, port, and remark. Returns the count removed. */
export function dedupeNodes(nodes: Proxy[]): number {
  const seen = new Set<string>();
  const kept: Proxy[] = [];
  for (const node of nodes) {
    const key = `${node.type}\u0000${node.hostname}\u0000${node.port}\u0000${node.remark}`;
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
