import { groupGenerate, processRemark } from "./nodes";
import type { Proxy } from "../types/proxy";
import { ProxyType, proxyTypeName } from "../types/proxy";
import type { ProxyGroupConfig } from "../types/proxy-group";
import type { ExtraSettings } from "../types/settings";
import { fnv1a64Hex } from "../utils/hash";
import { isIpv4, isIpv6 } from "../utils/string";

interface RawSection {
  name: string;
  lines: string[];
}

function parseRawSections(text: string): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine;
    const header = /^\[(.*)\]$/.exec(line.trim());
    if (header) {
      current = { lines: [], name: (header[1] as string).trim() };
      sections.push(current);
      continue;
    }
    if (line.trim() === "") {
      continue;
    }
    if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

function triStr(value: boolean | undefined): string {
  return value ? "true" : "false";
}

function httpProxyLine(x: Proxy, scv: boolean | undefined): string {
  let proxy = `http, ${x.hostname}, ${x.port}`;
  if (x.username !== "") {
    proxy += `, username=${x.username}`;
  }
  if (x.password !== "") {
    proxy += `, password=${x.password}`;
  }
  proxy += `, tls=${triStr(x.tlsSecure)}`;
  if (scv !== undefined) {
    proxy += `, skip-cert-verify=${triStr(scv)}`;
  }
  return proxy;
}

/** Build a WireGuard `peer=(...)` clause. */
export function generatePeer(node: Proxy, clientIdAsReserved = false): string {
  let result = `public-key = ${node.publicKey}`;
  result += `, endpoint = ${node.hostname}:${node.port}`;
  if (node.preSharedKey !== "") {
    result += `, preshared-key = ${node.preSharedKey}`;
  }
  if (node.allowedIps !== "") {
    result += `, allowed-ips = "${node.allowedIps}"`;
  }
  if (node.keepAlive > 0) {
    result += `, keepalive = ${node.keepAlive}`;
  }
  if (node.clientId !== "") {
    result += clientIdAsReserved
      ? `, reserved = [${node.clientId}]`
      : `, client-id = ${node.clientId}`;
  }
  return result;
}

export interface SurgeOptions {
  version: number;
  baseConf: string;
  nodeList: boolean;
  /** Rule lines to inject, plus the section name to place them in. */
  rules?: { section: string; lines: string[] };
}

interface SurgeBuildResult {
  proxies: string[];
  groups: string[];
  extraSections: Map<string, string[]>;
  sectionOrder: string[];
}

