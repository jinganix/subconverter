import { explodeSurge, parseClashText, parseConfContent } from "./conf";
import { explodeNetch } from "./netch";
import {
  explodeAnyTls,
  explodeHttp,
  explodeHttpSub,
  explodeHysteria2,
  explodeSs,
  explodeSsr,
  explodeSocks,
  explodeSsd,
  explodeTrojan,
  explodeTuic,
  explodeVless,
  explodeVmess,
  isLink,
} from "./uri";
import type { Proxy } from "../types/proxy";
import { ProxyType, createProxy } from "../types/proxy";
import { urlSafeBase64Decode } from "../utils/base64";
import { countOccurrences, startsWith } from "../utils/string";

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

/**
 * Parse a subscription body: SSD, Clash YAML, Surge INI, or a newline/space
 * delimited base64 list of links. Mirrors `explodeSub`.
 */
export function explodeSub(sub: string, nodes: Proxy[]): void {
  let processed = false;

  if (startsWith(sub, "ssd://")) {
    explodeSsd(sub, nodes);
    processed = true;
  }

  if (!processed && /"?(Proxy|proxies)"?:/.test(sub)) {
    if (parseClashText(sub, nodes)) {
      processed = true;
    }
  }

  if (!processed && explodeSurge(sub, nodes)) {
    processed = true;
  }

  if (processed) {
    return;
  }

  const body = urlSafeBase64Decode(sub);
  if (/(vmess|shadowsocks|http|trojan)\s*?=/.test(body)) {
    if (explodeSurge(body, nodes)) {
      return;
    }
  }
  const before = nodes.length;
  splitLinks(body, nodes);
  if (nodes.length === before && body !== sub) {
    // Not a base64 body after all (e.g. a plain-text provider list).
    splitLinks(sub, nodes);
  }
}

function splitLinks(body: string, nodes: Proxy[]): void {
  const normalized = body.replace(/\r\n/g, "\n");
  const delimiter =
    countOccurrences(normalized, "\n") < 1
      ? countOccurrences(normalized, "\r") < 1
        ? " "
        : "\r"
      : "\n";
  for (const rawLink of normalized.split(delimiter)) {
    const link = rawLink.replace(/\r/g, "");
    if (link === "") {
      continue;
    }
    const node = createProxy();
    explode(link, node);
    if (node.type === ProxyType.Unknown) {
      continue;
    }
    nodes.push(node);
  }
}

/** Parse a config blob (Clash/SS/SSR/V2Ray/SSTap/Netch) or a subscription. */
export function parseSubscription(content: string): Proxy[] {
  const nodes: Proxy[] = [];
  if (parseConfContent(content, nodes)) {
    return nodes;
  }
  explodeSub(content, nodes);
  return nodes;
}
