import { describe, expect, it } from "vitest";

import {
  ProxyGroupType,
  TargetFormat,
  parseCustomProxyGroup,
  parseExternalConfig,
  parseGroupTimes,
  parseRegexMatch,
  parseRequestSettings,
  parseRulesetConfig,
} from "../src/index";

describe("parseGroupTimes", () => {
  it("parses interval, timeout and tolerance", () => {
    expect(parseGroupTimes("300,,50")).toEqual({ interval: 300, timeout: 0, tolerance: 50 });
    expect(parseGroupTimes("60,5")).toEqual({ interval: 60, timeout: 5, tolerance: 0 });
  });
});

describe("parseCustomProxyGroup", () => {
  it("parses a select group", () => {
    const group = parseCustomProxyGroup("🚀 节点选择`select`[]DIRECT`.*");
    expect(group?.name).toBe("🚀 节点选择");
    expect(group?.type).toBe(ProxyGroupType.Select);
    expect(group?.proxies).toEqual(["[]DIRECT", ".*"]);
  });

  it("parses a url-test group with url and times", () => {
    const group = parseCustomProxyGroup(
      "auto`url-test`.*`http://www.gstatic.com/generate_204`300,,50",
    );
    expect(group?.type).toBe(ProxyGroupType.URLTest);
    expect(group?.url).toBe("http://www.gstatic.com/generate_204");
    expect(group?.interval).toBe(300);
    expect(group?.tolerance).toBe(50);
    expect(group?.proxies).toEqual([".*"]);
  });

  it("parses providers", () => {
    const group = parseCustomProxyGroup("g`select`!!PROVIDER=p1,p2");
    expect(group?.usingProvider).toEqual(["p1", "p2"]);
    expect(group?.proxies).toEqual([]);
  });

  it("rejects unknown types and short definitions", () => {
    expect(parseCustomProxyGroup("g`bogus`.*")).toBeUndefined();
    expect(parseCustomProxyGroup("g`select")).toBeUndefined();
    expect(parseCustomProxyGroup("auto`url-test`.*")).toBeUndefined();
  });
});

describe("parseRulesetConfig", () => {
  it("parses group,url", () => {
    expect(parseRulesetConfig("G,https://example.com/list")).toEqual({
      group: "G",
      interval: 86400,
      url: "https://example.com/list",
    });
  });

  it("parses group,url,interval", () => {
    expect(parseRulesetConfig("G,https://example.com/list,3600")).toEqual({
      group: "G",
      interval: 3600,
      url: "https://example.com/list",
    });
  });

  it("parses inline [] rules", () => {
    expect(parseRulesetConfig("G,[]FINAL")).toEqual({
      group: "G",
      interval: 86400,
      url: "[]FINAL",
    });
  });

  it("rejects malformed input", () => {
    expect(parseRulesetConfig("no-comma")).toBeUndefined();
  });
});

describe("parseRegexMatch", () => {
  it("splits on the delimiter", () => {
    expect(parseRegexMatch("foo@bar", "@")).toEqual({ match: "foo", replace: "bar", script: "" });
  });

  it("supports scripts", () => {
    expect(parseRegexMatch("script:path.js", "@")).toEqual({
      match: "",
      replace: "",
      script: "path.js",
    });
  });
});

describe("parseExternalConfig", () => {
  it("parses a [custom] section", () => {
    const config = parseExternalConfig(
      [
        "[custom]",
        "ruleset=G,https://example.com/list,3600",
        "custom_proxy_group=🚀 节点选择`select`[]DIRECT`.*",
        "rename=(.*)@\\1",
        "emoji=香港,🇭🇰",
        "include_remarks=HK",
        "exclude_remarks=广告",
        "add_emoji=true",
        "remove_old_emoji=true",
        "enable_rule_generator=true",
        "overwrite_original_rules=false",
        "clash_rule_base=base/clash.yml",
      ].join("\n"),
    );
    expect(config.rulesets).toHaveLength(1);
    expect(config.groups).toHaveLength(1);
    expect(config.groups[0]?.name).toBe("🚀 节点选择");
    expect(config.rename[0]?.match).toBe("(.*)");
    expect(config.emoji[0]?.replace).toBe("🇭🇰");
    expect(config.includeRemarks).toEqual(["HK"]);
    expect(config.excludeRemarks).toEqual(["广告"]);
    expect(config.addEmoji).toBe(true);
    expect(config.removeEmoji).toBe(true);
    expect(config.overwriteOriginalRules).toBe(false);
    expect(config.baseFiles["clash_rule_base"]).toBe("base/clash.yml");
  });

  it("falls back to items without a section", () => {
    const config = parseExternalConfig("ruleset=G,[]FINAL");
    expect(config.rulesets).toHaveLength(1);
  });
});

describe("parseRequestSettings", () => {
  it("parses core flags", () => {
    const settings = parseRequestSettings(
      "target=clash&url=https%3A%2F%2Fx&list=true&add_emoji=true&udp=true&rename=a@b&emoji=hk%2C🇭🇰&include=HK,US",
    );
    expect(settings.target).toBe(TargetFormat.Clash);
    expect(settings.url).toBe("https://x");
    expect(settings.list).toBe(true);
    expect(settings.nodeList).toBe(true);
    expect(settings.addEmoji).toBe(true);
    expect(settings.udp).toBe(true);
    expect(settings.rename[0]).toEqual({ match: "a", replace: "b", script: "" });
    expect(settings.emoji[0]).toEqual({ match: "hk", replace: "🇭🇰", script: "" });
    expect(settings.includeRemarks).toEqual(["HK", "US"]);
  });

  it("defaults unknown targets to auto", () => {
    expect(parseRequestSettings("target=bogus").target).toBe(TargetFormat.Auto);
  });

  it("treats underscore and hyphen keys as equivalent", () => {
    expect(parseRequestSettings("add-emoji=true").addEmoji).toBe(true);
    expect(parseRequestSettings("add_emoji=true").addEmoji).toBe(true);
    expect(parseRequestSettings("filter-deprecated=true").filterDeprecated).toBe(true);
    expect(parseRequestSettings("append-type=true").appendType).toBe(true);
    expect(parseRequestSettings("new-field-name=false").newFieldName).toBe(false);
    expect(parseRequestSettings("ADD_EMOJI=TRUE").addEmoji).toBe(true);
  });

  it("parses sort and dedupe flags", () => {
    expect(parseRequestSettings("sort=true").sort).toBe(true);
    expect(parseRequestSettings("sort=1").sort).toBe(true);
    expect(parseRequestSettings("sort=false").sort).toBe(false);
    expect(parseRequestSettings("sort_flag=true").sort).toBe(true);
    expect(parseRequestSettings("sort-flag=1").sort).toBe(true);
    expect(parseRequestSettings("dedupe=true").dedupe).toBe(true);
    expect(parseRequestSettings("deduplicate=1").dedupe).toBe(true);
    expect(parseRequestSettings("dedupe=false").dedupe).toBe(false);
    expect(parseRequestSettings("target=clash").sort).toBe(false);
    expect(parseRequestSettings("target=clash").dedupe).toBe(false);
  });
});
