import { groupGenerate, processRemark } from "./nodes";
import { generatePeer } from "./surge";
import type { Proxy } from "../types/proxy";
import { ProxyType, proxyTypeName } from "../types/proxy";
import type { ProxyGroupConfig } from "../types/proxy-group";
import type { ExtraSettings } from "../types/settings";
import { parseRawIni, renderRawIni, setRawSection, type RawIniSection } from "../utils/ini";
import { isIpv4, isIpv6 } from "../utils/string";

function buildLoonNode(x: Proxy, settings: ExtraSettings, remark: string): string | undefined {
  const hostname = x.hostname;
  const port = String(x.port);
  let method = x.encryptMethod;
  const scv = x.allowInsecure !== undefined ? x.allowInsecure : settings.skipCertVerify;

  let proxy: string;
  switch (x.type) {
    case ProxyType.Shadowsocks:
      proxy = `Shadowsocks,${hostname},${port},${method},"${x.password}"`;
      if (x.plugin === "simple-obfs" || x.plugin === "obfs-local") {
        if (x.pluginOption !== "") {
          proxy += `,${x.pluginOption.replace(/;obfs-host=/g, ",").replace(/obfs=/g, "")}`;
        }
      } else if (x.plugin !== "") {
        return undefined;
      }
      break;
    case ProxyType.VMess:
      if (method === "auto") {
        method = "chacha20-ietf-poly1305";
      }
      proxy = `vmess,${hostname},${port},${method},"${x.userId}",over-tls=${x.tlsSecure ? "true" : "false"}`;
      if (x.tlsSecure) {
        proxy += `,tls-name=${x.host}`;
      }
      switch (x.transferProtocol) {
        case "tcp":
          proxy += ",transport=tcp";
          break;
        case "ws":
          proxy += `,transport=ws,path=${x.path},host=${x.host}`;
          break;
        default:
          return undefined;
      }
      if (scv !== undefined) {
        proxy += `,skip-cert-verify=${scv ? "true" : "false"}`;
      }
      break;
    case ProxyType.ShadowsocksR:
      proxy = `ShadowsocksR,${hostname},${port},${method},"${x.password}",protocol=${x.protocol},protocol-param=${x.protocolParam},obfs=${x.obfs},obfs-param=${x.obfsParam}`;
      break;
    case ProxyType.HTTP:
      proxy = `http,${hostname},${port},${x.username},"${x.password}"`;
      break;
    case ProxyType.HTTPS:
      proxy = `https,${hostname},${port},${x.username},"${x.password}"`;
      if (x.host !== "") {
        proxy += `,tls-name=${x.host}`;
      }
      if (scv !== undefined) {
        proxy += `,skip-cert-verify=${scv ? "true" : "false"}`;
      }
      break;
    case ProxyType.VLESS:
      if (
        x.transferProtocol !== "" &&
        x.transferProtocol !== "tcp" &&
        x.transferProtocol !== "ws"
      ) {
        return undefined;
      }
      proxy = `VLESS,${hostname},${port},"${x.userId}"`;
      if (x.flow !== "") {
        proxy += `,flow=${x.flow}`;
      }
      if (x.publicKey !== "") {
        proxy += `,public-key="${x.publicKey}"`;
      }
      if (x.shortId !== "") {
        proxy += `,short-id=${x.shortId}`;
      }
      if (x.transferProtocol === "ws") {
        proxy += `,path=${x.path},host=${x.host}`;
      }
      proxy += `,transport=${x.transferProtocol === "ws" ? "ws" : "tcp"}`;
      if (x.udp !== undefined) {
        proxy += `,udp=${x.udp ? "true" : "false"}`;
      } else {
        proxy += ",udp=false";
      }
      proxy += `,over-tls=${x.tlsSecure ? "true" : "false"}`;
      if (x.tlsSecure && x.serverName !== "") {
        proxy += `,sni=${x.serverName}`;
      }
      if (scv !== undefined) {
        proxy += `,skip-cert-verify=${scv ? "true" : "false"}`;
      }
      break;
    case ProxyType.Trojan:
      proxy = `trojan,${hostname},${port},"${x.password}"`;
      if (x.host !== "") {
        proxy += `,tls-name=${x.host}`;
      }
      if (x.transferProtocol === "ws") {
        proxy += `,transport=ws,path=${x.path},host=${x.host}`;
      } else {
        proxy += ",transport=tcp";
      }
      if (scv !== undefined) {
        proxy += `,skip-cert-verify=${scv ? "true" : "false"}`;
      }
      break;
    case ProxyType.SOCKS5:
      proxy = `socks5,${hostname},${port}`;
      if (x.username !== "" && x.password !== "") {
        proxy += `,${x.username},"${x.password}"`;
      }
      proxy += `,over-tls=${x.tlsSecure ? "true" : "false"}`;
      if (x.tlsSecure) {
        if (x.host !== "") {
          proxy += `,tls-name=${x.host}`;
        }
        if (scv !== undefined) {
          proxy += `,skip-cert-verify=${scv ? "true" : "false"}`;
        }
      }
      break;
    case ProxyType.WireGuard:
      proxy = `wireguard, interface-ip=${x.selfIp}`;
      if (x.selfIpv6 !== "") {
        proxy += `, interface-ipv6=${x.selfIpv6}`;
      }
      proxy += `, private-key=${x.privateKey}`;
      for (const dns of x.dnsServers) {
        if (isIpv4(dns)) {
          proxy += `, dns=${dns}`;
        } else if (isIpv6(dns)) {
          proxy += `, dnsv6=${dns}`;
        }
      }
      if (x.mtu > 0) {
        proxy += `, mtu=${x.mtu}`;
      }
      if (x.keepAlive > 0) {
        proxy += `, keepalive=${x.keepAlive}`;
      }
      proxy += `, peers=[{${generatePeer(x, true)}}]`;
      break;
    case ProxyType.Hysteria2:
      proxy = `Hysteria2,${hostname},${port},"${x.password}"`;
      if (x.sni !== "") {
        proxy += `,sni=${x.sni}`;
      }
      // NOTE: some converters emit `download-bandwidth` from the *up*
      // value (and a default 100 when unset), which contradicts the
      // Hysteria2 spec. Emit the actual `down` speed instead; omit when unset.
      if (x.downSpeed > 0) {
        proxy += `,download-bandwidth=${x.downSpeed}`;
      }
      if (scv !== undefined) {
        proxy += `,skip-cert-verify=${scv ? "true" : "false"}`;
      }
      if (x.fingerprint !== "") {
        proxy += `,tls-cert-sha256=${x.fingerprint}`;
      }
      break;
    // Loon has no AnyTLS/TUIC mapping — keep the drop instead of
    // emitting non-standard lines.
    default:
      return undefined;
  }
  if (settings.tfo) {
    proxy += ",fast-open=true";
  }
  if (settings.udp) {
    proxy += ",udp=true";
  }
  void remark;
  return proxy;
}

