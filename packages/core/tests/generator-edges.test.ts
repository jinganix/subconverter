import { describe, expect, it } from "vitest";

import type { Proxy, ProxyGroupConfig } from "../src/index";
import {
  BalanceStrategy,
  ProxyGroupType,
  ProxyType,
  createExtraSettings,
  createProxy,
  createProxyGroupConfig,
  generate,
  hysteria2Construct,
  hysteriaConstruct,
  httpConstruct,
  proxyToSingle,
  proxyToSsd,
  proxyToSsSub,
  snellConstruct,
  socksConstruct,
  ssConstruct,
  ssrConstruct,
  toClash,
  toLoon,
  toQuan,
  toQuanX,
  toSingBox,
  toSurge,
  trojanConstruct,
  tuicConstruct,
  vlessConstruct,
  vmessConstruct,
  wireGuardConstruct,
} from "../src/index";

function base(remark: string): Proxy {
  const n = createProxy();
  n.remark = remark;
  n.hostname = "1.1.1.1";
  n.port = 443;
  n.group = "G";
  return n;
}

function group(
  name: string,
  type: ProxyGroupType,
  proxies: string[] = ["!!TYPE=SS", "!!TYPE=VMESS"],
  overrides: Partial<ProxyGroupConfig> = {},
): ProxyGroupConfig {
  const g = createProxyGroupConfig();
  g.name = name;
  g.type = type;
  g.proxies = proxies;
  return Object.assign(g, overrides);
}

const ss = (): Proxy => {
  const n = base("SS");
  ssConstruct(n, {
    group: "G",
    method: "aes-256-gcm",
    password: "pw",
    port: 8388,
    remark: "SS",
    server: "1.1.1.1",
  });
  return n;
};
const vmess = (net: string, tls: boolean, host = "h", edge = ""): Proxy => {
  const n = createProxy();
  vmessConstruct(n, {
    add: "1.1.1.1",
    aid: "0",
    cipher: "auto",
    edge,
    group: "G",
    host,
    id: "uuid",
    net,
    path: "/p",
    port: 443,
    remark: `VM-${net}`,
    tls: tls ? "tls" : "",
  });
  return n;
};

describe("loon edges", () => {
  it("covers ss plugins, vmess transports and socks", () => {
    const settings = createExtraSettings();
    const obfs = base("O");
    ssConstruct(obfs, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "simple-obfs",
      pluginOption: "obfs=http;obfs-host=h",
      port: 1,
      remark: "O",
      server: "s",
    });
    const badPlugin = base("BP");
    ssConstruct(badPlugin, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "v2ray-plugin",
      pluginOption: "x",
      port: 1,
      remark: "BP",
      server: "s",
    });
    const socks = base("SK");
    socksConstruct(socks, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "SK",
      server: "s",
      username: "u",
    });
    const socksNoAuth = base("SK2");
    socksConstruct(socksNoAuth, { group: "G", port: 1, remark: "SK2", server: "s" });
    const h2 = base("H2");
    hysteria2Construct(h2, {
      fingerprint: "fp",
      group: "G",
      password: "pw",
      port: 1,
      remark: "H2",
      server: "s",
      sni: "h",
    });
    const at = base("AT");
    at.type = ProxyType.AnyTLS;
    at.password = "pw";
    at.sni = "h";
    const out = toLoon(
      [obfs, badPlugin, vmess("tcp", true), vmess("bogus", false), socks, socksNoAuth, h2, at],
      [
        group("s", ProxyGroupType.Select),
        group("a", ProxyGroupType.URLTest, ["!!TYPE=SS"], {
          interval: 300,
          tolerance: 10,
          url: "http://x",
        }),
        group("lb", ProxyGroupType.LoadBalance, ["!!TYPE=SS"], {
          strategy: BalanceStrategy.RoundRobin,
          timeout: 5,
        }),
        group("fb", ProxyGroupType.Fallback, ["!!TYPE=SS"], { interval: 300, timeout: 5 }),
        group("ssid", ProxyGroupType.SSID, ["a", "b"]),
        group("ssid1", ProxyGroupType.SSID, ["a"]),
        group("relayskip", ProxyGroupType.Relay, ["!!TYPE=SS"]),
      ],
      settings,
      { baseConf: "", nodeList: false },
    );
    expect(out).toContain("Shadowsocks");
    expect(out).toContain("algorithm=");
    expect(out).toContain("ssid,");
  });

  it("covers wireguard v4/v6 dns", () => {
    const settings = createExtraSettings();
    const wg = base("WG");
    wireGuardConstruct(wg, {
      dnsServers: ["1.1.1.1", "fd00::1"],
      group: "G",
      keepAlive: 30,
      mtu: 1420,
      port: 1,
      privateKey: "p",
      publicKey: "u",
      remark: "WG",
      selfIp: "10.0.0.1",
      selfIpv6: "fd00::1",
      server: "s",
    });
    wg.allowedIps = "0.0.0.0/0";
    wg.clientId = "1/2/3";
    expect(toLoon([wg], [], settings, { baseConf: "", nodeList: false })).toContain("dnsv6=");
  });
});

