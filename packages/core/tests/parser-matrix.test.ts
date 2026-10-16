import { describe, expect, it } from "vitest";

import {
  ProxyType,
  base64Encode,
  createProxy,
  explodeAnyTls,
  explodeClash,
  explodeHttp,
  explodeHttpSub,
  explodeHysteria2,
  explodeKitsunebi,
  explodeNetch,
  explodeNetchConf,
  explodeQuan,
  explodeShadowrocket,
  explodeSocks,
  explodeSs,
  explodeSsAndroid,
  explodeSsConf,
  explodeSsd,
  explodeSsrConf,
  explodeSstap,
  explodeVmess,
  explodeVmessConf,
  parseLink,
  parseSubscription,
} from "../src/index";

function yaml(lines: string[]): string {
  return lines.join("\n");
}

describe("Clash parser covers all proxy types", () => {
  const clash = yaml([
    "proxies:",
    "  - {name: ss1, type: ss, server: 1.1.1.1, port: 8388, cipher: aes-256-gcm, password: pw, udp: true}",
    "  - {name: ss2, type: ss, server: 1.1.1.2, port: 8388, cipher: AEAD_CHACHA20_POLY1305, password: pw, plugin: obfs, plugin-opts: {mode: http, host: bing.com}}",
    "  - {name: ss3, type: ss, server: 1.1.1.3, port: 8388, cipher: AEAD_AES_128_GCM, password: pw, plugin: v2ray-plugin, plugin-opts: {mode: websocket, host: h.com, tls: true, path: /p, mux: true}}",
    "  - {name: ss4, type: ss, server: 1.1.1.4, port: 8388, cipher: aes-256-cfb, password: pw, obfs: http, obfs-host: bing.com}",
    "  - {name: ssr1, type: ssr, server: 2.2.2.1, port: 8388, cipher: aes-256-cfb, password: pw, protocol: auth_sha1_v4, obfs: http_simple, protocol-param: pp, obfs-param: op}",
    "  - {name: ssr2, type: ssr, server: 2.2.2.2, port: 8388, cipher: dummy, password: pw, protocol: origin, obfs: plain, protocolparam: pp, obfsparam: op}",
    "  - {name: vm1, type: vmess, server: 3.3.3.1, port: 443, uuid: uuid, alterId: 0, cipher: auto, tls: true}",
    "  - {name: vm2, type: vmess, server: 3.3.3.2, port: 443, uuid: uuid, alterId: 0, network: ws, ws-opts: {path: /p, headers: {Host: h, Edge: e}}}",
    "  - {name: vm3, type: vmess, server: 3.3.3.3, port: 443, uuid: uuid, alterId: 0, network: ws, ws-path: /old, ws-headers: {Host: h}}",
    "  - {name: vm4, type: vmess, server: 3.3.3.4, port: 443, uuid: uuid, alterId: 0, network: http, http-opts: {path: [/p], headers: {Host: [h]}}}",
    "  - {name: vm5, type: vmess, server: 3.3.3.5, port: 443, uuid: uuid, alterId: 0, network: h2, h2-opts: {path: /p, host: [h]}}",
    "  - {name: vm6, type: vmess, server: 3.3.3.6, port: 443, uuid: uuid, alterId: 0, network: grpc, grpc-opts: {grpc-service-name: gs}}",
    "  - {name: socks1, type: socks5, server: 4.4.4.1, port: 1080, username: u, password: p}",
    "  - {name: http1, type: http, server: 5.5.5.1, port: 8080, username: u, password: p, tls: true}",
    "  - {name: tj1, type: trojan, server: 6.6.6.1, port: 443, password: pw, sni: h}",
    "  - {name: tj2, type: trojan, server: 6.6.6.2, port: 443, password: pw, network: grpc, grpc-opts: {grpc-service-name: gs}}",
    "  - {name: tj3, type: trojan, server: 6.6.6.3, port: 443, password: pw, network: ws, ws-opts: {path: /p}}",
    "  - {name: sn1, type: snell, server: 7.7.7.1, port: 443, psk: pw, obfs-opts: {mode: http, host: h}, version: 3}",
    "  - {name: wg1, type: wireguard, server: 8.8.8.1, port: 2408, public-key: pub, private-key: priv, ip: 10.0.0.1, ipv6: fd00::1, preshared-key: psk, dns: [1.1.1.1], mtu: 1420}",
    "  - {name: hy1, type: hysteria, server: 9.9.9.1, port: 443, ports: 443-500, protocol: udp, obfs-protocol: xplus, up: 50, down: 100, auth-str: secret, obfs: xplus, sni: h, fingerprint: fp, ca: ca, ca-str: castr, recv-window-conn: 10, recv-window: 20, disable-mtu-discovery: true, hop-interval: 30, alpn: [h3]}",
    "  - {name: hy1b, type: hysteria, server: 9.9.9.2, port: 443, up: 1Mbps, down: 2Mbps, auth: c2VjcmV0}",
    "  - {name: hy2, type: hysteria2, server: 10.10.10.1, port: 443, ports: 443, up: 50, down: 100, password: pw, obfs: salamander, obfs-password: obfspw, sni: h, fingerprint: fp, alpn: h3, ca: ca, ca-str: castr, cwnd: 10, hop-interval: 30}",
    "  - {name: hy2b, type: hysteria2, server: 10.10.10.2, port: 443, auth: authpw}",
    "  - {name: at1, type: anytls, server: 11.11.11.1, port: 443, password: pw, sni: h}",
    "  - {name: vl1, type: vless, server: 12.12.12.1, port: 443, uuid: uuid, flow: xtls-rprx-vision, tls: true, servername: h, network: ws, ws-opts: {path: /p, headers: {Host: h}}, client-fingerprint: chrome, alpn: [h2]}",
    "  - {name: vl2, type: vless, server: 12.12.12.2, port: 443, uuid: uuid, network: grpc, grpc-opts: {grpc-service-name: gs}}",
    "  - {name: vl3, type: vless, server: 12.12.12.3, port: 443, uuid: uuid, network: tcp}",
    "  - {name: tu1, type: tuic, server: 13.13.13.1, port: 443, uuid: uuid, password: pw, congestion-controller: bbr, alpn: [h3], sni: h}",
    "  - {name: skip0, type: unknown, server: 1.1.1.1, port: 0}",
  ]);

  it("parses every supported type", () => {
    const nodes = parseSubscription(clash);
    const byName = Object.fromEntries(nodes.map((n) => [n.remark, n]));
    expect(byName["ss1"]?.type).toBe(ProxyType.Shadowsocks);
    expect(byName["ss2"]?.plugin).toBe("obfs-local");
    expect(byName["ss3"]?.plugin).toBe("v2ray-plugin");
    expect(byName["ss3"]?.pluginOption).toContain("mux=");
    expect(byName["ss4"]?.plugin).toBe("obfs-local");
    expect(byName["ssr1"]?.type).toBe(ProxyType.ShadowsocksR);
    expect(byName["ssr2"]?.encryptMethod).toBe("none");
    expect(byName["vm1"]?.type).toBe(ProxyType.VMess);
    expect(byName["vm2"]?.transferProtocol).toBe("ws");
    expect(byName["vm3"]?.transferProtocol).toBe("ws");
    expect(byName["vm4"]?.transferProtocol).toBe("http");
    expect(byName["vm5"]?.transferProtocol).toBe("h2");
    expect(byName["vm6"]?.transferProtocol).toBe("grpc");
    expect(byName["socks1"]?.type).toBe(ProxyType.SOCKS5);
    expect(byName["http1"]?.type).toBe(ProxyType.HTTPS);
    expect(byName["http1"]?.tlsSecure).toBe(true);
    expect(byName["tj1"]?.type).toBe(ProxyType.Trojan);
    expect(byName["tj2"]?.transferProtocol).toBe("grpc");
    expect(byName["tj3"]?.transferProtocol).toBe("ws");
    expect(byName["sn1"]?.type).toBe(ProxyType.Snell);
    expect(byName["sn1"]?.snellVersion).toBe(3);
    expect(byName["wg1"]?.type).toBe(ProxyType.WireGuard);
    expect(byName["wg1"]?.dnsServers).toEqual(["1.1.1.1"]);
    expect(byName["hy1"]?.type).toBe(ProxyType.Hysteria);
    expect(byName["hy1"]?.up).toBe("50 Mbps");
    expect(byName["hy1b"]?.up).toBe("1Mbps");
    expect(byName["hy1b"]?.authStr).toBe("secret");
    expect(byName["hy2"]?.type).toBe(ProxyType.Hysteria2);
    expect(byName["hy2b"]?.password).toBe("authpw");
    expect(byName["at1"]?.type).toBe(ProxyType.AnyTLS);
    expect(byName["vl1"]?.type).toBe(ProxyType.VLESS);
    expect(byName["vl1"]?.flow).toBe("xtls-rprx-vision");
    expect(byName["vl2"]?.transferProtocol).toBe("grpc");
    expect(byName["tu1"]?.type).toBe(ProxyType.TUIC);
    expect(byName["tu1"]?.congestionControl).toBe("bbr");
    expect(byName["skip0"]).toBeUndefined();
  });

  it("also accepts the legacy Proxy key", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeClash(
      {
        Proxy: [
          { cipher: "aes-128-gcm", name: "p", password: "x", port: 1, server: "s", type: "ss" },
        ],
      },
      nodes,
    );
    expect(nodes).toHaveLength(1);
  });
});