function buildLoonGroups(extraProxyGroup: ProxyGroupConfig[], nodelist: Proxy[]): string[] {
  const lines: string[] = [];
  for (const group of extraProxyGroup) {
    const filtered: string[] = [];
    switch (group.type) {
      case "select":
      case "load-balance":
      case "url-test":
      case "fallback":
        break;
      case "ssid":
        if (group.proxies.length < 2) {
          continue;
        }
        lines.push(
          `${group.name} = ssid,default=${group.proxies[0]},${group.proxies.slice(1).join(",")}`,
        );
        continue;
      default:
        continue;
    }
    for (const rule of group.proxies) {
      groupGenerate(rule, nodelist, filtered, true);
    }
    if (filtered.length === 0) {
      filtered.push("DIRECT");
    }
    let groupLine = `${group.type},${filtered.join(",")}`;
    if (group.type !== "select") {
      groupLine += `,url=${group.url},interval=${group.interval}`;
      if (group.type === "load-balance") {
        groupLine += `,algorithm=${group.strategy === "round-robin" ? "round-robin" : "pcc"}`;
        if (group.timeout > 0) {
          groupLine += `,max-timeout=${group.timeout}`;
        }
      }
      if (group.type === "url-test" && group.tolerance > 0) {
        groupLine += `,tolerance=${group.tolerance}`;
      }
      if (group.type === "fallback") {
        groupLine += `,max-timeout=${group.timeout}`;
      }
    }
    lines.push(`${group.name} = ${groupLine}`);
  }
  return lines;
}

export interface LoonOptions {
  baseConf: string;
  nodeList: boolean;
  /** Rule lines to inject, plus the section name to place them in. */
  rules?: { section: string; lines: string[] };
}

/** Convert nodes into a Loon configuration string. */
export function toLoon(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: LoonOptions,
): string {
  const remarksList: string[] = [];
  const proxyLines: string[] = [];
  const nodelist: Proxy[] = [];

  for (const x of nodes) {
    if (settings.appendProxyType) {
      x.remark = `[${proxyTypeName(x.type)}] ${x.remark}`;
    }
    const remark = processRemark(x.remark, remarksList);
    x.remark = remark;
    const line = buildLoonNode(x, settings, remark);
    if (line === undefined) {
      continue;
    }
    proxyLines.push(`${remark} = ${line}`);
    remarksList.push(remark);
    nodelist.push(x);
  }

  if (options.nodeList) {
    return proxyLines.join("\n");
  }

  const sections: RawIniSection[] = options.baseConf === "" ? [] : parseRawIni(options.baseConf);
  setRawSection(sections, "Proxy", proxyLines);
  const groupLines = buildLoonGroups(extraProxyGroup, nodelist);
  if (groupLines.length > 0) {
    setRawSection(sections, "Proxy Group", groupLines);
  }
  if (options.rules && options.rules.lines.length > 0) {
    setRawSection(sections, options.rules.section, options.rules.lines);
  }
  return renderRawIni(sections);
}
