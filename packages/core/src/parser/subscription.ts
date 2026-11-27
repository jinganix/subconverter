import { explodeSurge, parseClashText, parseConfContent } from "./conf";
import { explodeNetch } from "./netch";
import {
  explodeAnyTls,
  explodeHttp,
  explodeHttpSub,
  explodeHysteria,
  explodeHysteria2,
  explodeSnell,
  explodeSs,
  explodeSsr,
  explodeSocks,
  explodeSsd,
  explodeTrojan,
  explodeTuic,
  explodeVless,
  explodeVmess,
  explodeWireguard,
  isLink,
} from "./uri";
import { MAX_NODES } from "../settings/request-params";
import type { Proxy } from "../types/proxy";
import { ProxyType, createProxy } from "../types/proxy";
import { tryBase64Decode } from "../utils/base64";
import { startsWith, stripBom } from "../utils/string";

/** Parse a single proxy link into `node`. */
export function explode(link: string, node: Proxy): void {
  if (startsWith(link, "ssr://")) {
    explodeSsr(link, node);
  } else if (startsWith(link, "vmess://") || startsWith(link, "vmess1://")) {
    explodeVmess(link, node);
  } else if (startsWith(link, "ss://")) {
    explodeSs(link, node);
  } else if (
    startsWith(link, "socks://") ||
    startsWith(link, "https://t.me/socks") ||
    startsWith(link, "tg://socks")
  ) {
    explodeSocks(link, node);
  } else if (startsWith(link, "https://t.me/http") || startsWith(link, "tg://http")) {
    explodeHttp(link, node);
  } else if (startsWith(link, "Netch://")) {
    explodeNetch(link, node);
  } else if (startsWith(link, "trojan://")) {
    explodeTrojan(link, node);
  } else if (startsWith(link, "vless://")) {
    explodeVless(link, node);
  } else if (startsWith(link, "tuic://")) {
    explodeTuic(link, node);
  } else if (startsWith(link, "snell://")) {
    explodeSnell(link, node);
  } else if (startsWith(link, "hysteria://")) {
    explodeHysteria(link, node);
  } else if (startsWith(link, "wg://") || startsWith(link, "wireguard://")) {
    explodeWireguard(link, node);
  } else if (link.includes("hysteria2://") || link.includes("hy2://")) {
    explodeHysteria2(link, node);
  } else if (startsWith(link, "anytls://")) {
    explodeAnyTls(link, node);
  } else if (isLink(link)) {
    explodeHttpSub(link, node);
  }
}

/** Parse a link string, returning a node when recognized. */
export function parseLink(link: string): Proxy | undefined {
  const node = createProxy();
  explode(link, node);
  return node.type === ProxyType.Unknown ? undefined : node;
}

/** Throw a 400 once the in-parse node cap is exceeded (DoS guard). */
function throwTooManyNodes(limit: number): never {
  throw Object.assign(new Error(`Too many proxy nodes (max ${String(limit)}).`), {
    statusCode: 400,
  });
}

/**
 * Parse a subscription body: SSD, Clash YAML, Surge INI, or a newline/space
 * delimited base64 list of links. Mirrors `explodeSub`.
 *
 * Threads `limit` to every parser so a 5MB (~125k-link) body aborts in-parse
 * instead of building a full `Proxy[]` before the cap is enforced.
 */
export function explodeSub(sub: string, nodes: Proxy[], limit: number = MAX_NODES): void {
  let processed = false;

  if (startsWith(sub, "ssd://")) {
    explodeSsd(sub, nodes, limit);
    processed = true;
  }

  if (!processed && /"?(Proxy|proxies)"?:/.test(sub)) {
    if (parseClashText(sub, nodes, limit)) {
      processed = true;
    }
  }

  if (!processed && explodeSurge(sub, nodes, limit)) {
    processed = true;
  }

  if (processed) {
    return;
  }

  // Providers serve either a base64 blob or plain text; `tryBase64Decode`
  // passes plain text through untouched, so one path handles both.
  const body = tryBase64Decode(sub);
  if (/(vmess|shadowsocks|http|trojan)\s*?=/.test(body)) {
    if (explodeSurge(body, nodes, limit)) {
      return;
    }
  }
  splitLinks(body, nodes, limit);
}

