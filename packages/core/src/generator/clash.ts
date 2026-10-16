import { stringify as yamlStringify } from "yaml";

import { groupGenerate, processRemark } from "./nodes";
import type { Proxy } from "../types/proxy";
import { ProxyType, proxyTypeName } from "../types/proxy";
import type { ProxyGroupConfig } from "../types/proxy-group";
import type { ExtraSettings } from "../types/settings";
import { base64Encode } from "../utils/base64";
import { getUrlArg, urlDecode } from "../utils/url";

const CLASHR_PROTOCOLS = [
  "origin",
  "auth_sha1_v4",
  "auth_aes128_md5",
  "auth_aes128_sha1",
  "auth_chain_a",
  "auth_chain_b",
];
const CLASHR_OBFS = [
  "plain",
  "http_simple",
  "http_post",
  "random_head",
  "tls1.2_ticket_auth",
  "tls1.2_ticket_fastauth",
];
const CLASH_SSR_CIPHERS = [
  "rc4-md5",
  "aes-128-ctr",
  "aes-192-ctr",
  "aes-256-ctr",
  "aes-128-cfb",
  "aes-192-cfb",
  "aes-256-cfb",
  "chacha20-ietf",
  "xchacha20",
  "none",
];

type ClashProxy = Record<string, unknown>;

function stripBrackets(value: string): string {
  return value.replace(/^\[+/, "").replace(/\]+$/, "");
}

function toTri(value: boolean | undefined): boolean | undefined {
  return value;
}

