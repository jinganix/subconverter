import { describe, expect, it } from "vitest";

import type { Proxy } from "../src/index";
import {
  ProxyGroupType,
  ProxyType,
  TargetFormat,
  base64Encode,
  createExtraSettings,
  createProxy,
  createProxyGroupConfig,
  formatSingBoxInterval,
  generate,
  parseLink,
  parseSubscription,
  ssConstruct,
  toLoon,
  toQuan,
  toQuanX,
  toSingBox,
} from "../src/index";

function autoGroup(name = "Auto"): ReturnType<typeof createProxyGroupConfig> {
  const group = createProxyGroupConfig();
  group.name = name;
  group.type = ProxyGroupType.URLTest;
  group.interval = 300;
  group.proxies = ["!!TYPE=SS"];
  group.url = "http://www.gstatic.com/generate_204";
  return group;
}

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

describe("VLESS link", () => {
  it("parses a vless ws+tls link", () => {
    const node = parseLink(
      "vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?encryption=none&security=tls&type=ws&host=example.com&path=%2Fws&sni=example.com#Node",
    );
    expect(node?.type).toBe(ProxyType.VLESS);
    expect(node?.userId).toBe("b831381d-6324-4d53-ad4f-8cda48b30811");
    expect(node?.transferProtocol).toBe("ws");
    expect(node?.path).toBe("/ws");
    expect(node?.host).toBe("example.com");
    expect(node?.tlsSecure).toBe(true);
    expect(node?.remark).toBe("Node");
  });
});

describe("TUIC link", () => {
  it("parses a tuic link", () => {
    const node = parseLink(
      "tuic://uuid:pass@1.2.3.4:443?congestion_control=bbr&sni=example.com#Node",
    );
    expect(node?.type).toBe(ProxyType.TUIC);
    expect(node?.userId).toBe("uuid");
    expect(node?.password).toBe("pass");
    expect(node?.congestionControl).toBe("bbr");
    expect(node?.serverName).toBe("example.com");
  });
});

describe("VLESS/TUIC Clash round-trip", () => {
  it("emits and re-parses vless", () => {
    const node = parseLink(
      "vless://uuid@1.2.3.4:443?security=tls&type=ws&path=/ws&sni=e.com#V",
    ) as Proxy;
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const yaml = generate([node], { settings, target: TargetFormat.Clash });
    expect(yaml).toContain("type: vless");
    const back = parseSubscription(yaml);
    expect(back[0]?.type).toBe(ProxyType.VLESS);
    expect(back[0]?.path).toBe("/ws");
  });

  it("emits and re-parses tuic", () => {
    const node = parseLink("tuic://uuid:pass@1.2.3.4:443?congestion_control=bbr#T") as Proxy;
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const yaml = generate([node], { settings, target: TargetFormat.Clash });
    expect(yaml).toContain("type: tuic");
    const back = parseSubscription(yaml);
    expect(back[0]?.type).toBe(ProxyType.TUIC);
    expect(back[0]?.congestionControl).toBe("bbr");
  });
});

describe("toQuanX", () => {
  it("emits a server_local section", () => {
    const settings = createExtraSettings();
    const out = toQuanX([ssNode("Node")], [], settings, { baseConf: "", nodeList: false });
    expect(out).toContain("[server_local]");
    expect(out).toContain("shadowsocks = 1.2.3.4:8388, method=aes-256-gcm, password=pw, tag=Node");
  });

  it("preserves base sections", () => {
    const settings = createExtraSettings();
    const out = toQuanX([ssNode("Node")], [], settings, {
      baseConf: "[general]\nserver_check_url=http://example.com",
      nodeList: false,
    });
    expect(out).toContain("[general]");
    expect(out).toContain("server_check_url=http://example.com");
  });

  it("emits policy groups", () => {
    const settings = createExtraSettings();
    const out = toQuanX([ssNode("A"), ssNode("B")], [autoGroup()], settings, {
      baseConf: "",
      nodeList: false,
    });
    expect(out).toContain("[policy]");
    expect(out).toContain("url-latency-benchmark=Auto, A, B, check-interval=300");
  });

  it("emits only nodes when nodeList is set", () => {
    const settings = createExtraSettings();
    const out = toQuanX([ssNode("Node")], [], settings, { baseConf: "", nodeList: true });
    expect(out.startsWith("shadowsocks = ")).toBe(true);
  });
});

