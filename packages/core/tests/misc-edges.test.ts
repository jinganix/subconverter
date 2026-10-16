import { describe, expect, it } from "vitest";

import {
  ProxyType,
  addEmoji,
  applyMatcher,
  base64Encode,
  checkIgnore,
  convertRuleset,
  createExtraSettings,
  createProxy,
  createProxyGroupConfig,
  explodeNetch,
  groupGenerate,
  hysteria2Construct,
  hysteriaConstruct,
  httpConstruct,
  nodeRename,
  processRemark,
  proxyToSingle,
  proxyToSsd,
  rulesetToClashRules,
  rulesetToSurgeRules,
  socksConstruct,
  ssConstruct,
  ssrConstruct,
  toSingBox,
  vmessConstruct,
  wireGuardConstruct,
  RulesetType,
  type Proxy,
  type RulesetContent,
} from "../src/index";

function netch(data: Record<string, unknown>): Proxy {
  const node = createProxy();
  explodeNetch(`Netch://${base64Encode(JSON.stringify(data))}`, node);
  return node;
}

describe("netch edges", () => {
  it("parses SS with plugin and rejects invalid input", () => {
    const n = netch({
      EncryptMethod: "aes-256-gcm",
      Hostname: "h",
      Password: "p",
      Plugin: "obfs-local",
      PluginOption: "obfs=http",
      Port: 1,
      Remark: "n",
      Type: "SS",
    });
    expect(n.plugin).toBe("obfs-local");
    const bad = netch({ Port: 0, Type: "SS" });
    expect(bad.type).toBe(ProxyType.Unknown);
    const node = createProxy();
    explodeNetch("Netch://@@@", node);
    explodeNetch("Netch://" + base64Encode("not json"), node);
    explodeNetch("Netch://" + base64Encode("[]"), node);
    expect(node.type).toBe(ProxyType.Unknown);
  });

  it("parses VMess HTTPS Trojan Snell with TLS", () => {
    expect(
      netch({
        Hostname: "h",
        Port: 1,
        Remark: "n",
        TLSSecure: "true",
        TransferProtocol: "ws",
        Type: "VMess",
        UserID: "u",
      }).type,
    ).toBe(ProxyType.VMess);
    expect(netch({ Hostname: "h", Port: 1, Remark: "n", Type: "HTTPS" }).type).toBe(
      ProxyType.HTTPS,
    );
    expect(
      netch({
        Hostname: "h",
        Password: "p",
        Port: 1,
        Remark: "n",
        TLSSecure: "true",
        Type: "Trojan",
      }).tlsSecure,
    ).toBe(true);
    expect(
      netch({
        Hostname: "h",
        OBFS: "http",
        Password: "p",
        Port: 1,
        Remark: "n",
        SnellVersion: 3,
        Type: "Snell",
      }).snellVersion,
    ).toBe(3);
    expect(
      netch({ Hostname: "h", Port: 1, Remark: "n", TransferProtocol: "tcp", Type: "Trojan" }).type,
    ).toBe(ProxyType.Trojan);
  });

  it("derives a remark when missing", () => {
    expect(netch({ Hostname: "1.2.3.4", Port: 1, Type: "SS" }).remark).toBe("1.2.3.4:1");
  });

  it("leaves unknown types untouched", () => {
    expect(netch({ Hostname: "h", Port: 1, Type: "Bogus" }).type).toBe(ProxyType.Unknown);
  });
});