function buildClashProxy(
  x: Proxy,
  settings: ExtraSettings,
  clashR: boolean,
  remark: string,
  skipCertVerify: boolean | undefined,
  tfo: boolean | undefined,
): ClashProxy | undefined {
  const proxy: ClashProxy = {
    name: remark,
    port: x.port,
    server: stripBrackets(x.hostname),
  };

  switch (x.type) {
    case ProxyType.Shadowsocks: {
      if (settings.filterDeprecated && x.encryptMethod === "chacha20") {
        return undefined;
      }
      proxy.type = "ss";
      proxy.cipher = x.encryptMethod;
      proxy.password = x.password;
      const pluginOpts = x.pluginOption.replace(/;/g, "&");
      if (x.plugin === "simple-obfs" || x.plugin === "obfs-local") {
        proxy.plugin = "obfs";
        proxy["plugin-opts"] = {
          host: urlDecode(getUrlArg(pluginOpts, "obfs-host")),
          mode: urlDecode(getUrlArg(pluginOpts, "obfs")),
        };
      } else if (x.plugin === "v2ray-plugin") {
        proxy.plugin = "v2ray-plugin";
        const opts: Record<string, unknown> = {
          host: getUrlArg(pluginOpts, "host"),
          mode: getUrlArg(pluginOpts, "mode"),
          mux: pluginOpts.includes("mux"),
          path: getUrlArg(pluginOpts, "path"),
          tls: pluginOpts.includes("tls"),
        };
        if (skipCertVerify !== undefined) {
          opts["skip-cert-verify"] = skipCertVerify;
        }
        proxy["plugin-opts"] = opts;
      }
      break;
    }
    case ProxyType.VMess: {
      proxy.type = "vmess";
      proxy.uuid = x.userId;
      proxy.alterId = x.alterId;
      proxy.cipher = x.encryptMethod;
      proxy.tls = x.tlsSecure;
      if (skipCertVerify !== undefined) {
        proxy["skip-cert-verify"] = skipCertVerify;
      }
      if (x.serverName !== "") {
        proxy.servername = x.serverName;
      }
      switch (x.transferProtocol) {
        case "tcp":
          break;
        case "ws":
          proxy.network = x.transferProtocol;
          if (settings.clashNewFieldName) {
            proxy["ws-opts"] = {
              ...(x.host !== "" || x.edge !== ""
                ? {
                    headers: {
                      ...(x.edge !== "" ? { Edge: x.edge } : {}),
                      ...(x.host !== "" ? { Host: x.host } : {}),
                    },
                  }
                : {}),
              path: x.path,
            };
          } else {
            proxy["ws-path"] = x.path;
            if (x.host !== "" || x.edge !== "") {
              proxy["ws-headers"] = {
                ...(x.edge !== "" ? { Edge: x.edge } : {}),
                ...(x.host !== "" ? { Host: x.host } : {}),
              };
            }
          }
          break;
        case "http":
          proxy.network = x.transferProtocol;
          proxy["http-opts"] = {
            ...(x.host !== "" || x.edge !== ""
              ? {
                  headers: {
                    ...(x.edge !== "" ? { Edge: [x.edge] } : {}),
                    ...(x.host !== "" ? { Host: [x.host] } : {}),
                  },
                }
              : {}),
            method: "GET",
            path: [x.path],
          };
          break;
        case "h2":
          proxy.network = x.transferProtocol;
          proxy["h2-opts"] = {
            ...(x.host !== "" ? { host: [x.host] } : {}),
            path: x.path,
          };
          break;
        case "grpc":
          proxy.network = x.transferProtocol;
          proxy.servername = x.host;
          proxy["grpc-opts"] = { "grpc-service-name": x.path };
          break;
        default:
          return undefined;
      }
      break;
    }
    case ProxyType.ShadowsocksR: {
      if (settings.filterDeprecated) {
        if (!clashR && !CLASH_SSR_CIPHERS.includes(x.encryptMethod)) {
          return undefined;
        }
        if (!CLASHR_PROTOCOLS.includes(x.protocol)) {
          return undefined;
        }
        if (!CLASHR_OBFS.includes(x.obfs)) {
          return undefined;
        }
      }
      proxy.type = "ssr";
      proxy.cipher = x.encryptMethod === "none" ? "dummy" : x.encryptMethod;
      proxy.password = x.password;
      proxy.protocol = x.protocol;
      proxy.obfs = x.obfs;
      if (clashR) {
        proxy.protocolparam = x.protocolParam;
        proxy.obfsparam = x.obfsParam;
      } else {
        proxy["protocol-param"] = x.protocolParam;
        proxy["obfs-param"] = x.obfsParam;
      }
      break;
    }
    case ProxyType.SOCKS5:
      proxy.type = "socks5";
      if (x.username !== "") {
        proxy.username = x.username;
      }
      if (x.password !== "") {
        proxy.password = x.password;
      }
      if (skipCertVerify !== undefined) {
        proxy["skip-cert-verify"] = skipCertVerify;
      }
      break;
    case ProxyType.HTTP:
    case ProxyType.HTTPS:
      proxy.type = "http";
      if (x.username !== "") {
        proxy.username = x.username;
      }
      if (x.password !== "") {
        proxy.password = x.password;
      }
      proxy.tls = x.tlsSecure;
      if (skipCertVerify !== undefined) {
        proxy["skip-cert-verify"] = skipCertVerify;
      }
      break;
    case ProxyType.Trojan:
      proxy.type = "trojan";
      proxy.password = x.password;
      if (x.host !== "") {
        proxy.sni = x.host;
      }
      if (skipCertVerify !== undefined) {
        proxy["skip-cert-verify"] = skipCertVerify;
      }
      switch (x.transferProtocol) {
        case "tcp":
          break;
        case "grpc":
          proxy.network = x.transferProtocol;
          if (x.path !== "") {
            proxy["grpc-opts"] = { "grpc-service-name": x.path };
          }
          break;
        case "ws":
          proxy.network = x.transferProtocol;
          proxy["ws-opts"] = {
            ...(x.host !== "" ? { headers: { Host: x.host } } : {}),
            path: x.path,
          };
          break;
        default:
          break;
      }
      break;
    case ProxyType.Snell:
      if (x.snellVersion >= 4) {
        return undefined;
      }
      proxy.type = "snell";
      proxy.psk = x.password;
      if (x.snellVersion !== 0) {
        proxy.version = x.snellVersion;
      }
      if (x.obfs !== "") {
        proxy["obfs-opts"] = {
          ...(x.host !== "" ? { host: x.host } : {}),
          mode: x.obfs,
        };
      }
      break;
    case ProxyType.WireGuard:
      proxy.type = "wireguard";
      proxy["public-key"] = x.publicKey;
      proxy["private-key"] = x.privateKey;
      proxy.ip = x.selfIp;
      if (x.selfIpv6 !== "") {
        proxy.ipv6 = x.selfIpv6;
      }
      if (x.preSharedKey !== "") {
        proxy["preshared-key"] = x.preSharedKey;
      }
      if (x.dnsServers.length > 0) {
        proxy.dns = x.dnsServers;
      }
      if (x.mtu > 0) {
        proxy.mtu = x.mtu;
      }
      break;
    case ProxyType.Hysteria: {
      proxy.type = "hysteria";
      if (x.ports !== "") {
        proxy.ports = x.ports;
      }
      if (x.protocol !== "") {
        proxy.protocol = x.protocol;
      }
      if (x.obfsParam !== "") {
        proxy["obfs-protocol"] = x.obfsParam;
      }
      if (x.up !== "") {
        proxy.up = x.up;
      }
      if (x.upSpeed) {
        proxy["up-speed"] = x.upSpeed;
      }
      if (x.down !== "") {
        proxy.down = x.down;
      }
      if (x.downSpeed) {
        proxy["down-speed"] = x.downSpeed;
      }
      if (x.authStr !== "") {
        proxy["auth-str"] = x.authStr;
        proxy.auth = base64Encode(x.authStr);
      }
      if (x.obfs !== "") {
        proxy.obfs = x.obfs;
      }
      if (x.sni !== "") {
        proxy.sni = x.sni;
      }
      if (skipCertVerify !== undefined) {
        proxy["skip-cert-verify"] = skipCertVerify;
      }
      if (x.fingerprint !== "") {
        proxy.fingerprint = x.fingerprint;
      }
      if (x.alpn.length > 0) {
        proxy.alpn = x.alpn;
      }
      if (x.ca !== "") {
        proxy.ca = x.ca;
      }
      if (x.caStr !== "") {
        proxy["ca-str"] = x.caStr;
      }
      if (x.recvWindowConn) {
        proxy["recv-window-conn"] = x.recvWindowConn;
      }
      if (x.recvWindow) {
        proxy["recv-window"] = x.recvWindow;
      }
      if (x.disableMtuDiscovery !== undefined) {
        proxy["disable-mtu-discovery"] = x.disableMtuDiscovery;
      }
      if (x.tcpFastOpen !== undefined) {
        proxy["fast-open"] = x.tcpFastOpen;
      }
      if (x.hopInterval) {
        proxy["hop-interval"] = x.hopInterval;
      }
      break;
    }
    case ProxyType.Hysteria2:
      proxy.type = "hysteria2";
      if (x.ports !== "") {
        proxy.ports = x.ports;
      }
      if (x.upSpeed) {
        proxy.up = x.upSpeed;
      }
      if (x.downSpeed) {
        proxy.down = x.downSpeed;
      }
      if (x.password !== "") {
        proxy.password = x.password;
      }
      if (x.obfs !== "") {
        proxy.obfs = x.obfs;
      }
      if (x.obfsParam !== "") {
        proxy["obfs-password"] = x.obfsParam;
      }
      if (x.sni !== "") {
        proxy.sni = x.sni;
      }
      if (skipCertVerify !== undefined) {
        proxy["skip-cert-verify"] = skipCertVerify;
      }
      if (x.fingerprint !== "") {
        proxy.fingerprint = x.fingerprint;
      }
      if (x.alpn.length > 0) {
        proxy.alpn = x.alpn;
      }
      if (x.ca !== "") {
        proxy.ca = x.ca;
      }
      if (x.caStr !== "") {
        proxy["ca-str"] = x.caStr;
      }
      if (x.cwnd) {
        proxy.cwnd = x.cwnd;
      }
      if (x.hopInterval) {
        proxy["hop-interval"] = x.hopInterval;
      }
      break;
    case ProxyType.AnyTLS:
      proxy.type = "anytls";
      proxy.password = x.password;
      if (x.sni !== "") {
        proxy.sni = x.sni;
      }
      if (skipCertVerify !== undefined) {
        proxy["skip-cert-verify"] = skipCertVerify;
      }
      break;
    case ProxyType.VLESS:
      proxy.type = "vless";
      proxy.uuid = x.userId;
      if (x.flow !== "") {
        proxy.flow = x.flow;
      }
      proxy.tls = x.tlsSecure;
      if (x.serverName !== "") {
        proxy.servername = x.serverName;
      }
      if (x.fingerprint !== "") {
        proxy["client-fingerprint"] = x.fingerprint;
      }
      if (x.publicKey !== "" || x.shortId !== "") {
        const realityOpts: Record<string, unknown> = {};
        if (x.publicKey !== "") {
          realityOpts["public-key"] = x.publicKey;
        }
        realityOpts["short-id"] = x.shortId;
        proxy["reality-opts"] = realityOpts;
      }
      if (x.alpn.length > 0) {
        proxy.alpn = x.alpn;
      }
      if (skipCertVerify !== undefined) {
        proxy["skip-cert-verify"] = skipCertVerify;
      }
      switch (x.transferProtocol) {
        case "tcp":
          break;
        case "ws":
          proxy.network = x.transferProtocol;
          proxy["ws-opts"] = {
            ...(x.host !== "" ? { headers: { Host: x.host } } : {}),
            path: x.path,
          };
          break;
        case "grpc":
          proxy.network = x.transferProtocol;
          proxy["grpc-opts"] = { "grpc-service-name": x.path };
          break;
        default:
          break;
      }
      break;
    case ProxyType.TUIC:
      proxy.type = "tuic";
      proxy.uuid = x.userId;
      proxy.password = x.password;
      if (x.congestionControl !== "") {
        proxy["congestion-controller"] = x.congestionControl;
      }
      if (x.alpn.length > 0) {
        proxy.alpn = x.alpn;
      }
      if (x.serverName !== "") {
        proxy.sni = x.serverName;
      }
      if (skipCertVerify !== undefined) {
        proxy["skip-cert-verify"] = skipCertVerify;
      }
      break;
    default:
      return undefined;
  }

  if (udpEnabled(x, settings) && x.type !== ProxyType.Snell) {
    proxy.udp = true;
  }
  if (tfo !== undefined) {
    proxy.tfo = tfo;
  }
  if (settings.clashNewFieldName && x.underlyingProxy !== "") {
    proxy["dialer-proxy"] = x.underlyingProxy;
  }
  return proxy;
}