/** Explicit proxy-link schemes (mirrors `explode` dispatch, lowercased). */
const LINK_SCHEME_PREFIXES = [
  "ssr://",
  "vmess://",
  "vmess1://",
  "ss://",
  "socks://",
  "https://t.me/socks",
  "tg://socks",
  "https://t.me/http",
  "tg://http",
  "netch://",
  "trojan://",
  "vless://",
  "tuic://",
  "snell://",
  "hysteria://",
  "hysteria2://",
  "hy2://",
  "wg://",
  "wireguard://",
  "anytls://",
  "ssd://",
];

/**
 * `true` when a whitespace-separated token starts a new link.
 *
 * Only known proxy schemes split: a bare `https://example.com` inside a
 * remark (`ss://...#my https://example.com`) must continue the remark
 * instead of truncating it. Generic `http(s)://` starts a link only in
 * credential form — a base64 body (`http://dXNlcjpw...`) with no dots,
 * slashes, or other URL characters — matching what `explodeHttpSub`
 * actually parses.
 */
function isLinkStart(token: string): boolean {
  const lower = token.toLowerCase();
  for (const prefix of LINK_SCHEME_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return true;
    }
  }
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    const after = token.slice(token.indexOf("://") + 3);
    const body = after.split(/[?#]/, 1)[0] ?? "";
    return body !== "" && /^[A-Za-z0-9+/_=-]+$/.test(body);
  }
  return false;
}

/**
 * Split a decoded subscription body into links.
 *
 * Links arrive whitespace-separated (one per line, or space-separated per
 * the README), but remarks may legally contain spaces (`ss://...#my node`), so
 * a naive space split would truncate them while a pure line split fuses
 * space-separated links into one broken node. Split on any whitespace, then
 * re-join link-aware: a token with a known proxy scheme starts a new link,
 * anything else continues the previous link's remark (stray text before the
 * first link is dropped).
 */
function splitLinks(body: string, nodes: Proxy[], limit: number = MAX_NODES): void {
  let current = "";
  const flush = (): void => {
    if (current === "") {
      return;
    }
    // Providers and copy-pasted configs often indent lines; dispatch is
    // prefix-based (`startsWith`), so untrimmed links would silently drop.
    const link = current.trim();
    current = "";
    const node = createProxy();
    explode(link, node);
    if (node.type === ProxyType.Unknown) {
      return;
    }
    nodes.push(node);
    if (nodes.length > limit) {
      throwTooManyNodes(limit);
    }
  };
  for (const token of body.split(/\s+/)) {
    if (token === "") {
      continue;
    }
    if (isLinkStart(token)) {
      flush();
      current = token;
    } else if (current !== "") {
      current += ` ${token}`;
    }
  }
  flush();
}

/**
 * Parse a config blob (Clash/SS/SSR/V2Ray/SSTap/Netch) or a subscription.
 *
 * `groupId` tags every parsed node, mirroring upstream: nodes from the Nth
 * `url` get group id N so `!!GROUPID=`/`!!INSERT=` rules can target one source.
 * `limit` caps the parsed nodes (default `MAX_NODES`); exceeding it throws a
 * `statusCode: 400` error in-parse instead of after a full `Proxy[]` build.
 */
export function parseSubscription(
  content: string,
  groupId = 0,
  limit: number = MAX_NODES,
): Proxy[] {
  const nodes: Proxy[] = [];
  const text = stripBom(content);
  if (!parseConfContent(text, nodes, limit)) {
    explodeSub(text, nodes, limit);
  }
  if (nodes.length > limit) {
    throwTooManyNodes(limit);
  }
  for (const node of nodes) {
    node.groupId = groupId;
  }
  return nodes;
}
