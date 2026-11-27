import { describe, expect, it } from "vitest";

import type { Proxy } from "../src/index";
import {
  TARGETS,
  TargetFormat,
  base64Decode,
  base64Encode,
  checkIgnore,
  createExtraSettings,
  createProxy,
  dedupeNodes,
  isAffirmative,
  nodeRename,
  parseRequestSettings,
  parseSubscription,
  processRemark,
  proxyToSingle,
  proxyToSsd,
  proxyToSsSub,
  sanitizeProxy,
  socksConstruct,
  ssConstruct,
  ssLinkConstruct,
  toLoon,
  toMellow,
  toQuan,
  toQuanX,
  toSurge,
  toSurfboard,
  trojanConstruct,
  trojanLinkConstruct,
  tryBase64Decode,
  vmessConstruct,
} from "../src/index";

/** A node whose server smuggles a second INI line. */
function evilServerNode(): Proxy {
  const node = createProxy();
  ssConstruct(node, {
    group: "SSProvider",
    method: "aes-256-gcm",
    password: "pw",
    port: 8388,
    remark: "Node",
    server: "1.1.1.1\nHACK=evil",
  });
  return node;
}

const iniOutputs: Array<[string, (nodes: Proxy[]) => string]> = [
  [
    "surge",
    (nodes) =>
      toSurge(nodes, [], createExtraSettings(), { baseConf: "", nodeList: false, version: 5 }),
  ],
  [
    "surfboard",
    (nodes) => toSurfboard(nodes, [], createExtraSettings(), { baseConf: "", nodeList: false }),
  ],
  [
    "quanx",
    (nodes) => toQuanX(nodes, [], createExtraSettings(), { baseConf: "", nodeList: false }),
  ],
  ["quan", (nodes) => toQuan(nodes, [], createExtraSettings(), { baseConf: "", nodeList: false })],
  ["loon", (nodes) => toLoon(nodes, [], createExtraSettings(), { baseConf: "", nodeList: false })],
  [
    "mellow",
    (nodes) => toMellow(nodes, [], createExtraSettings(), { baseConf: "", nodeList: false }),
  ],
];

