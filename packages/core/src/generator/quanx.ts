import { groupGenerate, processRemark } from "./nodes";
import type { Proxy } from "../types/proxy";
import { ProxyType, proxyTypeName } from "../types/proxy";
import type { ProxyGroupConfig } from "../types/proxy-group";
import type { ExtraSettings } from "../types/settings";
import { parseRawIni, renderRawIni, setRawSection, type RawIniSection } from "../utils/ini";
import { getUrlArg } from "../utils/url";

function triStr(value: boolean | undefined): string {
  return value ? "true" : "false";
}

function buildQuanxNode(x: Proxy, settings: ExtraSettings, remark: string): string | undefined {
  const hostname = x.hostname;
  const port = String(x.port);
  let method = x.encryptMethod;
  let plugin = x.plugin;
  let pluginOption = x.pluginOption;
  let host = x.host;
  let path = x.path;
  let tlsSecure = x.tlsSecure;

  const udp = x.udp !== undefined ? x.udp : settings.udp;
  const tfo = x.tcpFastOpen !== undefined ? x.tcpFastOpen : settings.tfo;
  const scv = x.allowInsecure !== undefined ? x.allowInsecure : settings.skipCertVerify;
  const tls13 = x.tls13 !== undefined ? x.tls13 : settings.tls13;

  let proxyStr: string;
  switch (x.type) {
    case ProxyType.VMess:
      if (method === "auto") {
        method = "chacha20-ietf-poly1305";
      }
      proxyStr = `vmess = ${hostname}:${port}, method=${method}, password=${x.userId}`;
      if (x.alterId !== 0) {
        proxyStr += ", aead=false";
      }
      if (tlsSecure && tls13 !== undefined) {
        proxyStr += `, tls13=${triStr(tls13)}`;
      }
      if (x.transferProtocol === "ws") {
        proxyStr += tlsSecure ? ", obfs=wss" : ", obfs=ws";
        proxyStr += `, obfs-host=${host}, obfs-uri=${path}`;
      } else if (tlsSecure) {
        proxyStr += `, obfs=over-tls, obfs-host=${host}`;
      }
      break;
    case ProxyType.Shadowsocks:
      proxyStr = `shadowsocks = ${hostname}:${port}, method=${method}, password=${x.password}`;
      if (plugin !== "") {
        if (plugin === "simple-obfs" || plugin === "obfs-local") {
          if (pluginOption !== "") {
            proxyStr += `, ${pluginOption.replace(/;/g, ", ")}`;
          }
        } else if (plugin === "v2ray-plugin") {
          pluginOption = pluginOption.replace(/;/g, "&");
          plugin = getUrlArg(pluginOption, "mode") === "websocket" ? "ws" : "";
          host = getUrlArg(pluginOption, "host");
          path = getUrlArg(pluginOption, "path");
          tlsSecure = pluginOption.includes("tls");
          if (tlsSecure && plugin === "ws") {
            plugin += "s";
            if (tls13 !== undefined) {
              proxyStr += `, tls13=${triStr(tls13)}`;
            }
          }
          proxyStr += `, obfs=${plugin}`;
          if (host !== "") {
            proxyStr += `, obfs-host=${host}`;
          }
          if (path !== "") {
            proxyStr += `, obfs-uri=${path}`;
          }
        } else {
          return undefined;
        }
      }
      break;
    case ProxyType.ShadowsocksR:
      proxyStr = `shadowsocks = ${hostname}:${port}, method=${method}, password=${x.password}, ssr-protocol=${x.protocol}`;
      if (x.protocolParam !== "") {
        proxyStr += `, ssr-protocol-param=${x.protocolParam}`;
      }
      proxyStr += `, obfs=${x.obfs}`;
      if (x.obfsParam !== "") {
        proxyStr += `, obfs-host=${x.obfsParam}`;
      }
      break;
    case ProxyType.HTTP:
    case ProxyType.HTTPS:
      proxyStr = `http = ${hostname}:${port}, username=${x.username === "" ? "none" : x.username}, password=${x.password === "" ? "none" : x.password}`;
      if (tlsSecure) {
        proxyStr += ", over-tls=true";
        if (tls13 !== undefined) {
          proxyStr += `, tls13=${triStr(tls13)}`;
        }
      } else {
        proxyStr += ", over-tls=false";
      }
      break;
    case ProxyType.Trojan:
      proxyStr = `trojan = ${hostname}:${port}, password=${x.password}`;
      if (tlsSecure) {
        proxyStr += `, over-tls=true, tls-host=${x.host}`;
        if (tls13 !== undefined) {
          proxyStr += `, tls13=${triStr(tls13)}`;
        }
      } else {
        proxyStr += ", over-tls=false";
      }
      break;
    case ProxyType.SOCKS5:
      proxyStr = `socks5 = ${hostname}:${port}`;
      if (x.username !== "" && x.password !== "") {
        proxyStr += `, username=${x.username}, password=${x.password}`;
        if (tlsSecure) {
          proxyStr += `, over-tls=true, tls-host=${x.host}`;
          if (tls13 !== undefined) {
            proxyStr += `, tls13=${triStr(tls13)}`;
          }
        } else {
          proxyStr += ", over-tls=false";
        }
      }
      break;
    case ProxyType.AnyTLS:
      proxyStr = `anytls = ${hostname}:${port}, password=${x.password}`;
      if (x.sni !== "") {
        proxyStr += `, tls-host=${x.sni}`;
      }
      break;
    default:
      return undefined;
  }
  if (tfo !== undefined) {
    proxyStr += `, fast-open=${triStr(tfo)}`;
  }
  if (udp !== undefined) {
    proxyStr += `, udp-relay=${triStr(udp)}`;
  }
  if (
    tlsSecure &&
    scv !== undefined &&
    x.type !== ProxyType.Shadowsocks &&
    x.type !== ProxyType.ShadowsocksR
  ) {
    proxyStr += `, tls-verification=${scv ? "false" : "true"}`;
  }
  proxyStr += `, tag=${remark}`;
  return proxyStr;
}

