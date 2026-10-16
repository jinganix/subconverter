import { describe, expect, it } from "vitest";

import {
  ProxyType,
  RulesetType,
  addEmoji,
  applyMatcher,
  checkIgnore,
  convertRuleset,
  createExtraSettings,
  createProxy,
  createProxyGroupConfig,
  groupGenerate,
  matchRange,
  nodeRename,
  parseIni,
  parseRawIni,
  preprocessNodes,
  processRemark,
  proxyToSingle,
  proxyToSsd,
  proxyToSsSub,
  rulesetToClashRules,
  rulesetToSurgeRules,
  ssConstruct,
  toQuan,
  transformRuleToCommon,
  vmessLinkConstruct,
  httpConstruct,
  socksConstruct,
  vmessConstruct,
  type Proxy,
  type RulesetContent,
} from "../src/index";

describe("nodes coverage gaps", () => {
  it("covers matchRange negation ranges and open forms", () => {
    expect(matchRange("!1-5", 2)).toBe(false);
    expect(matchRange("!1-5", 7)).toBe(true);
    expect(matchRange("1-5,10", 10)).toBe(true);
    expect(matchRange("bogus", 1)).toBe(false);
  });

  it("covers matcher parse failures", () => {
    const node = createProxy();
    node.type = ProxyType.Unknown;
    expect(applyMatcher("!!GROUP=", node).matched).toBe(true);
    expect(applyMatcher("!!GROUPID=", node).matched).toBe(false);
    expect(applyMatcher("!!INSERT=", node).matched).toBe(false);
    expect(applyMatcher("!!TYPE=", node).matched).toBe(false);
    expect(applyMatcher("!!TYPE=SS", node).matched).toBe(false);
    expect(applyMatcher("!!PORT=", node).matched).toBe(false);
    expect(applyMatcher("!!SERVER=", node).matched).toBe(true);
  });

  it("covers checkIgnore branches", () => {
    const node = createProxy();
    node.type = ProxyType.Shadowsocks;
    node.remark = "HK";
    expect(checkIgnore(node, ["!!TYPE=SS"], [])).toBe(true);
    expect(checkIgnore(node, ["!!TYPE=VMESS"], [])).toBe(false);
    expect(checkIgnore(node, [], ["!!TYPE=SS"])).toBe(false);
  });

  it("covers nodeRename and preprocess", () => {
    const node = createProxy();
    node.remark = "🇭🇰 HK";
    nodeRename(node, [{ match: "script:x", replace: "y", script: "s" }]);
    expect(node.remark).toBe("🇭🇰 HK");
    nodeRename(node, [{ match: "HK", replace: "Hong Kong", script: "" }]);
    expect(node.remark).toBe("🇭🇰 Hong Kong");
    preprocessNodes([node], {
      addEmoji: true,
      emojiArray: [{ match: "Hong", replace: "🌆", script: "" }],
      removeEmoji: true,
      renameArray: [],
      sortFlag: true,
    });
    expect(node.remark).toContain("🌆");
    // sort comparator with equal remarks
    const a = createProxy();
    a.remark = "same";
    const b = createProxy();
    b.remark = "same";
    preprocessNodes([a, b], {
      addEmoji: false,
      emojiArray: [],
      removeEmoji: false,
      renameArray: [],
      sortFlag: true,
    });
    expect([a.remark, b.remark]).toEqual(["same", "same"]);
    const c = createProxy();
    c.remark = "x";
    expect(addEmoji(c, [{ match: "x", replace: "⭐", script: "" }])).toBe("⭐ x");
    const out: string[] = [];
    groupGenerate("no-match-rule", [c], out, false);
    expect(out).toEqual([]);
    expect(processRemark("a,b", ["a,b"])).toBe('"a,b"');
  });
});

describe("quan coverage gaps", () => {
  it("covers scv/plugin/host branches and groups", () => {
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
    });
    vm.allowInsecure = false;
    const ssPlug = createProxy();
    ssConstruct(ssPlug, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "simple-obfs",
      pluginOption: "obfs=http",
      port: 1,
      remark: "SP",
      server: "s",
    });
    const obfsLocal = createProxy();
    ssConstruct(obfsLocal, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "obfs-local",
      pluginOption: "obfs=http;obfs-host=h",
      port: 1,
      remark: "OL",
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
      username: "u",
    });
    http.host = "h";
    http.tlsSecure = true;
    const socks = createProxy();
    socksConstruct(socks, {
      group: "G",
      password: "pw",
      port: 1,
      remark: "SK",
      server: "s",
      username: "u",
    });
    socks.tlsSecure = true;
    socks.allowInsecure = true;
    const relay = createProxyGroupConfig();
    relay.name = "relay";
    relay.type = "relay" as never;
    relay.proxies = ["!!TYPE=SS"];
    const empty = createProxyGroupConfig();
    empty.name = "empty";
    empty.type = "select" as never;
    empty.proxies = ["!!TYPE=TUIC"];
    const nodes = [vm, ssPlug, obfsLocal, http, socks];
    const marked = toQuan(nodes, [relay, empty], settings, { baseConf: "", nodeList: false });
    expect(marked).toContain("[SERVER]");
    expect(marked).toContain("[POLICY]");
    const list = toQuan([ssPlug, obfsLocal, vm], [], settings, { baseConf: "", nodeList: true });
    expect(list.length).toBeGreaterThan(0);
  });
});