describe("Surge parser covers all proxy types", () => {
  const surge = yaml([
    "[Proxy]",
    "ss1 = ss, 1.1.1.1, 8388, encrypt-method=aes-256-gcm, password=pw, udp-relay=true, tfo=true",
    "ssr1 = ssr, 2.2.2.1, 8388, encrypt-method=aes-256-cfb, password=pw, protocol=auth_sha1_v4, obfs=http_simple",
    "custom1 = custom, 3.3.3.1, 8388, aes-256-gcm, pw, https://example.com/mod, obfs=http, obfs-host=bing.com",
    "socks1 = socks5, 4.4.4.1, 1080, u, p, udp-relay=true",
    "vmess1 = vmess, 5.5.5.1, 443, username=uuid, ws=true, ws-path=/p, ws-headers=Host:h|Edge:e, tls=true, skip-cert-verify=true, vmess-aead=false",
    "vmess2 = vmess, 5.5.5.2, 443, username=uuid, tls=true, vmess-aead=true",
    "http1 = http, 6.6.6.1, 8080, username=u, password=p, skip-cert-verify=true",
    "trojan1 = trojan, 7.7.7.1, 443, password=pw, sni=h, udp-relay=true",
    "snell1 = snell, 8.8.8.1, 443, psk=pw, obfs=http, obfs-host=h, version=3",
    "anytls1 = anytls, 9.9.9.1, 443, password=pw, sni=h",
    "wg1 = wireguard, section-name=wgsec, test-url=http://x",
    "shadowsocks = 10.10.10.1:8388, method=aes-256-gcm, password=pw, obfs=ws, obfs-host=h, obfs-uri=/p, tag=QSS, udp-relay=true, fast-open=true",
    "vmess = 11.11.11.1:443, method=auto, password=uuid2, obfs=wss, obfs-host=h, obfs-uri=/p, over-tls=true, tag=QV",
    "trojan = 12.12.12.1:443, password=pw, over-tls=true, tls-host=h, tls-verification=false, tag=QT",
    "http = 13.13.13.1:8080, username=none, password=none, over-tls=false, tag=QH",
    "anytls = 14.14.14.1:443, password=pw, sni=h, tag=QA",
    "[WireGuard wgsec]",
    "private-key = priv",
    "self-ip = 10.0.0.1",
    "dns-server = 1.1.1.1, 8.8.8.8",
    "mtu = 1420",
    'peer = (public-key = pub, allowed-ips = "0.0.0.0/0", endpoint = engage.example.com:2408)',
  ]);

  it("parses most surge node types", () => {
    const nodes = parseSubscription(surge);
    const byName = Object.fromEntries(nodes.map((n) => [n.remark, n]));
    expect(byName["ss1"]?.encryptMethod).toBe("aes-256-gcm");
    expect(byName["custom1"]?.plugin).toBe("simple-obfs");
    expect(byName["socks1"]?.type).toBe(ProxyType.SOCKS5);
    expect(byName["vmess1"]?.transferProtocol).toBe("ws");
    expect(byName["vmess1"]?.edge).toBe("e");
    expect(byName["vmess2"]?.alterId).toBe(0);
    expect(byName["http1"]?.type).toBe(ProxyType.HTTP);
    expect(byName["trojan1"]?.type).toBe(ProxyType.Trojan);
    expect(byName["snell1"]?.snellVersion).toBe(3);
    expect(byName["anytls1"]?.type).toBe(ProxyType.AnyTLS);
    expect(byName["wg1"]?.type).toBe(ProxyType.WireGuard);
    expect(byName["wg1"]?.publicKey).toBe("pub");
    expect(byName["wg1"]?.dnsServers).toEqual(["1.1.1.1", "8.8.8.8"]);
    expect(byName["QSS"]?.plugin).toBe("v2ray-plugin");
    expect(byName["QV"]?.tlsSecure).toBe(true);
    expect(byName["QT"]?.allowInsecure).toBe(true);
    expect(byName["QH"]?.username).toBe("");
    expect(byName["QA"]?.type).toBe(ProxyType.AnyTLS);
  });
});

