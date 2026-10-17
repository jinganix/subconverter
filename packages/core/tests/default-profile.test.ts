import { describe, expect, it } from "vitest";

import {
  TargetFormat,
  createExtraSettings,
  createProxy,
  generate,
  getDefaultProxyGroups,
  getDefaultRulesetConfigs,
  getDefaultRulesets,
  ssConstruct,
  type RulesetContent,
} from "../src/index";
import { RulesetType } from "../src/index";

function ssNode(remark = "Node"): ReturnType<typeof createProxy> {
  const node = createProxy();
  ssConstruct(node, {
    group: "SSProvider",
    method: "aes-256-gcm",
    password: "pw",
    port: 8388,
    remark,
    server: "1.2.3.4",
  });
  return node;
}

function inlineRuleset(): RulesetContent {
  return {
    content: "DOMAIN,example.com",
    ruleGroup: "G",
    rulePath: "",
    rulePathTyped: "",
    ruleType: RulesetType.Surge,
    updateInterval: 0,
  };
}

describe("default profile", () => {
  it("exposes default groups and rules", () => {
    const groups = getDefaultProxyGroups();
    const rules = getDefaultRulesets();
    expect(groups.length).toBeGreaterThan(5);
    expect(groups.map((g) => g.name)).toContain("🚀 节点选择");
    expect(groups.map((g) => g.name)).toContain("🐟 漏网之鱼");
    expect(rules.length).toBeGreaterThan(5);
    expect(rules.some((r) => r.content.includes("FINAL"))).toBe(true);
    expect(rules.some((r) => r.content.includes("GEOIP,CN"))).toBe(true);
  });

  it("returns fresh copies on each call", () => {
    const first = getDefaultProxyGroups();
    first[0]?.proxies.push("MUTATED");
    expect(getDefaultProxyGroups()[0]?.proxies).not.toContain("MUTATED");
    const rulesFirst = getDefaultRulesets();
    rulesFirst.push(inlineRuleset());
    expect(getDefaultRulesets()).toHaveLength(rulesFirst.length - 1);
  });

  it("exposes remote ACL4SSR configs for the Node adapter", () => {
    const configs = getDefaultRulesetConfigs();
    expect(configs.length).toBeGreaterThan(5);
    expect(configs.some((c) => c.url.startsWith("[]"))).toBe(true);
    expect(configs.some((c) => c.url.startsWith("https://"))).toBe(true);
  });
});

describe("generate includeRules", () => {
  it("emits bundled rules by default", () => {
    const out = generate([ssNode()], {
      settings: { clashNewFieldName: true },
      target: TargetFormat.Clash,
    });
    expect(out).toContain("rules:");
    expect(out).toContain("GEOIP,CN");
  });

  it("injects bundled groups and rules when opted in", () => {
    const out = generate([ssNode()], {
      includeRules: true,
      settings: { clashNewFieldName: true },
      target: TargetFormat.Clash,
    });
    expect(out).toContain("proxy-groups:");
    expect(out).toContain("🚀 节点选择");
    expect(out).toContain("rules:");
    expect(out).toContain("GEOIP,CN");
    expect(out).toContain("MATCH,");
  });

  it("keeps explicit groups/rulesets when opted in", () => {
    const out = generate([ssNode()], {
      includeRules: true,
      rulesets: [inlineRuleset()],
      settings: { clashNewFieldName: true },
      target: TargetFormat.Clash,
    });
    expect(out).toContain("DOMAIN,example.com,G");
    expect(out).not.toContain("GEOIP,CN");
  });

  it("strips rules when includeRules is false", () => {
    const out = generate([ssNode()], {
      includeRules: false,
      rulesets: [inlineRuleset()],
      settings: { clashNewFieldName: true },
      target: TargetFormat.Clash,
    });
    expect(out).not.toContain("DOMAIN,example.com");
  });

  it("respects enableRuleGenerator=false", () => {
    const out = generate([ssNode()], {
      includeRules: true,
      settings: { clashNewFieldName: true, enableRuleGenerator: false },
      target: TargetFormat.Clash,
    });
    expect(out).not.toContain("rules:");
  });

  it("emits Surge proxy groups and rules when opted in", () => {
    const out = generate([ssNode()], { includeRules: true, target: TargetFormat.Surge });
    expect(out).toContain("[Proxy Group]");
    expect(out).toContain("[Rule]");
    expect(out).toContain("GEOIP,CN");
  });

  it("emits QuanX/Quan/Loon rules when opted in", () => {
    const quanx = generate([ssNode()], {
      includeRules: true,
      target: TargetFormat.QuantumultX,
    });
    expect(quanx).toContain("filter_local");

    const quan = generate([ssNode()], {
      includeRules: true,
      target: TargetFormat.Quantumult,
    });
    expect(quan).toContain("TCP");

    const loon = generate([ssNode()], {
      includeRules: true,
      target: TargetFormat.Loon,
    });
    expect(loon).toContain("Rule");
  });

  it("emits sing-box route when opted in", () => {
    const out = generate([ssNode()], { includeRules: true, target: TargetFormat.SingBox });
    expect(out).toContain('"route"');
    expect(out).toContain("🚀 节点选择");
  });

  it("skips rules for bare node lists", () => {
    const settings = createExtraSettings();
    settings.nodeList = true;
    settings.clashNewFieldName = true;
    const out = generate([ssNode()], {
      includeRules: true,
      settings,
      target: TargetFormat.Clash,
    });
    expect(out).not.toContain("rules:");
  });
});
