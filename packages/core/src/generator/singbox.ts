import { groupGenerate, processRemark } from "./nodes";
import { rulesetToSingBoxRules } from "./ruleset";
import type { Proxy } from "../types/proxy";
import { ProxyType, proxyTypeName } from "../types/proxy";
import type { ProxyGroupConfig } from "../types/proxy-group";
import type { RulesetContent } from "../types/ruleset";
import type { ExtraSettings } from "../types/settings";
import { base64Encode } from "../utils/base64";

/** Format a sing-box duration string from seconds (e.g. 3660 → `1h1m`). */
export function formatSingBoxInterval(interval: number): string {
  let remaining = interval;
  let result = "";
  if (remaining >= 3600) {
    result += `${Math.floor(remaining / 3600)}h`;
    remaining %= 3600;
  }
  if (remaining >= 60) {
    result += `${Math.floor(remaining / 60)}m`;
    remaining %= 60;
  }
  if (remaining > 0) {
    result += `${remaining}s`;
  }
  return result;
}

function buildTransport(proxy: Proxy): Record<string, unknown> | undefined {
  switch (proxy.transferProtocol) {
    case "http":
      return undefined;
    case "ws": {
      const headers: Record<string, string> = {};
      if (proxy.host !== "") {
        headers.Host = proxy.host;
      }
      if (proxy.edge !== "") {
        headers.Edge = proxy.edge;
      }
      return {
        headers,
        path: proxy.path === "" ? "/" : proxy.path,
        type: "ws",
      };
    }
    case "grpc":
      return {
        ...(proxy.path !== "" ? { service_name: proxy.path } : {}),
        type: "grpc",
      };
    default:
      return undefined;
  }
}

function buildTls(x: Proxy, scv: boolean | undefined): Record<string, unknown> | undefined {
  if (!x.tlsSecure) {
    return undefined;
  }
  const tls: Record<string, unknown> = { enabled: true, insecure: scv === true };
  if (x.serverName !== "") {
    tls.server_name = x.serverName;
  } else if (x.host !== "") {
    tls.server_name = x.host;
  } else if (x.sni !== "") {
    tls.server_name = x.sni;
  }
  if (x.alpn.length > 0) {
    tls.alpn = x.alpn;
  }
  if (x.ca !== "") {
    tls.certificate = x.ca;
  }
  if (x.caStr !== "") {
    tls.certificate = x.caStr;
  }
  return tls;
}

function buildOutbound(
  x: Proxy,
  settings: ExtraSettings,
  remark: string,
): Record<string, unknown> | undefined {
  const common = {
    server: x.hostname,
    server_port: x.port,
    tag: remark,
  };
  const udp = x.udp !== undefined ? x.udp : settings.udp;
  const tfo = x.tcpFastOpen !== undefined ? x.tcpFastOpen : settings.tfo;
  const scv = x.allowInsecure !== undefined ? x.allowInsecure : settings.skipCertVerify;

  let proxy: Record<string, unknown>;
  switch (x.type) {
    case ProxyType.Shadowsocks: {
      const out: Record<string, unknown> = {
        ...common,
        method: x.encryptMethod,
        password: x.password,
        type: "shadowsocks",
      };
      if (x.plugin !== "" && x.pluginOption !== "") {
        out.plugin = x.plugin === "simple-obfs" ? "obfs-local" : x.plugin;
        out.plugin_opts = x.pluginOption;
      }
      proxy = out;
      break;
    }
    case ProxyType.ShadowsocksR:
      proxy = {
        ...common,
        method: x.encryptMethod,
        obfs: x.obfs,
        obfs_param: x.obfsParam,
        password: x.password,
        protocol: x.protocol,
        protocol_param: x.protocolParam,
        type: "shadowsocksr",
      };
      break;
    case ProxyType.VMess: {
      const out: Record<string, unknown> = {
        ...common,
        alter_id: x.alterId,
        security: x.encryptMethod,
        type: "vmess",
        uuid: x.userId,
      };
      const transport = buildTransport(x);
      if (transport) {
        out.transport = transport;
      }
      proxy = out;
      break;
    }
    case ProxyType.Trojan: {
      const out: Record<string, unknown> = { ...common, password: x.password, type: "trojan" };
      const transport = buildTransport(x);
      if (transport) {
        out.transport = transport;
      }
      proxy = out;
      break;
    }
    case ProxyType.WireGuard: {
      const addresses = [x.selfIp];
      if (x.selfIpv6 !== "") {
        addresses.push(x.selfIpv6);
      }
      const peer: Record<string, unknown> = {
        public_key: x.publicKey,
        server: x.hostname,
        server_port: x.port,
      };
      if (x.preSharedKey !== "") {
        peer.pre_shared_key = x.preSharedKey;
      }
      if (x.allowedIps !== "") {
        peer.allowed_ips = x.allowedIps.split(",").map((s) => s.trim());
      }
      if (x.clientId !== "") {
        peer.reserved = x.clientId.split(",").map((s) => Number(s.trim()));
      }
      proxy = {
        local_address: addresses,
        mtu: x.mtu,
        peers: [peer],
        private_key: x.privateKey,
        tag: remark,
        type: "wireguard",
      };
      break;
    }
    case ProxyType.Hysteria: {
      const out: Record<string, unknown> = { ...common, type: "hysteria" };
      if (x.up !== "") {
        out.up_mbps = x.upSpeed;
      }
      if (x.down !== "") {
        out.down_mbps = x.downSpeed;
      }
      if (x.obfs !== "") {
        out.obfs = x.obfs;
      }
      if (x.authStr !== "") {
        out.auth_str = x.authStr;
        out.auth = base64Encode(x.authStr);
      }
      if (x.recvWindowConn) {
        out.recv_window_conn = x.recvWindowConn;
      }
      if (x.recvWindow) {
        out.recv_window = x.recvWindow;
      }
      if (x.disableMtuDiscovery !== undefined) {
        out.disable_mtu_discovery = x.disableMtuDiscovery;
      }
      proxy = out;
      break;
    }
    case ProxyType.Hysteria2: {
      const out: Record<string, unknown> = { ...common, type: "hysteria2" };
      if (x.ports !== "") {
        out.server_ports = x.ports
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p !== "")
          .map((p) => (/^\d+$/.test(p) ? `${p}:${p}` : p));
      }
      if (x.upSpeed) {
        out.up_mbps = x.upSpeed;
      }
      if (x.downSpeed) {
        out.down_mbps = x.downSpeed;
      }
      if (x.obfs !== "") {
        out.obfs = {
          ...(x.obfsParam !== "" ? { password: x.obfsParam } : {}),
          type: x.obfs,
        };
      }
      if (x.password !== "") {
        out.password = x.password;
      }
      if (x.hopInterval) {
        out.hop_interval = formatSingBoxInterval(x.hopInterval);
      }
      proxy = out;
      break;
    }
    case ProxyType.HTTP:
    case ProxyType.HTTPS:
      proxy = {
        ...common,
        password: x.password,
        type: "http",
        username: x.username,
      };
      break;
    case ProxyType.SOCKS5:
      proxy = {
        ...common,
        password: x.password,
        type: "socks",
        username: x.username,
        version: "5",
      };
      break;
    case ProxyType.AnyTLS:
      proxy = {
        ...common,
        type: "anytls",
        users: [{ password: x.password, username: "sekai" }],
      };
      break;
    default:
      return undefined;
  }

  const tls = buildTls(x, scv);
  if (tls) {
    proxy.tls = tls;
  }
  if (udp !== undefined && !udp) {
    proxy.network = "tcp";
  }
  if (tfo !== undefined) {
    proxy.tcp_fast_open = tfo;
  }
  return proxy;
}

