import { describe, expect, it } from "vitest";

import { ProxyType, createProxy, generate, parseSubscription, TargetFormat } from "../src/index";

function yaml(lines: string[]): string {
  return lines.join("\n");
}

describe("surge parser extra branches", () => {
  it("parses option-rich proxy lines", () => {
    const surge = yaml([
      "[General]",
      "loglevel = notify",
      "[Proxy]",
      "ss1 = ss, 1.1.1.1, 8388, encrypt-method=aes-256-gcm, password=pw, obfs=http, obfs-host=bing.com, udp-relay=true, tfo=true, skip-cert-verify=true",
      "custom1 = custom, 2.2.2.1, 8388, aes-256-gcm, pw, https://x/mod, obfs=http, obfs-host=bing.com, udp-relay=true, tfo=true",
      "socks1 = socks5, 3.3.3.1, 1080, u, p, udp-relay=true, tfo=true, skip-cert-verify=true",
      "vmess1 = vmess, 4.4.4.1, 443, username=uuid, ws=true, ws-path=/p, ws-headers=Host:h|Edge:e, tls=true, udp-relay=true, tfo=true, skip-cert-verify=true, tls13=true, vmess-aead=false",
      "vmess2 = vmess, 4.4.4.2, 443, username=uuid, ws=true",
      "http1 = http, 5.5.5.1, 8080, username=u, password=p, skip-cert-verify=true",
      "trojan1 = trojan, 6.6.6.1, 443, password=pw, sni=h, udp-relay=true, tfo=true, skip-cert-verify=true",
      "snell1 = snell, 7.7.7.1, 443, psk=pw, obfs=http, obfs-host=h, udp-relay=true, tfo=true, skip-cert-verify=true, version=3",
      "snell2 = snell, 7.7.7.2, 443, psk=pw",
      "anytls1 = anytls, 8.8.8.1, 443, password=pw, sni=h, udp-relay=true, tfo=true, skip-cert-verify=true",
      "wgMissing = wireguard, section-name=doesnotexist",
      "wgNoSection = wireguard, test-url=http://x",
      "direct = direct",
      "reject = reject, 1.2.3.4, 1",
      "badport = ss, 1.1.1.1, 0, encrypt-method=aes-256-gcm, password=pw",
      "unsupported = wireguard, section-name=wgsec, test-url=http://x",
      "[WireGuard wgsec]",
      "private-key = p",
      "self-ip = 10.0.0.1",
      "self-ip-v6 = fd00::1",
      "dns-server = 1.1.1.1, 8.8.8.8",
      "mtu = 1420",
      'peer = (public-key = u, allowed-ips = "0.0.0.0/0", endpoint = h:2408, client-id = 1/2/3)',
    ]);
    const nodes = parseSubscription(surge);
    const names = nodes.map((n) => n.remark);
    expect(names).toContain("ss1");
    expect(names).toContain("custom1");
    expect(names).toContain("socks1");
    expect(names).toContain("vmess1");
    expect(names).toContain("vmess2");
    expect(names).toContain("http1");
    expect(names).toContain("trojan1");
    expect(names).toContain("snell1");
    expect(names).toContain("anytls1");
    expect(names).toContain("unsupported");
    expect(names).not.toContain("badport");
    expect(names).not.toContain("wgMissing");
    expect(names).not.toContain("wgNoSection");
    expect(names).not.toContain("direct");
  });

  it("parses quanx-style inline proxies", () => {
    const surge = yaml([
      "[Proxy]",
      "shadowsocks = 1.2.3.4:8388, method=aes-256-gcm, password=pw, obfs=http, obfs-host=h, obfs-uri=/p, tag=QSS",
      "shadowsocks = 1.2.3.5:8388, method=aes-256-gcm, password=pw, obfs=wss, obfs-host=h, obfs-uri=/p, tag=QV2",
      "shadowsocks = 1.2.3.6:8388, method=aes-256-gcm, password=pw, obfs=websocket, obfs-host=h, tag=QV2N",
      "shadowsocks = 1.2.3.7:8388, method=aes-256-gcm, password=pw, tag=QPLAIN",
      "shadowsocks = 1.2.3.8:8388, method=aes-256-cfb, password=pw, ssr-protocol=auth_sha1_v4, ssr-protocol-param=pp, obfs=http_simple, obfs-host=op, tag=QSSR",
      "vmess = 1.2.3.9:443, method=auto, password=uuid, obfs=ws, obfs-host=h, obfs-uri=/p, over-tls=true, aead=false, tag=QVM",
      "trojan = 1.2.3.10:443, password=pw, over-tls=false, tag=QTJ",
      "http = 1.2.3.11:8080, username=none, password=none, over-tls=true, tag=QHTTP",
      "anytls = 1.2.3.12:443, password=pw, sni=h, tag=QAT",
      "bad = not-a-server-port",
    ]);
    const nodes = parseSubscription(surge);
    const byName = Object.fromEntries(nodes.map((n) => [n.remark, n]));
    expect(byName["QSS"]?.plugin).toBe("simple-obfs");
    expect(byName["QV2"]?.plugin).toBe("v2ray-plugin");
    expect(byName["QV2N"]?.plugin).toBe("");
    expect(byName["QPLAIN"]?.type).toBe(ProxyType.Shadowsocks);
    expect(byName["QSSR"]?.type).toBe(ProxyType.ShadowsocksR);
    expect(byName["QVM"]?.type).toBe(ProxyType.VMess);
    expect(byName["QTJ"]?.type).toBe(ProxyType.Trojan);
    expect(byName["QHTTP"]?.type).toBe(ProxyType.HTTPS);
    expect(byName["QAT"]?.type).toBe(ProxyType.AnyTLS);
  });

  it("returns false for non-proxy text", () => {
    expect(parseSubscription("[General]\nloglevel = notify")).toHaveLength(0);
  });
});

