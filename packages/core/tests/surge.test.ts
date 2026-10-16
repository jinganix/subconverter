import { describe, expect, it } from "vitest";

import type { Proxy } from "../src/index";
import {
  BalanceStrategy,
  ProxyGroupType,
  ProxyType,
  createExtraSettings,
  createProxy,
  generatePeer,
  parseSubscription,
  ssConstruct,
  toSurge,
} from "../src/index";

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

describe("toSurge", () => {
  it("emits a Proxy section and DIRECT default", () => {
    const settings = createExtraSettings();
    const out = toSurge([ssNode("Node")], [], settings, {
      baseConf: "",
      nodeList: false,
      version: 4,
    });
    expect(out).toContain("[Proxy]");
    expect(out).toContain("DIRECT = direct");
    expect(out).toContain("Node = ss, 1.2.3.4, 8388, encrypt-method=aes-256-gcm, password=pw");
  });

  it("round-trips through the surge parser", () => {
    const settings = createExtraSettings();
    const out = toSurge([ssNode("Node")], [], settings, {
      baseConf: "",
      nodeList: false,
      version: 4,
    });
    const nodes = parseSubscription(out);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.remark).toBe("Node");
    expect(nodes[0]?.encryptMethod).toBe("aes-256-gcm");
  });

  it("preserves unrelated base sections", () => {
    const settings = createExtraSettings();
    const base = [
      "[General]",
      "loglevel = notify",
      "[Proxy]",
      "Old = ss, 1.1.1.1, 1, encrypt-method=aes-128-gcm, password=x",
    ].join("\n");
    const out = toSurge([ssNode("New")], [], settings, {
      baseConf: base,
      nodeList: false,
      version: 4,
    });
    expect(out).toContain("loglevel = notify");
    expect(out).not.toContain("Old = ss");
    expect(out).toContain("New = ss");
  });

  it("builds a url-test group", () => {
    const settings = createExtraSettings();
    const out = toSurge(
      [ssNode("HK"), ssNode("US")],
      [
        {
          disableUdp: undefined,
          evaluateBeforeUse: undefined,
          interval: 300,
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
      { baseConf: "", nodeList: false, version: 4 },
    );
    expect(out).toContain("[Proxy Group]");
    expect(out).toContain(
      "Auto = url-test,HK,US,url=http://www.gstatic.com/generate_204,interval=300",
    );
  });

  it("collapses a single DIRECT group into the proxy section", () => {
    const settings = createExtraSettings();
    const out = toSurge(
      [],
      [
        {
          disableUdp: undefined,
          evaluateBeforeUse: undefined,
          interval: 0,
          lazy: undefined,
          name: "OnlyDirect",
          persistent: undefined,
          proxies: ["[]DIRECT"],
          strategy: BalanceStrategy.ConsistentHashing,
          timeout: 0,
          tolerance: 0,
          type: ProxyGroupType.Select,
          url: "",
          usingProvider: [],
        },
      ],
      settings,
      { baseConf: "", nodeList: false, version: 4 },
    );
    expect(out).toContain("OnlyDirect = direct");
  });

  it("skips vmess for surge versions below 4", () => {
    const node = ssNode("V");
    node.type = ProxyType.VMess;
    node.userId = "uuid";
    const settings = createExtraSettings();
    const out = toSurge([node], [], settings, { baseConf: "", nodeList: false, version: 3 });
    expect(out).not.toContain("V = vmess");
  });

  it("emits only proxy lines when nodeList is set", () => {
    const settings = createExtraSettings();
    const out = toSurge([ssNode("Node")], [], settings, {
      baseConf: "",
      nodeList: true,
      version: 4,
    });
    expect(out.startsWith("Node = ss")).toBe(true);
    expect(out).not.toContain("[Proxy]");
  });
});

describe("generatePeer", () => {
  it("formats a WireGuard peer", () => {
    const node = createProxy();
    node.publicKey = "pubkey";
    node.hostname = "engage.example.com";
    node.port = 2408;
    node.allowedIps = "0.0.0.0/0, ::/0";
    node.preSharedKey = "psk";
    node.keepAlive = 30;
    node.clientId = "1/2/3";
    expect(generatePeer(node)).toBe(
      'public-key = pubkey, endpoint = engage.example.com:2408, preshared-key = psk, allowed-ips = "0.0.0.0/0, ::/0", keepalive = 30, client-id = 1/2/3',
    );
  });
});