function buildQuanxGroups(extraProxyGroup: ProxyGroupConfig[], nodelist: Proxy[]): string[] {
  const lines: string[] = [];
  for (const group of extraProxyGroup) {
    let type: string;
    const filtered: string[] = [];
    switch (group.type) {
      case "select":
        type = "static";
        break;
      case "url-test":
        type = "url-latency-benchmark";
        break;
      case "fallback":
        type = "available";
        break;
      case "load-balance":
        type = "round-robin";
        break;
      case "ssid":
        type = "ssid";
        for (const proxy of group.proxies) {
          filtered.push(proxy.replace(/=/g, ":"));
        }
        break;
      default:
        continue;
    }
    if (group.type !== "ssid") {
      for (const rule of group.proxies) {
        groupGenerate(rule, nodelist, filtered, true);
      }
      if (filtered.length === 0) {
        filtered.push("direct");
      }
      if (filtered.length < 2) {
        type = "static";
      }
    }
    const proxies = filtered.join(", ");
    let line = `${type}=${group.name}, ${proxies}`;
    if (group.type !== "select" && group.type !== "ssid") {
      line += `, check-interval=${group.interval}`;
      if (group.tolerance > 0) {
        line += `, tolerance=${group.tolerance}`;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface QuanxOptions {
  baseConf: string;
  nodeList: boolean;
  /** Rule lines to inject, plus the section name to place them in. */
  rules?: { section: string; lines: string[] };
}

/** Convert nodes into a Quantumult X configuration string. */
export function toQuanX(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: QuanxOptions,
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
    const line = buildQuanxNode(x, settings, remark);
    if (line === undefined) {
      continue;
    }
    serverLines.push(line);
    remarksList.push(remark);
    nodelist.push(x);
  }

  if (options.nodeList) {
    return serverLines.join("\n");
  }

  const sections: RawIniSection[] = options.baseConf === "" ? [] : parseRawIni(options.baseConf);
  setRawSection(sections, "server_local", serverLines);
  const groupLines = buildQuanxGroups(extraProxyGroup, nodelist);
  if (groupLines.length > 0) {
    setRawSection(sections, "policy", groupLines);
  }
  if (options.rules && options.rules.lines.length > 0) {
    setRawSection(sections, options.rules.section, options.rules.lines);
  }
  return renderRawIni(sections);
}