describe("quantumult (quan) edges", () => {
  it("covers all node and group shapes", () => {
    const settings = createExtraSettings();
    const ssr = base("SSR");
    ssrConstruct(ssr, {
      group: "G",
      method: "aes-256-cfb",
      obfs: "http_simple",
      obfsParam: "op",
      password: "pw",
      port: 8388,
      protocol: "auth_sha1_v4",
      protocolParam: "pp",
      remark: "SSR",
      server: "1.1.1.1",
    });
    const http = base("H");
    httpConstruct(http, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "H",
      server: "s",
      tls: true,
      username: "u",
    });
    const httpNoAuth = base("H2");
    httpConstruct(httpNoAuth, { group: "G", port: 1, remark: "H2", server: "s", tls: false });
    const socks = base("SK");
    socksConstruct(socks, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "SK",
      server: "s",
      username: "u",
    });
    socks.tlsSecure = true;
    const socksNoAuth = base("SK2");
    socksConstruct(socksNoAuth, { group: "G", port: 1, remark: "SK2", server: "s" });
    const out = toQuan(
      [
        ss(),
        ssr,
        http,
        httpNoAuth,
        socks,
        socksNoAuth,
        vmess("ws", true, "h", "e"),
        vmess("tcp", false),
      ],
      [group("ssid", ProxyGroupType.SSID, ["wifi", "x=celluar,rest", "y"])],
      settings,
      { baseConf: "", nodeList: false },
    );
    expect(out).toContain("[SERVER]");
    expect(out).toContain("[POLICY]");

    const list = toQuan([ssr, http, socks, vmess("tcp", false)], [], settings, {
      baseConf: "",
      nodeList: true,
    });
    expect(list.length).toBeGreaterThan(0);
  });
});

describe("quantumult x edges", () => {
  it("covers plugins and group shapes", () => {
    const settings = createExtraSettings();
    const v2 = base("V2");
    ssConstruct(v2, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "v2ray-plugin",
      pluginOption: "mode=websocket;tls;host=h;path=/p;",
      port: 1,
      remark: "V2",
      server: "s",
    });
    const obfs = base("OB");
    ssConstruct(obfs, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "obfs-local",
      pluginOption: "obfs=http;obfs-host=h",
      port: 1,
      remark: "OB",
      server: "s",
    });
    const obfsPlain = base("OB2");
    ssConstruct(obfsPlain, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "obfs-local",
      port: 1,
      remark: "OB2",
      server: "s",
    });
    const ssr = base("SSR");
    ssrConstruct(ssr, {
      group: "G",
      method: "aes-256-cfb",
      obfs: "http_simple",
      obfsParam: "op",
      password: "pw",
      port: 1,
      protocol: "auth_sha1_v4",
      protocolParam: "pp",
      remark: "SSR",
      server: "s",
    });
    const trojan = base("TJ");
    trojanConstruct(trojan, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "TJ",
      server: "s",
      tlsSecure: false,
    });
    const socks = base("SK");
    socksConstruct(socks, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "SK",
      server: "s",
      username: "u",
    });
    const socksSimple = base("SK2");
    socksConstruct(socksSimple, { group: "G", port: 1, remark: "SK2", server: "s" });
    const http = base("HP");
    httpConstruct(http, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "HP",
      server: "s",
      tls: true,
      tls13: true,
      username: "u",
    });
    const out = toQuanX(
      [
        v2,
        obfs,
        obfsPlain,
        ssr,
        trojan,
        socks,
        socksSimple,
        http,
        vmess("ws", true, "h"),
        vmess("tcp", true, "h"),
      ],
      [group("ssid", ProxyGroupType.SSID, ["a=b", "c"])],
      settings,
      { baseConf: "", nodeList: false },
    );
    expect(out).toContain("obfs=");
    expect(out).toContain("ssid=");
  });
});

