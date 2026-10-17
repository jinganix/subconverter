import { isSsCipher, SSR_CIPHERS } from "../parser/ciphers";
import type { Proxy } from "../types/proxy";
import { ProxyType } from "../types/proxy";
import type { ExtraSettings } from "../types/settings";
import { base64Encode, urlSafeBase64Encode } from "../utils/base64";
import { toInt } from "../utils/string";
import { getUrlArg, urlEncode } from "../utils/url";

/** Build the JSON payload of a `vmess://` link. */
export function vmessLinkConstruct(
  remarks: string,
  add: string,
  port: string,
  type: string,
  id: string,
  aid: string,
  net: string,
  path: string,
  host: string,
  tls: string,
): string {
  return JSON.stringify({
    add,
    aid,
    host,
    id,
    net: net === "" ? "tcp" : net,
    path,
    port,
    ps: remarks,
    tls,
    type: type === "" ? "none" : type,
    v: "2",
  });
}

/** Build an `ss://` link. */
export function ssLinkConstruct(proxy: Proxy): string {
  const port = String(proxy.port);
  let link = `ss://${urlSafeBase64Encode(`${proxy.encryptMethod}:${proxy.password}`)}@${proxy.hostname}:${port}`;
  if (proxy.plugin !== "" && proxy.pluginOption !== "") {
    link += `/?plugin=${urlEncode(`${proxy.plugin};${proxy.pluginOption}`)}`;
  }
  link += `#${urlEncode(proxy.remark)}`;
  return link;
}

/** Build an `ssr://` link. */
export function ssrLinkConstruct(
  hostname: string,
  port: number,
  protocol: string,
  method: string,
  obfs: string,
  password: string,
  group: string,
  remark: string,
  obfsParam = "",
  protocolParam = "",
): string {
  const payload =
    `${hostname}:${port}:${protocol}:${method}:${obfs}:${urlSafeBase64Encode(password)}` +
    `/?group=${urlSafeBase64Encode(group)}&remarks=${urlSafeBase64Encode(remark)}` +
    `&obfsparam=${urlSafeBase64Encode(obfsParam)}&protoparam=${urlSafeBase64Encode(protocolParam)}`;
  return `ssr://${urlSafeBase64Encode(payload)}`;
}

/** Build a `trojan://` link. */
export function trojanLinkConstruct(proxy: Proxy): string {
  const port = String(proxy.port);
  let link = `trojan://${proxy.password}@${proxy.hostname}:${port}?allowInsecure=${proxy.allowInsecure === true ? "1" : "0"}`;
  if (proxy.host !== "") {
    link += `&sni=${proxy.host}`;
  }
  if (proxy.transferProtocol === "ws") {
    link += "&ws=1";
    if (proxy.path !== "") {
      link += `&wspath=${urlEncode(proxy.path)}`;
    }
  }
  link += `#${urlEncode(proxy.remark)}`;
  return link;
}

function getBit(types: number, position: number): boolean {
  return (types & (1 << (position - 1))) !== 0;
}

/**
 * Export nodes as a plaintext or base64 list of share links.
 * `types` bitmask: SS=1, SSR=2, VMess=4, Trojan=8.
 */
export function proxyToSingle(nodes: Proxy[], types: number, settings: ExtraSettings): string {
  const ss = getBit(types, 1);
  const ssr = getBit(types, 2);
  const vmess = getBit(types, 3);
  const trojan = getBit(types, 4);
  let allLinks = "";

  for (const x of nodes) {
    let proxyStr = "";
    const port = String(x.port);
    const aid = String(x.alterId);
    switch (x.type) {
      case ProxyType.Shadowsocks:
        if (ss) {
          proxyStr = ssLinkConstruct(x);
        } else if (ssr) {
          if (SSR_CIPHERS.includes(x.encryptMethod) && x.plugin === "") {
            proxyStr = ssrLinkConstruct(
              x.hostname,
              x.port,
              "origin",
              x.encryptMethod,
              "plain",
              x.password,
              x.group,
              x.remark,
            );
          }
        } else {
          continue;
        }
        break;
      case ProxyType.ShadowsocksR:
        if (ssr) {
          proxyStr = ssrLinkConstruct(
            x.hostname,
            x.port,
            x.protocol,
            x.encryptMethod,
            x.obfs,
            x.password,
            x.group,
            x.remark,
            x.obfsParam,
            x.protocolParam,
          );
        } else if (ss) {
          if (isSsCipher(x.encryptMethod) && x.protocol === "origin" && x.obfs === "plain") {
            proxyStr = `ss://${urlSafeBase64Encode(`${x.encryptMethod}:${x.password}`)}@${x.hostname}:${port}#${urlEncode(x.remark)}`;
          }
        } else {
          continue;
        }
        break;
      case ProxyType.VMess:
        if (!vmess) {
          continue;
        }
        proxyStr = `vmess://${base64Encode(
          vmessLinkConstruct(
            x.remark,
            x.hostname,
            port,
            x.fakeType,
            x.userId,
            aid,
            x.transferProtocol,
            x.path,
            x.host,
            x.tlsSecure ? "tls" : "",
          ),
        )}`;
        break;
      case ProxyType.Trojan:
        if (!trojan) {
          continue;
        }
        proxyStr = trojanLinkConstruct(x);
        break;
      default:
        continue;
    }
    if (proxyStr !== "") {
      allLinks += `${proxyStr}\n`;
    }
  }

  return settings.nodeList ? allLinks : base64Encode(allLinks);
}