describe("clash parser extra branches", () => {
  it("parses minimal and maximal clash nodes", () => {
    const clash = yaml([
      "Proxy:",
      "  - {name: ssMin, type: ss, server: 1.1.1.1, port: 1, cipher: aes-128-gcm, password: p}",
      "  - {name: ssObfs, type: ss, server: 1.1.1.1, port: 1, cipher: aes-128-gcm, password: p, plugin: obfs, plugin-opts: {mode: http}}",
      "  - {name: ssObfsHost, type: ss, server: 1.1.1.1, port: 1, cipher: aes-128-gcm, password: p, plugin: obfs, plugin-opts: {mode: tls, host: bing.com}}",
      "  - {name: ssV2, type: ss, server: 1.1.1.1, port: 1, cipher: aes-128-gcm, password: p, plugin: v2ray-plugin, plugin-opts: {mode: websocket, host: h, path: /p, tls: true}}",
      "  - {name: socksU, type: socks5, server: 1.1.1.1, port: 1, username: u}",
      "  - {name: socksP, type: socks5, server: 1.1.1.1, port: 1, password: p}",
      "  - {name: httpU, type: http, server: 1.1.1.1, port: 1, username: u}",
      "  - {name: trojanWs, type: trojan, server: 1.1.1.1, port: 1, password: p, network: ws, ws-opts: {path: /p}, sni: h}",
      "  - {name: trojanTcp, type: trojan, server: 1.1.1.1, port: 1, password: p, network: tcp}",
      "  - {name: snellMin, type: snell, server: 1.1.1.1, port: 1, psk: p}",
      "  - {name: wgMin, type: wireguard, server: 1.1.1.1, port: 1, public-key: u, private-key: p, ip: 10.0.0.1}",
      "  - {name: vmMin, type: vmess, server: 1.1.1.1, port: 1, uuid: u, alterId: 0}",
      "  - {name: vmTls, type: vmess, server: 1.1.1.1, port: 1, uuid: u, alterId: 0, tls: true, servername: sni}",
      "  - {name: hyH, type: hysteria, server: 1.1.1.1, port: 1, obfs: xplus, up: 1Mbps, down: 2Mbps}",
      "  - {name: hyNoSpeed, type: hysteria, server: 1.1.1.1, port: 1, up: abc}",
      "  - {name: hy2min, type: hysteria2, server: 1.1.1.1, port: 1}",
      "  - {name: atMin, type: anytls, server: 1.1.1.1, port: 1}",
      "  - {name: vlMin, type: vless, server: 1.1.1.1, port: 1, uuid: u}",
      "  - {name: tuMin, type: tuic, server: 1.1.1.1, port: 1}",
      "  - {name: skipped, type: ss, server: 1.1.1.1, port: 0, cipher: aes-128-gcm, password: p}",
    ]);
    const nodes = parseSubscription(clash);
    const names = nodes.map((n) => n.remark);
    expect(names).toContain("ssMin");
    expect(names).toContain("ssV2");
    expect(names).toContain("hyH");
    expect(names).not.toContain("skipped");
  });

  it("parses a top-level proxies key via parseClashText", () => {
    const nodes = parseSubscription(
      "proxies:\n  - {name: a, type: ss, server: s, port: 1, cipher: aes-128-gcm, password: p}",
    );
    expect(nodes).toHaveLength(1);
  });
});

describe("generate clashr covers ssr param naming", () => {
  it("emits protocolparam for clashr", () => {
    const node = createProxy();
    node.type = ProxyType.ShadowsocksR;
    node.hostname = "s";
    node.port = 1;
    node.password = "pw";
    node.encryptMethod = "aes-256-cfb";
    node.protocol = "auth_sha1_v4";
    node.protocolParam = "pp";
    node.obfs = "http_simple";
    node.obfsParam = "op";
    node.remark = "SSR";
    expect(generate([node], { target: TargetFormat.ClashR })).toContain("protocolparam");
  });
});
