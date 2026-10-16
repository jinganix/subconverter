import { describe, expect, it } from "vitest";

import { ProxyType, parseSubscription } from "../src/index";

describe("clash minimal nodes hit empty-field branches", () => {
  const clash = [
    "proxies:",
    "  - {name: ss, type: ss, server: s, port: 1, cipher: aes-128-gcm, password: p}",
    "  - {name: ssr, type: ssr, server: s, port: 1, cipher: aes-256-cfb, password: p, protocol: origin, obfs: plain}",
    "  - {name: vmess, type: vmess, server: s, port: 1, uuid: u, alterId: 0}",
    "  - {name: vmessHttp, type: vmess, server: s, port: 1, uuid: u, alterId: 0, network: http}",
    "  - {name: vmessH2, type: vmess, server: s, port: 1, uuid: u, alterId: 0, network: h2}",
    "  - {name: vmessGrpc, type: vmess, server: s, port: 1, uuid: u, alterId: 0, network: grpc}",
    "  - {name: vmessWs, type: vmess, server: s, port: 1, uuid: u, alterId: 0, network: ws, ws-opts: {path: /p}}",
    "  - {name: socks, type: socks5, server: s, port: 1}",
    "  - {name: http, type: http, server: s, port: 1}",
    "  - {name: trojan, type: trojan, server: s, port: 1, password: p}",
    "  - {name: trojanGrpc, type: trojan, server: s, port: 1, password: p, network: grpc, grpc-opts: {}}",
    "  - {name: trojanWs, type: trojan, server: s, port: 1, password: p, network: ws, ws-opts: {}}",
    "  - {name: snell, type: snell, server: s, port: 1, psk: p}",
    "  - {name: snellObfs, type: snell, server: s, port: 1, psk: p, obfs-opts: {mode: http}}",
    "  - {name: wg, type: wireguard, server: s, port: 1, public-key: u, private-key: p, ip: 10.0.0.1}",
    "  - {name: hy, type: hysteria, server: s, port: 1}",
    "  - {name: hy2, type: hysteria2, server: s, port: 1}",
    "  - {name: hy2full, type: hysteria2, server: s, port: 1, up: 1, down: 2, password: p, obfs: salamander, ca: ca, ca-str: cs, cwnd: 1, hop-interval: 1, sni: h, fingerprint: fp, alpn: [h3], ports: '1,2'}",
    "  - {name: at, type: anytls, server: s, port: 1}",
    "  - {name: vless, type: vless, server: s, port: 1, uuid: u}",
    "  - {name: vlessWs, type: vless, server: s, port: 1, uuid: u, network: ws, ws-opts: {}, tls: true}",
    "  - {name: tuic, type: tuic, server: s, port: 1}",
  ].join("\n");

  it("parses without error and covers branches", () => {
    const nodes = parseSubscription(clash);
    expect(nodes.length).toBeGreaterThan(10);
    const names = nodes.map((n) => n.remark);
    expect(names).toContain("ssr");
    expect(names).toContain("snellObfs");
    expect(names).toContain("vlessWs");
    expect(names).toContain("tuic");
  });
});

describe("surge option permutations", () => {
  it("covers per-field branches", () => {
    const surge = [
      "[Proxy]",
      "ssAddon = ss, 1.1.1.1, 8388, encrypt-method=aes-256-gcm, password=pw, obfs=http",
      "ssObfsHost = ss, 1.1.1.1, 8388, encrypt-method=aes-256-gcm, password=pw, obfs=http, obfs-host=h",
      "socksOpts = socks5, 1.1.1.1, 1080, udp-relay=true",
      "vmessWide = vmess, 1.1.1.1, 443, username=u, ws=true, ws-path=/p, ws-headers=Host:h",
      "vmessEdge = vmess, 1.1.1.1, 443, username=u, ws=true, ws-path=/p, ws-headers=Host:h|Edge:e",
      "vmessTls13 = vmess, 1.1.1.1, 443, username=u, tls=true, tls13=true",
      "httpSkip = http, 1.1.1.1, 8080, skip-cert-verify=true",
      "trojanUdp = trojan, 1.1.1.1, 443, password=pw, udp-relay=true",
      "snellFull = snell, 1.1.1.1, 443, psk=pw, obfs=http, obfs-host=h, version=3",
      "anytlsUdp = anytls, 1.1.1.1, 443, password=pw, udp-relay=true",
      "bad = ss, 1.1.1.1, 0, encrypt-method=aes-256-gcm, password=pw",
      "short = ss, 1.1.1.1",
    ].join("\n");
    const nodes = parseSubscription(surge);
    const byName = Object.fromEntries(nodes.map((n) => [n.remark, n]));
    expect(byName["ssObfsHost"]?.plugin).toBe("simple-obfs");
    expect(byName["vmessEdge"]?.edge).toBe("e");
    expect(byName["vmessTls13"]?.tls13).toBe(true);
    expect(byName["anytlsUdp"]?.type).toBe(ProxyType.AnyTLS);
    expect(byName["bad"]).toBeUndefined();
    expect(byName["short"]).toBeUndefined();
  });

  it("covers quanx sub-branches", () => {
    const surge = [
      "[Proxy]",
      "shadowsocks = 1.2.3.4:8388, method=aes-256-gcm, password=pw, obfs=http, obfs-host=h, obfs-uri=/p, tag=A",
      "shadowsocks = 1.2.3.5:8388, method=aes-256-gcm, password=pw, obfs=ws, obfs-host=h, obfs-uri=/p, tag=B",
      "shadowsocks = 1.2.3.6:8388, method=aes-256-gcm, password=pw, obfs=tls, tag=C",
      "shadowsocks = 1.2.3.7:8388, method=aes-256-gcm, password=pw, obfs=weird, tag=D",
      "vmess = 1.2.3.8:443, method=auto, password=u, obfs=ws, obfs-host=h, obfs-uri=/p, tag=E",
      "vmess = 1.2.3.9:443, method=auto, password=u, obfs=over-tls, obfs-host=h, tag=F",
      "vmess = 1.2.3.10:443, method=auto, password=u, obfs=wss, obfs-host=h, obfs-uri=/p, tag=G",
      "vmess = 1.2.3.11:443, method=auto, password=u, aead=true, tag=H",
      "trojan = 1.2.3.12:443, password=pw, tls-verification=false, tag=I",
      "http = 1.2.3.13:8080, username=u, password=p, over-tls=true, tag=J",
      "anytls = 1.2.3.14:443, password=pw, sni=h, tag=K",
    ].join("\n");
    const nodes = parseSubscription(surge);
    const byName = Object.fromEntries(nodes.map((n) => [n.remark, n]));
    expect(byName["C"]?.plugin).toBe("simple-obfs");
    expect(byName["D"]?.type).toBe(ProxyType.Shadowsocks);
    expect(byName["H"]?.alterId).toBe(0);
    expect(byName["I"]?.allowInsecure).toBe(true);
    expect(byName["J"]?.tlsSecure).toBe(true);
  });
});

describe("conf parser error paths", () => {
  it("ignores invalid JSON configs", () => {
    for (const bad of [
      "not json",
      '{"version": 1}',
      '{"servers": []}',
      '{"configs": "nope"}',
      '{"outbounds": []}',
      '{"vmess": []}',
      '{"configs": []}',
      '{"Server": []}',
    ]) {
      expect(parseSubscription(bad)).toHaveLength(0);
    }
  });
});
