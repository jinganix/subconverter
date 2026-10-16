import { describe, expect, it } from "vitest";

import {
  BalanceStrategy,
  ProxyGroupType,
  ProxyType,
  addEmoji,
  applyMatcher,
  base64Decode,
  createExtraSettings,
  createProxy,
  filterNodes,
  groupGenerate,
  matchRange,
  parseSubscription,
  preprocessNodes,
  processRemark,
  proxyToSingle,
  removeEmoji,
  ssConstruct,
  ssLinkConstruct,
  toClash,
  vmessConstruct,
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

function vmessNode(remark: string): Proxy {
  const node = createProxy();
  vmessConstruct(node, {
    add: "5.6.7.8",
    aid: "0",
    cipher: "auto",
    group: "V2RayProvider",
    host: "example.com",
    id: "b831381d-6324-4d53-ad4f-8cda48b30811",
    net: "ws",
    path: "/p",
    port: 443,
    remark,
    tls: "tls",
  });
  return node;
}

describe("matchRange", () => {
  it("matches exact and ranges", () => {
    expect(matchRange("1", 1)).toBe(true);
    expect(matchRange("1", 2)).toBe(false);
    expect(matchRange("1-5", 3)).toBe(true);
    expect(matchRange("1-5", 6)).toBe(false);
  });

  it("handles negation and open ranges", () => {
    expect(matchRange("!5", 5)).toBe(false);
    expect(matchRange("!5", 4)).toBe(true);
    expect(matchRange("3-", 2)).toBe(true);
    expect(matchRange("3-", 5)).toBe(false);
    expect(matchRange("3+", 5)).toBe(true);
    expect(matchRange("3+", 2)).toBe(false);
  });
});

describe("applyMatcher", () => {
  it("matches by type", () => {
    expect(applyMatcher("!!TYPE=VMESS", vmessNode("a")).matched).toBe(true);
    expect(applyMatcher("!!TYPE=SS", vmessNode("a")).matched).toBe(false);
  });

  it("matches by group and captures the trailing rule", () => {
    const result = applyMatcher("!!GROUP=V2Ray!!Node", vmessNode("a"));
    expect(result.matched).toBe(true);
    expect(result.realRule).toBe("Node");
  });

  it("matches by port with negation", () => {
    expect(applyMatcher("!!PORT=!443", vmessNode("a")).matched).toBe(false);
    expect(applyMatcher("!!PORT=443", vmessNode("a")).matched).toBe(true);
  });

  it("matches by server", () => {
    expect(applyMatcher("!!SERVER=5\\.6", vmessNode("a")).matched).toBe(true);
  });

  it("matches by group id with INSERT direction", () => {
    const node = ssNode("a");
    node.groupId = 2;
    expect(applyMatcher("!!GROUPID=2", node).matched).toBe(true);
    node.groupId = -1;
    expect(applyMatcher("!!INSERT=1", node).matched).toBe(true);
  });

  it("treats a plain rule as a match-all with a remark pattern", () => {
    const result = applyMatcher("香港", ssNode("a"));
    expect(result.matched).toBe(true);
    expect(result.realRule).toBe("香港");
  });
});

describe("processRemark", () => {
  it("replaces '=' with '-'", () => {
    expect(processRemark("a=b", [])).toBe("a-b");
  });

  it("quotes remarks containing commas", () => {
    expect(processRemark("a,b", [])).toBe('"a,b"');
  });

  it("de-duplicates against existing remarks", () => {
    expect(processRemark("node", ["node", "node 2"])).toBe("node 3");
  });
});

describe("removeEmoji", () => {
  it("strips leading astral emoji", () => {
    expect(removeEmoji("🇭🇰 Node")).toBe("Node");
  });

  it("returns the original when the result would be empty", () => {
    expect(removeEmoji("🇭🇰")).toBe("🇭🇰");
  });

  it("leaves plain remarks untouched", () => {
    expect(removeEmoji("Node")).toBe("Node");
  });
});

describe("addEmoji", () => {
  it("prefixes the emoji when the remark matches", () => {
    const node = ssNode("HK Node");
    const out = addEmoji(node, [{ match: "HK", replace: "🇭🇰", script: "" }]);
    expect(out).toBe("🇭🇰 HK Node");
  });

  it("leaves the remark untouched when nothing matches", () => {
    const node = ssNode("US Node");
    const out = addEmoji(node, [{ match: "HK", replace: "🇭🇰", script: "" }]);
    expect(out).toBe("US Node");
  });
});

describe("preprocessNodes", () => {
  it("renames, adds emoji and sorts", () => {
    const nodes = [ssNode("🇭🇰 Zeta"), ssNode("Alpha")];
    preprocessNodes(nodes, {
      addEmoji: false,
      emojiArray: [],
      removeEmoji: true,
      renameArray: [{ match: "Zeta", replace: "Renamed", script: "" }],
      sortFlag: true,
    });
    expect(nodes.map((n) => n.remark)).toEqual(["Alpha", "Renamed"]);
  });
});

describe("groupGenerate", () => {
  it("collects matching node remarks", () => {
    const nodes = [ssNode("HK 1"), ssNode("US 1")];
    const out: string[] = [];
    groupGenerate("!!TYPE=SS", nodes, out, true);
    expect(out).toEqual(["HK 1", "US 1"]);
  });

  it("supports the []direct syntax", () => {
    const out: string[] = [];
    groupGenerate("[]DIRECT", [], out, true);
    expect(out).toEqual(["DIRECT"]);
  });
});

describe("filterNodes", () => {
  it("removes excluded nodes and renumbers", () => {
    const nodes = [ssNode("HK"), ssNode("US"), ssNode("JP")];
    filterNodes(nodes, ["US"], [], 3);
    expect(nodes.map((n) => n.remark)).toEqual(["HK", "JP"]);
    expect(nodes.map((n) => n.id)).toEqual([0, 1]);
    expect(nodes.every((n) => n.groupId === 3)).toBe(true);
  });

  it("keeps only included nodes when include list is set", () => {
    const nodes = [ssNode("HK"), ssNode("US")];
    filterNodes(nodes, [], ["HK"], 0);
    expect(nodes.map((n) => n.remark)).toEqual(["HK"]);
  });
});

describe("links", () => {
  it("round-trips an ss link", () => {
    const node = ssNode("Node");
    const link = ssLinkConstruct(node);
    expect(link.startsWith("ss://")).toBe(true);
    const parsed = parseSubscription(link);
    expect(parsed[0]?.encryptMethod).toBe("aes-256-gcm");
    expect(parsed[0]?.password).toBe("pw");
    expect(parsed[0]?.remark).toBe("Node");
  });

  it("emits a base64 list for proxyToSingle", () => {
    const nodes = [vmessNode("A"), ssNode("B")];
    const settings = createExtraSettings();
    const out = proxyToSingle(nodes, 1 | 4, settings);
    const decoded = base64Decode(out);
    expect(decoded).toContain("vmess://");
    expect(decoded).toContain("ss://");
  });

  it("emits a plain list when nodeList is set", () => {
    const nodes = [ssNode("B")];
    const settings = createExtraSettings();
    settings.nodeList = true;
    const out = proxyToSingle(nodes, 1, settings);
    expect(out.startsWith("ss://")).toBe(true);
  });
});

describe("toClash", () => {
  it("emits proxies and round-trips", () => {
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const yaml = toClash([ssNode("Node")], [], settings);
    expect(yaml).toContain("proxies:");
    const nodes = parseSubscription(yaml);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.remark).toBe("Node");
    expect(nodes[0]?.encryptMethod).toBe("aes-256-gcm");
    expect(nodes[0]?.port).toBe(8388);
  });

  it("uses the legacy Proxy key when requested", () => {
    const settings = createExtraSettings();
    const yaml = toClash([ssNode("Node")], [], settings);
    expect(yaml).toContain("Proxy:");
  });

  it("appends the proxy type when requested", () => {
    const settings = createExtraSettings();
    settings.appendProxyType = true;
    const yaml = toClash([ssNode("Node")], [], settings);
    expect(yaml).toContain("[SS] Node");
  });

  it("builds proxy groups", () => {
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const yaml = toClash(
      [ssNode("HK"), ssNode("US")],
      [
        {
          disableUdp: undefined,
          evaluateBeforeUse: undefined,
          interval: 0,
          lazy: undefined,
          name: "Auto",
          persistent: undefined,
          proxies: ["!!TYPE=SS"],
          strategy: BalanceStrategy.ConsistentHashing,
          timeout: 0,
          tolerance: 0,
          type: ProxyGroupType.URLTest,
          url: "http://www.gstatic.com/generate_204",
          usingProvider: [],
        },
      ],
      settings,
    );
    expect(yaml).toContain("proxy-groups:");
    expect(yaml).toContain("Auto");
    expect(yaml).toContain("http://www.gstatic.com/generate_204");
  });

  it("skips snell v4 and unsupported types", () => {
    const node = ssNode("Snell");
    node.type = ProxyType.Snell;
    node.snellVersion = 4;
    const settings = createExtraSettings();
    const yaml = toClash([node], [], settings);
    expect(yaml).not.toContain("Snell");
  });
});
