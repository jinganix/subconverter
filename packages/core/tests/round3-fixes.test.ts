import { describe, expect, it } from "vitest";

import type { Proxy } from "../src/index";
import {
  createProxy,
  dedupeNodes,
  isUnsafeRegexPattern,
  processRemark,
  sanitizeProxy,
  socksConstruct,
  ssConstruct,
  ssrConstruct,
  vmessConstruct,
  wireGuardConstruct,
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

describe("round-3 must 1: sequential quantified atoms are budgeted", () => {
  it("blocks 25x a* partition explosion", () => {
    expect(isUnsafeRegexPattern("a*".repeat(25))).toBe(true);
  });

  it("allows up to 2 quantified atoms, blocks the 3rd (a*a*a* is O(n^3))", () => {
    expect(isUnsafeRegexPattern("a*".repeat(2))).toBe(false);
    expect(isUnsafeRegexPattern("a*".repeat(3))).toBe(true);
    expect(isUnsafeRegexPattern("a*a*a*b")).toBe(true);
    expect(isUnsafeRegexPattern("a?a?")).toBe(false);
    expect(isUnsafeRegexPattern("a?a?a?")).toBe(true);
  });

  it("counts group quantifiers and { braces", () => {
    expect(isUnsafeRegexPattern("(ab)".repeat(6) + "+".repeat(0))).toBe(false);
    // Six quantified groups exceed the budget.
    expect(isUnsafeRegexPattern("(a)(b)(c)(d)(e)(f)".replaceAll(")(", ")*(") + "*")).toBe(true);
    expect(isUnsafeRegexPattern("a{2}".repeat(3))).toBe(true);
    expect(isUnsafeRegexPattern("a{2}".repeat(2))).toBe(false);
  });

  it("keeps common filters working", () => {
    expect(isUnsafeRegexPattern("香港|HK")).toBe(false);
    expect(isUnsafeRegexPattern("(ab)+")).toBe(false);
    expect(isUnsafeRegexPattern("(?:ab)+")).toBe(false);
    expect(isUnsafeRegexPattern("node-\\d+")).toBe(false);
    expect(isUnsafeRegexPattern("[+]*")).toBe(false);
  });

  it("ignores escaped/classed quantifiers and (?: ? syntax", () => {
    expect(isUnsafeRegexPattern("\\*\\*\\*\\*\\*\\*")).toBe(false);
    expect(isUnsafeRegexPattern("[*][*][*][*][*][*]")).toBe(false);
    expect(isUnsafeRegexPattern("(?:ab)+")).toBe(false);
  });
});

describe("round-3 must 2: dedupe keys cover transport/identity fields", () => {
  it("keeps wireguard pk1 vs pk2 on the same ip/port", () => {
    const base = {
      group: "WireGuardProvider",
      port: 2408,
      remark: "wg",
      server: "10.10.10.10",
    };
    const a = createProxy();
    wireGuardConstruct(a, { ...base, privateKey: "priv", publicKey: "pk1", selfIp: "10.0.0.1" });
    const b = createProxy();
    wireGuardConstruct(b, { ...base, privateKey: "priv", publicKey: "pk2", selfIp: "10.0.0.1" });
    expect(dedupeNodes([a, b])).toBe(0);
  });

  it("keeps nodes differing only in privateKey/selfIp", () => {
    const mk = (privateKey: string, selfIp: string): Proxy => {
      const n = createProxy();
      wireGuardConstruct(n, {
        group: "G",
        port: 1,
        privateKey,
        publicKey: "pub",
        remark: "wg",
        selfIp,
        server: "s",
      });
      return n;
    };
    expect(dedupeNodes([mk("k1", "10.0.0.1"), mk("k2", "10.0.0.1")])).toBe(0);
    expect(dedupeNodes([mk("k", "10.0.0.1"), mk("k", "10.0.0.2")])).toBe(0);
  });

  it("keeps ssr nodes differing in obfsParam/protocolParam", () => {
    const mk = (obfsParam: string, protocolParam: string): Proxy => {
      const n = createProxy();
      ssrConstruct(n, {
        group: "G",
        method: "aes-128-cfb",
        obfs: "http_simple",
        obfsParam,
        password: "pw",
        port: 8388,
        protocol: "auth_sha1_v4",
        protocolParam,
        remark: "ssr",
        server: "s",
      });
      return n;
    };
    expect(dedupeNodes([mk("op1", "pp"), mk("op2", "pp")])).toBe(0);
    expect(dedupeNodes([mk("op", "pp1"), mk("op", "pp2")])).toBe(0);
  });

  it("keeps vmess/vless/tuic identity fields distinct", () => {
    const uid = "00000000-0000-0000-0000-000000000000";
    const vmA = createProxy();
    vmessConstruct(vmA, {
      add: "s",
      aid: "0",
      group: "G",
      id: uid,
      net: "ws",
      path: "/a",
      port: 443,
      remark: "v",
      tls: "tls",
    });
    vmA.edge = "e1";
    const vmB = createProxy();
    vmessConstruct(vmB, {
      add: "s",
      aid: "0",
      group: "G",
      id: uid,
      net: "ws",
      path: "/a",
      port: 443,
      remark: "v",
      tls: "tls",
    });
    vmB.edge = "e2";
    expect(dedupeNodes([vmA, vmB])).toBe(0);
  });

  it("covers every newly keyed field", () => {
    const stringFields = [
      "obfsParam",
      "protocolParam",
      "edge",
      "publicKey",
      "shortId",
      "privateKey",
      "selfIp",
      "ca",
      "caStr",
      "up",
      "down",
      "congestionControl",
      "fakeType",
      "quicSecure",
      "quicSecret",
    ] as const;
    for (const field of stringFields) {
      const a = ssNode("same", "9.9.9.9");
      const b = ssNode("same", "9.9.9.9");
      (a as unknown as Record<string, unknown>)[field] = "v1";
      (b as unknown as Record<string, unknown>)[field] = "v2";
      expect(dedupeNodes([a, b]), field).toBe(0);
    }
    const numberFields = ["hopInterval", "cwnd", "snellVersion"] as const;
    for (const field of numberFields) {
      const a = ssNode("same", "9.9.9.9");
      const b = ssNode("same", "9.9.9.9");
      (a as unknown as Record<string, unknown>)[field] = 1;
      (b as unknown as Record<string, unknown>)[field] = 2;
      expect(dedupeNodes([a, b]), field).toBe(0);
    }
  });

  it("still drops exact duplicates", () => {
    expect(dedupeNodes([ssNode("same"), ssNode("same")])).toBe(1);
  });
});

describe("round-3 must 3: sanitizeProxy folds CSV separators for all strings", () => {
  it("neutralizes socks username CSV injection", () => {
    const node = createProxy();
    socksConstruct(node, {
      group: "SocksProvider",
      password: "pw",
      port: 1080,
      remark: "S",
      server: "1.2.3.4",
      username: "a, password=hacked",
    });
    sanitizeProxy(node);
    expect(node.username).not.toContain(",");
    expect(node.username).not.toContain("=");
    expect(node.username).toBe("a  password hacked");
  });

  it("folds separators in encryptMethod/plugin/obfs/protocol/sni/serverName/edge", () => {
    const node = ssNode("n");
    node.encryptMethod = "aes,=x";
    node.plugin = "p,=x";
    node.pluginOption = "o,=x";
    node.obfs = "o,=x";
    node.protocol = "p,=x";
    node.sni = "s,=x";
    node.serverName = "s,=x";
    node.edge = "e,=x";
    node.username = "u,=x";
    sanitizeProxy(node);
    for (const field of [
      node.encryptMethod,
      node.plugin,
      node.pluginOption,
      node.obfs,
      node.protocol,
      node.sni,
      node.serverName,
      node.edge,
      node.username,
    ]) {
      expect(field).not.toContain(",");
      expect(field).not.toContain("=");
    }
  });

  it("leaves remark for processRemark (no double-sanitize)", () => {
    const node = ssNode("a,b=c");
    sanitizeProxy(node);
    // sanitizeProxy only strips line breaks from remarks.
    expect(node.remark).toBe("a,b=c");
    // processRemark still owns `=`→`-` and `,`-quoting.
    const out = processRemark(node.remark, [], true);
    expect(out).toBe('"a,b-c"');
  });
});