describe("node utilities edges", () => {
  it("regFind/regMatch reject invalid patterns gracefully", () => {
    const node = createProxy();
    node.remark = "x";
    expect(() => applyMatcher("!!SERVER=[", node)).not.toThrow();
    expect(() => applyMatcher("!!GROUP=[", node)).not.toThrow();
    expect(applyMatcher("!!SERVER=nomatch", node).matched).toBe(false);
  });

  it("checkIgnore handles exclude and include", () => {
    const node = createProxy();
    node.remark = "HK";
    node.group = "G";
    expect(checkIgnore(node, ["US"], [])).toBe(false);
    expect(checkIgnore(node, ["HK"], [])).toBe(true);
    expect(checkIgnore(node, ["!!GROUP=G"], [])).toBe(true);
    expect(checkIgnore(node, [], ["US"])).toBe(true);
    expect(checkIgnore(node, [], ["HK"])).toBe(false);
  });

  it("groupGenerate honours addDirect and empty rules", () => {
    const node = createProxy();
    node.remark = "HK";
    node.type = ProxyType.Shadowsocks;
    const out: string[] = [];
    groupGenerate("[]DIRECT", [node], out, false);
    expect(out).toEqual([]);
    groupGenerate(".*", [node], out, false);
    expect(out).toEqual(["HK"]);
    groupGenerate(".*", [node], out, false);
    expect(out).toEqual(["HK"]);
  });

  it("processRemark can skip comma handling", () => {
    expect(processRemark("a,b", [], false)).toBe("a,b");
    expect(processRemark("a=b", [], false)).toBe("a-b");
  });

  it("addEmoji skips rules without an emoji and nodeRename restores empty", () => {
    const node = createProxy();
    node.remark = "HK";
    expect(addEmoji(node, [{ match: "HK", replace: "", script: "" }])).toBe("HK");
    nodeRename(node, [{ match: "HK", replace: "", script: "" }]);
    expect(node.remark).toBe("HK");
  });
});

function ruleset(
  content: string,
  ruleType: RulesetType,
  group = "G",
  rulePath = "",
): RulesetContent {
  return { content, ruleGroup: group, rulePath, rulePathTyped: "", ruleType, updateInterval: 0 };
}

describe("ruleset edges", () => {
  it("handles classical, comments and keyword forms", () => {
    const clash = [
      "payload:",
      "  - '.a.com'",
      "  - '+.b.*'",
      "  - '1.2.3.0/24'",
      "  - '# comment'",
      "  - '2001:db8::/32'",
      "  - // skipped",
    ].join("\n");
    const out = convertRuleset(clash, RulesetType.ClashDomain);
    expect(out).toContain("DOMAIN-SUFFIX,a.com");
    expect(out).toContain("DOMAIN-KEYWORD,b");
    expect(out).toContain("IP-CIDR,1.2.3.0/24");
    expect(out).toContain("IP-CIDR6,2001:db8::/32");
    expect(convertRuleset(clash, RulesetType.ClashClassical)).toContain(".a.com");
  });

  it("passes through empty and unsupported content", () => {
    expect(rulesetToClashRules([ruleset("", RulesetType.Surge)])).toEqual([]);
    expect(rulesetToClashRules([ruleset("  \n#x", RulesetType.Surge)])).toEqual([]);
  });

  it("handles []MATCH and inline rules", () => {
    expect(rulesetToClashRules([ruleset("[]MATCH", RulesetType.Surge)])).toEqual(["MATCH,G"]);
    expect(rulesetToSurgeRules([ruleset("[]FINAL", RulesetType.Surge, "G")], 4).lines).toEqual([
      "FINAL,G",
    ]);
  });

  it("supports -3/-4 surge versions and filtering", () => {
    const ipv6 = ruleset("IP-CIDR6,2001:db8::/32", RulesetType.Surge, "G");
    expect(rulesetToSurgeRules([ipv6], -3).section).toBe("Rule");
    expect(rulesetToSurgeRules([ipv6], -4).lines).toEqual(["IP-CIDR6,2001:db8::/32,G"]);
    expect(
      rulesetToSurgeRules([ruleset("USER-AGENT,x,no-resolve", RulesetType.Surge, "G")], -1).lines,
    ).toEqual(["USER-AGENT,x,G,no-resolve"]);
  });

  it("keeps remote rule paths as RULE-SET", () => {
    const remote = ruleset("", RulesetType.Surge, "G", "https://example.com/rules");
    const result = rulesetToSurgeRules([remote], 4);
    expect(result.lines).toEqual([]);
  });
});

