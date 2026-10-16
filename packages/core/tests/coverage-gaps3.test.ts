import { describe, expect, it } from "vitest";

import {
  BalanceStrategy,
  ProxyGroupType,
  ProxyType,
  createExtraSettings,
  createProxy,
  createProxyGroupConfig,
  explodeClash,
  httpConstruct,
  parseSubscription,
  socksConstruct,
  ssConstruct,
  ssrConstruct,
  toClash,
  toLoon,
  toQuanX,
  trojanConstruct,
  hysteriaConstruct,
  vlessConstruct,
  vmessConstruct,
  wireGuardConstruct,
  type Proxy,
} from "../src/index";

function ss(remark = "SS"): Proxy {
  const n = createProxy();
  ssConstruct(n, {
    group: "G",
    method: "aes-256-gcm",
    password: "pw",
    port: 8388,
    remark,
    server: "1.1.1.1",
  });
  return n;
}

describe("clash branches", () => {
  it("covers vmess/trojan/vless header and transport variants", () => {
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const vmTls = createProxy();
    vmessConstruct(vmTls, {
      add: "s",
      aid: "0",
      cipher: "auto",
      group: "G",
      id: "u",
      net: "tcp",
      port: 1,
      remark: "VMT",
      sni: "sni",
      tls: "tls",
    });
    vmTls.allowInsecure = true;
    const wsEdge = createProxy();
    vmessConstruct(wsEdge, {
      add: "s",
      aid: "0",
      cipher: "auto",
      edge: "e",
      group: "G",
      id: "u",
      net: "ws",
      path: "/p",
      port: 1,
      remark: "WSE",
      tls: "",
    });
    const wsHost = createProxy();
    vmessConstruct(wsHost, {
      add: "s",
      aid: "0",
      cipher: "auto",
      group: "G",
      host: "h",
      id: "u",
      net: "ws",
      path: "/p",
      port: 1,
      remark: "WSH",
      tls: "",
    });
    const httpEdge = createProxy();
    vmessConstruct(httpEdge, {
      add: "s",
      aid: "0",
      cipher: "auto",
      edge: "e",
      group: "G",
      id: "u",
      net: "http",
      path: "/p",
      port: 1,
      remark: "HE",
      tls: "",
    });
    const httpHost = createProxy();
    vmessConstruct(httpHost, {
      add: "s",
      aid: "0",
      cipher: "auto",
      group: "G",
      host: "h",
      id: "u",
      net: "http",
      path: "/p",
      port: 1,
      remark: "HH",
      tls: "",
    });
    const h2NoHost = createProxy();
    vmessConstruct(h2NoHost, {
      add: "s",
      aid: "0",
      cipher: "auto",
      group: "G",
      id: "u",
      net: "h2",
      path: "/p",
      port: 1,
      remark: "H2",
      tls: "",
    });
    const trojanGrpc = createProxy();
    trojanConstruct(trojanGrpc, {
      group: "G",
      network: "grpc",
      password: "pw",
      port: 1,
      remark: "TG",
      server: "s",
    });
    const trojanWs = createProxy();
    trojanConstruct(trojanWs, {
      group: "G",
      network: "ws",
      password: "pw",
      path: "/p",
      port: 1,
      remark: "TW",
      server: "s",
    });
    trojanWs.host = "";
    const vlessGrpc = createProxy();
    vlessConstruct(vlessGrpc, {
      group: "G",
      network: "grpc",
      path: "gs",
      port: 1,
      remark: "VG",
      server: "s",
      userId: "u",
    });
    const vlessWsNoHost = createProxy();
    vlessConstruct(vlessWsNoHost, {
      group: "G",
      network: "ws",
      path: "/p",
      port: 1,
      remark: "VW",
      server: "s",
      tls: "tls",
      userId: "u",
    });
    const hy = createProxy();
    hysteriaConstruct(hy, { group: "G", port: 1, remark: "HY", server: "s", up: "50" });
    const hy2 = createProxy();
    hy2.type = ProxyType.Hysteria2;
    hy2.hostname = "s";
    hy2.port = 1;
    hy2.remark = "HY2";
    hy2.down = "1 Mbps";
    const out = toClash(
      [
        vmTls,
        wsEdge,
        wsHost,
        httpEdge,
        httpHost,
        h2NoHost,
        trojanGrpc,
        trojanWs,
        vlessGrpc,
        vlessWsNoHost,
        hy,
        hy2,
        ss(),
      ],
      [
        mkGroup("min-ut", ProxyGroupType.URLTest, ["!!TYPE=SS"]),
        mkGroup("min-fb", ProxyGroupType.Fallback, ["!!TYPE=SS"]),
        mkGroup("lb", ProxyGroupType.LoadBalance, ["!!TYPE=SS"], {
          strategy: BalanceStrategy.RoundRobin,
        }),
      ],
      settings,
    );
    expect(out).toContain("ws-opts");
    expect(out).toContain("grpc-opts");
  });

  it("filters deprecated ssr but keeps valid ones", () => {
    const settings = createExtraSettings();
    settings.filterDeprecated = true;
    const good = createProxy();
    ssrConstruct(good, {
      group: "G",
      method: "aes-256-ctr",
      obfs: "plain",
      password: "pw",
      port: 1,
      protocol: "origin",
      remark: "GOOD",
      server: "s",
    });
    const none = createProxy();
    ssrConstruct(none, {
      group: "G",
      method: "none",
      obfs: "plain",
      password: "pw",
      port: 1,
      protocol: "origin",
      remark: "NONE",
      server: "s",
    });
    const out = toClash([good, none], [], settings);
    expect(out).toContain("GOOD");
    expect(out).toContain("dummy");
    expect(out).toContain("NONE");
  });

  it("skips a clash proxies section that is not an array", () => {
    const nodes: Proxy[] = [];
    explodeClash({ proxies: "nope" }, nodes);
    expect(nodes).toHaveLength(0);
    explodeClash({ proxies: [{ name: "x", port: 1, server: "s", type: "bogus" }] }, nodes);
    expect(nodes).toHaveLength(0);
  });
});

