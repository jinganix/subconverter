import { describe, expect, it } from "vitest";

import type { Proxy } from "../src/index";
import {
  BalanceStrategy,
  ProxyGroupType,
  ProxyType,
  RulesetType,
  TargetFormat,
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
  vlessConstruct,
  vmessConstruct,
  wireGuardConstruct,
} from "../src/index";
import type { RulesetContent } from "../src/types/ruleset";

function minimal(type: ProxyType): Proxy {
  const n = createProxy();
  switch (type) {
    case ProxyType.Shadowsocks:
      ssConstruct(n, {
        group: "G",
        method: "aes-256-gcm",
        password: "pw",
        port: 8388,
        remark: "SS",
        server: "1.1.1.1",
      });
      break;
    case ProxyType.ShadowsocksR:
      ssrConstruct(n, {
        group: "G",
        method: "aes-256-cfb",
        obfs: "plain",
        password: "pw",
        port: 8388,
        protocol: "origin",
        remark: "SSR",
        server: "1.1.1.1",
      });
      break;
    case ProxyType.VMess:
      vmessConstruct(n, {
        add: "1.1.1.1",
        aid: "0",
        cipher: "",
        group: "G",
        id: "uuid",
        port: 443,
        remark: "VM",
        tls: "",
      });
      break;
    case ProxyType.VLESS:
      vlessConstruct(n, { group: "G", port: 443, remark: "VL", server: "1.1.1.1", userId: "uuid" });
      break;
    case ProxyType.Trojan:
      trojanConstruct(n, {
        group: "G",
        password: "pw",
        port: 443,
        remark: "TJ",
        server: "1.1.1.1",
      });
      break;
    case ProxyType.Snell:
      snellConstruct(n, { group: "G", password: "pw", port: 443, remark: "SN", server: "1.1.1.1" });
      break;
    case ProxyType.HTTP:
      httpConstruct(n, { group: "G", port: 8080, remark: "HP", server: "1.1.1.1", tls: false });
      break;
    case ProxyType.HTTPS:
      httpConstruct(n, { group: "G", port: 8080, remark: "HS", server: "1.1.1.1", tls: true });
      break;
    case ProxyType.SOCKS5:
      socksConstruct(n, { group: "G", port: 1080, remark: "SK", server: "1.1.1.1" });
      break;
    case ProxyType.WireGuard:
      wireGuardConstruct(n, { group: "G", port: 0, remark: "WG", server: "1.1.1.1" });
      break;
    case ProxyType.Hysteria:
      hysteriaConstruct(n, { group: "G", port: 443, remark: "HY", server: "1.1.1.1" });
      break;
    case ProxyType.Hysteria2:
      hysteria2Construct(n, { group: "G", port: 443, remark: "HY2", server: "1.1.1.1" });
      break;
    case ProxyType.AnyTLS:
      n.type = ProxyType.AnyTLS;
      break;
    case ProxyType.TUIC:
      n.type = ProxyType.TUIC;
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

describe("minimal nodes exercise optional branches", () => {
  it("runs every generator on minimal nodes", () => {
    const settings = createExtraSettings();
    for (const type of ALL_TYPES) {
      const n = minimal(type);
      expect(typeof toClash([n], [], settings)).toBe("string");
      expect(typeof toSurge([n], [], settings, { baseConf: "", nodeList: false, version: 4 })).toBe(
        "string",
      );
      expect(typeof toQuanX([n], [], settings, { baseConf: "", nodeList: false })).toBe("string");
      expect(typeof toQuan([n], [], settings, { baseConf: "", nodeList: false })).toBe("string");
      expect(typeof toLoon([n], [], settings, { baseConf: "", nodeList: false })).toBe("string");
      expect(typeof toSingBox([n], [], settings, { baseConf: "", nodeList: false })).toBe("string");
      expect(typeof proxyToSingle([n], 15, settings)).toBe("string");
    }
  });

  it("switches optional features on", () => {
    const settings = createExtraSettings();
    settings.udp = true;
    settings.tfo = true;
    settings.skipCertVerify = true;
    settings.tls13 = true;
    settings.appendProxyType = true;
    for (const type of ALL_TYPES) {
      const n = minimal(type);
      expect(typeof toClash([n], [], settings)).toBe("string");
      expect(
        typeof toSurge([n], [], settings, {
          baseConf: "[General]\nloglevel = notify",
          nodeList: false,
          version: 4,
        }),
      ).toBe("string");
      expect(
        typeof toQuanX([n], [], settings, { baseConf: "[general]\nx=1", nodeList: false }),
      ).toBe("string");
      expect(
        typeof toQuan([n], [], settings, { baseConf: "[GENERAL]\nx=1", nodeList: false }),
      ).toBe("string");
      expect(typeof toLoon([n], [], settings, { baseConf: "[Plugin]\nx=1", nodeList: false })).toBe(
        "string",
      );
      expect(typeof toSingBox([n], [], settings, { baseConf: "", nodeList: false })).toBe("string");
    }
  });

  it("switches optional features off explicitly", () => {
    const settings = createExtraSettings();
    for (const type of ALL_TYPES) {
      const n = minimal(type);
      n.allowInsecure = false;
      n.udp = false;
      n.tcpFastOpen = false;
      n.tls13 = false;
      expect(typeof toLoon([n], [], settings, { baseConf: "", nodeList: false })).toBe("string");
      expect(typeof toQuan([n], [], settings, { baseConf: "", nodeList: false })).toBe("string");
      expect(typeof toSurge([n], [], settings, { baseConf: "", nodeList: false, version: 4 })).toBe(
        "string",
      );
      expect(typeof toClash([n], [], settings)).toBe("string");
      expect(typeof toQuanX([n], [], settings, { baseConf: "", nodeList: false })).toBe("string");
      expect(typeof toSingBox([n], [], settings, { baseConf: "", nodeList: false })).toBe("string");
    }
  });

  it("exercises clash network variants", () => {
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const ws = createProxy();
    vmessConstruct(ws, {
      add: "s",
      aid: "0",
      cipher: "auto",
      edge: "e",
      group: "G",
      host: "h",
      id: "u",
      net: "ws",
      path: "/p",
      port: 443,
      remark: "ws",
      tls: "",
    });
    const http = createProxy();
    vmessConstruct(http, {
      add: "s",
      aid: "0",
      cipher: "auto",
      edge: "e",
      group: "G",
      host: "h",
      id: "u",
      net: "http",
      path: "/p",
      port: 443,
      remark: "http",
      tls: "",
    });
    const h2 = createProxy();
    vmessConstruct(h2, {
      add: "s",
      aid: "0",
      cipher: "auto",
      group: "G",
      host: "h",
      id: "u",
      net: "h2",
      path: "/p",
      port: 443,
      remark: "h2",
      tls: "",
    });
    const grpc = createProxy();
    vmessConstruct(grpc, {
      add: "s",
      aid: "0",
      cipher: "auto",
      group: "G",
      host: "h",
      id: "u",
      net: "grpc",
      path: "gs",
      port: 443,
      remark: "grpc",
      tls: "",
    });
    const out = toClash([ws, http, h2, grpc], [], settings);
    expect(out).toContain("ws-opts");
    expect(out).toContain("http-opts");
    expect(out).toContain("h2-opts");
    expect(out).toContain("grpc-opts");
  });

  it("exercises clash ss plugins", () => {
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const obfs = createProxy();
    ssConstruct(obfs, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "obfs-local",
      pluginOption: "obfs=http;obfs-host=h",
      port: 1,
      remark: "obfs",
      server: "s",
    });
    const v2 = createProxy();
    ssConstruct(v2, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "v2ray-plugin",
      pluginOption: "mode=websocket;tls;host=h;path=/p;mux=4;",
      port: 1,
      remark: "v2",
      server: "s",
    });
    const out = toClash([obfs, v2], [], settings);
    expect(out).toContain("plugin: obfs");
    expect(out).toContain("plugin: v2ray-plugin");
  });

  it("emits clash groups for relay/ssid and disable-udp", () => {
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const relay = createProxyGroupConfig();
    relay.name = "relay";
    relay.type = ProxyGroupType.Relay;
    relay.proxies = ["!!TYPE=SS"];
    relay.disableUdp = true;
    const ssid = createProxyGroupConfig();
    ssid.name = "ssid";
    ssid.type = ProxyGroupType.SSID;
    ssid.proxies = ["a"];
    expect(toClash([minimal(ProxyType.Shadowsocks)], [relay, ssid], settings)).toContain(
      "proxy-groups",
    );
  });

  it("produces share links across node shapes", () => {
    const settings = createExtraSettings();
    const ssr = minimal(ProxyType.ShadowsocksR);
    const ssAsSsr = createProxy();
    ssConstruct(ssAsSsr, {
      group: "G",
      method: "chacha20-ietf",
      password: "pw",
      port: 1,
      remark: "s",
      server: "h",
    });
    const trojan = minimal(ProxyType.Trojan);
    trojan.transferProtocol = "ws";
    trojan.path = "/p";
    trojan.host = "h";
    const links = proxyToSingle([ssr, ssAsSsr, trojan, minimal(ProxyType.VMess)], 15, settings);
    expect(links.length).toBeGreaterThan(0);
    // ssr-only mask with a plain ss node that cannot be represented
    const list = createExtraSettings();
    list.nodeList = true;
    expect(proxyToSingle([minimal(ProxyType.Shadowsocks)], 2, list)).toBe("");
  });

  it("maps plugins in SIP008 / SSD", () => {
    const obfs = createProxy();
    ssConstruct(obfs, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "obfs-local",
      pluginOption: "obfs=http",
      port: 1,
      remark: "obfs",
      server: "s",
    });
    expect(proxyToSsSub([obfs], "")).toContain("obfs-local");
    const ssd = proxyToSsd([obfs, minimal(ProxyType.ShadowsocksR)], "G", "");
    expect(ssd.startsWith("ssd://")).toBe(true);
  });

  it("generates quan/loon group variants", () => {
    const settings = createExtraSettings();
    const load = createProxyGroupConfig();
    load.name = "load";
    load.type = ProxyGroupType.LoadBalance;
    load.strategy = BalanceStrategy.RoundRobin;
    load.timeout = 5;
    load.proxies = ["!!TYPE=SS"];
    const fallback = createProxyGroupConfig();
    fallback.name = "fb";
    fallback.type = ProxyGroupType.Fallback;
    fallback.interval = 300;
    fallback.timeout = 5;
    fallback.proxies = ["!!TYPE=SS"];
    const nodes = [minimal(ProxyType.Shadowsocks), minimal(ProxyType.Shadowsocks)];
    expect(toLoon(nodes, [load, fallback], settings, { baseConf: "", nodeList: false })).toContain(
      "algorithm=",
    );
    expect(toQuanX(nodes, [load], settings, { baseConf: "", nodeList: false })).toContain(
      "round-robin=",
    );
    expect(toQuan(nodes, [load], settings, { baseConf: "", nodeList: false })).toContain(
      "[POLICY]",
    );
  });

  it("generate dispatch supports ssd and nodelist with minimal nodes", () => {
    const settings = createExtraSettings();
    expect(
      generate([minimal(ProxyType.Shadowsocks)], { settings, target: TargetFormat.SSD }),
    ).toContain("ssd://");
  });

  it("injects rules across generators", () => {
    const settings = createExtraSettings();
    const nodes = [minimal(ProxyType.Shadowsocks)];
    const rules = { lines: ["DOMAIN,example.com,Proxy"], section: "Rule" };

    expect(
      toSurge(nodes, [], settings, { baseConf: "", nodeList: false, rules, version: 4 }),
    ).toContain("DOMAIN,example.com,Proxy");
    expect(toQuanX(nodes, [], settings, { baseConf: "", nodeList: false, rules })).toContain(
      "DOMAIN,example.com,Proxy",
    );
    expect(toQuan(nodes, [], settings, { baseConf: "", nodeList: false, rules })).toContain(
      "DOMAIN,example.com,Proxy",
    );
    expect(toLoon(nodes, [], settings, { baseConf: "", nodeList: false, rules })).toContain(
      "DOMAIN,example.com,Proxy",
    );

    // empty rules lines take the `rules && lines.length > 0` false branch
    const emptyRules = { lines: [] as string[], section: "Rule" };
    expect(
      toSurge(nodes, [], settings, {
        baseConf: "",
        nodeList: false,
        rules: emptyRules,
        version: 4,
      }),
    ).not.toContain("DOMAIN,example.com,Proxy");
    expect(
      toQuanX(nodes, [], settings, { baseConf: "", nodeList: false, rules: emptyRules }),
    ).not.toContain("DOMAIN,example.com,Proxy");
    expect(
      toQuan(nodes, [], settings, { baseConf: "", nodeList: false, rules: emptyRules }),
    ).not.toContain("DOMAIN,example.com,Proxy");
    expect(
      toLoon(nodes, [], settings, { baseConf: "", nodeList: false, rules: emptyRules }),
    ).not.toContain("DOMAIN,example.com,Proxy");

    const rulesets: RulesetContent[] = [
      {
        content: "DOMAIN,example.com",
        ruleGroup: "Proxy",
        rulePath: "",
        rulePathTyped: "",
        ruleType: RulesetType.Surge,
        updateInterval: 0,
      },
    ];
    expect(toSingBox(nodes, [], settings, { baseConf: "{}", nodeList: false, rulesets })).toContain(
      "example.com",
    );

    // generate() with explicit rulesets covers attachClashRules + Surge/QuanX/Quan/Loon/SingBox rule paths
    expect(
      generate([minimal(ProxyType.Shadowsocks)], {
        rulesets,
        settings,
        target: TargetFormat.Clash,
      }),
    ).toContain("example.com");
    expect(
      generate([minimal(ProxyType.Shadowsocks)], {
        rulesets,
        settings,
        target: TargetFormat.Surge,
      }),
    ).toContain("example.com");
    expect(
      generate([minimal(ProxyType.Shadowsocks)], {
        rulesets,
        settings,
        target: TargetFormat.QuantumultX,
      }),
    ).toContain("example.com");
    expect(
      generate([minimal(ProxyType.Shadowsocks)], {
        rulesets,
        settings,
        target: TargetFormat.Quantumult,
      }),
    ).toContain("example.com");
    expect(
      generate([minimal(ProxyType.Shadowsocks)], {
        rulesets,
        settings,
        target: TargetFormat.Loon,
      }),
    ).toContain("example.com");
    expect(
      generate([minimal(ProxyType.Shadowsocks)], {
        rulesets,
        settings,
        target: TargetFormat.SingBox,
      }),
    ).toContain("example.com");
  });
});
