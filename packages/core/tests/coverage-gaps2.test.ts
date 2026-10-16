import { describe, expect, it } from "vitest";

import {
  ProxyGroupType,
  ProxyType,
  base64Encode,
  createExtraSettings,
  createProxy,
  createProxyGroupConfig,
  explodeNetch,
  generatePeer,
  parseExternalConfig,
  parseRegexMatch,
  parseRulesetConfig,
  parseSubscription,
  ssConstruct,
  ssrConstruct,
  toClash,
  toLoon,
  toQuanX,
  toSurge,
  vmessConstruct,
  wireGuardConstruct,
  type Proxy,
} from "../src/index";

describe("netch group defaults", () => {
  it("sets the default group per type when absent", () => {
    const types = ["SS", "SSR", "VMess", "Socks5", "HTTP", "HTTPS", "Trojan", "Snell"];
    for (const type of types) {
      const node = createProxy();
      explodeNetch(
        `Netch://${base64Encode(
          JSON.stringify({
            EncryptMethod: type === "SSR" ? "aes-256-cfb" : "aes-256-gcm",
            Group: "Custom",
            Hostname: "h",
            OBFS: type === "SSR" ? "http_simple" : "plain",
            Password: "pw",
            Port: 1,
            Protocol: type === "SSR" ? "auth_sha1_v4" : "origin",
            Remark: "n",
            Type: type,
            UserID: "u",
          }),
        )}`,
        node,
      );
      expect(node.group).toBe("Custom");
    }
    const flattened = createProxy();
    explodeNetch(
      `Netch://${base64Encode(
        JSON.stringify({
          EncryptMethod: "aes-256-gcm",
          Group: "G",
          Hostname: "h",
          OBFS: "plain",
          Password: "pw",
          Port: 1,
          Protocol: "origin",
          Remark: "n",
          Type: "SSR",
        }),
      )}`,
      flattened,
    );
    expect(flattened.type).toBe(ProxyType.Shadowsocks);
    const scalar = createProxy();
    explodeNetch(`Netch://${base64Encode("5")}`, scalar);
    explodeNetch(`Netch://${base64Encode("null")}`, scalar);
    expect(scalar.type).toBe(ProxyType.Unknown);
  });
});

describe("surge optional branches", () => {
  it("covers ssr/wireguard/group/vmess variants", () => {
    const settings = createExtraSettings();
    settings.surgeSsrPath = "/bin/ssr";
    const ssrDomain = createProxy();
    ssrConstruct(ssrDomain, {
      group: "G",
      method: "aes-256-cfb",
      obfs: "http_simple",
      password: "pw",
      port: 8388,
      protocol: "auth_sha1_v4",
      remark: "SSRD",
      server: "example.com",
    });
    const ssrParam = createProxy();
    ssrConstruct(ssrParam, {
      group: "G",
      method: "aes-256-cfb",
      obfs: "http_simple",
      obfsParam: "op",
      password: "pw",
      port: 8388,
      protocol: "auth_sha1_v4",
      protocolParam: "pp",
      remark: "SSRP",
      server: "1.1.1.1",
    });
    const wg = createProxy();
    wireGuardConstruct(wg, {
      dnsServers: [],
      group: "G",
      keepAlive: 0,
      mtu: 0,
      port: 2408,
      privateKey: "p",
      publicKey: "u",
      remark: "WG",
      selfIp: "10.0.0.1",
      server: "s",
    });
    const ssObfs = createProxy();
    ssConstruct(ssObfs, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "simple-obfs",
      port: 1,
      remark: "O1",
      server: "s",
    });
    const ssObfsOpts = createProxy();
    ssConstruct(ssObfsOpts, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "simple-obfs",
      pluginOption: "obfs=http;obfs-host=h",
      port: 1,
      remark: "O2",
      server: "s",
    });
    const vmessWsNoHost = createProxy();
    vmessConstruct(vmessWsNoHost, {
      add: "s",
      aid: "0",
      cipher: "auto",
      group: "G",
      id: "u",
      net: "ws",
      path: "/p",
      port: 1,
      remark: "VW",
      tls: "tls",
    });
    const vmessUnderlying = createProxy();
    vmessConstruct(vmessUnderlying, {
      add: "s",
      aid: "0",
      cipher: "auto",
      group: "G",
      id: "u",
      net: "tcp",
      port: 1,
      remark: "VU",
      tls: "",
    });
    vmessUnderlying.underlyingProxy = "DIRECT";
    const snellZero = createProxy();
    const h2 = createProxy();
    const relayGroup = createProxyGroupConfig();
    relayGroup.name = "relay";
    relayGroup.type = "relay" as never;
    relayGroup.proxies = ["!!TYPE=SS"];
    const out = toSurge(
      [ssrDomain, ssrParam, wg, ssObfs, ssObfsOpts, vmessWsNoHost, vmessUnderlying, snellZero, h2],
      [
        relayGroup,
        mkGroup("ssid", ProxyGroupType.SSID, ["a", "b"]),
        mkGroup("ut", ProxyGroupType.URLTest, ["!!TYPE=SS"], {
          evaluateBeforeUse: false,
          interval: 300,
          persistent: true,
          timeout: 5,
          tolerance: 10,
          url: "http://x",
        }),
        mkGroup("lb0", ProxyGroupType.LoadBalance, ["!!TYPE=SS"]),
        mkGroup("single", ProxyGroupType.Select, ["[]REJECT"]),
      ],
      settings,
      { baseConf: "", nodeList: false, version: 4 },
    );
    expect(out).toContain("external, exec=");
    expect(out).toContain("addresses=");
    expect(out).toContain("ssid,");
    expect(out).toContain("single = reject");
  });

  it("preserves blank lines in a base config", () => {
    const settings = createExtraSettings();
    const out = toSurge([], [], settings, {
      baseConf: "[General]\n\nloglevel = notify\n",
      nodeList: false,
      version: 4,
    });
    expect(out).toContain("loglevel = notify");
  });

  it("handles a load-balance group in an old surge version", () => {
    const settings = createExtraSettings();
    const nodes = [mkSS("A"), mkSS("B")];
    const out = toSurge(
      nodes,
      [mkGroup("lb", ProxyGroupType.LoadBalance, ["!!TYPE=SS"])],
      settings,
      {
        baseConf: "",
        nodeList: false,
        version: 0,
      },
    );
    expect(out).not.toContain("lb =");
  });
});

