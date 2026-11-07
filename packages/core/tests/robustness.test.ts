import { describe, expect, it } from "vitest";

import {
  ProxyType,
  TargetFormat,
  applyMatcher,
  createSelectGroup,
  base64Decode,
  parseRawIni,
  renderRawIni,
  base64Encode,
  convertNodes,
  parsePeers,
  parseSubscription,
  proxyToSsd,
  createProxy,
} from "../src/index";

/** JSON array items that providers/tools may emit next to real entries. */
const WEIRD_ITEMS = [null, 1, "s", true, [], {}, { server_port: 1 }];

function ssdPayload(doc: Record<string, unknown>): string {
  return `ssd://${base64Encode(JSON.stringify(doc))}`;
}

describe("malformed config JSON never throws", () => {
  it("skips null/scalar array entries instead of crashing", () => {
    const bodies = [
      JSON.stringify({ servers: WEIRD_ITEMS, version: 1 }),
      JSON.stringify({ configs: WEIRD_ITEMS }),
      JSON.stringify({ configs: WEIRD_ITEMS, remarks: 3 }),
      JSON.stringify({ serverSubscribes: WEIRD_ITEMS }),
      JSON.stringify({ subItem: WEIRD_ITEMS, vmess: WEIRD_ITEMS }),
      JSON.stringify({ ModeFileNameType: 1, Server: WEIRD_ITEMS }),
      JSON.stringify({ configs: WEIRD_ITEMS, proxy_apps: {} }),
      JSON.stringify(WEIRD_ITEMS),
    ];
    for (const body of bodies) {
      expect(() => parseSubscription(body), body).not.toThrow();
    }
    // The null-only arrays parse to nothing but do not abort a surrounding list.
    expect(parseSubscription(bodies[0] as string)).toEqual([]);
  });

  it("parses valid entries next to junk", () => {
    const nodes = parseSubscription(
      JSON.stringify({
        configs: [null, { group: "g", remarks: "r", server: "1.2.3.4", server_port: 8388 }],
        version: 1,
      }),
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.hostname).toBe("1.2.3.4");
  });
});

describe("parseSubscription group ids", () => {
  it("tags every node of a source with its group id", () => {
    const first = parseSubscription("trojan://pw@1.2.3.4:443#A", 0);
    const second = parseSubscription("trojan://pw@5.6.7.8:443#B", 1);
    expect(first[0]?.groupId).toBe(0);
    expect(second[0]?.groupId).toBe(1);
    // `!!GROUPID=1` must select the second source only.
    expect(applyMatcher("!!GROUPID=1", second[0]!).matched).toBe(true);
    expect(applyMatcher("!!GROUPID=1", first[0]!).matched).toBe(false);
  });

  it("defaults to group id 0", () => {
    expect(parseSubscription("trojan://pw@1.2.3.4:443#A")[0]?.groupId).toBe(0);
  });
});

describe("parser hardening", () => {
  it("keeps a WireGuard peer hostname when the endpoint has no port", () => {
    const node = createProxy();
    parsePeers(node, "peer = (public-key = abc, endpoint = example.com)");
    expect(node.hostname).toBe("example.com");
    expect(node.port).toBe(0);
  });

  it("reads SSD userinfo regardless of `;` spacing", () => {
    const node = createProxy();
    node.type = ProxyType.Shadowsocks;
    node.hostname = "1.2.3.4";
    node.port = 8388;
    node.password = "p";
    node.remark = "n";
    const tight = proxyToSsd([{ ...node }], "G", "upload=1000;download=1000;total=2000000000");
    const loose = proxyToSsd(
      [{ ...node }],
      "G",
      "upload=1000; download=1000; total=2000000000; expire=",
    );
    expect(tight).toBe(loose);
    expect(base64Decode(tight.slice(6))).toContain('"traffic_used":0.000002');
  });
});

describe("fuzz corpus: parse and generate never throw", () => {
  const corpus = [
    "",
    "\uFEFF",
    "%",
    "ssd://%%%",
    "ssd://" + base64Encode(JSON.stringify({ servers: { a: null, b: { server: "s" } } })),
    ssdPayload({ servers: [{ port: 8388, server: "1.2.3.4" }] }),
    "ss://",
    "ss://@",
    "ssr://",
    "vmess://",
    "vmess://e30=",
    "vless://",
    "trojan://",
    "tuic://",
    "hysteria://",
    "hysteria2://",
    "hy2://",
    "wg://",
    "wireguard://",
    "snell://",
    "anytls://",
    "socks://",
    "tg://socks",
    "Netch://",
    "proxies:\n  - null\n",
    "proxies: 5\n",
    "Proxy: [null]\n",
    "a: &x\n  b: 1\nproxies:\n  - *x\n",
    "abc:/@?#[]{}()\"'\\|,=&%\n0123456789",
  ];

  it("never throws for any target", () => {
    for (const body of corpus) {
      const nodes = parseSubscription(body);
      for (const target of Object.values(TargetFormat)) {
        if (target === TargetFormat.Auto) {
          continue;
        }
        expect(() => convertNodes(nodes, { target }), `${target}: ${body}`).not.toThrow();
      }
    }
  });
});

describe("group names cannot inject config lines", () => {
  it("sanitizes `=` and line breaks in group names and `[]` references", () => {
    const node = createProxy();
    Object.assign(node, {
      hostname: "1.2.3.4",
      password: "p",
      port: 443,
      remark: "n",
      type: ProxyType.Trojan,
    });
    const groups = [
      createSelectGroup("inject\n[Rule]\nFINAL,REJECT"),
      createSelectGroup("a=b"),
      { ...createSelectGroup("ref"), proxies: ["[]inject\nx"] },
    ];
    const targets = [
      TargetFormat.Clash,
      TargetFormat.Loon,
      TargetFormat.Mellow,
      TargetFormat.Quantumult,
      TargetFormat.QuantumultX,
      TargetFormat.Surge,
    ];
    for (const target of targets) {
      const out = convertNodes([node], {
        baseConf: "",
        groups,
        includeRules: false,
        target,
      }).output;
      expect(out).not.toContain("\n[Rule]\nFINAL,REJECT");
      expect(out).not.toContain("a=b");
    }
  });
});

describe("base config preamble", () => {
  it("keeps lines before the first section header", () => {
    const sections = parseRawIni("# preamble comment\n[General]\nkey=v\n");
    expect(sections[0]?.name).toBe("");
    expect(sections[0]?.lines).toEqual(["# preamble comment"]);
    const rendered = renderRawIni(sections);
    expect(rendered.startsWith("# preamble comment\n")).toBe(true);
    expect(rendered).toContain("[General]\nkey=v");
  });

  it("does not add a headerless section when the body starts with a header", () => {
    const sections = parseRawIni("[General]\nkey=v\n");
    expect(sections).toHaveLength(1);
    expect(renderRawIni(sections)).toBe("[General]\nkey=v\n");
  });
});