describe("surge edges", () => {
  it("covers hysteria2, wireguard, groups and ssr", () => {
    const settings = createExtraSettings();
    settings.surgeSsrPath = "/bin/ssr";
    const h2 = base("H2");
    hysteria2Construct(h2, {
      down: "100",
      fingerprint: "fp",
      group: "G",
      password: "pw",
      port: 443,
      remark: "H2",
      server: "s",
      sni: "h",
    });
    const wg = base("WG");
    wireGuardConstruct(wg, {
      dnsServers: ["1.1.1.1"],
      group: "G",
      keepAlive: 30,
      mtu: 1420,
      port: 2408,
      privateKey: "p",
      publicKey: "u",
      remark: "WG",
      selfIp: "10.0.0.1",
      selfIpv6: "fd00::1",
      server: "s",
      testUrl: "http://t",
    });
    wg.clientId = "1/2/3";
    const snell = base("SN");
    snellConstruct(snell, {
      group: "G",
      host: "h",
      obfs: "http",
      password: "pw",
      port: 443,
      remark: "SN",
      server: "s",
      version: 3,
    });
    const snellPlain = base("SN2");
    snellConstruct(snellPlain, {
      group: "G",
      password: "pw",
      port: 443,
      remark: "SN2",
      server: "s",
    });
    const ssr = base("SSR");
    ssrConstruct(ssr, {
      group: "G",
      method: "aes-256-cfb",
      obfs: "http_simple",
      obfsParam: "op",
      password: "pw",
      port: 8388,
      protocol: "auth_sha1_v4",
      protocolParam: "pp",
      remark: "SSR",
      server: "1.1.1.1",
    });
    const https = base("HS");
    httpConstruct(https, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "HS",
      server: "s",
      tls: true,
      username: "u",
    });
    const out = toSurge(
      [h2, wg, snell, snellPlain, ssr, https, vmess("tcp", false), vmess("ws", false, "h", "e")],
      [
        group("s", ProxyGroupType.Select, ["!!TYPE=SS"]),
        group("ssid", ProxyGroupType.SSID, ["a", "b"]),
        group("lb", ProxyGroupType.LoadBalance, ["!!TYPE=SS"], {
          evaluateBeforeUse: false,
          interval: 300,
          persistent: true,
          timeout: 5,
          tolerance: 10,
          url: "http://x",
        }),
      ],
      settings,
      { baseConf: "", nodeList: false, version: 4 },
    );
    expect(out).toContain("wireguard");
    expect(out).toContain("hysteria");
    expect(out).toContain("[Proxy Group]");
  });

  it("handles the Surfboard (-3) https branch", () => {
    const settings = createExtraSettings();
    const https = base("HS");
    httpConstruct(https, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "HS",
      server: "s",
      tls: true,
      username: "u",
    });
    expect(
      toSurge([https], [], settings, { baseConf: "", nodeList: false, version: -3 }),
    ).toContain("https,");
  });
});

