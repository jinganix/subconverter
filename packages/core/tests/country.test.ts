import { describe, expect, it } from "vitest";

import { addCountryPrefix, preprocessNodes } from "../src/generator/nodes";
import { parseExternalConfig } from "../src/settings/config";
import { parseRequestSettings } from "../src/settings/request-params";
import { createProxy, ProxyType } from "../src/types/proxy";
import {
  formatCountryRemark,
  hasRegionName,
  isRegionCode,
  regionDisplayName,
  regionFlag,
} from "../src/utils/country";

function node(remark: string, hostname = "1.2.3.4"): ReturnType<typeof createProxy> {
  const proxy = createProxy();
  proxy.type = ProxyType.Trojan;
  proxy.hostname = hostname;
  proxy.port = 443;
  proxy.remark = remark;
  return proxy;
}

describe("region helpers", () => {
  it("formats names with compact Chinese labels", () => {
    expect(regionDisplayName("US")).toBe("美国");
    expect(regionDisplayName("us")).toBe("美国");
    expect(regionDisplayName("HK")).toBe("香港");
    expect(regionDisplayName("MO")).toBe("澳门");
    expect(regionDisplayName("TW")).toBe("台湾");
    expect(regionDisplayName("GB")).toBe("英国");
  });

  it("supports other locales and invalid input", () => {
    expect(regionDisplayName("US", "en")).toBe("United States");
    expect(regionDisplayName("not-a-code")).toBe("not-a-code");
  });

  it("derives flag emoji and validates codes", () => {
    expect(regionFlag("US")).toBe("🇺🇸");
    expect(regionFlag("hk")).toBe("🇭🇰");
    expect(regionFlag("1A")).toBe("");
    expect(isRegionCode("JP")).toBe(true);
    expect(isRegionCode("ZZ")).toBe(false);
    expect(isRegionCode("J")).toBe(false);
  });

  it("prefixes a remark with the country name", () => {
    expect(formatCountryRemark("server1", "US")).toBe("美国-server1");
    expect(formatCountryRemark("  server1  ", "HK")).toBe("香港-server1");
    expect(formatCountryRemark("", "JP")).toBe("日本");
    expect(formatCountryRemark("node", "US", "en")).toBe("United States-node");
  });
});

describe("hasRegionName", () => {
  it.each([
    "美国-server1",
    "香港 01",
    "🇭🇰 HK",
    "US-01",
    "us01",
    "US01",
    "JP",
    "Hong Kong 01",
    "hong kong 01",
    "Singapore",
    "United States",
    "UK London",
    "Holland",
    "Macau",
    "日本01",
  ])("detects a region in %s", (remark) => {
    expect(hasRegionName(remark)).toBe(true);
  });

  it.each(["", "server1", "Node A", "in-01", "no1", "Tokyo", "Netflix", "Auto", "Direct", "IEPL"])(
    "does not detect a region in %s",
    (remark) => {
      expect(hasRegionName(remark)).toBe(false);
    },
  );
});

describe("addCountryPrefix", () => {
  it("prefixes names without a region", () => {
    const proxy = node("server1");
    expect(addCountryPrefix(proxy, () => "US")).toBe("美国-server1");
  });

  it("keeps names that already mention a region", () => {
    const proxy = node("香港-server1");
    expect(addCountryPrefix(proxy, () => "US")).toBe("香港-server1");
  });

  it("keeps names when the country is unknown", () => {
    const proxy = node("server1");
    expect(addCountryPrefix(proxy, () => undefined)).toBe("server1");
    expect(addCountryPrefix(proxy, () => "")).toBe("server1");
  });

  it("uses the requested locale", () => {
    const proxy = node("server1");
    expect(addCountryPrefix(proxy, () => "US", "en")).toBe("United States-server1");
  });
});

describe("preprocessNodes autoCountry", () => {
  it("applies rename first, then the country prefix", () => {
    const nodes = [node("JP01"), node("server2", "5.6.7.8")];
    preprocessNodes(nodes, {
      addEmoji: false,
      autoCountry: true,
      countryResolver: (proxy) => (proxy.hostname === "5.6.7.8" ? "HK" : "US"),
      emojiArray: [],
      removeEmoji: false,
      renameArray: [{ match: "JP01", replace: "Tokyo", script: "" }],
      sortFlag: false,
    });
    expect(nodes.map((proxy) => proxy.remark)).toEqual(["美国-Tokyo", "香港-server2"]);
  });

  it("does nothing when disabled or without a resolver", () => {
    const nodes = [node("server1")];
    preprocessNodes(nodes, {
      addEmoji: false,
      emojiArray: [],
      removeEmoji: false,
      renameArray: [],
      sortFlag: false,
    });
    preprocessNodes(nodes, {
      addEmoji: false,
      autoCountry: true,
      emojiArray: [],
      removeEmoji: false,
      renameArray: [],
      sortFlag: false,
    });
    expect(nodes[0]?.remark).toBe("server1");
  });
});

describe("edge cases", () => {
  it("falls back to the code for an unsupported locale", () => {
    expect(regionDisplayName("US", "!!!")).toBe("US");
  });

  it("skips empty tokens when scanning names", () => {
    expect(hasRegionName(" - US - ")).toBe(true);
    expect(hasRegionName("---")).toBe(false);
  });

  it("returns an empty remark unchanged when the code is invalid", () => {
    expect(formatCountryRemark("", "")).toBe("");
  });
});

describe("settings plumbing", () => {
  it("parses auto_country from the query", () => {
    expect(parseRequestSettings("auto_country=true").autoCountry).toBe(true);
    expect(parseRequestSettings("auto-country=1").autoCountry).toBe(true);
    expect(parseRequestSettings("auto_country=false").autoCountry).toBe(false);
    expect(parseRequestSettings("").autoCountry).toBe(false);
  });

  it("parses auto_country from an external config", () => {
    expect(parseExternalConfig("[custom]\nauto_country=true").autoCountry).toBe(true);
    expect(parseExternalConfig("[custom]\ncountry=false").autoCountry).toBe(false);
  });
});
