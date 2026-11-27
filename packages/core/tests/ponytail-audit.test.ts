import { describe, expect, it } from "vitest";

import {
  applyMatcher,
  checkIgnore,
  createProxy,
  filterNodes,
  groupGenerate,
  matchRange,
  nodeRename,
  parseRequestSettings,
  processRemark,
  ssConstruct,
  toInt,
} from "../src/index";
import type { Proxy } from "../src/index";

function ssNode(remark: string): Proxy {
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

describe("finding 3: user regexes are rejected before compiling", () => {
  it("neutralizes nested-quantifier patterns at match time", () => {
    const node = ssNode("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    nodeRename(node, [{ match: "^(a+)+$", replace: "evil", script: "" }]);
    expect(node.remark).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(checkIgnore(node, [], ["^(a+)+$"])).toBe(true);
  });

  it("rejects over-long patterns at match time", () => {
    const node = ssNode("server1");
    nodeRename(node, [{ match: `a${"b".repeat(200)}`, replace: "x", script: "" }]);
    expect(node.remark).toBe("server1");
  });

  it("drops blocked rename/emoji/include patterns while parsing", () => {
    const evil = encodeURIComponent("^(a+)+$@x");
    expect(parseRequestSettings(`rename=${evil}`).rename).toEqual([]);
    expect(parseRequestSettings(`emoji=${evil}`).emoji).toEqual([]);
    expect(parseRequestSettings(`include=${evil}`).includeRemarks).toEqual([]);
    expect(parseRequestSettings(`name_regex=${evil}`).nameRegex).toEqual([]);
    const long = encodeURIComponent(`${"a".repeat(101)}@x`);
    expect(parseRequestSettings(`rename=${long}`).rename).toEqual([]);
  });

  it("keeps the exact-match blacklist and safe patterns", () => {
    const settings = parseRequestSettings("rename=(.*)*@x&rename=HK@us");
    expect(settings.rename.map((rule) => rule.match)).toEqual(["HK"]);
    const node = ssNode("HK node");
    expect(applyMatcher("!!TYPE=SS!!HK", node).matched).toBe(true);
  });
});

describe("finding 5: repeatable rename/emoji/include/exclude params", () => {
  it("collects every occurrence instead of last-wins", () => {
    const settings = parseRequestSettings(
      "rename=a@b&rename=c@d&emoji=hk%2CHKE&emoji=us%2CUSE" +
        "&include=HK&include=US%2CJP&exclude=ad&exclude=spam%2Ctest",
    );
    expect(settings.rename.map((rule) => rule.match)).toEqual(["a", "c"]);
    expect(settings.rename.map((rule) => rule.replace)).toEqual(["b", "d"]);
    expect(settings.emoji.map((rule) => rule.match)).toEqual(["hk", "us"]);
    expect(settings.includeRemarks).toEqual(["HK", "US", "JP"]);
    expect(settings.excludeRemarks).toEqual(["ad", "spam", "test"]);
  });

  it("applies repeated filters end to end", () => {
    const settings = parseRequestSettings("include=HK&include=US&exclude=ad");
    const nodes = [ssNode("HK node"), ssNode("US node"), ssNode("ad node"), ssNode("JP node")];
    filterNodes(nodes, settings.excludeRemarks, settings.includeRemarks, 0);
    expect(nodes.map((node) => node.remark)).toEqual(["HK node", "US node"]);
  });
});

describe("finding 7: bounded matcher caches", () => {
  it("evicts old entries without breaking lookups", () => {
    for (let i = 0; i < 600; i++) {
      expect(matchRange(`${i}`, i)).toBe(true);
    }
    expect(matchRange("0", 0)).toBe(true);
    expect(matchRange("1-5", 3)).toBe(true);
    const node = ssNode("aaaa");
    for (let i = 0; i < 600; i++) {
      nodeRename(node, [{ match: `zzz${i}xxx`, replace: "y", script: "" }]);
    }
    expect(node.remark).toBe("aaaa");
    nodeRename(node, [{ match: "aaaa", replace: "bbbb", script: "" }]);
    expect(node.remark).toBe("bbbb");
  });
});

describe("finding 8: O(1) dedup checks", () => {
  it("dedupes remarks without linear scans", () => {
    expect(processRemark("node", ["node", "node 2"])).toBe("node 3");
    const nodes = [ssNode("HK"), ssNode("HK"), ssNode("US")];
    const out: string[] = [];
    groupGenerate(".*", nodes, out, false);
    groupGenerate(".*", nodes, out, false);
    expect(out).toEqual(["HK", "US"]);
  });
});

describe("finding 10: toInt is anchored to the start", () => {
  it("returns 0 unless digits lead the string", () => {
    expect(toInt("abc123")).toBe(0);
    expect(toInt("123abc")).toBe(123);
    expect(toInt("  -42")).toBe(-42);
    expect(toInt("+7")).toBe(7);
    expect(toInt("")).toBe(0);
    expect(toInt("  ")).toBe(0);
  });
});
