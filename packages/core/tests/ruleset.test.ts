import { describe, expect, it } from "vitest";

import type { RulesetContent } from "../src/index";
import {
  RulesetType,
  TargetFormat,
  convertRuleset,
  createExtraSettings,
  createProxy,
  generate,
  ssConstruct,
  rulesetToClashRules,
  rulesetToSurgeRules,
  transformRuleToCommon,
} from "../src/index";

function ruleset(content: string, ruleType: RulesetType, group = "Proxy"): RulesetContent {
  return {
    content,
    ruleGroup: group,
    rulePath: "",
    rulePathTyped: "",
    ruleType,
    updateInterval: 0,
  };
}

describe("convertRuleset", () => {
  it("passes through Surge rulesets", () => {
    expect(convertRuleset("DOMAIN,example.com", RulesetType.Surge)).toBe("DOMAIN,example.com");
  });

  it("converts a Clash domain payload", () => {
    const clash = [
      "payload:",
      "  - '.google.com'",
      "  - '+.example.com'",
      "  - 'plain.com'",
      "  - '+.keyword.*'",
    ].join("\n");
    const out = convertRuleset(clash, RulesetType.ClashDomain);
    expect(out).toContain("DOMAIN-SUFFIX,google.com");
    expect(out).toContain("DOMAIN-SUFFIX,example.com");
    expect(out).toContain("DOMAIN,plain.com");
    expect(out).toContain("DOMAIN-KEYWORD,keyword");
  });

  it("converts a Clash ipcidr payload", () => {
    const clash = ["payload:", "  - 1.2.3.0/24", "  - '2001:db8::/32'"].join("\n");
    const out = convertRuleset(clash, RulesetType.ClashIpCidr);
    expect(out).toContain("IP-CIDR,1.2.3.0/24");
    expect(out).toContain("IP-CIDR6,2001:db8::/32");
  });

  it("returns classical clash payload untouched", () => {
    const clash = ["payload:", "  - DOMAIN,example.com"].join("\n");
    expect(convertRuleset(clash, RulesetType.ClashClassical)).toContain("DOMAIN,example.com");
  });

  it("converts QuanX rules and strips the group", () => {
    const quanx = ["host,example.com,Proxy", "ip6-cidr,2001:db8::/32,Proxy"].join("\n");
    const out = convertRuleset(quanx, RulesetType.QuantumultX);
    expect(out).toContain("DOMAIN,example.com");
    expect(out).toContain("IP-CIDR6,2001:db8::/32");
  });

  it("preserves no-resolve in QuanX rules", () => {
    const out = convertRuleset("ip-cidr,1.2.3.0/24,Proxy,no-resolve", RulesetType.QuantumultX);
    expect(out).toContain("IP-CIDR,1.2.3.0/24,no-resolve");
  });
});

describe("transformRuleToCommon", () => {
  it("appends a group", () => {
    expect(transformRuleToCommon("DOMAIN,a.com", "G")).toBe("DOMAIN,a.com,G");
  });

  it("keeps the no-resolve flag", () => {
    expect(transformRuleToCommon("IP-CIDR,1.2.3.0/24,no-resolve", "G")).toBe(
      "IP-CIDR,1.2.3.0/24,G,no-resolve",
    );
  });

  it("drops extra flags unless noResolveOnly", () => {
    expect(transformRuleToCommon("IP-CIDR,1.2.3.0/24,foo", "G", true)).toBe("IP-CIDR,1.2.3.0/24,G");
  });
});

describe("rulesetToClashRules", () => {
  it("converts a Clash ruleset into grouped rules", () => {
    const clash = ["payload:", "  - '.google.com'", "  - '1.2.3.0/24'"].join("\n");
    const rules = rulesetToClashRules([ruleset(clash, RulesetType.ClashDomain, "G")]);
    expect(rules).toEqual(["DOMAIN-SUFFIX,google.com,G", "IP-CIDR,1.2.3.0/24,G"]);
  });

  it("handles []DIRECT literals", () => {
    const rules = rulesetToClashRules([ruleset("[]FINAL", RulesetType.Surge, "G")]);
    expect(rules).toEqual(["MATCH,G"]);
  });

  it("skips unsupported rule types", () => {
    const rules = rulesetToClashRules([ruleset("FOO,bar", RulesetType.Surge, "G")]);
    expect(rules).toEqual([]);
  });
});

describe("rulesetToSurgeRules", () => {
  it("produces a Rule section for modern Surge", () => {
    const result = rulesetToSurgeRules([ruleset("DOMAIN,example.com", RulesetType.Surge, "G")], 4);
    expect(result.section).toBe("Rule");
    expect(result.lines).toEqual(["DOMAIN,example.com,G"]);
  });

  it("produces filter_local for QuanX", () => {
    const result = rulesetToSurgeRules([ruleset("DOMAIN,example.com", RulesetType.Surge, "G")], -1);
    expect(result.section).toBe("filter_local");
    expect(result.lines).toEqual(["DOMAIN,example.com,G"]);
  });

  it("maps IP-CIDR6 to IP6-CIDR for QuanX", () => {
    const result = rulesetToSurgeRules(
      [ruleset("IP-CIDR6,2001:db8::/32", RulesetType.Surge, "G")],
      -1,
    );
    expect(result.lines).toEqual(["IP6-CIDR,2001:db8::/32,G"]);
  });

  it("drops IP-CIDR6 for Quan", () => {
    const result = rulesetToSurgeRules(
      [ruleset("IP-CIDR6,2001:db8::/32", RulesetType.Surge, "G")],
      -2,
    );
    expect(result.lines).toEqual([]);
  });
});

describe("engine ruleset integration", () => {
  it("injects Clash rules", () => {
    const node = (() => {
      const n = createProxy();
      ssConstruct(n, {
        group: "SSProvider",
        method: "aes-256-gcm",
        password: "pw",
        port: 8388,
        remark: "N",
        server: "1.2.3.4",
      });
      return n;
    })();
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const out = generate([node], {
      rulesets: [ruleset("payload:\n  - '.google.com'", RulesetType.ClashDomain, "G")],
      settings,
      target: TargetFormat.Clash,
    });
    expect(out).toContain("rules:");
    expect(out).toContain("DOMAIN-SUFFIX,google.com,G");
  });

  it("injects Surge rules", () => {
    const node = createProxy();
    ssConstruct(node, {
      group: "SSProvider",
      method: "aes-256-gcm",
      password: "pw",
      port: 8388,
      remark: "N",
      server: "1.2.3.4",
    });
    const out = generate([node], {
      rulesets: [ruleset("DOMAIN,example.com", RulesetType.Surge, "G")],
      target: TargetFormat.Surge,
    });
    expect(out).toContain("[Rule]");
    expect(out).toContain("DOMAIN,example.com,G");
  });
});