describe("ponytail finding 2: INI injection via hostile fields", () => {
  it.each(iniOutputs)("%s folds an injected line break in the server", (_name, render) => {
    const out = render([evilServerNode()]);
    expect(out).not.toMatch(/^HACK=/m);
    expect(out).not.toContain("\nHACK=evil");
    // Round-2 finding 6: `=` in CSV-sensitive fields folds too, so the
    // smuggled `HACK=evil` key cannot survive as `password=HACK...`.
    expect(out).toContain("1.1.1.1 HACK evil");
  });

  it("folds injected line breaks in credentials, hosts, and paths", () => {
    const trojan = createProxy();
    trojanConstruct(trojan, {
      group: "TrojanProvider",
      host: "h\nHACK=evil",
      password: "pw\nHACK=evil",
      port: 443,
      remark: "T",
      server: "1.2.3.4",
    });
    const vmess = createProxy();
    vmessConstruct(vmess, {
      add: "1.2.3.4",
      group: "V2RayProvider",
      host: "h\nHACK=evil",
      id: "00000000-0000-0000-0000-000000000000",
      net: "ws",
      path: "/p\nHACK=evil",
      port: 443,
      remark: "V",
      tls: "tls",
    });
    const socks = createProxy();
    socksConstruct(socks, {
      group: "SocksProvider",
      password: "pw",
      port: 1080,
      remark: "S",
      server: "1.2.3.4",
      username: "u\nHACK=evil",
    });
    const grouped = createProxy();
    ssConstruct(grouped, {
      group: "G\nHACK=evil",
      method: "aes-256-gcm",
      password: "pw",
      port: 8388,
      remark: "N",
      server: "1.2.3.4",
    });
    const settings = createExtraSettings();
    for (const out of [
      toSurge([trojan, vmess, socks], [], settings, {
        baseConf: "",
        nodeList: false,
        version: 5,
      }),
      toQuan([grouped], [], settings, { baseConf: "", nodeList: false }),
    ]) {
      expect(out).not.toMatch(/^HACK=/m);
      expect(out).not.toContain("\nHACK=evil");
    }
  });

  it("does not mutate the caller's nodes", () => {
    const node = evilServerNode();
    toSurge([node], [], createExtraSettings(), { baseConf: "", nodeList: false, version: 5 });
    expect(node.hostname).toBe("1.1.1.1\nHACK=evil");
  });

  it("neutralizes smuggled newlines arriving via parsed subscriptions", () => {
    const vmess =
      "vmess://" +
      base64Encode(
        JSON.stringify({
          add: "1.1.1.1\nHACK=evil",
          aid: "0",
          host: "",
          id: "00000000-0000-0000-0000-000000000000",
          net: "tcp",
          path: "",
          port: "443",
          ps: "N",
          tls: "",
          type: "none",
          v: "2",
        }),
      );
    const nodes = parseSubscription(vmess);
    expect(nodes).toHaveLength(1);
    const out = toSurge(nodes, [], createExtraSettings(), {
      baseConf: "",
      nodeList: false,
      version: 5,
    });
    expect(out).not.toMatch(/^HACK=/m);
    expect(out).not.toContain("\nHACK=evil");
  });

  it("sanitizeProxy cleans strings and copies string arrays", () => {
    const node = createProxy();
    node.hostname = "a\r\nb";
    node.password = "c\rd";
    node.dnsServers = ["1.1.1.1\nHACK=evil"];
    const dnsServers = node.dnsServers;
    sanitizeProxy(node);
    expect(node.hostname).toBe("a b");
    expect(node.password).toBe("c d");
    expect(node.dnsServers).toEqual(["1.1.1.1 HACK evil"]);
    expect(node.dnsServers).not.toBe(dnsServers);
  });
});

describe("ponytail finding 4: whitespace-separated subscription links", () => {
  const ssLink = (remark: string): string =>
    `ss://${base64Encode("aes-256-gcm:pw")}@1.2.3.4:8388#${remark}`;

  it("parses space-separated links on one line", () => {
    const nodes = parseSubscription(`${ssLink("one")} ${ssLink("two")}`);
    expect(nodes).toHaveLength(2);
    expect(nodes.map((node) => node.remark)).toEqual(["one", "two"]);
  });

  it("keeps spaces inside link remarks", () => {
    const nodes = parseSubscription(ssLink("my node"));
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.remark).toBe("my node");
  });

  it("handles mixed newlines, carriage returns, and extra whitespace", () => {
    const nodes = parseSubscription(`${ssLink("a")}\r\n  ${ssLink("b c")}\r${ssLink("d")}  `);
    expect(nodes.map((node) => node.remark)).toEqual(["a", "b c", "d"]);
  });

  it("splits a spaced remark from a following link", () => {
    const nodes = parseSubscription(`${ssLink("my node")} ${ssLink("two")}`);
    expect(nodes.map((node) => node.remark)).toEqual(["my node", "two"]);
  });

  it("drops stray text before the first link", () => {
    const nodes = parseSubscription(`hello ${ssLink("a")}`);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.remark).toBe("a");
  });
});

describe("ponytail finding 15: base64 decoding in explodeSub", () => {
  it("tryBase64Decode passes plain subscriptions through untouched", () => {
    const plain = "ss://a#1 ss://b#2";
    expect(tryBase64Decode(plain)).toBe(plain);
    expect(tryBase64Decode("  ")).toBe("");
  });

  it("parses base64-encoded bodies without a manual fallback", () => {
    const payload = (host: string, remark: string): string =>
      `ss://${base64Encode("aes-256-gcm:pw")}@${host}:8388#${remark}`;
    const sub = base64Encode(`${payload("1.2.3.4", "a")}\n${payload("5.6.7.8", "b")}`);
    expect(parseSubscription(sub).map((node) => node.remark)).toEqual(["a", "b"]);
  });
});

