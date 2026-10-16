import { parse as parseYaml } from "yaml";

import { isFlattenableSsr } from "./ciphers";
import {
  anyTlsConstruct,
  httpConstruct,
  hysteria2Construct,
  hysteriaConstruct,
  snellConstruct,
  socksConstruct,
  ssConstruct,
  ssrConstruct,
  trojanConstruct,
  tuicConstruct,
  vlessConstruct,
  vmessConstruct,
  wireGuardConstruct,
} from "./construct";
import { explodeNetch } from "./netch";
import type { Proxy } from "../types/proxy";
import { DEFAULT_GROUPS, createProxy } from "../types/proxy";
import type { TriBool } from "../types/tribool";
import { base64Encode } from "../utils/base64";
import { split, toInt, trim } from "../utils/string";

function asString(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return asString(value).toLowerCase() === "true";
}

function asTri(value: unknown): TriBool {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return asBool(value);
}

function get(obj: any, key: string | number): unknown {
  return obj !== null && typeof obj === "object" ? obj[key] : undefined;
}

/** Parse a Clash `proxies:` list into normalized nodes. */
export function explodeClash(root: any, nodes: Proxy[]): void {
  const section = get(root, "proxies") !== undefined ? "proxies" : "Proxy";
  const list = get(root, section) as any[] | undefined;
  if (!Array.isArray(list)) {
    return;
  }
  let index = nodes.length;

  for (const single of list) {
    const proxyType = asString(get(single, "type")).toLowerCase();
    const ps = asString(get(single, "name"));
    const server = asString(get(single, "server"));
    const port = asString(get(single, "port"));
    let underlyingProxy = asString(get(single, "underlying-proxy"));
    if (underlyingProxy === "") {
      underlyingProxy = asString(get(single, "dialer-proxy"));
    }
    if (port === "" || port === "0") {
      continue;
    }
    const udp = asTri(get(single, "udp"));
    const tfo = asTri(get(single, "fast-open"));
    const scv = asTri(get(single, "skip-cert-verify"));
    const node = createProxy();
    let group = "";

    switch (proxyType) {
      case "vmess": {
        group = DEFAULT_GROUPS.v2ray;
        const id = asString(get(single, "uuid"));
        const aid = asString(get(single, "alterId"));
        const cipher = asString(get(single, "cipher"));
        const net = get(single, "network") !== undefined ? asString(get(single, "network")) : "tcp";
        const sni = asString(get(single, "servername"));
        let path = "";
        let host = "";
        let edge = "";
        switch (net) {
          case "http":
            path = asString(get(get(get(single, "http-opts"), "path"), 0));
            host = asString(get(get(get(get(single, "http-opts"), "headers"), "Host"), 0));
            edge = "";
            break;
          case "ws":
            if (get(single, "ws-opts") !== undefined) {
              const wsOpts = get(single, "ws-opts");
              path = get(wsOpts, "path") !== undefined ? asString(get(wsOpts, "path")) : "/";
              host = asString(get(get(wsOpts, "headers"), "Host"));
              edge = asString(get(get(wsOpts, "headers"), "Edge"));
            } else {
              path = get(single, "ws-path") !== undefined ? asString(get(single, "ws-path")) : "/";
              host = asString(get(get(single, "ws-headers"), "Host"));
              edge = asString(get(get(single, "ws-headers"), "Edge"));
            }
            break;
          case "h2":
            path = asString(get(get(single, "h2-opts"), "path"));
            host = asString(get(get(get(single, "h2-opts"), "host"), 0));
            edge = "";
            break;
          case "grpc":
            host = asString(get(single, "servername"));
            path = asString(get(get(single, "grpc-opts"), "grpc-service-name"));
            edge = "";
            break;
          default:
            break;
        }
        const tls = asBool(get(single, "tls")) ? "tls" : "";
        vmessConstruct(node, {
          add: server,
          aid,
          cipher,
          edge,
          group,
          host,
          id,
          net,
          path,
          port,
          remark: ps,
          scv,
          sni,
          tfo,
          tls,
          type: "",
          udp,
          underlyingProxy,
        });
        break;
      }
      case "ss": {
        group = DEFAULT_GROUPS.ss;
        let cipher = asString(get(single, "cipher"));
        const password = asString(get(single, "password"));
        let plugin = "";
        let pluginOption = "";
        let pluginMode = "";
        let pluginHost = "";
        let pluginMux = "";
        let pluginTls = "";
        let path = "";
        if (get(single, "plugin") !== undefined) {
          const pluginName = asString(get(single, "plugin")).toLowerCase();
          const pluginOpts = get(single, "plugin-opts");
          if (pluginName === "obfs") {
            plugin = "obfs-local";
            pluginMode = asString(get(pluginOpts, "mode"));
            pluginHost = asString(get(pluginOpts, "host"));
          } else if (pluginName === "v2ray-plugin") {
            plugin = "v2ray-plugin";
            pluginMode = asString(get(pluginOpts, "mode"));
            pluginHost = asString(get(pluginOpts, "host"));
            pluginTls = asBool(get(pluginOpts, "tls")) ? "tls;" : "";
            path = asString(get(pluginOpts, "path"));
            pluginMux = asBool(get(pluginOpts, "mux")) ? "mux=4;" : "";
          }
        } else if (get(single, "obfs") !== undefined) {
          plugin = "obfs-local";
          pluginMode = asString(get(single, "obfs"));
          pluginHost = asString(get(single, "obfs-host"));
        }
        if (plugin === "simple-obfs" || plugin === "obfs-local") {
          pluginOption = `obfs=${pluginMode}`;
          pluginOption += pluginHost === "" ? "" : `;obfs-host=${pluginHost}`;
        } else if (plugin === "v2ray-plugin") {
          pluginOption = `mode=${pluginMode};${pluginTls}${pluginMux}`;
          if (pluginHost !== "") {
            pluginOption += `host=${pluginHost};`;
          }
          if (path !== "") {
            pluginOption += `path=${path};`;
          }
          if (pluginMux !== "") {
            pluginOption += `mux=${pluginMux};`;
          }
        }
        if (cipher === "AEAD_CHACHA20_POLY1305") {
          cipher = "chacha20-ietf-poly1305";
        } else if (cipher.includes("AEAD")) {
          cipher = cipher.replace(/AEAD_/g, "").replace(/_/g, "-").toLowerCase();
        }
        ssConstruct(node, {
          group,
          method: cipher,
          password,
          plugin,
          pluginOption,
          port,
          remark: ps,
          scv,
          server,
          tfo,
          udp,
          underlyingProxy,
        });
        break;
      }
      case "socks5": {
        group = DEFAULT_GROUPS.socks;
        const user = asString(get(single, "username"));
        const password = asString(get(single, "password"));
        socksConstruct(node, {
          group,
          password,
          port,
          remark: ps,
          server,
          underlyingProxy,
          username: user,
        });
        break;
      }
      case "ssr": {
        group = DEFAULT_GROUPS.ssr;
        let cipher = asString(get(single, "cipher"));
        if (cipher === "dummy") {
          cipher = "none";
        }
        const password = asString(get(single, "password"));
        const protocol = asString(get(single, "protocol"));
        const obfs = asString(get(single, "obfs"));
        const protocolParam =
          get(single, "protocol-param") !== undefined
            ? asString(get(single, "protocol-param"))
            : asString(get(single, "protocolparam"));
        const obfsParam =
          get(single, "obfs-param") !== undefined
            ? asString(get(single, "obfs-param"))
            : asString(get(single, "obfsparam"));
        ssrConstruct(node, {
          group,
          method: cipher,
          obfs,
          obfsParam,
          password,
          port,
          protocol,
          protocolParam,
          remark: ps,
          scv,
          server,
          tfo,
          udp,
          underlyingProxy,
        });
        break;
      }
      case "http": {
        group = DEFAULT_GROUPS.http;
        const user = asString(get(single, "username"));
        const password = asString(get(single, "password"));
        const tls = asString(get(single, "tls"));
        httpConstruct(node, {
          group,
          password,
          port,
          remark: ps,
          scv,
          server,
          tfo,
          tls: tls === "true",
          underlyingProxy,
          username: user,
        });
        break;
      }
      case "trojan": {
        group = DEFAULT_GROUPS.trojan;
        const password = asString(get(single, "password"));
        const host = asString(get(single, "sni"));
        let net = asString(get(single, "network"));
        let path = "";
        switch (net) {
          case "grpc":
            path = asString(get(get(single, "grpc-opts"), "grpc-service-name"));
            break;
          case "ws":
            path = asString(get(get(single, "ws-opts"), "path"));
            break;
          default:
            net = "tcp";
            path = "";
            break;
        }
        trojanConstruct(node, {
          group,
          host,
          network: net,
          password,
          path,
          port,
          remark: ps,
          scv,
          server,
          tfo,
          tlsSecure: true,
          udp,
          underlyingProxy,
        });
        break;
      }
      case "snell": {
        group = DEFAULT_GROUPS.snell;
        const password = asString(get(single, "psk"));
        const obfs = asString(get(get(single, "obfs-opts"), "mode"));
        const host = asString(get(get(single, "obfs-opts"), "host"));
        const version = asString(get(single, "version"));
        snellConstruct(node, {
          group,
          host,
          obfs,
          password,
          port,
          remark: ps,
          scv,
          server,
          tfo,
          udp,
          underlyingProxy,
          version: toInt(version),
        });
        break;
      }
      case "wireguard": {
        group = DEFAULT_GROUPS.wireguard;
        const publicKey = asString(get(single, "public-key"));
        const privateKey = asString(get(single, "private-key"));
        const dns = get(single, "dns");
        const dnsServers = Array.isArray(dns)
          ? dns.map((d) => String(d))
          : dns
            ? [String(dns)]
            : [];
        const mtu = asString(get(single, "mtu"));
        const psk = asString(get(single, "preshared-key"));
        const ip = asString(get(single, "ip"));
        const ipv6 = asString(get(single, "ipv6"));
        wireGuardConstruct(node, {
          dnsServers,
          group,
          keepAlive: "0",
          mtu,
          port,
          preSharedKey: psk,
          privateKey,
          publicKey,
          remark: ps,
          selfIp: ip,
          selfIpv6: ipv6,
          server,
          testUrl: "",
          udp,
          underlyingProxy,
        });
        break;
      }
      case "hysteria": {
        group = DEFAULT_GROUPS.hysteria;
        const ports = asString(get(single, "ports"));
        const protocol = asString(get(single, "protocol"));
        const obfsProtocol = asString(get(single, "obfs-protocol"));
        const up = asString(get(single, "up"));
        const upSpeed = asString(get(single, "up-speed"));
        const down = asString(get(single, "down"));
        const downSpeed = asString(get(single, "down-speed"));
        const auth = asString(get(single, "auth"));
        let authStr = asString(get(single, "auth-str"));
        if (authStr === "") {
          authStr = asString(get(single, "auth_str"));
        }
        const obfs = asString(get(single, "obfs"));
        const sni = asString(get(single, "sni"));
        const fingerprint = asString(get(single, "fingerprint"));
        const alpnValue = get(single, "alpn");
        const alpn = Array.isArray(alpnValue) ? asString(alpnValue[0]) : asString(alpnValue);
        const ca = asString(get(single, "ca"));
        const caStr = asString(get(single, "ca-str"));
        const recvWindowConn = asString(get(single, "recv-window-conn"));
        const recvWindow = asString(get(single, "recv-window"));
        let disableMtuDiscovery = asString(get(single, "disable-mtu-discovery"));
        if (disableMtuDiscovery === "") {
          disableMtuDiscovery = asString(get(single, "disable_mtu_discovery"));
        }
        const hopInterval = asString(get(single, "hop-interval"));
        hysteriaConstruct(node, {
          alpn,
          auth,
          authStr,
          ca,
          caStr,
          disableMtuDiscovery,
          down,
          downSpeed,
          fingerprint,
          group,
          hopInterval,
          obfs,
          obfsProtocol,
          port,
          ports,
          protocol,
          recvWindow,
          recvWindowConn,
          remark: ps,
          scv,
          server,
          sni,
          tfo,
          underlyingProxy,
          up,
          upSpeed,
        });
        break;
      }
      case "hysteria2": {
        group = DEFAULT_GROUPS.hysteria2;
        const ports = asString(get(single, "ports"));
        const up = asString(get(single, "up"));
        const down = asString(get(single, "down"));
        let password = asString(get(single, "password"));
        if (password === "") {
          password = asString(get(single, "auth"));
        }
        const obfs = asString(get(single, "obfs"));
        const obfsPassword = asString(get(single, "obfs-password"));
        const sni = asString(get(single, "sni"));
        const fingerprint = asString(get(single, "fingerprint"));
        const alpnValue = get(single, "alpn");
        const alpn = Array.isArray(alpnValue) ? asString(alpnValue[0]) : asString(alpnValue);
        const ca = asString(get(single, "ca"));
        const caStr = asString(get(single, "ca-str"));
        const cwnd = asString(get(single, "cwnd"));
        const hopInterval = asString(get(single, "hop-interval"));
        hysteria2Construct(node, {
          alpn,
          ca,
          caStr,
          cwnd,
          down,
          fingerprint,
          group,
          hopInterval,
          obfs,
          obfsPassword,
          password,
          port,
          ports,
          remark: ps,
          scv,
          server,
          sni,
          tfo,
          underlyingProxy,
          up,
        });
        break;
      }
      case "anytls": {
        group = DEFAULT_GROUPS.anytls;
        const password = asString(get(single, "password"));
        const sni = asString(get(single, "sni"));
        anyTlsConstruct(node, {
          group,
          password,
          port,
          remark: ps,
          scv,
          server,
          sni,
          tfo,
          udp,
          underlyingProxy,
        });
        break;
      }
      case "vless": {
        group = DEFAULT_GROUPS.v2ray;
        const userId = asString(get(single, "uuid"));
        const net = asString(get(single, "network"));
        const tls = asString(get(single, "tls"));
        let path = "";
        let host = "";
        if (net === "ws") {
          path = asString(get(get(single, "ws-opts"), "path"));
          host = asString(get(get(get(single, "ws-opts"), "headers"), "Host"));
        } else if (net === "grpc") {
          path = asString(get(get(single, "grpc-opts"), "grpc-service-name"));
        }
        const alpnValue = get(single, "alpn");
        vlessConstruct(node, {
          alpn: Array.isArray(alpnValue) ? alpnValue.map((a) => String(a)) : undefined,
          encryption: asString(get(single, "encryption")),
          fingerprint: asString(get(single, "client-fingerprint")),
          flow: asString(get(single, "flow")),
          group,
          host,
          network: net,
          path,
          port,
          remark: ps,
          scv,
          server,
          sni: asString(get(single, "servername")),
          tfo,
          tls: tls === "true" ? "tls" : "",
          udp,
          underlyingProxy,
          userId,
        });
        break;
      }
      case "tuic": {
        group = DEFAULT_GROUPS.v2ray;
        const alpnValue = get(single, "alpn");
        tuicConstruct(node, {
          alpn: Array.isArray(alpnValue) ? alpnValue.map((a) => String(a)) : undefined,
          congestionControl: asString(get(single, "congestion-controller")),
          group,
          password: asString(get(single, "password")),
          port,
          remark: ps,
          scv,
          server,
          sni: asString(get(single, "sni")),
          tfo,
          udp,
          underlyingProxy,
          userId: asString(get(single, "uuid")),
        });
        break;
      }
      default:
        continue;
    }

    node.id = index;
    nodes.push(node);
    index += 1;
  }
}

