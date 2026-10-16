import { describe, expect, it } from "vitest";

import {
  base64Decode,
  base64Encode,
  countOccurrences,
  findSection,
  fnv1a64Hex,
  getSectionItems,
  getUrlArg,
  isBlank,
  isIp,
  isIpv4,
  isIpv6,
  parseIni,
  parseRawIni,
  parseTriBool,
  regMatch,
  regReplace,
  renderRawIni,
  replaceAllDistinct,
  setRawSection,
  split,
  splitUrl,
  startsWith,
  strFind,
  stripScheme,
  toBool,
  toInt,
  triBoolOr,
  trim,
  trimLowerCase,
  tryBase64Decode,
  urlDecode,
  urlEncode,
  urlSafeBase64Decode,
  urlSafeBase64Encode,
  utf8Decode,
  utf8Encode,
} from "../src/index";

describe("base64", () => {
  it("round-trips ascii and unicode", () => {
    expect(base64Decode(base64Encode("hello"))).toBe("hello");
    expect(base64Decode(base64Encode("你好，世界"))).toBe("你好，世界");
  });

  it("produces url-safe output without padding", () => {
    const encoded = urlSafeBase64Encode("a?b/c");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(urlSafeBase64Decode(encoded)).toBe("a?b/c");
  });

  it("tolerates whitespace and missing padding", () => {
    expect(base64Decode(" aGVs bG8 ")).toBe("hello");
  });

  it("tryBase64Decode falls back to the raw input", () => {
    expect(tryBase64Decode("hello world!")).toBe("hello world!");
    expect(tryBase64Decode("")).toBe("");
    expect(tryBase64Decode("aGVsbG8=")).toBe("hello");
  });

  it("encodes and decodes utf8 bytes", () => {
    expect(utf8Decode(utf8Encode("hi"))).toBe("hi");
  });
});

describe("string utils", () => {
  it("trims and lowercases", () => {
    expect(trim("  x  ")).toBe("x");
    expect(trimLowerCase("  AbC ")).toBe("abc");
  });

  it("parses integers", () => {
    expect(toInt("123abc")).toBe(123);
    expect(toInt(12.9)).toBe(12);
    expect(toInt(null)).toBe(0);
    expect(toInt("-5")).toBe(-5);
  });

  it("parses booleans", () => {
    expect(toBool("true")).toBe(true);
    expect(toBool("1")).toBe(true);
    expect(toBool("no")).toBe(false);
    expect(toBool(null)).toBe(false);
  });

  it("detects substrings and prefixes", () => {
    expect(strFind("hello", "ell")).toBe(true);
    expect(startsWith("hello", "he")).toBe(true);
    expect(startsWith("hello", "lo")).toBe(false);
  });

  it("counts occurrences", () => {
    expect(countOccurrences("aaa", "a")).toBe(3);
    expect(countOccurrences("abc", "")).toBe(0);
  });

  it("splits with optional empty removal", () => {
    expect(split("a,,b", ",", true)).toEqual(["a", "b"]);
    expect(split("a,b", ",")).toEqual(["a", "b"]);
  });

  it("replaces and matches regexes", () => {
    expect(regReplace("a.b.c", "\\.", "-")).toBe("a-b-c");
    expect(regMatch("hello", "h.*o")).toBe(true);
    expect(replaceAllDistinct("aaa", "a", "b")).toBe("bbb");
    expect(replaceAllDistinct("aaa", "", "b")).toBe("aaa");
  });

  it("classifies ip literals", () => {
    expect(isIpv4("1.2.3.4")).toBe(true);
    expect(isIpv4("1.2.3")).toBe(false);
    expect(isIpv4("1.2.3.999")).toBe(false);
    expect(isIpv6("2001:db8::1")).toBe(true);
    expect(isIp("1.2.3.4")).toBe(true);
    expect(isIp("example.com")).toBe(false);
  });

  it("detects blank strings", () => {
    expect(isBlank("  ")).toBe(true);
    expect(isBlank("x")).toBe(false);
    expect(isBlank(undefined)).toBe(true);
  });
});

describe("tribool", () => {
  it("parses loose values", () => {
    expect(parseTriBool("true")).toBe(true);
    expect(parseTriBool("0")).toBe(false);
    expect(parseTriBool("unknown")).toBeUndefined();
    expect(parseTriBool("")).toBeUndefined();
    expect(parseTriBool(null)).toBeUndefined();
  });

  it("applies fallbacks", () => {
    expect(triBoolOr(undefined, true)).toBe(true);
    expect(triBoolOr(false, true)).toBe(false);
  });
});

describe("url utils", () => {
  it("decodes malformed percent sequences", () => {
    expect(urlDecode("a%20b")).toBe("a b");
    expect(urlDecode("%E4%BD%A0")).toBe("你");
    expect(urlDecode("%ZZ")).toBe("%ZZ");
  });

  it("encodes components", () => {
    expect(urlEncode("a b")).toBe("a%20b");
    expect(urlEncode("!")).toBe("%21");
  });

  it("reads query arguments (last wins)", () => {
    expect(getUrlArg("a=1&b=2&a=3", "a")).toBe("3");
    expect(getUrlArg("?foo=bar", "foo")).toBe("bar");
    expect(getUrlArg("", "foo")).toBe("");
    expect(getUrlArg("flag", "flag")).toBe("");
  });

  it("splits urls and strips schemes", () => {
    expect(splitUrl("https://x/y?a=1#h")).toEqual({ base: "https://x/y", query: "a=1" });
    expect(splitUrl("no-query")).toEqual({ base: "no-query", query: "" });
    expect(stripScheme("ss://abc")).toBe("abc");
    expect(stripScheme("abc")).toBe("abc");
  });
});

describe("hash", () => {
  it("computes deterministic fnv1a64", () => {
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("a")).toBe(fnv1a64Hex("a"));
    expect(fnv1a64Hex("a")).not.toBe(fnv1a64Hex("b"));
  });
});

describe("ini parsing", () => {
  const content = ["[General]", "a = 1", "b = 2", "[Proxy]", "x = 1", "[Proxy]", "y = 2"].join(
    "\n",
  );

  it("parses sections and duplicate sections", () => {
    const doc = parseIni(content);
    expect(doc.sections).toHaveLength(3);
    expect(findSection(doc, "General")?.items).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(getSectionItems(doc, "Proxy")).toEqual([
      ["x", "1"],
      ["y", "2"],
    ]);
  });

  it("keeps isolated items under the configured section", () => {
    const doc = parseIni("isolated = yes\n[s]");
    expect(doc.isolated).toEqual([["isolated", "yes"]]);
    const doc2 = parseIni("isolated = yes\n[s]", { isolatedSection: "main" });
    expect(findSection(doc2, "main")?.items).toEqual([["isolated", "yes"]]);
  });

  it("drops empty values unless configured to keep them", () => {
    expect(parseIni("[s]\na =").sections[0]?.items).toEqual([]);
    expect(parseIni("[s]\na =", { keepEmptyValues: true }).sections[0]?.items).toEqual([["a", ""]]);
  });

  it("parses raw sections preserving order", () => {
    const sections = parseRawIni(content);
    expect(sections.map((s) => s.name)).toEqual(["General", "Proxy", "Proxy"]);
  });

  it("renders and updates raw sections", () => {
    const sections = parseRawIni(content);
    setRawSection(sections, "Proxy", ["z = 9"]);
    setRawSection(sections, "New", ["n = 1"]);
    const rendered = renderRawIni(sections);
    expect(rendered).toContain("[New]");
    expect(rendered).toContain("z = 9");
    expect(rendered).not.toContain("x = 1");
  });
});