describe("ponytail finding 14: shared core flags", () => {
  it("TARGETS lists every TargetFormat", () => {
    expect(TARGETS).toEqual(new Set(Object.values(TargetFormat)));
  });

  it("isAffirmative matches the documented literals", () => {
    for (const value of ["", "true", "1", "yes", "on", " TRUE ", "Yes"]) {
      expect(isAffirmative(value)).toBe(true);
    }
    for (const value of ["false", "0", "no", "off", "2", "true-ish"]) {
      expect(isAffirmative(value)).toBe(false);
    }
  });
});

describe("round-1 finding 2: alternation inside a quantified group is unsafe", () => {
  function remarkNode(remark: string): Proxy {
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

  it("neutralizes `(a|aa)+$` at match time", () => {
    const node = remarkNode("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    nodeRename(node, [{ match: "(a|aa)+$", replace: "evil", script: "" }]);
    expect(node.remark).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(checkIgnore(node, [], ["(a|aa)+$"])).toBe(true);
  });

  it("drops alternation-quantifier patterns from query params", () => {
    const evil = encodeURIComponent("(a|aa)+$@x");
    expect(parseRequestSettings(`rename=${evil}`).rename).toEqual([]);
    const inc = encodeURIComponent("(a|aa)+$");
    expect(parseRequestSettings(`include=${inc}`).includeRemarks).toEqual([]);
  });
});

describe("round-1 finding 3: dedupe keeps vmess nodes with distinct paths", () => {
  const uid = "00000000-0000-0000-0000-000000000000";
  function vmessNode(path: string): Proxy {
    const node = createProxy();
    vmessConstruct(node, {
      add: "1.2.3.4",
      group: "V2RayProvider",
      host: "",
      id: uid,
      net: "ws",
      path,
      port: 443,
      remark: "node",
      tls: "tls",
    });
    return node;
  }

  it("keeps /a vs /b on the same server", () => {
    const nodes = [vmessNode("/a"), vmessNode("/b")];
    expect(dedupeNodes(nodes)).toBe(0);
    expect(nodes).toHaveLength(2);
  });

  it("still removes exact duplicates", () => {
    const nodes = [vmessNode("/a"), vmessNode("/a")];
    expect(dedupeNodes(nodes)).toBe(1);
    expect(nodes).toHaveLength(1);
  });
});

describe("round-1 finding 5: remarks containing :// stay on one link", () => {
  const linkFor = (remark: string): string =>
    `ss://${base64Encode("aes-256-gcm:pw")}@1.2.3.4:8388#${remark}`;

  it("keeps `my :// node` as a single remark", () => {
    const nodes = parseSubscription(linkFor("my :// node"));
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.remark).toBe("my :// node");
  });

  it("still splits a following link after a :// remark", () => {
    const other = `ss://${base64Encode("aes-256-gcm:pw")}@5.6.7.8:8388#two`;
    const nodes = parseSubscription(`${linkFor("my :// node")} ${other}`);
    expect(nodes).toHaveLength(2);
    expect(nodes.map((node) => node.remark)).toEqual(["my :// node", "two"]);
  });
});

describe("round-1 finding 6: repeatable filter lists are capped with 400", () => {
  it("rejects more than 50 include entries", () => {
    const query = Array.from({ length: 51 }, (_, i) => `include=n${String(i)}`).join("&");
    let status: unknown;
    try {
      parseRequestSettings(query);
    } catch (error) {
      status = (error as { statusCode?: unknown }).statusCode;
    }
    expect(status).toBe(400);
  });

  it("rejects oversized name_remove/country payloads", () => {
    const big = "x".repeat(2001);
    for (const query of [`name_remove=${big}`, `include_country=${big}`]) {
      let status: unknown;
      try {
        parseRequestSettings(query);
      } catch (error) {
        status = (error as { statusCode?: unknown }).statusCode;
      }
      expect(status).toBe(400);
    }
  });

  it("rejects oversized rename char totals with safe patterns", () => {
    const rule = `${"a".repeat(70)}@${"b".repeat(70)}`;
    const query = Array.from({ length: 30 }, () => `rename=${rule}`).join("&");
    let status: unknown;
    try {
      parseRequestSettings(query);
    } catch (error) {
      status = (error as { statusCode?: unknown }).statusCode;
    }
    expect(status).toBe(400);
  });

  it("keeps ordinary filter lists working", () => {
    const settings = parseRequestSettings("include=HK&include=US&exclude=ad");
    expect(settings.includeRemarks).toEqual(["HK", "US"]);
    expect(settings.excludeRemarks).toEqual(["ad"]);
  });
});

describe("round-1 finding 7: processRemark reuses a persistent set", () => {
  it("matches the array fallback while sharing one set", () => {
    const remarks: string[] = [];
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    // processRemark is a pure lookup: callers record the name only after
    // the node builds successfully (round-2 finding 5).
    expect(processRemark("node", remarks, true, seen, counts)).toBe("node");
    remarks.push("node");
    seen.add("node");
    expect(processRemark("node", remarks, true, seen, counts)).toBe("node 2");
    remarks.push("node 2");
    seen.add("node 2");
    expect(processRemark("node", remarks, true, seen, counts)).toBe("node 3");
    expect(processRemark("node", ["node", "node 2"])).toBe("node 3");
  });

  it("generators still dedupe repeated remarks", () => {
    const make = (remark: string): Proxy => {
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
    };
    const out = toSurge(
      [make("dup"), make("dup"), make("dup")],
      [],
      {
        ...createExtraSettings(),
      },
      { baseConf: "", nodeList: false, version: 5 },
    );
    expect(out).toContain("dup 2");
    expect(out).toContain("dup 3");
  });
});

describe("round-1 finding 10: share-link outputs fold injected newlines", () => {
  function evilSsNode(): Proxy {
    const node = createProxy();
    ssConstruct(node, {
      group: "SSProvider",
      method: "aes-256-gcm",
      password: "pw",
      port: 8388,
      remark: "Node",
      server: "1.1.1.1\nss://evil@...",
    });
    return node;
  }

  it("ss/trojan constructors sanitize without mutating the caller", () => {
    const node = evilSsNode();
    expect(ssLinkConstruct(node)).not.toContain("\n");
    expect(node.hostname).toBe("1.1.1.1\nss://evil@...");
    const trojan = createProxy();
    trojanConstruct(trojan, {
      group: "TrojanProvider",
      host: "h",
      password: "pw",
      port: 443,
      remark: "T",
      server: "1.2.3.4\nINJECT",
    });
    expect(trojanLinkConstruct(trojan)).not.toContain("\n");
    expect(trojan.hostname).toContain("\n");
  });

  it("node-list output stays one line per node", () => {
    const out = proxyToSingle([evilSsNode()], 1, {
      ...createExtraSettings(),
      nodeList: true,
    });
    expect(out.trim().split("\n")).toHaveLength(1);
    expect(out).toContain("1.1.1.1 ss://evil");
  });

  it("ssd/sssub payloads carry no raw newlines", () => {
    const ssd = proxyToSsd([evilSsNode()], "", "");
    const doc = JSON.parse(base64Decode(ssd.slice("ssd://".length))) as {
      servers: Array<{ server: string }>;
    };
    expect(doc.servers[0]?.server).toBe("1.1.1.1 ss://evil@...");
    const conf = proxyToSsSub([evilSsNode()], "");
    expect(conf).not.toContain("\nss://evil");
    const parsed = JSON.parse(conf) as Array<{ server: string }>;
    expect(parsed[0]?.server).toBe("1.1.1.1 ss://evil@...");
  });
});
