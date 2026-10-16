import { describe, expect, it } from "vitest";

import type { Proxy } from "../src/index";
import {
  BalanceStrategy,
  ProxyGroupType,
  ProxyType,
  TargetFormat,
  anyTlsConstruct,
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

function node(type: ProxyType): Proxy {
  const n = createProxy();
  switch (type) {
    case ProxyType.Shadowsocks:
      ssConstruct(n, {
        group: "G",
        method: "aes-256-gcm",
        password: "pw",
        plugin: "v2ray-plugin",
        pluginOption: "mode=websocket;tls;host=h;path=/p;mux=4;",
        port: 8388,
        remark: "SS",
        server: "1.1.1.1",
      });
      break;
    case ProxyType.ShadowsocksR:
      ssrConstruct(n, {
        group: "G",
        method: "aes-256-cfb",
        obfs: "http_simple",
        obfsParam: "op",
        password: "pw",
        port: 8388,
        protocol: "auth_sha1_v4",
        protocolParam: "pp",
        remark: "SSR",
        server: "2.2.2.2",
      });
      break;
    case ProxyType.VMess:
      vmessConstruct(n, {
        add: "3.3.3.3",
        aid: "0",
        cipher: "auto",
        group: "G",
        host: "h",
        id: "uuid",
        net: "ws",
        path: "/p",
        port: 443,
        remark: "VM",
        tls: "tls",
      });
      break;
    case ProxyType.VLESS:
      vlessConstruct(n, {
        flow: "xtls-rprx-vision",
        group: "G",
        network: "grpc",
        path: "gs",
        port: 443,
        remark: "VL",
        server: "4.4.4.4",
        sni: "h",
        tls: "tls",
        userId: "uuid",
      });
      break;
    case ProxyType.Trojan:
      trojanConstruct(n, {
        group: "G",
        host: "h",
        network: "ws",
        password: "pw",
        path: "/p",
        port: 443,
        remark: "TJ",
        server: "5.5.5.5",
        sni: "h",
      });
      break;
    case ProxyType.Snell:
      snellConstruct(n, {
        group: "G",
        host: "h",
        obfs: "http",
        password: "pw",
        port: 443,
        remark: "SN",
        server: "6.6.6.6",
        version: 3,
      });
      break;
    case ProxyType.HTTP:
      httpConstruct(n, {
        group: "G",
        password: "pw",
        port: 8080,
        remark: "HP",
        server: "7.7.7.7",
        tls: false,
        username: "u",
      });
      break;
    case ProxyType.HTTPS:
      httpConstruct(n, {
        group: "G",
        password: "pw",
        port: 8080,
        remark: "HS",
        server: "8.8.8.8",
        tls: true,
        username: "u",
      });
      break;
    case ProxyType.SOCKS5:
      socksConstruct(n, {
        group: "G",
        password: "pw",
        port: 1080,
        remark: "SK",
        server: "9.9.9.9",
        username: "u",
      });
      break;
    case ProxyType.WireGuard:
      wireGuardConstruct(n, {
        dnsServers: ["1.1.1.1", "fd00::1"],
        group: "G",
        keepAlive: 30,
        mtu: 1420,
        port: 2408,
        preSharedKey: "psk",
        privateKey: "priv",
        publicKey: "pub",
        remark: "WG",
        selfIp: "10.0.0.1",
        selfIpv6: "fd00::1",
        server: "10.10.10.10",
        testUrl: "http://x",
      });
      n.clientId = "1,2,3";
      n.allowedIps = "0.0.0.0/0, ::/0";
      break;
    case ProxyType.Hysteria:
      hysteriaConstruct(n, {
        alpn: "h3",
        authStr: "secret",
        ca: "ca",
        caStr: "castr",
        disableMtuDiscovery: "true",
        down: "100",
        downSpeed: "100",
        fingerprint: "fp",
        group: "G",
        hopInterval: "30",
        obfs: "xplus",
        obfsProtocol: "xplus",
        port: 443,
        ports: "443-500",
        protocol: "udp",
        recvWindow: "20",
        recvWindowConn: "10",
        remark: "HY",
        server: "11.11.11.11",
        sni: "h",
        up: "50",
        upSpeed: "50",
      });
      break;
    case ProxyType.Hysteria2:
      hysteria2Construct(n, {
        alpn: "h3",
        ca: "ca",
        caStr: "castr",
        cwnd: "10",
        down: "100",
        fingerprint: "fp",
        group: "G",
        hopInterval: "30",
        obfs: "salamander",
        obfsPassword: "op",
        password: "pw",
        port: 443,
        ports: "443",
        remark: "HY2",
        server: "12.12.12.12",
        sni: "h",
        up: "50",
      });
      break;
    case ProxyType.AnyTLS:
      anyTlsConstruct(n, {
        group: "G",
        password: "pw",
        port: 443,
        remark: "AT",
        server: "13.13.13.13",
        sni: "h",
      });
      break;
    case ProxyType.TUIC:
      tuicConstruct(n, {
        alpn: ["h3"],
        congestionControl: "bbr",
        group: "G",
        password: "pw",
        port: 443,
        remark: "TU",
        server: "14.14.14.14",
        sni: "h",
        userId: "uuid",
      });
      break;
    default:
      break;
  }
  return n;
}

const ALL_TYPES = [
  ProxyType.Shadowsocks,
  ProxyType.ShadowsocksR,
  ProxyType.VMess,
  ProxyType.VLESS,
  ProxyType.Trojan,
  ProxyType.Snell,
  ProxyType.HTTP,
  ProxyType.HTTPS,
  ProxyType.SOCKS5,
  ProxyType.WireGuard,
  ProxyType.Hysteria,
  ProxyType.Hysteria2,
  ProxyType.AnyTLS,
  ProxyType.TUIC,
];

function allNodes(): Proxy[] {
  return ALL_TYPES.map((type) => node(type));
}

describe("generator matrix", () => {
  it("generates Clash for every type", () => {
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const out = toClash(allNodes(), [], settings);
    expect(out).toContain("type: ss");
    expect(out).toContain("type: ssr");
    expect(out).toContain("type: vmess");
    expect(out).toContain("type: vless");
    expect(out).toContain("type: trojan");
    expect(out).toContain("type: snell");
    expect(out).toContain("type: wireguard");
    expect(out).toContain("type: hysteria");
    expect(out).toContain("type: hysteria2");
    expect(out).toContain("type: anytls");
    expect(out).toContain("type: tuic");
  });

  it("generates Clash nodes-only", () => {
    const settings = createExtraSettings();
    settings.nodeList = true;
    const out = toClash([node(ProxyType.VMess)], [], settings);
    expect(out).toContain("proxies:");
  });

  it("filters deprecated ss/ssr ciphers", () => {
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    settings.filterDeprecated = true;
    const ss = createProxy();
    ssConstruct(ss, {
      group: "G",
      method: "chacha20",
      password: "pw",
      port: 1,
      remark: "old",
      server: "s",
    });
    expect(toClash([ss], [], settings)).not.toContain("old");
    const ssr = createProxy();
    ssrConstruct(ssr, {
      group: "G",
      method: "bogus",
      obfs: "bogus",
      password: "pw",
      port: 1,
      protocol: "bogus",
      remark: "badssr",
      server: "s",
    });
    expect(toClash([ssr], [], settings)).not.toContain("badssr");
  });

  it("skips vmess over quic and snell v4", () => {
    const settings = createExtraSettings();
    const vm = createProxy();
    vmessConstruct(vm, {
      add: "s",
      aid: "0",
      cipher: "auto",
      group: "G",
      id: "u",
      net: "quic",
      path: "/p",
      port: 443,
      remark: "Q",
      tls: "",
    });
    expect(toClash([vm], [], settings)).not.toContain("Q");
    const sn = createProxy();
    snellConstruct(sn, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "sn4",
      server: "s",
      version: 4,
    });
    expect(toClash([sn], [], settings)).not.toContain("sn4");
  });

  it("builds every Clash group type", () => {
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const groups = [
      mkGroup("select", ProxyGroupType.Select),
      mkGroup("auto", ProxyGroupType.URLTest, {
        interval: 300,
        lazy: true,
        tolerance: 50,
        url: "http://x",
      }),
      mkGroup("fallback", ProxyGroupType.Fallback, { interval: 300, timeout: 5, url: "http://x" }),
      mkGroup("lb", ProxyGroupType.LoadBalance, {
        interval: 300,
        strategy: BalanceStrategy.RoundRobin,
        url: "http://x",
      }),
      mkGroup("smart", ProxyGroupType.Smart, { interval: 300, url: "http://x" }),
      mkGroup("direct", ProxyGroupType.Select, { usingProvider: ["P1"] }),
    ];
    const out = toClash(allNodes(), groups, settings);
    expect(out).toContain("proxy-groups:");
    expect(out).toContain("url-test");
    expect(out).toContain("fallback");
    expect(out).toContain("load-balance");
    expect(out).toContain("use:");
    expect(out).toContain("DIRECT");
  });

  it("generates ClashR", () => {
    const settings = createExtraSettings();
    const out = generate([node(ProxyType.ShadowsocksR)], { settings, target: TargetFormat.ClashR });
    expect(out).toContain("protocolparam");
  });

  it("generates Surge for every version including nodelist", () => {
    for (const version of [-3, 2, 3, 4]) {
      const settings = createExtraSettings();
      const out = toSurge(allNodes(), [], settings, { baseConf: "", nodeList: false, version });
      expect(typeof out).toBe("string");
    }
    const settings = createExtraSettings();
    const list = toSurge(allNodes(), [], settings, { baseConf: "", nodeList: true, version: 4 });
    expect(list).toContain("VM = vmess,");
  });

  it("emits Surge SSR external proxies when a path is configured", () => {
    const settings = createExtraSettings();
    settings.surgeSsrPath = "/usr/bin/ssr-local";
    const out = toSurge([node(ProxyType.ShadowsocksR)], [], settings, {
      baseConf: "",
      nodeList: false,
      version: 4,
    });
    expect(out).toContain("external, exec=");
    expect(out).toContain("local-port=1080");
  });

  it("generates Quantumult X / Quantumult / Loon / sing-box", () => {
    const settings = createExtraSettings();
    const groups = [
      mkGroup("s", ProxyGroupType.Select),
      mkGroup("a", ProxyGroupType.URLTest, { interval: 300, tolerance: 10, url: "http://x" }),
      mkGroup("f", ProxyGroupType.Fallback, { interval: 300, timeout: 5, url: "http://x" }),
      mkGroup("l", ProxyGroupType.LoadBalance, { strategy: BalanceStrategy.RoundRobin }),
      mkSsidGroup(),
    ];
    expect(toQuanX(allNodes(), groups, settings, { baseConf: "", nodeList: false })).toContain(
      "[server_local]",
    );
    expect(toQuan(allNodes(), groups, settings, { baseConf: "", nodeList: false })).toContain(
      "[SERVER]",
    );
    expect(toLoon(allNodes(), groups, settings, { baseConf: "", nodeList: false })).toContain(
      "[Proxy]",
    );
    expect(toSingBox(allNodes(), groups, settings, { baseConf: "", nodeList: false })).toContain(
      "outbounds",
    );
  });

  it("generates node lists for quanx/quan/loon/singbox", () => {
    const settings = createExtraSettings();
    expect(toQuanX(allNodes(), [], settings, { baseConf: "", nodeList: true })).toContain(
      "shadowsocks = ",
    );
    expect(
      toQuan(allNodes(), [], settings, { baseConf: "", nodeList: true }).length,
    ).toBeGreaterThan(0);
    expect(toLoon(allNodes(), [], settings, { baseConf: "", nodeList: true })).toContain(
      "ShadowsocksR,",
    );
    const sb = toSingBox(allNodes(), [], settings, { baseConf: "", nodeList: true });
    expect(JSON.parse(sb).outbounds).toBeDefined();
  });

  it("skips unsupported types per generator", () => {
    const settings = createExtraSettings();
    // Quantumult does not support wireguard/hysteria; Loon does wireguard but not hysteria v1.
    const quan = toQuan([node(ProxyType.WireGuard)], [], settings, {
      baseConf: "",
      nodeList: false,
    });
    expect(quan).not.toContain("WG =");
  });

  it("generates share links for every mask", () => {
    const settings = createExtraSettings();
    for (const mask of [1, 2, 4, 8, 15]) {
      const out = proxyToSingle(allNodes(), mask, settings);
      expect(typeof out).toBe("string");
    }
  });

  it("generates SIP008 and SSD", () => {
    expect(
      proxyToSsSub([node(ProxyType.Shadowsocks), node(ProxyType.ShadowsocksR)], "{}"),
    ).toContain("server_port");
    const ssd = proxyToSsd(
      [node(ProxyType.Shadowsocks), node(ProxyType.ShadowsocksR)],
      "G",
      "upload=1; download=2; total=3; expire=1700000000",
    );
    expect(ssd.startsWith("ssd://")).toBe(true);
  });

  it("dispatches generate for clash/surge targets with rulesets and base conf", () => {
    const settings = createExtraSettings();
    const out = generate([node(ProxyType.VMess)], {
      baseConf: "[General]\nloglevel = notify",
      settings,
      target: TargetFormat.Surge,
    });
    expect(out).toContain("loglevel = notify");
  });
});

function mkGroup(
  name: string,
  type: ProxyGroupType,
  overrides: Partial<ReturnType<typeof createProxyGroupConfig>> = {},
): ReturnType<typeof createProxyGroupConfig> {
  const group = createProxyGroupConfig();
  group.name = name;
  group.type = type;
  group.proxies = ["!!TYPE=SS", "!!TYPE=VMESS", "[]DIRECT"];
  return Object.assign(group, overrides);
}

function mkSsidGroup(): ReturnType<typeof createProxyGroupConfig> {
  const group = createProxyGroupConfig();
  group.name = "ssid";
  group.type = ProxyGroupType.SSID;
  group.proxies = ["wifi1", "wifi2=celluar", "wifi3"];
  return group;
}