/** Split INI-style text into ordered sections with their raw lines. */
function parseRawSections(text: string): Array<{ name: string; lines: string[] }> {
  const sections: Array<{ name: string; lines: string[] }> = [];
  const isolated: string[] = [];
  let current: { name: string; lines: string[] } | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = /^\[(.*)\]$/.exec(line);
    if (header) {
      current = { lines: [], name: (header[1] as string).trim() };
      sections.push(current);
      continue;
    }
    if (line === "" || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    if (current) {
      current.lines.push(line);
    } else {
      isolated.push(line);
    }
  }
  if (isolated.length > 0) {
    sections.unshift({ lines: isolated, name: "Proxy" });
  }
  return sections;
}

function getRawSection(sections: Array<{ name: string; lines: string[] }>, name: string): string[] {
  const lines: string[] = [];
  for (const section of sections) {
    if (section.name === name) {
      lines.push(...section.lines);
    }
  }
  return lines;
}

function collectKeyValues(
  lines: string[],
  startIndex: number,
  sink: { [key: string]: string },
): void {
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = trim(lines[i] as string);
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    sink[trim(line.slice(0, eq))] = trim(line.slice(eq + 1));
  }
}

/** Parse a Surge/Loon `[Proxy]` configuration into nodes. */
export function explodeSurge(surge: string, nodes: Proxy[]): boolean {
  let text = surge;
  if (text.includes("[Proxy]")) {
    text = text.replace(/^[\s\S]*?\[/, "[");
  }
  const sections = parseRawSections(text);
  const proxyLines = getRawSection(sections, "Proxy");
  if (proxyLines.length === 0) {
    return false;
  }
  const startCount = nodes.length;
  let index = nodes.length;

  for (const line of proxyLines) {
    const match = /^(.*?)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const remark = match[1] as string;
    const config = match[2] as string;
    const configs = split(config, ",");
    if (configs.length < 3) {
      continue;
    }
    const node = createProxy();
    let server = "";
    let port = "";
    let method = "";
    let username = "";
    let password = "";
    let plugin = "";
    let pluginOption = "";
    let pluginMode = "";
    let pluginHost = "";
    let id = "";
    let net = "tcp";
    let tls = "";
    let host = "";
    let edge = "";
    let path = "";
    let version = "";
    let aead = "1";
    let udp: TriBool;
    let tfo: TriBool;
    let scv: TriBool;
    let tls13: TriBool;

    switch ((configs[0] as string).toLowerCase()) {
      case "direct":
      case "reject":
      case "reject-tinygif":
        continue;
      case "custom": {
        if (configs.length < 5) {
          continue;
        }
        server = trim(configs[1] as string);
        port = trim(configs[2] as string);
        if (port === "0") {
          continue;
        }
        method = trim(configs[3] as string);
        password = trim(configs[4] as string);
        for (let i = 6; i < configs.length; i += 1) {
          const vArray = split(configs[i] as string, "=");
          if (vArray.length < 2) {
            continue;
          }
          const itemName = trim(vArray[0] as string);
          const itemVal = trim(vArray[1] as string);
          if (itemName === "obfs") {
            plugin = "simple-obfs";
            pluginMode = itemVal;
          } else if (itemName === "obfs-host") {
            pluginHost = itemVal;
          } else if (itemName === "udp-relay") {
            udp = asTri(itemVal);
          } else if (itemName === "tfo") {
            tfo = asTri(itemVal);
          }
        }
        if (plugin !== "") {
          pluginOption = `obfs=${pluginMode}`;
          pluginOption += pluginHost === "" ? "" : `;obfs-host=${pluginHost}`;
        }
        ssConstruct(node, {
          group: DEFAULT_GROUPS.ss,
          method,
          password,
          plugin,
          pluginOption,
          port,
          remark,
          scv,
          server,
          tfo,
          udp,
        });
        break;
      }
      case "ss": {
        server = trim(configs[1] as string);
        port = trim(configs[2] as string);
        if (port === "0") {
          continue;
        }
        for (let i = 3; i < configs.length; i += 1) {
          const vArray = split(configs[i] as string, "=");
          if (vArray.length < 2) {
            continue;
          }
          const itemName = trim(vArray[0] as string);
          const itemVal = trim(vArray[1] as string);
          if (itemName === "encrypt-method") {
            method = itemVal;
          } else if (itemName === "password") {
            password = itemVal;
          } else if (itemName === "obfs") {
            plugin = "simple-obfs";
            pluginMode = itemVal;
          } else if (itemName === "obfs-host") {
            pluginHost = itemVal;
          } else if (itemName === "udp-relay") {
            udp = asTri(itemVal);
          } else if (itemName === "tfo") {
            tfo = asTri(itemVal);
          }
        }
        if (plugin !== "") {
          pluginOption = `obfs=${pluginMode}`;
          pluginOption += pluginHost === "" ? "" : `;obfs-host=${pluginHost}`;
        }
        ssConstruct(node, {
          group: DEFAULT_GROUPS.ss,
          method,
          password,
          plugin,
          pluginOption,
          port,
          remark,
          scv,
          server,
          tfo,
          udp,
        });
        break;
      }
      case "socks5": {
        server = trim(configs[1] as string);
        port = trim(configs[2] as string);
        if (port === "0") {
          continue;
        }
        if (configs.length >= 5) {
          username = trim(configs[3] as string);
          password = trim(configs[4] as string);
        }
        for (let i = 5; i < configs.length; i += 1) {
          const vArray = split(configs[i] as string, "=");
          if (vArray.length < 2) {
            continue;
          }
          const itemName = trim(vArray[0] as string);
          const itemVal = trim(vArray[1] as string);
          if (itemName === "udp-relay") {
            udp = asTri(itemVal);
          } else if (itemName === "tfo") {
            tfo = asTri(itemVal);
          } else if (itemName === "skip-cert-verify") {
            scv = asTri(itemVal);
          }
        }
        socksConstruct(node, {
          group: DEFAULT_GROUPS.socks,
          password,
          port,
          remark,
          scv,
          server,
          tfo,
          udp,
          username,
        });
        break;
      }
      case "vmess": {
        server = trim(configs[1] as string);
        port = trim(configs[2] as string);
        if (port === "0") {
          continue;
        }
        net = "tcp";
        method = "auto";
        for (let i = 3; i < configs.length; i += 1) {
          const vArray = split(configs[i] as string, "=");
          if (vArray.length !== 2) {
            continue;
          }
          const itemName = trim(vArray[0] as string);
          const itemVal = trim(vArray[1] as string);
          switch (itemName) {
            case "username":
              id = itemVal;
              break;
            case "ws":
              net = itemVal === "true" ? "ws" : "tcp";
              break;
            case "tls":
              tls = itemVal === "true" ? "tls" : "";
              break;
            case "ws-path":
              path = itemVal;
              break;
            case "obfs-host":
              host = itemVal;
              break;
            case "ws-headers": {
              const headers = split(itemVal, "|");
              for (const header of headers) {
                const kv = split(trim(header), ":");
                if (kv.length !== 2) {
                  continue;
                }
                if (/host/i.test(kv[0] as string)) {
                  host = trimQuote(kv[1] as string);
                } else if (/edge/i.test(kv[0] as string)) {
                  edge = trimQuote(kv[1] as string);
                }
              }
              break;
            }
            case "udp-relay":
              udp = asTri(itemVal);
              break;
            case "tfo":
              tfo = asTri(itemVal);
              break;
            case "skip-cert-verify":
              scv = asTri(itemVal);
              break;
            case "tls13":
              tls13 = asTri(itemVal);
              break;
            case "vmess-aead":
              aead = itemVal === "true" ? "0" : "1";
              break;
            default:
              break;
          }
        }
        vmessConstruct(node, {
          add: server,
          aid: aead,
          cipher: method,
          edge,
          group: DEFAULT_GROUPS.v2ray,
          host,
          id,
          net,
          path,
          port,
          remark,
          scv,
          tfo,
          tls,
          tls13,
          udp,
        });
        break;
      }
      case "http": {
        server = trim(configs[1] as string);
        port = trim(configs[2] as string);
        if (port === "0") {
          continue;
        }
        for (let i = 3; i < configs.length; i += 1) {
          const vArray = split(configs[i] as string, "=");
          if (vArray.length < 2) {
            continue;
          }
          const itemName = trim(vArray[0] as string);
          const itemVal = trim(vArray[1] as string);
          if (itemName === "username") {
            username = itemVal;
          } else if (itemName === "password") {
            password = itemVal;
          } else if (itemName === "skip-cert-verify") {
            scv = asTri(itemVal);
          }
        }
        httpConstruct(node, {
          group: DEFAULT_GROUPS.http,
          password,
          port,
          remark,
          scv,
          server,
          tfo,
          tls: false,
          username,
        });
        break;
      }
      case "trojan": {
        server = trim(configs[1] as string);
        port = trim(configs[2] as string);
        if (port === "0") {
          continue;
        }
        for (let i = 3; i < configs.length; i += 1) {
          const vArray = split(configs[i] as string, "=");
          if (vArray.length !== 2) {
            continue;
          }
          const itemName = trim(vArray[0] as string);
          const itemVal = trim(vArray[1] as string);
          if (itemName === "password") {
            password = itemVal;
          } else if (itemName === "sni") {
            host = itemVal;
          } else if (itemName === "udp-relay") {
            udp = asTri(itemVal);
          } else if (itemName === "tfo") {
            tfo = asTri(itemVal);
          } else if (itemName === "skip-cert-verify") {
            scv = asTri(itemVal);
          }
        }
        trojanConstruct(node, {
          group: DEFAULT_GROUPS.trojan,
          host,
          password,
          port,
          remark,
          scv,
          server,
          tfo,
          tlsSecure: true,
          udp,
        });
        break;
      }
      case "snell": {
        server = trim(configs[1] as string);
        port = trim(configs[2] as string);
        if (port === "0") {
          continue;
        }
        for (let i = 3; i < configs.length; i += 1) {
          const vArray = split(configs[i] as string, "=");
          if (vArray.length !== 2) {
            continue;
          }
          const itemName = trim(vArray[0] as string);
          const itemVal = trim(vArray[1] as string);
          if (itemName === "psk") {
            password = itemVal;
          } else if (itemName === "obfs") {
            plugin = itemVal;
          } else if (itemName === "obfs-host") {
            host = itemVal;
          } else if (itemName === "udp-relay") {
            udp = asTri(itemVal);
          } else if (itemName === "tfo") {
            tfo = asTri(itemVal);
          } else if (itemName === "skip-cert-verify") {
            scv = asTri(itemVal);
          } else if (itemName === "version") {
            version = itemVal;
          }
        }
        snellConstruct(node, {
          group: DEFAULT_GROUPS.snell,
          host,
          obfs: plugin,
          password,
          port,
          remark,
          scv,
          server,
          tfo,
          udp,
          version: toInt(version),
        });
        break;
      }
      case "wireguard": {
        let section = "";
        let testUrl = "";
        for (let i = 1; i < configs.length; i += 1) {
          const vArray = split(trim(configs[i] as string), "=");
          if (vArray.length !== 2) {
            continue;
          }
          const itemName = trim(vArray[0] as string);
          const itemVal = trim(vArray[1] as string);
          if (itemName === "section-name") {
            section = itemVal;
          } else if (itemName === "test-url") {
            testUrl = itemVal;
          }
        }
        if (section === "") {
          continue;
        }
        const wgLines = getRawSection(sections, `WireGuard ${section}`);
        if (wgLines.length === 0) {
          continue;
        }
        const wg: { [key: string]: string } = {};
        collectKeyValues(wgLines, 0, wg);
        const dnsServers: string[] = [];
        if (wg["dns-server"]) {
          for (const dns of split(wg["dns-server"], ",")) {
            dnsServers.push(trim(dns));
          }
        }
        wireGuardConstruct(node, {
          dnsServers,
          group: DEFAULT_GROUPS.wireguard,
          keepAlive: wg["keepalive"] ?? "",
          mtu: wg["mtu"] ?? "",
          port: "0",
          privateKey: wg["private-key"] ?? "",
          remark,
          selfIp: wg["self-ip"] ?? "",
          selfIpv6: wg["self-ip-v6"] ?? "",
          server: "",
          testUrl,
          udp,
        });
        parsePeers(node, wg["peer"] ?? "");
        break;
      }
      case "anytls": {
        server = trim(configs[1] as string);
        port = trim(configs[2] as string);
        if (port === "0") {
          continue;
        }
        for (let i = 3; i < configs.length; i += 1) {
          const vArray = split(configs[i] as string, "=");
          if (vArray.length !== 2) {
            continue;
          }
          const itemName = trim(vArray[0] as string);
          const itemVal = trim(vArray[1] as string);
          if (itemName === "password") {
            password = itemVal;
          } else if (itemName === "sni") {
            host = itemVal;
          } else if (itemName === "udp-relay") {
            udp = asTri(itemVal);
          } else if (itemName === "tfo") {
            tfo = asTri(itemVal);
          } else if (itemName === "skip-cert-verify") {
            scv = asTri(itemVal);
          }
        }
        anyTlsConstruct(node, {
          group: DEFAULT_GROUPS.anytls,
          password,
          port,
          remark,
          scv,
          server,
          sni: host,
          tfo,
          udp,
        });
        break;
      }
      default: {
        const handled = parseQuanxStyle(remark, configs, node, { scv, tfo, tls13, udp });
        if (!handled) {
          continue;
        }
        break;
      }
    }

    node.id = index;
    nodes.push(node);
    index += 1;
  }
  return nodes.length > startCount;
}

interface QuanxFlags {
  udp: TriBool;
  tfo: TriBool;
  scv: TriBool;
  tls13: TriBool;
}

function parseQuanxStyle(
  remark: string,
  configs: string[],
  node: Proxy,
  flags: QuanxFlags,
): boolean {
  const kind = remark.toLowerCase();
  const first = configs[0] as string;
  const lastColon = first.lastIndexOf(":");
  const server = trim(first.slice(0, lastColon));
  const port = trim(first.slice(lastColon + 1));
  if (port === "0") {
    return false;
  }
  let method = "";
  let password = "";
  let username = "";
  let host = "";
  let path = "";
  let plugin = "";
  let pluginMode = "";
  let pluginHost = "";
  let protocol = "";
  let protocolParam = "";
  let tls = "";
  let net = "tcp";
  let id = "";
  let aead = "1";
  let newRemark = remark;
  const udp = flags.udp;
  const tfo = flags.tfo;
  let scv = flags.scv;
  const tls13 = flags.tls13;

  const kv: { [key: string]: string } = {};
  for (let i = 1; i < configs.length; i += 1) {
    const vArray = split(trim(configs[i] as string), "=");
    if (vArray.length !== 2) {
      continue;
    }
    kv[trim(vArray[0] as string)] = trim(vArray[1] as string);
  }

  if (kind === "shadowsocks") {
    method = kv["method"] ?? "";
    password = kv["password"] ?? "";
    if (kv["tag"]) {
      newRemark = kv["tag"] as string;
    }
    protocol = kv["ssr-protocol"] ?? "";
    protocolParam = kv["ssr-protocol-param"] ?? "";
    if (kv["obfs"]) {
      const obfsVal = kv["obfs"] as string;
      if (obfsVal === "http" || obfsVal === "tls") {
        plugin = "simple-obfs";
        pluginMode = obfsVal;
      } else if (obfsVal === "wss" || obfsVal === "ws") {
        if (obfsVal === "wss") {
          tls = "tls";
        }
        pluginMode = "websocket";
        plugin = "v2ray-plugin";
      } else {
        pluginMode = obfsVal;
      }
    }
    pluginHost = kv["obfs-host"] ?? "";
    path = kv["obfs-uri"] ?? "";
    if (newRemark === "") {
      newRemark = `${server}:${port}`;
    }
    let pluginOption = "";
    if (plugin === "simple-obfs") {
      pluginOption = `obfs=${pluginMode}`;
      if (pluginHost !== "") {
        pluginOption += `;obfs-host=${pluginHost}`;
      }
    } else if (plugin === "v2ray-plugin") {
      if (pluginHost === "" && !/^\d+(\.\d+){3}$/.test(server) && !server.includes(":")) {
        pluginHost = server;
      }
      pluginOption = `mode=${pluginMode}`;
      if (pluginHost !== "") {
        pluginOption += `;host=${pluginHost}`;
      }
      if (path !== "") {
        pluginOption += `;path=${path}`;
      }
      pluginOption += `;${tls}`;
    }
    if (protocol !== "") {
      ssrConstruct(node, {
        group: DEFAULT_GROUPS.ssr,
        method,
        obfs: pluginMode,
        obfsParam: pluginHost,
        password,
        port,
        protocol,
        protocolParam,
        remark: newRemark,
        scv,
        server,
        tfo,
        udp,
      });
    } else {
      ssConstruct(node, {
        group: DEFAULT_GROUPS.ss,
        method,
        password,
        plugin,
        pluginOption,
        port,
        remark: newRemark,
        scv,
        server,
        tfo,
        tls13,
        udp,
      });
    }
    return true;
  }

  if (kind === "vmess") {
    net = "tcp";
    method = kv["method"] ?? "";
    id = kv["password"] ?? "";
    if (kv["tag"]) {
      newRemark = kv["tag"] as string;
    }
    if (kv["obfs"]) {
      const obfsVal = kv["obfs"] as string;
      if (obfsVal === "ws") {
        net = "ws";
      } else if (obfsVal === "over-tls") {
        tls = "tls";
      } else if (obfsVal === "wss") {
        net = "ws";
        tls = "tls";
      }
    }
    host = kv["obfs-host"] ?? "";
    path = kv["obfs-uri"] ?? "";
    if (kv["over-tls"]) {
      tls = kv["over-tls"] === "true" ? "tls" : "";
    }
    if (kv["aead"]) {
      aead = kv["aead"] === "true" ? "0" : "1";
    }
    if (newRemark === "") {
      newRemark = `${server}:${port}`;
    }
    vmessConstruct(node, {
      add: server,
      aid: aead,
      cipher: method,
      group: DEFAULT_GROUPS.v2ray,
      host,
      id,
      net,
      path,
      port,
      remark: newRemark,
      scv,
      tfo,
      tls,
      tls13,
      udp,
    });
    return true;
  }

  if (kind === "trojan") {
    password = kv["password"] ?? "";
    if (kv["tag"]) {
      newRemark = kv["tag"] as string;
    }
    if (kv["over-tls"]) {
      tls = kv["over-tls"] as string;
    }
    host = kv["tls-host"] ?? "";
    if (kv["tls-verification"] === "false") {
      scv = true;
    }
    if (newRemark === "") {
      newRemark = `${server}:${port}`;
    }
    trojanConstruct(node, {
      group: DEFAULT_GROUPS.trojan,
      host,
      password,
      port,
      remark: newRemark,
      scv,
      server,
      tfo,
      tls13,
      tlsSecure: tls === "true",
      udp,
    });
    return true;
  }

  if (kind === "http") {
    username = kv["username"] ?? "";
    password = kv["password"] ?? "";
    if (kv["tag"]) {
      newRemark = kv["tag"] as string;
    }
    if (kv["over-tls"]) {
      tls = kv["over-tls"] as string;
    }
    if (kv["tls-verification"] === "false") {
      scv = true;
    }
    if (newRemark === "") {
      newRemark = `${server}:${port}`;
    }
    if (username === "none") {
      username = "";
    }
    if (password === "none") {
      password = "";
    }
    httpConstruct(node, {
      group: DEFAULT_GROUPS.http,
      password,
      port,
      remark: newRemark,
      scv,
      server,
      tfo,
      tls: tls === "true",
      tls13,
      username,
    });
    return true;
  }

  if (kind === "anytls") {
    password = kv["password"] ?? "";
    if (kv["tag"]) {
      newRemark = kv["tag"] as string;
    }
    host = kv["sni"] ?? "";
    if (kv["tls-verification"] === "false") {
      scv = true;
    }
    if (newRemark === "") {
      newRemark = `${server}:${port}`;
    }
    anyTlsConstruct(node, {
      group: DEFAULT_GROUPS.anytls,
      password,
      port,
      remark: newRemark,
      scv,
      server,
      sni: host,
      tfo,
      udp,
    });
    return true;
  }

  return false;
}

function trimQuote(input: string): string {
  let value = trim(input);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

/** Parse a WireGuard `peer = (...)` blob into `node`. */
export function parsePeers(node: Proxy, data: string): void {
  const peers = [...data.matchAll(/\((.*?)\)/g)].map((m) => m[1] as string);
  if (peers.length === 0) {
    return;
  }
  const peer = peers[0] as string;
  const pairs = [...peer.matchAll(/([a-z-]+)\s?=\s?([^" ),]+|".*?"),?\s?/g)];
  for (const pair of pairs) {
    const key = pair[1] as string;
    const val = pair[2] as string;
    switch (key) {
      case "public-key":
        node.publicKey = val;
        break;
      case "endpoint": {
        const colon = val.lastIndexOf(":");
        node.hostname = val.slice(0, colon);
        node.port = toInt(val.slice(colon + 1));
        break;
      }
      case "client-id":
        node.clientId = val;
        break;
      case "allowed-ips":
        node.allowedIps = trimQuote(val);
        break;
      default:
        break;
    }
  }
}

/** Parse a Clash/plain YAML string into nodes (returns count). */
export function parseClashText(content: string, nodes: Proxy[]): boolean {
  try {
    const root = parseYaml(content);
    if (
      root &&
      typeof root === "object" &&
      (get(root, "Proxy") !== undefined || get(root, "proxies") !== undefined)
    ) {
      explodeClash(root, nodes);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Parse an ss/ssr/v2ray configuration JSON blob (single or list). */
export function parseConfContent(content: string, nodes: Proxy[]): boolean {
  if (content.includes('"version"')) {
    explodeSsConf(content, nodes);
  } else if (content.includes('"serverSubscribes"')) {
    explodeSsrConf(content, nodes);
  } else if (content.includes('"uiItem"') || content.includes("vnext")) {
    explodeVmessConf(content, nodes);
  } else if (content.includes('"proxy_apps"')) {
    explodeSsAndroid(content, nodes);
  } else if (content.includes('"idInUse"')) {
    explodeSstap(content, nodes);
  } else if (content.includes('"local_address"') && content.includes('"local_port"')) {
    explodeSsrConf(content, nodes);
  } else if (content.includes('"ModeFileNameType"')) {
    explodeNetchConf(content, nodes);
  } else {
    return false;
  }
  return nodes.length > 0;
}

/** Parse a Shadowsocks Android (`ssconf`) JSON config. */
export function explodeSsConf(content: string, nodes: Proxy[]): void {
  let json: any;
  try {
    json = JSON.parse(content);
  } catch {
    return;
  }
  if (json === null || typeof json !== "object") {
    return;
  }
  const section = "version" in json && "servers" in json ? "servers" : "configs";
  if (!(section in json)) {
    return;
  }
  const group = asString(json.remarks);
  const list: any[] = json[section];
  if (!Array.isArray(list)) {
    return;
  }
  let index = nodes.length;
  for (const entry of list) {
    const remark = asString(entry.remarks);
    const port = asString(entry.server_port);
    if (port === "0") {
      continue;
    }
    const server = asString(entry.server);
    const node = createProxy();
    ssConstruct(node, {
      group,
      method: asString(entry.method),
      password: asString(entry.password),
      plugin: asString(entry.plugin),
      pluginOption: asString(entry.plugin_opts),
      port,
      remark: remark === "" ? `${server}:${port}` : remark,
      server,
    });
    node.id = index;
    nodes.push(node);
    index += 1;
  }
}

/** Parse a Shadowsocks Android (`com.github.shadowsocks`) node array. */
export function explodeSsAndroid(content: string, nodes: Proxy[]): void {
  let json: any;
  try {
    json = JSON.parse(`{"nodes":${content}}`);
  } catch {
    return;
  }
  if (json === null || typeof json !== "object" || !Array.isArray(json.nodes)) {
    return;
  }
  let index = nodes.length;
  for (const entry of json.nodes) {
    const server = asString(entry.server);
    if (server === "") {
      continue;
    }
    const port = asString(entry.server_port);
    if (port === "0" || port === "") {
      continue;
    }
    const remark = asString(entry.remarks);
    const node = createProxy();
    ssConstruct(node, {
      group: DEFAULT_GROUPS.ss,
      method: asString(entry.method),
      password: asString(entry.password),
      plugin: asString(entry.plugin),
      pluginOption: asString(entry.plugin_opts),
      port,
      remark: remark === "" ? `${server}:${port}` : remark,
      server,
    });
    node.id = index;
    nodes.push(node);
    index += 1;
  }
}

/** Parse a ShadowsocksR config JSON. */
export function explodeSsrConf(content: string, nodes: Proxy[]): void {
  let json: any;
  try {
    json = JSON.parse(content);
  } catch {
    return;
  }
  if (json === null || typeof json !== "object") {
    return;
  }
  let index = nodes.length;
  if ("local_port" in json && "local_address" in json) {
    const node = createProxy();
    const server = asString(json.server);
    const port = asString(json.server_port);
    const remark = `${server}:${port}`;
    const method = asString(json.method);
    const obfs = asString(json.obfs);
    const protocol = asString(json.protocol);
    const password = asString(json.password);
    if (isFlattenableSsr(method, obfs, protocol)) {
      ssConstruct(node, {
        group: DEFAULT_GROUPS.ss,
        method,
        password,
        plugin: asString(json.plugin),
        pluginOption: asString(json.plugin_opts),
        port,
        remark,
        server,
      });
    } else {
      ssrConstruct(node, {
        group: DEFAULT_GROUPS.ssr,
        method,
        obfs,
        obfsParam: asString(json.obfs_param),
        password,
        port,
        protocol,
        protocolParam: asString(json.protocol_param),
        remark,
        server,
      });
    }
    node.id = index;
    nodes.push(node);
    return;
  }

  const list: any[] = json.configs ?? [];
  if (!Array.isArray(list)) {
    return;
  }
  for (const entry of list) {
    const group = asString(entry.group) === "" ? DEFAULT_GROUPS.ssr : asString(entry.group);
    const server = asString(entry.server);
    const port = asString(entry.server_port);
    if (port === "0" || port === "") {
      continue;
    }
    const remark = asString(entry.remarks) === "" ? `${server}:${port}` : asString(entry.remarks);
    const node = createProxy();
    ssrConstruct(node, {
      group,
      method: asString(entry.method),
      obfs: asString(entry.obfs),
      obfsParam: asString(entry.obfsparam),
      password: asString(entry.password),
      port,
      protocol: asString(entry.protocol),
      protocolParam: asString(entry.protocolparam),
      remark,
      server,
    });
    node.id = index;
    nodes.push(node);
    index += 1;
  }
}

/** Parse a v2rayN config JSON. */
export function explodeVmessConf(content: string, nodes: Proxy[]): void {
  let json: any;
  try {
    json = JSON.parse(content);
  } catch {
    return;
  }
  if (json === null || typeof json !== "object") {
    return;
  }
  let index = nodes.length;

  if ("outbounds" in json) {
    const outbounds = json.outbounds;
    if (
      Array.isArray(outbounds) &&
      outbounds.length > 0 &&
      outbounds[0]?.settings?.vnext?.length > 0
    ) {
      const vnext = outbounds[0].settings.vnext[0];
      const add = asString(vnext.address);
      const port = asString(vnext.port);
      if (port === "0") {
        return;
      }
      const users = vnext.users;
      const id = Array.isArray(users) && users.length ? asString(users[0].id) : "";
      const aid = Array.isArray(users) && users.length ? asString(users[0].alterId) : "";
      const cipher = Array.isArray(users) && users.length ? asString(users[0].security) : "";
      const stream = outbounds[0].streamSettings ?? {};
      const net = asString(stream.network);
      const tls = asString(stream.security);
      let path = "";
      let host = "";
      let edge = "";
      let type = "";
      if (net === "ws") {
        const ws = stream.wsSettings ?? {};
        path = asString(ws.path);
        if (ws.headers) {
          host = asString(ws.headers.Host);
          edge = asString(ws.headers.Edge);
        }
      }
      const tcp = stream.tcpSettings;
      if (tcp && tcp.header) {
        type = asString(tcp.header.type);
        if (type === "http" && tcp.header.request) {
          if (Array.isArray(tcp.header.request.path) && tcp.header.request.path.length) {
            path = asString(tcp.header.request.path[0]);
          }
          if (tcp.header.request.headers) {
            host = asString(tcp.header.request.headers.Host);
            edge = asString(tcp.header.request.headers.Edge);
          }
        }
      }
      const node = createProxy();
      vmessConstruct(node, {
        add,
        aid,
        cipher,
        edge,
        group: DEFAULT_GROUPS.v2ray,
        host,
        id,
        net,
        path,
        port,
        remark: `${add}:${port}`,
        tls,
        type,
      });
      nodes.push(node);
    }
    return;
  }

  const subdata = new Map<string, string>();
  const subItems: any[] = json.subItem ?? [];
  for (const item of subItems) {
    subdata.set(asString(item.id), asString(item.remarks));
  }

  const list: any[] = json.vmess ?? [];
  for (const entry of list) {
    if (
      entry.address === null ||
      entry.address === undefined ||
      entry.port === null ||
      entry.id === null
    ) {
      continue;
    }
    let ps = asString(entry.remarks);
    const add = asString(entry.address);
    const port = asString(entry.port);
    if (port === "0" || port === "") {
      continue;
    }
    const subid = asString(entry.subid);
    let group = "";
    if (subid !== "") {
      group = subdata.get(subid) ?? "";
    }
    if (ps === "") {
      ps = `${add}:${port}`;
    }
    const scv = asTri(entry.allowInsecure);
    const configType = toInt(entry.configType);
    const node = createProxy();
    if (configType === 1) {
      vmessConstruct(node, {
        add,
        aid: asString(entry.alterId),
        cipher: asString(entry.security),
        group: group || DEFAULT_GROUPS.v2ray,
        host: asString(entry.requestHost),
        id: asString(entry.id),
        net: asString(entry.network),
        path: asString(entry.path),
        port,
        remark: ps,
        scv,
        sni: asString(entry.sni),
        tls: asString(entry.streamSecurity),
        type: asString(entry.headerType),
      });
    } else if (configType === 3) {
      ssConstruct(node, {
        group: group || DEFAULT_GROUPS.ss,
        method: asString(entry.security),
        password: asString(entry.id),
        port,
        remark: ps,
        scv,
        server: add,
      });
    } else if (configType === 4) {
      socksConstruct(node, {
        group: group || DEFAULT_GROUPS.socks,
        port,
        remark: ps,
        scv,
        server: add,
      });
    } else {
      continue;
    }
    node.id = index;
    nodes.push(node);
    index += 1;
  }
}

/** Parse an SSTap config JSON. */
export function explodeSstap(content: string, nodes: Proxy[]): void {
  let json: any;
  try {
    json = JSON.parse(content);
  } catch {
    return;
  }
  if (json === null || typeof json !== "object" || !Array.isArray(json.configs)) {
    return;
  }
  let index = nodes.length;
  for (const entry of json.configs) {
    const group = asString(entry.group);
    const server = asString(entry.server);
    const port = asString(entry.server_port);
    if (port === "0" || port === "") {
      continue;
    }
    const remark = asString(entry.remarks) === "" ? `${server}:${port}` : asString(entry.remarks);
    const password = asString(entry.password);
    const node = createProxy();
    const configType = toInt(entry.type);
    if (configType === 5) {
      socksConstruct(node, {
        group,
        password,
        port,
        remark,
        server,
        username: asString(entry.username),
      });
    } else if (configType === 6) {
      const protocol = asString(entry.protocol);
      const obfs = asString(entry.obfs);
      const method = asString(entry.method);
      if (isFlattenableSsr(method, obfs, protocol)) {
        ssConstruct(node, { group, method, password, port, remark, server });
      } else {
        ssrConstruct(node, {
          group,
          method,
          obfs,
          obfsParam: asString(entry.obfsparam),
          password,
          port,
          protocol,
          protocolParam: asString(entry.protocolparam),
          remark,
          server,
        });
      }
    } else {
      continue;
    }
    node.id = index;
    nodes.push(node);
    index += 1;
  }
}

/** Parse a Netch config JSON. */
export function explodeNetchConf(content: string, nodes: Proxy[]): void {
  let json: any;
  try {
    json = JSON.parse(content);
  } catch {
    return;
  }
  if (json === null || typeof json !== "object" || !Array.isArray(json.Server)) {
    return;
  }
  let index = nodes.length;
  for (const entry of json.Server) {
    const node = createProxy();
    explodeNetch(`Netch://${base64Encode(JSON.stringify(entry))}`, node);
    node.id = index;
    nodes.push(node);
    index += 1;
  }
}