describe("toQuan", () => {
  it("emits a SERVER section", () => {
    const settings = createExtraSettings();
    const out = toQuan([ssNode("Node")], [], settings, { baseConf: "", nodeList: false });
    expect(out).toContain("[SERVER]");
    expect(out).toContain('Node = shadowsocks, 1.2.3.4, 8388, aes-256-gcm, "pw", group=SSProvider');
  });

  it("preserves base sections", () => {
    const settings = createExtraSettings();
    const out = toQuan([ssNode("Node")], [], settings, {
      baseConf: "[GENERAL]\nserver_check_url = http://example.com",
      nodeList: false,
    });
    expect(out).toContain("[GENERAL]");
    expect(out).toContain("server_check_url = http://example.com");
    expect(out).toContain("[SERVER]");
  });

  it("emits a base64 policy group", () => {
    const settings = createExtraSettings();
    const out = toQuan([ssNode("A"), ssNode("B")], [autoGroup()], settings, {
      baseConf: "",
      nodeList: false,
    });
    expect(out).toContain("[POLICY]");
  });
});

describe("toLoon", () => {
  it("emits a Proxy section", () => {
    const settings = createExtraSettings();
    const out = toLoon([ssNode("Node")], [], settings, { baseConf: "", nodeList: false });
    expect(out).toContain("[Proxy]");
    expect(out).toContain('Node = Shadowsocks,1.2.3.4,8388,aes-256-gcm,"pw"');
  });

  it("emits a Proxy Group section", () => {
    const settings = createExtraSettings();
    const out = toLoon([ssNode("A"), ssNode("B")], [autoGroup()], settings, {
      baseConf: "",
      nodeList: false,
    });
    expect(out).toContain("[Proxy Group]");
    expect(out).toContain(
      "Auto = url-test,A,B,url=http://www.gstatic.com/generate_204,interval=300",
    );
  });
});

describe("toSingBox", () => {
  it("emits outbounds JSON", () => {
    const settings = createExtraSettings();
    const out = toSingBox([ssNode("Node")], [], settings, { baseConf: "", nodeList: false });
    const doc = JSON.parse(out) as { outbounds: Array<Record<string, unknown>> };
    const tags = doc.outbounds.map((o) => o.tag);
    expect(tags).toContain("DIRECT");
    expect(tags).toContain("REJECT");
    expect(tags).toContain("Node");
    const node = doc.outbounds.find((o) => o.tag === "Node");
    expect(node?.type).toBe("shadowsocks");
    expect(node?.method).toBe("aes-256-gcm");
  });

  it("merges a base config", () => {
    const settings = createExtraSettings();
    const out = toSingBox([ssNode("Node")], [], settings, {
      baseConf: '{"log":{"level":"info"}}',
      nodeList: false,
    });
    const doc = JSON.parse(out) as { log: { level: string } };
    expect(doc.log.level).toBe("info");
  });
});

describe("formatSingBoxInterval", () => {
  it("formats durations", () => {
    expect(formatSingBoxInterval(3660)).toBe("1h1m");
    expect(formatSingBoxInterval(90)).toBe("1m30s");
    expect(formatSingBoxInterval(0)).toBe("");
  });
});

describe("generate dispatch", () => {
  const vmessLink = `vmess://${base64Encode(
    JSON.stringify({
      add: "2.2.2.2",
      aid: "0",
      id: "uuid",
      net: "tcp",
      port: "443",
      ps: "VM",
      v: "2",
    }),
  )}`;
  const ssrLink = `ssr://${base64Encode(
    `9.9.9.9:443:auth_sha1_v4:aes-256-cfb:http_simple:${base64Encode("pw")}/?remarks=${base64Encode("SSR")}`,
  )}`;
  const mixedNodes = parseSubscription(
    [
      "ss://YWVzLTI1Ni1nY206cHc=@1.2.3.4:8388#SS",
      "trojan://pw@5.6.7.8:443#TROJAN",
      ssrLink,
      vmessLink,
    ].join("\n"),
  );

  const sharedTargets = [
    TargetFormat.Clash,
    TargetFormat.ClashR,
    TargetFormat.Surge,
    TargetFormat.QuantumultX,
    TargetFormat.Quantumult,
    TargetFormat.Loon,
    TargetFormat.SingBox,
    TargetFormat.V2Ray,
    TargetFormat.Trojan,
    TargetFormat.Mixed,
    TargetFormat.SSC,
    TargetFormat.SSR,
    TargetFormat.SSD,
    TargetFormat.NodeList,
  ];

  it("supports every implemented target format", () => {
    for (const target of sharedTargets) {
      const out = generate(
        mixedNodes.map((n) => ({ ...n })),
        { target },
      );
      expect(typeof out).toBe("string");
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it("throws for an unimplemented target", () => {
    expect(generate([ssNode("Node")], { target: TargetFormat.Mellow })).toContain("[Endpoint]");
    expect(() => generate([ssNode("Node")], { target: TargetFormat.Auto })).toThrow();
  });
});