describe("conf parsers", () => {
  it("parses ssconf (Shadowsocks Android version/servers)", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeSsConf(
      JSON.stringify({
        remarks: "G",
        servers: [
          { method: "aes-256-gcm", password: "pw", port: 8388, remark: "n1", server: "1.2.3.4" },
        ],
        version: 1,
      }),
      nodes,
    );
    expect(nodes[0]?.group).toBe("G");
    expect(nodes[0]?.encryptMethod).toBe("aes-256-gcm");
  });

  it("parses ssconf configs/remarks fallback", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeSsConf(
      JSON.stringify({
        configs: [{ method: "aes-128-gcm", password: "x", server: "1.2.3.4", server_port: 80 }],
      }),
      nodes,
    );
    expect(nodes[0]?.remark).toBe("1.2.3.4:80");
  });

  it("parses Shadowsocks Android node arrays", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeSsAndroid(
      JSON.stringify([
        {
          method: "aes-128-gcm",
          password: "x",
          plugin: "obfs-local",
          plugin_opts: "obfs=http",
          remarks: "n",
          server: "1.2.3.4",
          server_port: 80,
        },
      ]),
      nodes,
    );
    expect(nodes[0]?.plugin).toBe("obfs-local");
  });

  it("parses ssr single libev config", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeSsrConf(
      JSON.stringify({
        local_address: "0.0.0.0",
        local_port: 1080,
        method: "aes-256-cfb",
        obfs: "http_simple",
        password: "pw",
        protocol: "auth_sha1_v4",
        server: "1.2.3.4",
        server_port: 8388,
      }),
      nodes,
    );
    expect(nodes[0]?.type).toBe(ProxyType.ShadowsocksR);
  });

  it("parses ssr configs list and flattens", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeSsrConf(
      JSON.stringify({
        configs: [
          {
            group: "G",
            method: "aes-256-gcm",
            obfs: "plain",
            password: "pw",
            protocol: "origin",
            server: "1.2.3.4",
            server_port: 8388,
          },
          {
            method: "aes-256-cfb",
            obfs: "http_simple",
            password: "pw",
            protocol: "auth_sha1_v4",
            server: "1.2.3.5",
            server_port: 8388,
          },
        ],
      }),
      nodes,
    );
    expect(nodes[0]?.type).toBe(ProxyType.ShadowsocksR);
    expect(nodes[0]?.group).toBe("G");
    expect(nodes[1]?.type).toBe(ProxyType.ShadowsocksR);
  });

  it("parses v2rayN outbounds config", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeVmessConf(
      JSON.stringify({
        outbounds: [
          {
            settings: {
              vnext: [
                {
                  address: "1.2.3.4",
                  port: 443,
                  users: [{ alterId: 0, id: "uuid", security: "auto" }],
                },
              ],
            },
            streamSettings: {
              network: "ws",
              security: "tls",
              tcpSettings: {
                header: { request: { headers: { Host: "h2" }, path: ["/q"] }, type: "http" },
              },
              wsSettings: { headers: { Host: "h" }, path: "/p" },
            },
          },
        ],
      }),
      nodes,
    );
    expect(nodes[0]?.type).toBe(ProxyType.VMess);
    expect(nodes[0]?.host).toBe("h2");
  });

  it("parses v2rayN list config", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeVmessConf(
      JSON.stringify({
        subItem: [{ id: "sid", remarks: "Group" }],
        vmess: [
          {
            address: "1.2.3.4",
            configType: 1,
            headerType: "none",
            id: "uuid",
            network: "tcp",
            port: 443,
            remarks: "n",
            security: "auto",
            streamSecurity: "tls",
            subid: "sid",
          },
          {
            address: "1.2.3.5",
            configType: 3,
            id: "pw",
            port: 8388,
            remarks: "ss",
            security: "aes-256-gcm",
          },
          { address: "1.2.3.6", configType: 4, port: 1080, remarks: "socks" },
          { address: "1.2.3.7", configType: 99, port: 1 },
        ],
      }),
      nodes,
    );
    expect(nodes).toHaveLength(3);
    expect(nodes[0]?.group).toBe("Group");
    expect(nodes[1]?.type).toBe(ProxyType.Shadowsocks);
    expect(nodes[2]?.type).toBe(ProxyType.SOCKS5);
  });

  it("parses SSTap configs", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeSstap(
      JSON.stringify({
        configs: [
          {
            group: "G",
            password: "pw",
            remarks: "s1",
            server: "1.2.3.4",
            server_port: 1080,
            type: 5,
            username: "u",
          },
          {
            method: "aes-256-gcm",
            obfs: "plain",
            password: "pw",
            protocol: "origin",
            server: "1.2.3.5",
            server_port: 8388,
            type: 6,
          },
          {
            method: "aes-256-cfb",
            obfs: "http_simple",
            password: "pw",
            protocol: "auth_sha1_v4",
            server: "1.2.3.6",
            server_port: 8388,
            type: 6,
          },
        ],
      }),
      nodes,
    );
    expect(nodes[0]?.type).toBe(ProxyType.SOCKS5);
    expect(nodes[1]?.type).toBe(ProxyType.Shadowsocks);
    expect(nodes[2]?.type).toBe(ProxyType.ShadowsocksR);
  });

  it("parses Netch conf", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeNetchConf(
      JSON.stringify({
        Server: [
          {
            EncryptMethod: "aes-256-gcm",
            Hostname: "1.2.3.4",
            Password: "pw",
            Port: 8388,
            Remark: "n",
            Type: "SS",
          },
        ],
      }),
      nodes,
    );
    expect(nodes[0]?.type).toBe(ProxyType.Shadowsocks);
  });
});

