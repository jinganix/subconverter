import { groupGenerate, processRemark } from "./nodes";
import type { Proxy } from "../types/proxy";
import { ProxyType, proxyTypeName } from "../types/proxy";
import type { ProxyGroupConfig } from "../types/proxy-group";
import type { ExtraSettings } from "../types/settings";
import { base64Encode, urlSafeBase64Encode } from "../utils/base64";
import { parseRawIni, renderRawIni, setRawSection, type RawIniSection } from "../utils/ini";
import { urlEncode } from "../utils/url";

function buildQuanNode(
  x: Proxy,
  settings: ExtraSettings,
  remark: string,
  nodeList: boolean,
): string | undefined {
  const hostname = x.hostname;
  const port = String(x.port);
  const group = x.group;
  let method = x.encryptMethod;
  const scv = x.allowInsecure !== undefined ? x.allowInsecure : settings.skipCertVerify;

  let proxyStr: string;
  switch (x.type) {
    case ProxyType.VMess:
      if (method === "auto") {
        method = "chacha20-ietf-poly1305";
      }
      proxyStr = `${remark} = vmess, ${hostname}, ${port}, ${method}, "${x.userId}", group=${group}`;
      if (x.tlsSecure) {
        proxyStr += `, over-tls=true, tls-host=${x.host}`;
        if (scv !== undefined) {
          proxyStr += `, certificate=${scv ? "0" : "1"}`;
        }
      }
      if (x.transferProtocol === "ws") {
        proxyStr += `, obfs=ws, obfs-path="${x.path}", obfs-header="Host: ${x.host}`;
        if (x.edge !== "") {
          proxyStr += `[Rr][Nn]Edge: ${x.edge}`;
        }
        proxyStr += '"';
      }
      if (nodeList) {
        proxyStr = `vmess://${urlSafeBase64Encode(proxyStr)}`;
      }
      break;
    case ProxyType.ShadowsocksR:
      if (nodeList) {
        proxyStr = `ssr://${urlSafeBase64Encode(
          `${hostname}:${port}:${x.protocol}:${method}:${x.obfs}:${urlSafeBase64Encode(x.password)}` +
            `/?group=${urlSafeBase64Encode(group)}&remarks=${urlSafeBase64Encode(remark)}` +
            `&obfsparam=${urlSafeBase64Encode(x.obfsParam)}&protoparam=${urlSafeBase64Encode(x.protocolParam)}`,
        )}`;
      } else {
        proxyStr = `${remark} = shadowsocksr, ${hostname}, ${port}, ${method}, "${x.password}", group=${group}, protocol=${x.protocol}, obfs=${x.obfs}`;
        if (x.protocolParam !== "") {
          proxyStr += `, protocol_param=${x.protocolParam}`;
        }
        if (x.obfsParam !== "") {
          proxyStr += `, obfs_param=${x.obfsParam}`;
        }
      }
      break;
    case ProxyType.Shadowsocks:
      if (nodeList) {
        proxyStr = `ss://${urlSafeBase64Encode(`${method}:${x.password}`)}@${hostname}:${port}`;
        if (x.plugin !== "" && x.pluginOption !== "") {
          proxyStr += `/?plugin=${urlEncode(`${x.plugin};${x.pluginOption}`)}`;
        }
        proxyStr += `&group=${urlSafeBase64Encode(group)}#${urlEncode(remark)}`;
      } else {
        proxyStr = `${remark} = shadowsocks, ${hostname}, ${port}, ${method}, "${x.password}", group=${group}`;
        if (x.plugin === "obfs-local" && x.pluginOption !== "") {
          proxyStr += `, ${x.pluginOption.replace(/;/g, ", ")}`;
        }
      }
      break;
    case ProxyType.HTTP:
    case ProxyType.HTTPS:
      proxyStr = `${remark} = http, upstream-proxy-address=${hostname}, upstream-proxy-port=${port}, group=${group}`;
      if (x.username !== "" && x.password !== "") {
        proxyStr += `, upstream-proxy-auth=true, upstream-proxy-username=${x.username}, upstream-proxy-password=${x.password}`;
      } else {
        proxyStr += ", upstream-proxy-auth=false";
      }
      if (x.tlsSecure) {
        proxyStr += ", over-tls=true";
        if (x.host !== "") {
          proxyStr += `, tls-host=${x.host}`;
        }
        if (scv !== undefined) {
          proxyStr += `, certificate=${scv ? "0" : "1"}`;
        }
      }
      if (nodeList) {
        proxyStr = `http://${urlSafeBase64Encode(proxyStr)}`;
      }
      break;
    case ProxyType.SOCKS5:
      proxyStr = `${remark} = socks, upstream-proxy-address=${hostname}, upstream-proxy-port=${port}, group=${group}`;
      if (x.username !== "" && x.password !== "") {
        proxyStr += `, upstream-proxy-auth=true, upstream-proxy-username=${x.username}, upstream-proxy-password=${x.password}`;
      } else {
        proxyStr += ", upstream-proxy-auth=false";
      }
      if (x.tlsSecure) {
        proxyStr += ", over-tls=true";
        if (x.host !== "") {
          proxyStr += `, tls-host=${x.host}`;
        }
        if (scv !== undefined) {
          proxyStr += `, certificate=${scv ? "0" : "1"}`;
        }
      }
      if (nodeList) {
        proxyStr = `socks://${urlSafeBase64Encode(proxyStr)}`;
      }
      break;
    default:
      return undefined;
  }
  return proxyStr;
}

