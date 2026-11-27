import { describe, expect, it } from "vitest";

import type { Proxy } from "../src/index";
import {
  createExtraSettings,
  createProxy,
  dedupeNodes,
  isUnsafeRegexPattern,
  nodeRename,
  parseRequestSettings,
  parseSubscription,
  processRemark,
  sanitizeProxy,
  ssConstruct,
  toSurge,
} from "../src/index";

function ssNode(remark: string, server = "1.2.3.4"): Proxy {
  const node = createProxy();
  ssConstruct(node, {
    group: "SSProvider",
    method: "aes-256-gcm",
    password: "pw",
    port: 8388,
    remark,
    server,
  });
  return node;
}

describe("round-2 finding 1: nested-quantifier guard handles parens", () => {
  it("flags ((a+))+ which [^)]* guards miss", () => {
    expect(isUnsafeRegexPattern("((a+))+")).toBe(true);
    expect(isUnsafeRegexPattern("(a+)+")).toBe(true);
    expect(isUnsafeRegexPattern("(.*)*")).toBe(true);
    expect(isUnsafeRegexPattern("a++")).toBe(true);
  });

  it("allows safe patterns", () => {
    expect(isUnsafeRegexPattern("(ab)+")).toBe(false);
    expect(isUnsafeRegexPattern("node-\\d+")).toBe(false);
    expect(isUnsafeRegexPattern("(?:ab)+")).toBe(false);
    expect(isUnsafeRegexPattern("[+]*")).toBe(false);
    // Alternation inside a quantified group stays blocked (round-1
    // finding 2): `(a|b)+` is disjoint but indistinguishable syntactically
    // from the catastrophic `(a|aa)+$`.
    expect(isUnsafeRegexPattern("(a|b)+")).toBe(true);
    expect(isUnsafeRegexPattern("(a|aa)+$")).toBe(true);
  });

  it("blocks the evil rename without running the engine", () => {
    const node = ssNode("aaa");
    nodeRename(node, [{ match: "((a+))+", replace: "x", script: "" }]);
    expect(node.remark).toBe("aaa");
  });
});

describe("round-2 finding 2: dedupe keeps plugin-distinct nodes", () => {
  it("does not drop simple-obfs vs plain with same server/port", () => {
    const plain = ssNode("same");
    const obfs = ssNode("same");
    obfs.plugin = "simple-obfs";
    obfs.pluginOption = "obfs=http;obfs-host=example.com";
    const nodes = [plain, obfs];
    expect(dedupeNodes(nodes)).toBe(0);
    expect(nodes).toHaveLength(2);
  });

  it("still drops exact duplicates", () => {
    const nodes = [ssNode("same"), ssNode("same")];
    expect(dedupeNodes(nodes)).toBe(1);
    expect(nodes).toHaveLength(1);
  });
});

describe("round-2 finding 3: remark URLs do not split links", () => {
  it("keeps `my https://example.com` as one remark", () => {
    const nodes = parseSubscription("ss://aes-256-gcm:pw@1.1.1.1:8388#my https://example.com");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.remark).toBe("my https://example.com");
  });

  it("still splits space-separated links", () => {
    const nodes = parseSubscription(
      "ss://aes-256-gcm:pw@1.1.1.1:8388#a ss://aes-256-gcm:pw@2.2.2.2:8388#b",
    );
    expect(nodes).toHaveLength(2);
    expect(nodes.map((node) => node.remark)).toEqual(["a", "b"]);
  });
});

describe("round-2 finding 5: skipped nodes leave no remark gap", () => {
  it("pure lookup does not reserve names", () => {
    const remarks: string[] = [];
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    const first = processRemark("dup", remarks, true, seen, counts);
    expect(first).toBe("dup");
    remarks.push(first);
    seen.add(first);
    // Second node fails to build -> caller records nothing.
    expect(processRemark("dup", remarks, true, seen, counts)).toBe("dup 2");
    // Third node reuses the freed suffix instead of jumping to `dup 3`.
    expect(processRemark("dup", remarks, true, seen, counts)).toBe("dup 2");
  });

  it("generators do not skip suffixes for unsupported nodes", () => {
    const unknown = createProxy();
    unknown.remark = "dup";
    const out = toSurge([ssNode("dup"), unknown, ssNode("dup")], [], createExtraSettings(), {
      baseConf: "",
      nodeList: false,
      version: 5,
    });
    expect(out).toContain("dup 2");
    expect(out).not.toContain("dup 3");
  });
});

describe("round-2 finding 6: CSV fields fold separators", () => {
  it("sanitizes hostname/password/host/path", () => {
    const node = createProxy();
    ssConstruct(node, {
      group: "SSProvider",
      method: "aes-256-gcm",
      password: "a,b=c",
      port: 8388,
      remark: "n",
      server: "1.1.1.1, password=hacked",
    });
    node.host = "h,ost=x";
    node.path = "/p,ath=x";
    sanitizeProxy(node);
    for (const field of [node.hostname, node.password, node.host, node.path]) {
      expect(field).not.toContain(",");
      expect(field).not.toContain("=");
    }
  });

  it("surge output keeps one host column", () => {
    const out = toSurge([ssNode("n", "1.1.1.1, password=hacked")], [], createExtraSettings(), {
      baseConf: "",
      nodeList: false,
      version: 5,
    });
    expect(out).not.toContain("password=hacked");
  });
});

describe("round-2 finding 9: caps count raw entries", () => {
  it("rejects 51 blocked include entries", () => {
    const query = Array.from({ length: 51 }, () => "include=(.*)*").join("&");
    let status: unknown;
    try {
      parseRequestSettings(query);
    } catch (error) {
      status = (error as { statusCode?: unknown }).statusCode;
    }
    expect(status).toBe(400);
  });

  it("rejects 60 blocked rename rules", () => {
    const query = Array.from({ length: 60 }, () => "rename=((a+))+@x").join("&");
    let status: unknown;
    try {
      parseRequestSettings(query);
    } catch (error) {
      status = (error as { statusCode?: unknown }).statusCode;
    }
    expect(status).toBe(400);
  });
});

describe("round-2 finding 13: per-base counters", () => {
  it("dedupes 500 repeats with unique suffixes", () => {
    const remarks: string[] = [];
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    const results: string[] = [];
    for (let i = 0; i < 500; i += 1) {
      const name = processRemark("dup", remarks, true, seen, counts);
      results.push(name);
      remarks.push(name);
      seen.add(name);
    }
    expect(new Set(results).size).toBe(500);
    expect(results[499]).toBe("dup 500");
  });
});