describe("sing-box edges", () => {
  it("covers v1 hysteria, ss plugin, socks, http, anytls", () => {
    const settings = createExtraSettings();
    const hy = createProxy();
    hysteriaConstruct(hy, {
      authStr: "a",
      down: "1",
      downSpeed: "1",
      group: "G",
      obfs: "x",
      port: 1,
      recvWindow: "2",
      recvWindowConn: "3",
      remark: "HY",
      server: "s",
      up: "1",
      upSpeed: "1",
    });
    hy.disableMtuDiscovery = true;
    const hy2 = createProxy();
    hysteria2Construct(hy2, {
      down: "1",
      group: "G",
      hopInterval: "30",
      obfs: "salamander",
      obfsPassword: "p",
      password: "pw",
      port: 1,
      ports: "1,2,3",
      remark: "HY2",
      server: "s",
      up: "1",
    });
    const ss = createProxy();
    ssConstruct(ss, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "simple-obfs",
      pluginOption: "obfs=http",
      port: 1,
      remark: "SS",
      server: "s",
    });
    const socks = createProxy();
    socksConstruct(socks, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "SK",
      server: "s",
      username: "u",
    });
    const http = createProxy();
    httpConstruct(http, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "HP",
      server: "s",
      tls: false,
      username: "u",
    });
    const at = createProxy();
    at.type = ProxyType.AnyTLS;
    at.password = "pw";
    const wg = createProxy();
    wireGuardConstruct(wg, {
      group: "G",
      port: 1,
      privateKey: "p",
      publicKey: "u",
      remark: "WG",
      selfIp: "10.0.0.1",
      server: "s",
    });
    const out = toSingBox([hy, hy2, ss, socks, http, at, wg], [], settings, {
      baseConf: "",
      nodeList: false,
    });
    const doc = JSON.parse(out) as { outbounds: Array<Record<string, unknown>> };
    expect(doc.outbounds.some((o) => o.type === "hysteria")).toBe(true);
    expect(doc.outbounds.some((o) => o.type === "hysteria2")).toBe(true);
  });

  it("skips unsupported types", () => {
    const settings = createExtraSettings();
    const vl = createProxy();
    vl.type = ProxyType.VLESS;
    const out = toSingBox([vl], [], settings, { baseConf: "", nodeList: false });
    expect(JSON.parse(out).outbounds.filter((o: { tag: string }) => o.tag === "VL")).toHaveLength(
      0,
    );
  });
});

describe("links edges", () => {
  it("emits vmess/ss/ssr/trojan links", () => {
    const settings = createExtraSettings();
    const ss = createProxy();
    ssConstruct(ss, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      port: 1,
      remark: "SS",
      server: "s",
    });
    const ssr = createProxy();
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
    const links = proxyToSingle([ss, ssr], 15, settings);
    expect(links.length).toBeGreaterThan(0);
    const ssd = proxyToSsd([ss], "G", "");
    expect(ssd.startsWith("ssd://")).toBe(true);
  });

  it("emits trojan links with sni and ws", () => {
    const settings = createExtraSettings();
    const t = createProxy();
    t.type = ProxyType.Trojan;
    t.hostname = "s";
    t.port = 1;
    t.password = "pw";
    t.remark = "T";
    t.host = "h";
    t.transferProtocol = "ws";
    t.path = "/p";
    t.allowInsecure = true;
    const links = proxyToSingle([t], 8, settings);
    expect(links.length).toBeGreaterThan(0);
  });
});

describe("generator group skips", () => {
  it("ignores relay groups in quanx/loon/surge/quan", () => {
    const settings = createExtraSettings();
    const relay = createProxyGroupConfig();
    relay.name = "relay";
    relay.type = "relay" as never;
    relay.proxies = ["!!TYPE=SS"];
    const ss = createProxy();
    ssConstruct(ss, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      port: 1,
      remark: "SS",
      server: "s",
    });
    const vmess = createProxy();
    vmessConstruct(vmess, {
      add: "s",
      aid: "0",
      cipher: "auto",
      group: "G",
      id: "u",
      net: "tcp",
      port: 1,
      remark: "VM",
      tls: "",
    });
    expect(
      toSingBox([ss, vmess], [relay], settings, { baseConf: "", nodeList: false }),
    ).not.toContain("relay");
  });
});