describe("links coverage gaps", () => {
  it("covers vmess link defaults and ss/ssr conversions", () => {
    expect(vmessLinkConstruct("n", "h", "1", "", "u", "0", "", "", "", "")).toContain(
      '"net":"tcp"',
    );
    const ssAsSsr = createProxy();
    ssAsSsr.type = ProxyType.Shadowsocks;
    ssAsSsr.hostname = "s";
    ssAsSsr.port = 1;
    ssAsSsr.password = "pw";
    ssAsSsr.encryptMethod = "aes-256-cfb";
    ssAsSsr.remark = "S";
    const ssrAsSs = createProxy();
    ssrAsSs.type = ProxyType.ShadowsocksR;
    ssrAsSs.hostname = "s";
    ssrAsSs.port = 1;
    ssrAsSs.password = "pw";
    ssrAsSs.encryptMethod = "aes-256-gcm";
    ssrAsSs.protocol = "origin";
    ssrAsSs.obfs = "plain";
    ssrAsSs.remark = "R";
    const settings = createExtraSettings();
    expect(proxyToSingle([ssAsSsr], 2, settings)).not.toBe("");
    expect(proxyToSingle([ssrAsSs], 1, settings)).not.toBe("");
    const obfs = createProxy();
    ssConstruct(obfs, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      plugin: "simple-obfs",
      pluginOption: "obfs=http",
      port: 1,
      remark: "O",
      server: "s",
    });
    expect(proxyToSsSub([obfs, ssrAsSs], "")).toContain("obfs-local");
    const ssd = proxyToSsd([ssAsSsr], "G", "upload=1; download=1; total=2; expire=");
    expect(ssd.startsWith("ssd://")).toBe(true);
  });
});

describe("ini coverage gaps", () => {
  it("covers trim/empty/malformed lines", () => {
    const doc = parseIni("[s]\n  spaced =   value  \nnoequals\n\n", {
      keepEmptyValues: true,
      trim: false,
    });
    expect(doc.sections[0]?.items).toContainEqual(["  spaced ", "   value  "]);
    const doc2 = parseIni("[s]\nnoequals\nx=1");
    expect(doc2.sections[0]?.items).toEqual([["x", "1"]]);
    expect(parseRawIni("[s]\n\n  \na=1\noutside")[0]?.lines).toEqual(["a=1", "outside"]);
  });
});

describe("ruleset coverage gaps", () => {
  function rs(content: string, ruleType: RulesetType, group = "G"): RulesetContent {
    return {
      content,
      ruleGroup: group,
      rulePath: "",
      rulePathTyped: "",
      ruleType,
      updateInterval: 0,
    };
  }

  it("covers quanx and classical conversion", () => {
    expect(convertRuleset("host,a.com,G\n#c\n\n", RulesetType.QuantumultX)).toContain(
      "DOMAIN,a.com",
    );
    expect(convertRuleset("bogus line", RulesetType.QuantumultX)).toContain("bogus line");
    expect(transformRuleToCommon("DOMAIN", "G")).toBe("DOMAIN,G");
  });

  it("covers surge version variants and inline rules", () => {
    expect(rulesetToSurgeRules([rs("DOMAIN,a.com // c", RulesetType.Surge)], 2).lines).toEqual([
      "DOMAIN,a.com,G",
    ]);
    expect(rulesetToSurgeRules([rs("[]MATCH", RulesetType.Surge)], -1).lines).toEqual(["FINAL,G"]);
    expect(rulesetToSurgeRules([rs("[]AND,x", RulesetType.Surge)], 4).lines).toEqual(["AND,x"]);
    expect(rulesetToSurgeRules([rs("BOGUS,x", RulesetType.Surge)], 4).lines).toEqual([]);
  });

  it("covers clash conversion with comments and keywords", () => {
    expect(rulesetToClashRules([rs("bogus", RulesetType.Surge)])).toEqual([]);
    expect(rulesetToClashRules([rs("DOMAIN,a.com // c", RulesetType.Surge)])).toEqual([
      "DOMAIN,a.com,G",
    ]);
  });
});

describe("quan/loon proxy type skips", () => {
  it("skips unsupported nodes", () => {
    const settings = createExtraSettings();
    const wg = createProxy();
    wg.type = ProxyType.WireGuard;
    wg.remark = "WG";
    wg.hostname = "s";
    wg.port = 1;
    const out: Proxy[] = [wg];
    void out;
    expect(toQuan([wg], [], settings, { baseConf: "", nodeList: false })).not.toContain("WG =");
  });
});
