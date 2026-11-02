import { describe, expect, it } from "vitest";

import { addCountryPrefix, filterNodesByCountry, preprocessNodes } from "../src/generator/nodes";
import { parseExternalConfig } from "../src/settings/config";
import { parseRequestSettings } from "../src/settings/request-params";
import { createProxy, ProxyType } from "../src/types/proxy";
import {
  formatCountryRemark,
  hasRegionName,
  isRegionCode,
  normalizeCountryCode,
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
  it("prefixes remarks with the uppercase ISO code", () => {
    expect(formatCountryRemark("server1", "US")).toBe("US-server1");
    expect(formatCountryRemark("server1", "us")).toBe("US-server1");
    expect(formatCountryRemark("  server1  ", "HK")).toBe("HK-server1");
    expect(formatCountryRemark("", "JP")).toBe("JP");
  });

  it("leaves the remark unchanged for invalid codes", () => {
    expect(formatCountryRemark("server1", "")).toBe("server1");
    expect(formatCountryRemark("server1", "USA")).toBe("server1");
    expect(formatCountryRemark("server1", "ZZ")).toBe("server1");
    expect(formatCountryRemark("", "")).toBe("");
  });

  it("validates codes", () => {
    expect(isRegionCode("JP")).toBe(true);
    expect(isRegionCode("us")).toBe(true);
    expect(isRegionCode("ZZ")).toBe(false);
    expect(isRegionCode("J")).toBe(false);
  });

  it("normalizes country input", () => {
    expect(normalizeCountryCode("us")).toBe("US");
    expect(normalizeCountryCode(" NL ")).toBe("NL");
    expect(normalizeCountryCode("USA")).toBeUndefined();
    expect(normalizeCountryCode("")).toBeUndefined();
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
    expect(addCountryPrefix(proxy, () => "US")).toBe("US-server1");
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
});

describe("filterNodesByCountry", () => {
  const resolve = (proxy: ReturnType<typeof createProxy>): string | undefined =>
    proxy.hostname === "1.2.3.4" ? "US" : proxy.hostname === "5.6.7.8" ? "NL" : undefined;

  it("keeps only included countries, dropping unknown ones", () => {
    const nodes = [node("a", "1.2.3.4"), node("b", "5.6.7.8"), node("c", "9.9.9.9")];
    filterNodesByCountry(nodes, resolve, ["us"], []);
    expect(nodes.map((proxy) => proxy.remark)).toEqual(["a"]);
  });

  it("drops excluded countries but keeps unknown ones", () => {
    const nodes = [node("a", "1.2.3.4"), node("b", "5.6.7.8"), node("c", "9.9.9.9")];
    filterNodesByCountry(nodes, resolve, [], ["NL"]);
    expect(nodes.map((proxy) => proxy.remark)).toEqual(["a", "c"]);
  });

  it("ignores invalid codes", () => {
    const nodes = [node("a", "1.2.3.4")];
    filterNodesByCountry(nodes, resolve, ["USA"], ["XX"]);
    expect(nodes).toHaveLength(1);
  });

  it("does nothing without filters", () => {
    const nodes = [node("a", "1.2.3.4")];
    filterNodesByCountry(nodes, resolve, [], []);
    expect(nodes).toHaveLength(1);
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
    expect(nodes.map((proxy) => proxy.remark)).toEqual(["US-Tokyo", "HK-server2"]);
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

  it("filters by country and remark after the prefix", () => {
    const nodes = [node("server1", "1.2.3.4"), node("server2", "5.6.7.8")];
    const resolve = (proxy: ReturnType<typeof createProxy>): string | undefined =>
      proxy.hostname === "1.2.3.4" ? "US" : "NL";
    preprocessNodes(nodes, {
      addEmoji: false,
      autoCountry: true,
      countryResolver: resolve,
      emojiArray: [],
      excludeCountries: ["NL"],
      removeEmoji: false,
      renameArray: [],
      sortFlag: false,
    });
    expect(nodes.map((proxy) => proxy.remark)).toEqual(["US-server1"]);
  });

  it("filters by remark include/exclude and renumbers", () => {
    const nodes = [node("HK-1"), node("US-1"), node("US-2")];
    preprocessNodes(nodes, {
      addEmoji: false,
      emojiArray: [],
      excludeRemarks: ["US-2"],
      includeRemarks: ["US"],
      removeEmoji: false,
      renameArray: [],
      sortFlag: false,
    });
    expect(nodes.map((proxy) => proxy.remark)).toEqual(["US-1"]);
    expect(nodes.map((proxy) => proxy.id)).toEqual([0]);
  });
});

describe("settings plumbing", () => {
  it("parses auto_country from the query", () => {
    expect(parseRequestSettings("auto_country=true").autoCountry).toBe(true);
    expect(parseRequestSettings("auto-country=1").autoCountry).toBe(true);
    expect(parseRequestSettings("auto_country=false").autoCountry).toBe(false);
    expect(parseRequestSettings("").autoCountry).toBe(false);
  });

  it("parses country filters from the query", () => {
    const settings = parseRequestSettings("include_country=us,JP&exclude_country=nl");
    expect(settings.includeCountries).toEqual(["US", "JP"]);
    expect(settings.excludeCountries).toEqual(["NL"]);
    expect(parseRequestSettings("").includeCountries).toEqual([]);
    expect(parseRequestSettings("").excludeCountries).toEqual([]);
  });

  it("parses auto_country from an external config", () => {
    expect(parseExternalConfig("[custom]\nauto_country=true").autoCountry).toBe(true);
    expect(parseExternalConfig("[custom]\ncountry=false").autoCountry).toBe(false);
  });

  it("parses country filters from an external config", () => {
    const config = parseExternalConfig("[custom]\ninclude_country=US, JP\nexclude_country=nl");
    expect(config.includeCountries).toEqual(["US", "JP"]);
    expect(config.excludeCountries).toEqual(["NL"]);
  });
});