describe("clash edges", () => {
  it("covers vless/tuic/hysteria/anytls variants", () => {
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const vl = base("VL");
    vlessConstruct(vl, {
      alpn: ["h2"],
      flow: "f",
      group: "G",
      host: "h",
      network: "tcp",
      port: 1,
      remark: "VL",
      server: "s",
      sni: "sni",
      tls: "tls",
      userId: "u",
    });
    const tu = base("TU");
    tuicConstruct(tu, {
      alpn: ["h3"],
      congestionControl: "bbr",
      group: "G",
      password: "pw",
      port: 1,
      remark: "TU",
      server: "s",
      sni: "h",
      userId: "u",
    });
    const hy = base("HY");
    hysteriaConstruct(hy, {
      down: "100",
      group: "G",
      port: 1,
      remark: "HY",
      server: "s",
      up: "50",
    });
    const at = base("AT");
    at.type = ProxyType.AnyTLS;
    at.password = "pw";
    at.sni = "h";
    const out = toClash([vl, tu, hy, at], [], settings);
    expect(out).toContain("type: vless");
    expect(out).toContain("type: tuic");
    expect(out).toContain("type: hysteria");
    expect(out).toContain("type: anytls");
  });
});

describe("sing-box edges", () => {
  it("covers transports and groups", () => {
    const settings = createExtraSettings();
    const wg = base("WG");
    wireGuardConstruct(wg, {
      dnsServers: [],
      group: "G",
      keepAlive: 30,
      mtu: 1420,
      port: 1,
      preSharedKey: "psk",
      privateKey: "p",
      publicKey: "u",
      remark: "WG",
      selfIp: "10.0.0.1",
      selfIpv6: "fd00::1",
      server: "s",
    });
    wg.clientId = "1,2,3";
    wg.allowedIps = "0.0.0.0/0, ::/0";
    const out = toSingBox(
      [vmess("ws", true, "h", "e"), vmess("grpc", true, "h"), vmess("http", false, "h"), wg],
      [
        group("sel", ProxyGroupType.Select, ["!!TYPE=VMESS"]),
        group("auto", ProxyGroupType.URLTest, ["!!TYPE=VMESS"], {
          interval: 300,
          tolerance: 10,
          url: "http://x",
        }),
        group("fb", ProxyGroupType.Fallback, ["!!TYPE=VMESS"]),
        group("lb", ProxyGroupType.LoadBalance, ["!!TYPE=VMESS"]),
        group("relayskip", ProxyGroupType.Relay, ["!!TYPE=VMESS"]),
      ],
      settings,
      { baseConf: "", nodeList: false },
    );
    const doc = JSON.parse(out) as { outbounds: Array<Record<string, unknown>> };
    expect(doc.outbounds.some((o) => o.type === "urltest")).toBe(true);
    expect(doc.outbounds.some((o) => o.type === "selector")).toBe(true);
  });
});

describe("links edges", () => {
  it("covers flattening and ssd meta", () => {
    const settings = createExtraSettings();
    const flat = base("FLAT");
    flat.type = ProxyType.ShadowsocksR;
    flat.encryptMethod = "aes-256-gcm";
    flat.protocol = "origin";
    flat.obfs = "plain";
    flat.password = "pw";
    const ssNode = ss();
    const trojan = base("TJ");
    trojanConstruct(trojan, {
      group: "G",
      host: "h",
      network: "ws",
      password: "pw",
      path: "/p",
      port: 1,
      remark: "TJ",
      server: "s",
      sni: "s",
    });
    const links = proxyToSingle([flat, ssNode, trojan, vmess("tcp", false)], 15, settings);
    expect(links.length).toBeGreaterThan(0);
    const ssd = proxyToSsd([ssNode, flat], "G", "upload=1; download=2; total=3; expire=1700000000");
    expect(ssd.startsWith("ssd://")).toBe(true);
    const sip = proxyToSsSub([ssNode], '{"remarks":"base"}');
    expect(sip).toContain("server_port");
  });
});

describe("generate edges", () => {
  it("throws on invalid sing-box base config", () => {
    expect(() => generate([ss()], { baseConf: "not json", target: "singbox" as never })).toThrow();
  });
});