function udpEnabled(x: Proxy, settings: ExtraSettings): boolean {
  return x.udp !== undefined ? x.udp : settings.udp === true;
}

export interface ClashBuildResult {
  doc: Record<string, unknown>;
  nodeList: Proxy[];
}

/** Build the Clash document object (without serialization). */
export function buildClash(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  clashR = false,
): ClashBuildResult {
  const proxies: ClashProxy[] = [];
  const nodeList: Proxy[] = [];
  const remarksList: string[] = [];

  for (const x of nodes) {
    const type = proxyTypeName(x.type);
    if (settings.appendProxyType) {
      x.remark = `[${type}] ${x.remark}`;
    }
    const remark = processRemark(x.remark, remarksList, false);
    x.remark = remark;

    const skipCertVerify =
      x.allowInsecure !== undefined ? x.allowInsecure : settings.skipCertVerify;
    const tfo = x.tcpFastOpen !== undefined ? x.tcpFastOpen : settings.tfo;
    const built = buildClashProxy(x, settings, clashR, remark, toTri(skipCertVerify), toTri(tfo));
    if (!built) {
      continue;
    }
    proxies.push(built);
    remarksList.push(remark);
    nodeList.push(x);
  }

  if (settings.nodeList) {
    return { doc: { proxies }, nodeList };
  }

  const groups: unknown[] = [];
  for (const group of extraProxyGroup) {
    const singlegroup: Record<string, unknown> = {
      name: group.name,
      type: group.type === "smart" ? "url-test" : group.type,
    };
    switch (group.type) {
      case "select":
      case "relay":
        break;
      case "load-balance":
        singlegroup.strategy = group.strategy;
        singlegroup.lazy = group.lazy;
        singlegroup.url = group.url;
        if (group.interval > 0) {
          singlegroup.interval = group.interval;
        }
        if (group.tolerance > 0) {
          singlegroup.tolerance = group.tolerance;
        }
        break;
      case "smart":
      case "url-test":
        if (group.lazy !== undefined) {
          singlegroup.lazy = group.lazy;
        }
        singlegroup.url = group.url;
        if (group.interval > 0) {
          singlegroup.interval = group.interval;
        }
        if (group.tolerance > 0) {
          singlegroup.tolerance = group.tolerance;
        }
        break;
      case "fallback":
        singlegroup.url = group.url;
        if (group.interval > 0) {
          singlegroup.interval = group.interval;
        }
        if (group.tolerance > 0) {
          singlegroup.tolerance = group.tolerance;
        }
        break;
      default:
        continue;
    }
    if (group.disableUdp !== undefined) {
      singlegroup["disable-udp"] = group.disableUdp;
    }
    const filtered: string[] = [];
    for (const rule of group.proxies) {
      groupGenerate(rule, nodeList, filtered, true);
    }
    if (group.usingProvider.length > 0) {
      singlegroup.use = group.usingProvider;
    } else {
      if (filtered.length === 0) {
        filtered.push("DIRECT");
      }
      singlegroup.proxies = filtered;
    }
    groups.push(singlegroup);
  }

  const doc: Record<string, unknown> = {};
  if (settings.clashNewFieldName) {
    doc.proxies = proxies;
    if (groups.length > 0) {
      doc["proxy-groups"] = groups;
    }
  } else {
    doc.Proxy = proxies;
    if (groups.length > 0) {
      doc["Proxy Group"] = groups;
    }
  }
  return { doc, nodeList };
}

/** Serialize a Clash document built by {@link buildClash}. */
export function stringifyClash(doc: Record<string, unknown>): string {
  return yamlStringify(doc, {
    aliasDuplicateObjects: false,
    lineWidth: 0,
  });
}

/** Convert nodes into a Clash YAML configuration string. */
export function toClash(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  clashR = false,
): string {
  const { doc } = buildClash(nodes, extraProxyGroup, settings, clashR);
  return stringifyClash(doc);
}
