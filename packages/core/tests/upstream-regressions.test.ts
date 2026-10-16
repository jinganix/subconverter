import { describe, expect, it } from "vitest";

import {
  ProxyType,
  base64Encode,
  createExtraSettings,
  createProxy,
  dedupeNodes,
  generate,
  generatePeer,
  hysteria2Construct,
  parseLink,
  parseSubscription,
  ssConstruct,
  toSurge,
  wireGuardConstruct,
  TargetFormat,
} from "../src/index";

describe("upstream regression: ISSUE 897 / PR 849 — ss special characters", () => {
  it("round-trips an SS2022 password containing base64-significant characters", () => {
    const password = "pa/ss+word/with+special==";
    const link = `ss://${base64Encode(`2022-blake3-aes-256-gcm:${password}`)}@1.2.3.4:8388#SS2022`;
    const node = parseLink(link);
    expect(node?.type).toBe(ProxyType.Shadowsocks);
    expect(node?.encryptMethod).toBe("2022-blake3-aes-256-gcm");
    expect(node?.password).toBe(password);
  });
});

describe("upstream regression: ISSUE 877 — net:+tls standard vmess", () => {
  it("parses tcp+tls standard vmess links", () => {
    const node = parseLink(
      "vmess://tcp+tls:b831381d-6324-4d53-ad4f-8cda48b30811-0@1.2.3.4:443#TCPTLS",
    );
    expect(node?.type).toBe(ProxyType.VMess);
    expect(node?.transferProtocol).toBe("tcp");
    expect(node?.tlsSecure).toBe(true);
  });
});

describe("upstream regression: PR 889 / 876 — hysteria2 port ranges", () => {
  it("imports mport/ports and exports sing-box server_ports", () => {
    const node = parseLink("hysteria2://pw@1.2.3.4:443?mport=443,500-600&up=50&down=100#HY2");
    expect(node?.type).toBe(ProxyType.Hysteria2);
    expect(node?.ports).toBe("443,500-600");
    const sb = generate([node!], { target: TargetFormat.SingBox });
    const doc = JSON.parse(sb) as { outbounds: Array<Record<string, unknown>> };
    const entry = doc.outbounds.find((o) => o.tag === "HY2");
    expect(entry?.server_ports).toEqual(["443:443", "500-600"]);
  });
});

describe("upstream regression: PR 904 / 903 — hysteria2 bandwidth and fingerprint", () => {
  it("keeps up/down bandwidth and fingerprint on clash export", () => {
    const node = createProxy();
    hysteria2Construct(node, {
      down: "100",
      fingerprint: "sha256-fp",
      group: "G",
      password: "pw",
      port: 443,
      remark: "HY2",
      server: "1.2.3.4",
      up: "50",
    });
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const clash = generate([node], { settings, target: TargetFormat.Clash });
    expect(clash).toContain("up: 50");
    expect(clash).toContain("down: 100");
    expect(clash).toContain("fingerprint: sha256-fp");
    const sb = generate([node], { target: TargetFormat.SingBox });
    expect(sb).toContain('"up_mbps": 50');
    expect(sb).toContain('"down_mbps": 100');
  });
});

describe("upstream regression: PR 848 / ISSUE 881 — clash dialer-proxy", () => {
  it("emits and re-parses dialer-proxy with the new field names", () => {
    const node = createProxy();
    node.type = ProxyType.Trojan;
    node.hostname = "1.2.3.4";
    node.port = 443;
    node.password = "pw";
    node.remark = "TJ";
    node.tlsSecure = true;
    node.underlyingProxy = "DIRECT";
    const settings = createExtraSettings();
    settings.clashNewFieldName = true;
    const clash = generate([node], { settings, target: TargetFormat.Clash });
    expect(clash).toContain("dialer-proxy: DIRECT");
    const back = parseSubscription(clash);
    expect(back[0]?.underlyingProxy).toBe("DIRECT");
  });
});

describe("upstream regression: PR 840 / ISSUE 855 — wireguard preshared-key and keepalive", () => {
  it("exports preshared-key and keepalive for Surge/Loon", () => {
    const node = createProxy();
    wireGuardConstruct(node, {
      dnsServers: ["1.1.1.1"],
      group: "G",
      keepAlive: 25,
      mtu: 1420,
      port: 2408,
      preSharedKey: "psk",
      privateKey: "priv",
      publicKey: "pub",
      remark: "WG",
      selfIp: "10.0.0.1",
      server: "engage.example.com",
    });
    expect(generatePeer(node)).toContain("preshared-key = psk");
    expect(generatePeer(node)).toContain("keepalive = 25");
    const settings = createExtraSettings();
    const surge = toSurge([node], [], settings, { baseConf: "", nodeList: false, version: 4 });
    expect(surge).toContain("preshared-key = psk");
    expect(surge).toContain("keepalive = 25");
  });
});

describe("upstream regression: PR 898 — identification headers", () => {
  it("uses a neutral default User-Agent helper string", () => {
    // The UA is applied by the node adapter; core generation must not embed it.
    const settings = createExtraSettings();
    const node = createProxy();
    ssConstruct(node, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      port: 1,
      remark: "N",
      server: "s",
    });
    expect(generate([node], { settings, target: TargetFormat.Clash })).not.toContain(
      "subconverter",
    );
  });
});

describe("node de-duplication", () => {
  it("removes identical nodes and reports the count", () => {
    const a = createProxy();
    ssConstruct(a, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      port: 8388,
      remark: "dup",
      server: "1.2.3.4",
    });
    const b = createProxy();
    ssConstruct(b, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      port: 8388,
      remark: "dup",
      server: "1.2.3.4",
    });
    const c = createProxy();
    ssConstruct(c, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      port: 8388,
      remark: "other",
      server: "1.2.3.4",
    });
    const nodes = [a, b, c];
    expect(dedupeNodes(nodes)).toBe(1);
    expect(nodes.map((n) => n.remark)).toEqual(["dup", "other"]);
  });

  it("is applied by the engine when enabled", () => {
    const settings = createExtraSettings();
    settings.dedupe = true;
    const a = createProxy();
    ssConstruct(a, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      port: 8388,
      remark: "dup",
      server: "1.2.3.4",
    });
    const b = createProxy();
    ssConstruct(b, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      port: 8388,
      remark: "dup",
      server: "1.2.3.4",
    });
    const clash = generate([a, b], { settings, target: TargetFormat.Clash });
    expect(clash.match(/name: dup/g)).toHaveLength(1);
  });
});