export interface SingBoxOptions {
  baseConf: string;
  nodeList: boolean;
  rulesets?: RulesetContent[];
  overwriteOriginalRules?: boolean;
}

/** Convert nodes into a sing-box configuration JSON string. */
export function toSingBox(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: SingBoxOptions,
): string {
  let doc: Record<string, unknown>;
  if (options.nodeList) {
    doc = {};
  } else {
    try {
      doc = (options.baseConf.trim() === "" ? {} : JSON.parse(options.baseConf)) as Record<
        string,
        unknown
      >;
    } catch {
      throw new Error("sing-box base config is not valid JSON");
    }
  }

  const outbounds: Record<string, unknown>[] = [];
  if (!options.nodeList) {
    outbounds.push({ tag: "DIRECT", type: "direct" });
    outbounds.push({ tag: "REJECT", type: "block" });
    outbounds.push({ tag: "dns-out", type: "dns" });
  }

  const remarksList: string[] = [];
  const nodelist: Proxy[] = [];
  for (const x of nodes) {
    if (settings.appendProxyType) {
      x.remark = `[${proxyTypeName(x.type)}] ${x.remark}`;
    }
    const remark = processRemark(x.remark, remarksList, false);
    x.remark = remark;
    const outbound = buildOutbound(x, settings, remark);
    if (!outbound) {
      continue;
    }
    outbounds.push(outbound);
    nodelist.push(x);
    remarksList.push(remark);
  }

  if (!options.nodeList) {
    for (const group of extraProxyGroup) {
      let type: string;
      switch (group.type) {
        case "select":
          type = "selector";
          break;
        case "url-test":
        case "fallback":
        case "load-balance":
          type = "urltest";
          break;
        default:
          continue;
      }
      const filtered: string[] = [];
      for (const rule of group.proxies) {
        groupGenerate(rule, nodelist, filtered, true);
      }
      if (filtered.length === 0) {
        filtered.push("DIRECT");
      }
      const entry: Record<string, unknown> = { outbounds: filtered, tag: group.name, type };
      if (group.type === "url-test") {
        entry.url = group.url;
        entry.interval = formatSingBoxInterval(group.interval);
        if (group.tolerance > 0) {
          entry.tolerance = group.tolerance;
        }
      }
      outbounds.push(entry);
    }
  }

  doc.outbounds = outbounds;

  if (
    !options.nodeList &&
    options.rulesets &&
    options.rulesets.length > 0 &&
    settings.enableRuleGenerator
  ) {
    const route = rulesetToSingBoxRules(options.rulesets);
    const existingRoute = doc.route as Record<string, unknown> | undefined;
    const existingRules =
      !(options.overwriteOriginalRules ?? true) &&
      existingRoute &&
      Array.isArray(existingRoute.rules)
        ? (existingRoute.rules as Record<string, unknown>[])
        : [];
    doc.route = {
      ...(existingRoute ?? {}),
      final: route.final,
      rules: [...existingRules, ...route.rules],
    };
  }

  return JSON.stringify(doc, null, 2);
}