describe("clash json parser string branches", () => {
  it("covers vmess ws path defaults and plugin tls/host/path", () => {
    const clash = [
      "proxies:",
      "  - {name: wsNoPath, type: vmess, server: s, port: 1, uuid: u, alterId: 0, network: ws, ws-opts: {}}",
      "  - {name: wsOld, type: vmess, server: s, port: 1, uuid: u, alterId: 0, network: ws, ws-headers: {Host: h}}",
      "  - {name: v2NoTls, type: ss, server: s, port: 1, cipher: aes-128-gcm, password: p, plugin: v2ray-plugin, plugin-opts: {mode: websocket}}",
      "  - {name: v2Host, type: ss, server: s, port: 1, cipher: aes-128-gcm, password: p, plugin: v2ray-plugin, plugin-opts: {mode: websocket, host: h}}",
      "  - {name: v2Path, type: ss, server: s, port: 1, cipher: aes-128-gcm, password: p, plugin: v2ray-plugin, plugin-opts: {mode: websocket, path: /p}}",
      "  - {name: wgScalarDns, type: wireguard, server: s, port: 1, public-key: u, private-key: p, ip: 10.0.0.1, dns: 1.1.1.1}",
    ].join("\n");
    const nodes = parseSubscription(clash);
    expect(nodes.length).toBe(6);
  });
});

describe("clash/surge output branches", () => {
  it("covers ssr protocol/obfs params and quoted types", () => {
    const settings = createExtraSettings();
    const ssr = createProxy();
    ssrConstruct(ssr, {
      group: "G",
      method: "aes-256-cfb",
      obfs: "http_simple",
      obfsParam: "",
      password: "pw",
      port: 1,
      protocol: "auth_sha1_v4",
      protocolParam: "",
      remark: "SSR",
      server: "s",
    });
    expect(toClash([ssr], [], settings)).toContain("ssr");
  });
});

describe("quanx branches", () => {
  it("covers vmess aead/tls13, plugin variants and empty groups", () => {
    const settings = createExtraSettings();
    const vm = createProxy();
    vmessConstruct(vm, {
      add: "s",
      aid: "1",
      cipher: "auto",
      group: "G",
      host: "h",
      id: "u",
      net: "ws",
      path: "/p",
      port: 1,
      remark: "VM",
      tls: "tls",
      tls13: true,
    });
    const v2NoMode = createProxy();
    ssConstruct(v2NoMode, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "v2ray-plugin",
      pluginOption: "mode=quic",
      port: 1,
      remark: "V2Q",
      server: "s",
    });
    const v2Ws = createProxy();
    ssConstruct(v2Ws, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "v2ray-plugin",
      pluginOption: "mode=websocket;tls;",
      port: 1,
      remark: "V2W",
      server: "s",
    });
    const http = createProxy();
    httpConstruct(http, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "HP",
      server: "s",
      tls: true,
      tls13: false,
      username: "u",
    });
    const empty = mkGroup("empty", ProxyGroupType.Select, ["!!TYPE=TUIC"]);
    const out = toQuanX([vm, v2NoMode, v2Ws, http, ss()], [empty], settings, {
      baseConf: "",
      nodeList: false,
    });
    expect(out).toContain("empty");
    expect(out).toContain("obfs=");
  });
});

describe("loon branches", () => {
  it("covers ss plugin empty opts, socks tls and wireguard ipv6", () => {
    const settings = createExtraSettings();
    const ssNoOpts = createProxy();
    ssConstruct(ssNoOpts, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "obfs-local",
      port: 1,
      remark: "SO",
      server: "s",
    });
    const socksTls = createProxy();
    socksConstruct(socksTls, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "ST",
      server: "s",
      username: "u",
    });
    socksTls.tlsSecure = true;
    socksTls.host = "h";
    socksTls.allowInsecure = true;
    const wg = createProxy();
    wireGuardConstruct(wg, {
      dnsServers: ["1.1.1.1", "fd00::1"],
      group: "G",
      port: 1,
      privateKey: "p",
      publicKey: "u",
      remark: "WG",
      selfIp: "10.0.0.1",
      server: "s",
    });
    const empty = mkGroup("empty", ProxyGroupType.Select, ["!!TYPE=TUIC"]);
    const out = toLoon([ssNoOpts, socksTls, wg, ss()], [empty], settings, {
      baseConf: "",
      nodeList: false,
    });
    expect(out).toContain("dnsv6=");
    expect(out).toContain("empty");
  });
});

function mkGroup(
  name: string,
  type: ProxyGroupType,
  proxies: string[],
  overrides: Partial<ReturnType<typeof createProxyGroupConfig>> = {},
): ReturnType<typeof createProxyGroupConfig> {
  const g = createProxyGroupConfig();
  g.name = name;
  g.type = type;
  g.proxies = proxies;
  return Object.assign(g, overrides);
}