/** Export Shadowsocks nodes as a SIP008 (`ssconf`) document. */
export function proxyToSsSub(nodes: Proxy[], baseConf: string): string {
  let base: Record<string, unknown>;
  try {
    const trimmed = baseConf.trim() === "" ? "{}" : baseConf;
    base = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    base = {};
  }
  const proxies: unknown[] = [];
  for (const x of nodes) {
    let plugin = x.plugin;
    switch (x.type) {
      case ProxyType.Shadowsocks:
        if (plugin === "simple-obfs") {
          plugin = "obfs-local";
        }
        break;
      case ProxyType.ShadowsocksR:
        if (!isSsCipher(x.encryptMethod) || x.protocol !== "origin" || x.obfs !== "plain") {
          continue;
        }
        break;
      default:
        continue;
    }
    proxies.push({
      ...base,
      method: x.encryptMethod,
      password: x.password,
      plugin,
      plugin_opts: x.pluginOption,
      remarks: x.remark,
      server: x.hostname,
      server_port: x.port,
    });
  }
  return JSON.stringify(proxies);
}

/** Export Shadowsocks nodes as an `ssd://` document. */
export function proxyToSsd(nodes: Proxy[], group: string, userinfo: string): string {
  const resolvedGroup = group === "" ? "SSD" : group;
  const doc: Record<string, unknown> = {
    airport: resolvedGroup,
    encryption: "aes-128-gcm",
    password: "password",
    port: 1,
  };
  if (userinfo !== "") {
    const data = userinfo.replace(/; /g, "&");
    const upload = getUrlArg(data, "upload");
    const download = getUrlArg(data, "download");
    const total = getUrlArg(data, "total");
    const expiry = getUrlArg(data, "expire");
    // SSD reports traffic in decimal GB (1 GB = 1000^3 bytes) per spec,
    // distinct from Clash `subscription-userinfo` clients that divide by
    // 1024^3 (see `scaleDecimalBytes` in userinfo.ts).
    const gb = 1000 ** 3;
    doc.traffic_used = (Number(upload || 0) + Number(download || 0)) / gb;
    doc.traffic_total = Number(total || 0) / gb;
    if (expiry !== "") {
      const date = new Date(toInt(expiry) * 1000);
      doc.expiry = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    }
  }
  const servers: unknown[] = [];
  let index = 0;
  for (const x of nodes) {
    if (x.type === ProxyType.Shadowsocks) {
      const plugin = x.plugin === "obfs-local" ? "simple-obfs" : x.plugin;
      servers.push({
        encryption: x.encryptMethod,
        id: index,
        password: x.password,
        plugin,
        plugin_options: x.pluginOption,
        port: x.port,
        remarks: x.remark,
        server: x.hostname,
      });
      index += 1;
    } else if (x.type === ProxyType.ShadowsocksR) {
      if (isSsCipher(x.encryptMethod) && x.protocol === "origin" && x.obfs === "plain") {
        servers.push({
          encryption: x.encryptMethod,
          id: index,
          password: x.password,
          port: x.port,
          remarks: x.remark,
          server: x.hostname,
        });
        index += 1;
      }
    }
  }
  doc.servers = servers;
  return `ssd://${base64Encode(JSON.stringify(doc))}`;
}