function buildQuanGroups(extraProxyGroup: ProxyGroupConfig[], nodelist: Proxy[]): string[] {
  const lines: string[] = [];
  for (const group of extraProxyGroup) {
    let type: string;
    switch (group.type) {
      case "select":
      case "fallback":
        type = "static";
        break;
      case "url-test":
        type = "auto";
        break;
      case "load-balance":
        type = "balance, round-robin";
        break;
      case "ssid": {
        let singlegroup = `${group.name} : wifi = ${group.proxies[0] ?? ""}`;
        let content = "";
        let celluar = "";
        for (const proxy of group.proxies.slice(1)) {
          const m = /^(.*?),?celluar\s?=\s?(.*?)(,.*)$/.exec(proxy);
          if (!m) {
            content += `${proxy}\n`;
            continue;
          }
          celluar = m[2] as string;
          content += `${m[1] as string}${m[3] as string}\n`;
        }
        if (celluar !== "") {
          singlegroup += `, celluar = ${celluar}`;
        }
        singlegroup += `\n${content.trim().replace(/^,|,$/g, "").replace(/,/g, "\n")}`;
        lines.push(base64Encode(singlegroup));
        continue;
      }
      default:
        continue;
    }

    const filtered: string[] = [];
    for (const rule of group.proxies) {
      groupGenerate(rule, nodelist, filtered, true);
    }
    if (filtered.length === 0) {
      filtered.push("direct");
    }
    if (filtered.length < 2) {
      type = "static";
    }
    const proxies = filtered.join("\n");
    let singlegroup = `${group.name} : ${type}`;
    if (type === "static") {
      singlegroup += `, ${filtered[0] as string}`;
    }
    singlegroup += `\n${proxies}\n`;
    lines.push(base64Encode(singlegroup));
  }
  return lines;
}

export interface QuanOptions {
  baseConf: string;
  nodeList: boolean;
  /** Rule lines to inject, plus the section name to place them in. */
  rules?: { section: string; lines: string[] };
}

/** Convert nodes into a Quantumult configuration string. */
export function toQuan(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: QuanOptions,
): string {
  const remarksList: string[] = [];
  const serverLines: string[] = [];
  const nodelist: Proxy[] = [];

  for (const x of nodes) {
    if (settings.appendProxyType) {
      x.remark = `[${proxyTypeName(x.type)}] ${x.remark}`;
    }
    const remark = processRemark(x.remark, remarksList);
    x.remark = remark;
    const line = buildQuanNode(x, settings, remark, options.nodeList);
    if (line === undefined) {
      continue;
    }
    serverLines.push(line);
    remarksList.push(remark);
    nodelist.push(x);
  }

  if (options.nodeList) {
    return base64Encode(serverLines.join("\n"));
  }

  const sections: RawIniSection[] = options.baseConf === "" ? [] : parseRawIni(options.baseConf);
  setRawSection(sections, "SERVER", serverLines);
  const groupLines = buildQuanGroups(extraProxyGroup, nodelist);
  if (groupLines.length > 0) {
    setRawSection(sections, "POLICY", groupLines);
  }
  if (options.rules && options.rules.lines.length > 0) {
    setRawSection(sections, options.rules.section, options.rules.lines);
  }
  return renderRawIni(sections);
}