describe("generatePeer optional branches", () => {
  it("handles empty allowedIps and keepAlive", () => {
    const node = createProxy();
    node.publicKey = "u";
    node.hostname = "h";
    node.port = 1;
    node.allowedIps = "";
    expect(generatePeer(node)).not.toContain("allowed-ips");
    node.allowedIps = "0.0.0.0/0";
    node.keepAlive = 25;
    node.clientId = "1/2/3";
    expect(generatePeer(node, true)).toContain("reserved");
  });
});

describe("uri extra branches", () => {
  it("handles vmess ip hosts and malformed std links", () => {
    const ip = parseSubscription(
      `vmess://${base64Encode(JSON.stringify({ add: "1.2.3.4", aid: "0", id: "u", net: "tcp", path: "/p", port: "443", ps: "n", v: "2" }))}`,
    );
    expect(ip[0]?.hostname).toBe("1.2.3.4");
    const v6 = parseSubscription(
      `vmess://${base64Encode(JSON.stringify({ add: "2001:db8::1", aid: "0", id: "u", net: "tcp", port: "443", ps: "n", v: "2" }))}`,
    );
    expect(v6[0]?.hostname).toBe("2001:db8::1");
    const bad = parseSubscription("vmess://tcp:nothex-0@host:443");
    expect(bad).toHaveLength(0);
  });

  it("handles ss remark/plugin/group and socks/http fallbacks", () => {
    expect(parseSubscription(`ss://${base64Encode("aes-256-gcm:pw")}@h:1#R`)[0]?.remark).toBe("R");
    expect(parseSubscription("socks://" + base64Encode("u:p@h:1") + "#R")[0]?.remark).toBe("R");
    expect(
      parseSubscription("http://" + base64Encode("1.2.3.4:8080") + "?remarks=R")[0]?.remark,
    ).toBe("R");
  });

  it("handles trojan/vless/tuic/hysteria variants", () => {
    expect(parseSubscription("trojan://pw@h:1?type=tcp&group=G#R")[0]?.group).toBe("G");
    expect(
      parseSubscription("vless://u@h:1?security=tls&type=ws&host=h&path=/p&sni=s#R")[0]?.type,
    ).toBe(ProxyType.VLESS);
    expect(parseSubscription("tuic://u:p@h:1?congestion_control=bbr&alpn=h3#R")[0]?.alpn).toEqual([
      "h3",
    ]);
    expect(parseSubscription("hysteria2://pw@h:1?insecure=1&sni=s#R")[0]?.allowInsecure).toBe(true);
  });
});

describe("clash extra branches", () => {
  it("covers group and node variants", () => {
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const vless = createProxy();
    vless.type = ProxyType.VLESS;
    vless.userId = "u";
    vless.hostname = "s";
    vless.port = 1;
    vless.remark = "VL";
    vless.transferProtocol = "ws";
    vless.path = "/p";
    vless.serverName = "sni";
    vless.fingerprint = "chrome";
    vless.alpn = ["h2"];
    vless.tlsSecure = true;
    vless.flow = "f";
    const relay = createProxyGroupConfig();
    relay.name = "relay";
    relay.type = "relay" as never;
    relay.proxies = ["!!TYPE=VMESS"];
    const empty = createProxyGroupConfig();
    empty.name = "empty";
    empty.type = "select" as never;
    empty.proxies = ["!!TYPE=TUIC"];
    const out = toClash([vless, mkSS("A")], [relay, empty], settings);
    expect(out).toContain("type: vless");
    expect(out).toContain("empty");
  });
});

describe("settings config extra branches", () => {
  it("covers delimiter-missing and base files", () => {
    expect(parseRegexMatch("noDelimiter", "@")).toEqual({
      match: "noDelimiter",
      replace: "",
      script: "",
    });
    expect(parseRulesetConfig("G,[]FINAL")?.url).toBe("[]FINAL");
    const config = parseExternalConfig("[custom]\nfoo_rule_base=base/x\nunknown=1");
    expect(config.baseFiles["foo_rule_base"]).toBe("base/x");
  });
});

describe("loon/quanx extra branches", () => {
  it("covers additional group and node shapes", () => {
    const settings = createExtraSettings();
    const nodes = [mkSS("A"), mkSS("B")];
    const relay = createProxyGroupConfig();
    relay.name = "relay";
    relay.type = "relay" as never;
    relay.proxies = ["!!TYPE=SS"];
    expect(toLoon(nodes, [relay], settings, { baseConf: "", nodeList: false })).toContain(
      "[Proxy]",
    );
    expect(toQuanX(nodes, [relay], settings, { baseConf: "", nodeList: false })).toContain(
      "[server_local]",
    );
  });
});

function mkSS(remark: string): Proxy {
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