function buildSurge(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: SurgeOptions,
): SurgeBuildResult {
  const surgeVer = options.version;
  const remarksList: string[] = [];
  const proxies: string[] = [];
  const nodelist: Proxy[] = [];
  const extraSections = new Map<string, string[]>();
  const sectionOrder: string[] = [];
  let localPort = 1080;

  for (const x of nodes) {
    if (settings.appendProxyType) {
      x.remark = `[${proxyTypeName(x.type)}] ${x.remark}`;
    }
    const remark = processRemark(x.remark, remarksList);
    x.remark = remark;

    const udp = x.udp !== undefined ? x.udp : settings.udp;
    const tfo = x.tcpFastOpen !== undefined ? x.tcpFastOpen : settings.tfo;
    const scv = x.allowInsecure !== undefined ? x.allowInsecure : settings.skipCertVerify;
    const tls13 = x.tls13 !== undefined ? x.tls13 : settings.tls13;

    let proxy = "";
    switch (x.type) {
      case ProxyType.Shadowsocks:
        if (surgeVer >= 3 || surgeVer === -3) {
          proxy = `ss, ${x.hostname}, ${x.port}, encrypt-method=${x.encryptMethod}, password=${x.password}`;
        } else {
          proxy = `custom, ${x.hostname}, ${x.port}, ${x.encryptMethod}, ${x.password}, https://github.com/pobizhe/SSEncrypt/raw/master/SSEncrypt.module`;
        }
        if (x.plugin !== "") {
          if (x.plugin === "simple-obfs" || x.plugin === "obfs-local") {
            if (x.pluginOption !== "") {
              proxy += `,${x.pluginOption.replace(/;/g, ",")}`;
            }
          } else {
            continue;
          }
        }
        break;
      case ProxyType.VMess: {
        if (surgeVer < 4 && surgeVer !== -3) {
          continue;
        }
        proxy = `vmess, ${x.hostname}, ${x.port}, username=${x.userId}, tls=${triStr(x.tlsSecure)}, vmess-aead=${x.alterId === 0 ? "true" : "false"}`;
        if (x.tlsSecure && tls13 !== undefined) {
          proxy += `, tls13=${triStr(tls13)}`;
        }
        const headers: string[] = [];
        switch (x.transferProtocol) {
          case "tcp":
            break;
          case "ws": {
            if (x.host === "") {
              proxy += `, ws=true, ws-path=${x.path}, sni=${x.hostname}`;
            } else {
              proxy += `, ws=true, ws-path=${x.path}, sni=${x.host}`;
            }
            if (x.host !== "") {
              headers.push(`Host:${x.host}`);
            }
            if (x.edge !== "") {
              headers.push(`Edge:${x.edge}`);
            }
            if (headers.length > 0) {
              proxy += `, ws-headers=${headers.join("|")}`;
            }
            break;
          }
          default:
            continue;
        }
        if (scv !== undefined) {
          proxy += `, skip-cert-verify=${triStr(scv)}`;
        }
        break;
      }
      case ProxyType.ShadowsocksR: {
        if (settings.surgeSsrPath === "" || surgeVer < 2) {
          continue;
        }
        const args = [
          "-l",
          String(localPort),
          "-s",
          x.hostname,
          "-p",
          String(x.port),
          "-m",
          x.encryptMethod,
          "-k",
          x.password,
          "-o",
          x.obfs,
          "-O",
          x.protocol,
        ];
        if (x.obfsParam !== "") {
          args.push("-g", x.obfsParam);
        }
        if (x.protocolParam !== "") {
          args.push("-G", x.protocolParam);
        }
        proxy = `external, exec="${settings.surgeSsrPath}", args="${args.join('", args="')}", local-port=${localPort}`;
        if (isIpv4(x.hostname) || isIpv6(x.hostname)) {
          proxy += `, addresses=${x.hostname}`;
        }
        localPort += 1;
        break;
      }
      case ProxyType.SOCKS5:
        proxy = `socks5, ${x.hostname}, ${x.port}`;
        if (x.username !== "") {
          proxy += `, username=${x.username}`;
        }
        if (x.password !== "") {
          proxy += `, password=${x.password}`;
        }
        if (scv !== undefined) {
          proxy += `, skip-cert-verify=${triStr(scv)}`;
        }
        break;
      case ProxyType.HTTPS:
        if (surgeVer === -3) {
          proxy = `https, ${x.hostname}, ${x.port}, ${x.username}, ${x.password}`;
          if (scv !== undefined) {
            proxy += `, skip-cert-verify=${triStr(scv)}`;
          }
          break;
        }
        proxy = httpProxyLine(x, scv);
        break;
      case ProxyType.HTTP:
        proxy = httpProxyLine(x, scv);
        break;
      case ProxyType.Trojan:
        if (surgeVer < 4 && surgeVer !== -3) {
          continue;
        }
        proxy = `trojan, ${x.hostname}, ${x.port}, password=${x.password}`;
        if (x.snellVersion !== 0) {
          proxy += `, version=${x.snellVersion}`;
        }
        if (x.host !== "") {
          proxy += `, sni=${x.host}`;
        }
        if (x.transferProtocol === "ws") {
          proxy += ", ws=true";
          if (x.path !== "") {
            proxy += `, ws-path=${x.path}`;
          }
          const wsHost = x.host !== "" ? x.host : x.hostname;
          proxy += `, ws-headers=Host:"${wsHost}"`;
        }
        if (scv !== undefined) {
          proxy += `, skip-cert-verify=${triStr(scv)}`;
        }
        break;
      case ProxyType.Snell:
        proxy = `snell, ${x.hostname}, ${x.port}, psk=${x.password}`;
        if (x.obfs !== "") {
          proxy += `, obfs=${x.obfs}`;
          if (x.host !== "") {
            proxy += `, obfs-host=${x.host}`;
          }
        }
        if (x.snellVersion !== 0) {
          proxy += `, version=${x.snellVersion}`;
        }
        break;
      case ProxyType.WireGuard: {
        if (surgeVer < 4 && surgeVer !== -3) {
          continue;
        }
        const section = fnv1a64Hex(x.remark).slice(0, 5);
        proxy = `wireguard, section-name=${section}`;
        if (x.testUrl !== "") {
          proxy += `, test-url=${x.testUrl}`;
        }
        const wgLines: string[] = [`private-key = ${x.privateKey}`, `self-ip = ${x.selfIp}`];
        if (x.selfIpv6 !== "") {
          wgLines.push(`self-ip-v6 = ${x.selfIpv6}`);
        }
        if (x.dnsServers.length > 0) {
          wgLines.push(`dns-server = ${x.dnsServers.join(",")}`);
        }
        if (x.mtu > 0) {
          wgLines.push(`mtu = ${x.mtu}`);
        }
        wgLines.push(`peer = (${generatePeer(x)})`);
        const sectionName = `WireGuard ${section}`;
        extraSections.set(sectionName, wgLines);
        sectionOrder.push(sectionName);
        break;
      }
      case ProxyType.Hysteria2:
        if (surgeVer < 4) {
          continue;
        }
        proxy = `hysteria2, ${x.hostname}, ${x.port}, password=${x.password}`;
        if (x.downSpeed) {
          proxy += `, download-bandwidth=${x.downSpeed}`;
        }
        if (scv !== undefined) {
          proxy += `,skip-cert-verify=${triStr(scv)}`;
        }
        if (x.fingerprint !== "") {
          proxy += `,server-cert-fingerprint-sha256=${x.fingerprint}`;
        }
        if (x.sni !== "") {
          proxy += `,sni=${x.sni}`;
        }
        break;
      case ProxyType.AnyTLS:
        if (surgeVer < 4 && surgeVer !== -3) {
          continue;
        }
        proxy = `anytls, ${x.hostname}, ${x.port}, password=${x.password}`;
        if (x.sni !== "") {
          proxy += `,sni=${x.sni}`;
        }
        break;
      default:
        continue;
    }

    if (tfo !== undefined) {
      proxy += `, tfo=${triStr(tfo)}`;
    }
    if (udp !== undefined) {
      proxy += `, udp-relay=${triStr(udp)}`;
    }
    if (x.underlyingProxy !== "") {
      proxy += `, underlying-proxy=${x.underlyingProxy}`;
    }

    proxies.push(`${remark} = ${proxy}`);
    remarksList.push(remark);
    nodelist.push(x);
  }

  if (options.nodeList) {
    return { extraSections, groups: [], proxies, sectionOrder };
  }

  const groups: string[] = [];
  for (const group of extraProxyGroup) {
    const filtered: string[] = [];
    let groupLine = "";
    switch (group.type) {
      case "select":
      case "smart":
      case "url-test":
      case "fallback":
        break;
      case "load-balance":
        if (surgeVer < 1 && surgeVer !== -3) {
          continue;
        }
        break;
      case "ssid": {
        const rest = group.proxies.slice(1).join(",");
        const line = `${group.type},default=${group.proxies[0] ?? ""},${rest}`;
        groups.push(`${group.name} = ${line}`);
        continue;
      }
      default:
        continue;
    }

    for (const rule of group.proxies) {
      groupGenerate(rule, nodelist, filtered, true);
    }
    if (filtered.length === 0) {
      filtered.push("DIRECT");
    }
    if (filtered.length === 1) {
      const single = (filtered[0] as string).toLowerCase();
      if (single === "direct" || single === "reject" || single === "reject-tinygif") {
        proxies.push(`${group.name} = ${single}`);
        continue;
      }
    }
    groupLine = `${group.type},${filtered.join(",")}`;
    if (group.type === "url-test" || group.type === "fallback" || group.type === "load-balance") {
      groupLine += `,url=${group.url},interval=${group.interval}`;
      if (group.tolerance > 0) {
        groupLine += `,tolerance=${group.tolerance}`;
      }
      if (group.timeout > 0) {
        groupLine += `,timeout=${group.timeout}`;
      }
      if (group.persistent !== undefined) {
        groupLine += `,persistent=${triStr(group.persistent)}`;
      }
      if (group.evaluateBeforeUse !== undefined) {
        groupLine += `,evaluate-before-use=${triStr(group.evaluateBeforeUse)}`;
      }
    }
    groups.push(`${group.name} = ${groupLine}`);
  }

  return { extraSections, groups, proxies, sectionOrder };
}

/** Convert nodes into a Surge configuration string. */
export function toSurge(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: SurgeOptions,
): string {
  const result = buildSurge(nodes, extraProxyGroup, settings, options);
  if (options.nodeList) {
    return result.proxies.join("\n");
  }

  const baseSections = options.baseConf === "" ? [] : parseRawSections(options.baseConf);
  const byName = new Map<string, RawSection>();
  const order: string[] = [];
  for (const section of baseSections) {
    byName.set(section.name, section);
    order.push(section.name);
  }
  const setSection = (name: string, lines: string[]): void => {
    if (!byName.has(name)) {
      order.push(name);
    }
    byName.set(name, { lines, name });
  };
  setSection("Proxy", ["DIRECT = direct", ...result.proxies]);
  if (result.groups.length > 0) {
    setSection("Proxy Group", result.groups);
  }
  for (const name of result.sectionOrder) {
    setSection(name, result.extraSections.get(name) as string[]);
  }
  if (options.rules && options.rules.lines.length > 0) {
    setSection(options.rules.section, options.rules.lines);
  }

  const out: string[] = [];
  for (const name of order) {
    const section = byName.get(name);
    if (!section) {
      continue;
    }
    out.push(`[${name}]`);
    out.push(...section.lines);
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}