describe("URI parsers edge cases", () => {
  it("parses socks:// and tg://socks", () => {
    const a = parseLink(`socks://${base64Encode("user:pass@1.2.3.4:1080")}#Node`);
    expect(a?.type).toBe(ProxyType.SOCKS5);
    expect(a?.username).toBe("user");
    const b = parseLink("tg://socks?server=1.2.3.4&port=1080&user=u&pass=p");
    expect(b?.type).toBe(ProxyType.SOCKS5);
  });

  it("parses telegram http links", () => {
    const node = parseLink("https://t.me/http?server=1.2.3.4&port=8080&user=u&pass=p&remarks=n");
    expect(node?.type).toBe(ProxyType.HTTP);
  });

  it("parses http(s) base64 sub links", () => {
    const node = parseLink(`http://${base64Encode("1.2.3.4:8080")}?remarks=n`);
    expect(node?.type).toBe(ProxyType.HTTP);
    const secure = parseLink(`https://${base64Encode("u:p@1.2.3.4:8080")}`);
    expect(secure?.type).toBe(ProxyType.HTTPS);
  });

  it("parses kitsunebi vmess1 links", () => {
    const node = parseLink("vmess1://uuid@1.2.3.4:443/?network=ws&tls=true&ws.host=h#N");
    expect(node?.type).toBe(ProxyType.VMess);
    expect(node?.transferProtocol).toBe("ws");
  });

  it("parses shadowrocket vmess links", () => {
    const payload = base64Encode("auto:uuid@1.2.3.4:443");
    const node = parseLink(`vmess://${payload}?remarks=n&obfs=websocket&obfsParam=h&path=/p`);
    expect(node?.type).toBe(ProxyType.VMess);
    expect(node?.transferProtocol).toBe("ws");
  });

  it("parses Quantumult vmess definitions", () => {
    const node = createProxy();
    explodeQuan(
      'n = vmess, 1.2.3.4, 443, auto, "uuid", over-tls=true, tls-host=h, obfs=ws, obfs-path="/p", obfs-header="Host: h[Rr][Nn]Edge: e"',
      node,
    );
    expect(node.type).toBe(ProxyType.VMess);
    expect(node.host).toBe("h");
    expect(node.edge).toBe("e");
  });

  it("parses hysteria2 additional variants", () => {
    const a = parseLink(
      "hy2://pw@1.2.3.4:443?insecure=1&up=50&down=100&sni=h&obfs=salamander&obfs-password=x&alpn=h3#N",
    );
    expect(a?.type).toBe(ProxyType.Hysteria2);
    expect(a?.allowInsecure).toBe(true);
    const b = parseLink("hysteria2://1.2.3.4:443?password=pw#N2");
    expect(b?.type).toBe(ProxyType.Hysteria2);
  });

  it("parses anytls links", () => {
    const node = parseLink("anytls://pw@1.2.3.4:443?sni=h&udp=1&insecure=1#N");
    expect(node?.type).toBe(ProxyType.AnyTLS);
    expect(node?.udp).toBe(true);
    expect(node?.allowInsecure).toBe(true);
  });

  it("parses Netch:// links", () => {
    const node = createProxy();
    explodeNetch(
      `Netch://${base64Encode(
        JSON.stringify({
          AlterID: 0,
          EnableTFO: true,
          EnableUDP: true,
          EncryptMethod: "auto",
          FakeType: "none",
          Hostname: "1.2.3.4",
          Password: "",
          Path: "/p",
          Port: 443,
          Remark: "n",
          TransferProtocol: "ws",
          Type: "VMess",
          UserID: "uuid",
        }),
      )}`,
      node,
    );
    expect(node.type).toBe(ProxyType.VMess);
    expect(node.transferProtocol).toBe("ws");
  });

  it("parses Netch:// for SSR/SS/Socks/HTTP/Trojan/Snell", () => {
    const cases: Array<[string, ProxyType]> = [
      ["SS", ProxyType.Shadowsocks],
      ["SSR", ProxyType.ShadowsocksR],
      ["Socks5", ProxyType.SOCKS5],
      ["HTTP", ProxyType.HTTP],
      ["Trojan", ProxyType.Trojan],
      ["Snell", ProxyType.Snell],
    ];
    for (const [type, expected] of cases) {
      const node = createProxy();
      const isSsr = type === "SSR";
      explodeNetch(
        `Netch://${base64Encode(
          JSON.stringify({
            EncryptMethod: isSsr ? "aes-256-cfb" : "aes-256-gcm",
            Hostname: "1.2.3.4",
            OBFS: isSsr ? "http_simple" : "plain",
            Password: "pw",
            Port: 443,
            Protocol: isSsr ? "auth_sha1_v4" : "origin",
            Remark: "n",
            Type: type,
          }),
        )}`,
        node,
      );
      expect(node.type).toBe(expected);
    }
  });

  it("parses ssd:// with object servers", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeSsd(
      `ssd://${base64Encode(
        JSON.stringify({
          airport: "A",
          servers: {
            s0: { encryption: "aes-128-gcm", password: "pw", port: 80, server: "1.2.3.4" },
          },
        }),
      )}`,
      nodes,
    );
    expect(nodes).toHaveLength(1);
  });

  it("ignores malformed links", () => {
    for (const link of [
      "ss://bogus",
      "vmess://notbase64",
      "trojan://no-at-sign",
      "Netch://@@@",
      "ssd://@@@",
    ]) {
      expect(parseLink(link)).toBeUndefined();
    }
  });

  it("parses direct explode helpers", () => {
    const node = createProxy();
    explodeSs(`ss://${base64Encode("aes-256-gcm:pw")}@1.2.3.4:8388`, node);
    expect(node.type).toBe(ProxyType.Shadowsocks);

    const sr = createProxy();
    explodeSocks("socks://" + base64Encode("1.2.3.4:1080"), sr);
    expect(sr.type).toBe(ProxyType.SOCKS5);

    const hp = createProxy();
    explodeHttp("tg://http?server=1.2.3.4&port=8080", hp);
    expect(hp.type).toBe(ProxyType.HTTP);

    const hs = createProxy();
    explodeHttpSub("http://" + base64Encode("1.2.3.4:8080"), hs);
    expect(hs.type).toBe(ProxyType.HTTP);

    const vm = createProxy();
    explodeVmess(
      "vmess://" +
        base64Encode(
          JSON.stringify({
            add: "1.2.3.4",
            aid: "0",
            id: "u",
            net: "tcp",
            port: "443",
            ps: "n",
            v: "2",
          }),
        ),
      vm,
    );
    expect(vm.type).toBe(ProxyType.VMess);

    const sk = createProxy();
    explodeShadowrocket("vmess://" + base64Encode("auto:u@1.2.3.4:443") + "?remarks=n", sk);
    expect(sk.type).toBe(ProxyType.VMess);

    const kb = createProxy();
    explodeKitsunebi("vmess1://u@1.2.3.4:443?network=tcp", kb);
    expect(kb.type).toBe(ProxyType.VMess);

    const at = createProxy();
    explodeAnyTls("anytls://pw@1.2.3.4:443#N", at);
    expect(at.type).toBe(ProxyType.AnyTLS);

    const hy = createProxy();
    explodeHysteria2("hysteria2://pw@1.2.3.4:443#N", hy);
    expect(hy.type).toBe(ProxyType.Hysteria2);
  });

  it("parses a surge config embedded in a base64 subscription", () => {
    const surge =
      "vmess = 1.2.3.4:443, method=auto, password=uuid, obfs=ws, obfs-host=h, obfs-uri=/p, tag=N";
    const nodes = parseSubscription(base64Encode(surge));
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe(ProxyType.VMess);
  });

  it("parses a bare whitespace-separated surge proxy list", () => {
    const nodes = parseSubscription(
      "shadowsocks = 1.2.3.4:8388, method=aes-256-gcm, password=pw, tag=A",
    );
    expect(nodes).toHaveLength(1);
  });

  it("parses an ssd:// subscription body", () => {
    const body = `ssd://${base64Encode(
      JSON.stringify({
        airport: "A",
        servers: [{ encryption: "aes-128-gcm", password: "pw", port: 80, server: "1.2.3.4" }],
      }),
    )}`;
    expect(parseSubscription(body)).toHaveLength(1);
  });
});
