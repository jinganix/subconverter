import { describe, expect, it } from "vitest";

import {
  ProxyType,
  base64Encode,
  explode,
  explodeSs,
  explodeSsr,
  explodeTrojan,
  explodeVmess,
  parseLink,
  parseSubscription,
  base64Decode,
  createProxy,
} from "../src/index";

describe("explodeSs", () => {
  it("parses a base64 userinfo ss link", () => {
    const node = createProxy();
    explodeSs("ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@1.2.3.4:8388#TestNode", node);
    expect(node.type).toBe(ProxyType.Shadowsocks);
    expect(node.encryptMethod).toBe("aes-256-gcm");
    expect(node.password).toBe("password");
    expect(node.hostname).toBe("1.2.3.4");
    expect(node.port).toBe(8388);
    expect(node.remark).toBe("TestNode");
  });

  it("parses a fully base64-encoded ss link", () => {
    const payload = base64Encode("aes-128-gcm:secret@9.9.9.9:443");
    const node = createProxy();
    explodeSs(`ss://${payload}`, node);
    expect(node.hostname).toBe("9.9.9.9");
    expect(node.port).toBe(443);
    expect(node.encryptMethod).toBe("aes-128-gcm");
    expect(node.password).toBe("secret");
    expect(node.remark).toBe("9.9.9.9:443");
  });

  it("parses plugin options", () => {
    const secret = base64Encode("chacha20-ietf-poly1305:pw");
    const link = `ss://${secret}@1.2.3.4:8388/?plugin=${encodeURIComponent(
      "obfs-local;obfs=http;obfs-host=bing.com",
    )}&group=${encodeURIComponent(base64Encode("MyGroup"))}#Node`;
    const node = createProxy();
    explodeSs(link, node);
    expect(node.plugin).toBe("obfs-local");
    expect(node.pluginOption).toBe("obfs=http;obfs-host=bing.com");
    expect(node.group).toBe("MyGroup");
  });
});

describe("explodeVmess", () => {
  const build = (extra: Record<string, string>): string => {
    const payload = {
      add: "1.2.3.4",
      aid: "0",
      host: "example.com",
      id: "b831381d-6324-4d53-ad4f-8cda48b30811",
      net: "ws",
      path: "/path",
      port: "443",
      ps: "Node",
      tls: "tls",
      type: "none",
      v: "2",
      ...extra,
    };
    return `vmess://${base64Encode(JSON.stringify(payload))}`;
  };

  it("parses a v2rayN style vmess link", () => {
    const node = createProxy();
    explodeVmess(build({}), node);
    expect(node.type).toBe(ProxyType.VMess);
    expect(node.userId).toBe("b831381d-6324-4d53-ad4f-8cda48b30811");
    expect(node.transferProtocol).toBe("ws");
    expect(node.host).toBe("example.com");
    expect(node.path).toBe("/path");
    expect(node.tlsSecure).toBe(true);
    expect(node.remark).toBe("Node");
  });

  it("handles version 1 semicolon host/path", () => {
    const node = createProxy();
    explodeVmess(build({ host: "a.com;/p", net: "tcp", v: "1" }), node);
    expect(node.host).toBe("a.com");
    expect(node.path).toBe("/p");
  });

  it("rejects a link with port 0", () => {
    const node = createProxy();
    explodeVmess(build({ port: "0" }), node);
    expect(node.type).toBe(ProxyType.Unknown);
  });

  it("parses the std vmess format", () => {
    const link =
      "vmess://ws+tls:b831381d-6324-4d53-ad4f-8cda48b30811-0@1.2.3.4:443?host=example.com&path=/x#Remark";
    const node = createProxy();
    explodeVmess(link, node);
    expect(node.type).toBe(ProxyType.VMess);
    expect(node.hostname).toBe("1.2.3.4");
    expect(node.host).toBe("example.com");
    expect(node.path).toBe("/x");
    expect(node.tlsSecure).toBe(true);
    expect(node.remark).toBe("Remark");
  });
});

describe("explodeSsr", () => {
  it("parses an ssr link", () => {
    const password = base64Encode("pw");
    const payload = `1.2.3.4:443:auth_sha1_v4:aes-256-cfb:http_simple:${password}/?remarks=${base64Encode(
      "SSR Node",
    )}`;
    const link = `ssr://${base64Encode(payload)}`;
    const node = createProxy();
    explodeSsr(link, node);
    expect(node.type).toBe(ProxyType.ShadowsocksR);
    expect(node.protocol).toBe("auth_sha1_v4");
    expect(node.obfs).toBe("http_simple");
    expect(node.password).toBe("pw");
    expect(node.remark).toBe("SSR Node");
  });

  it("flattens to plain ss when applicable", () => {
    const password = base64Encode("pw");
    const payload = `1.2.3.4:443:origin:aes-256-gcm:plain:${password}/?remarks=${base64Encode("Flat")}`;
    const node = createProxy();
    explodeSsr(`ssr://${base64Encode(payload)}`, node);
    expect(node.type).toBe(ProxyType.Shadowsocks);
    expect(node.encryptMethod).toBe("aes-256-gcm");
  });
});

describe("explodeTrojan", () => {
  it("parses a trojan link with sni", () => {
    const node = createProxy();
    explodeTrojan("trojan://password@1.2.3.4:443?sni=example.com#TrojanNode", node);
    expect(node.type).toBe(ProxyType.Trojan);
    expect(node.password).toBe("password");
    expect(node.host).toBe("example.com");
    expect(node.tlsSecure).toBe(true);
    expect(node.remark).toBe("TrojanNode");
  });
});

describe("explode dispatcher", () => {
  it("returns undefined for unknown schemes", () => {
    expect(parseLink("http://not-a-proxy.example")).toBeUndefined();
  });

  it("dispatches by scheme", () => {
    const node = parseLink("trojan://p@1.2.3.4:443#x");
    expect(node?.type).toBe(ProxyType.Trojan);
  });
});

describe("parseSubscription", () => {
  it("parses a base64 list of links", () => {
    const links = ["trojan://p@1.2.3.4:443#A", "trojan://p@5.6.7.8:443#B"].join("\n");
    const nodes = parseSubscription(base64Encode(links));
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.remark)).toEqual(["A", "B"]);
  });

  it("parses a plain (non-base64) list", () => {
    const nodes = parseSubscription("trojan://p@1.2.3.4:443#A\ntrojan://p@5.6.7.8:443#B");
    expect(nodes).toHaveLength(2);
  });

  it("parses a Clash YAML config", () => {
    const yaml = [
      "proxies:",
      "  - name: ss1",
      "    type: ss",
      "    server: 1.2.3.4",
      "    port: 8388",
      "    cipher: aes-256-gcm",
      "    password: pw",
    ].join("\n");
    const nodes = parseSubscription(yaml);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.remark).toBe("ss1");
    expect(nodes[0]?.encryptMethod).toBe("aes-256-gcm");
  });

  it("parses a Surge config", () => {
    const surge = [
      "[Proxy]",
      "ss1 = ss, 1.2.3.4, 8388, encrypt-method=aes-256-gcm, password=pw",
    ].join("\n");
    const nodes = parseSubscription(surge);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.hostname).toBe("1.2.3.4");
  });

  it("parses an ssd:// subscription", () => {
    const doc = {
      airport: "Airport",
      servers: [
        { encryption: "aes-256-gcm", password: "pw", port: 8388, remarks: "n1", server: "1.2.3.4" },
      ],
    };
    const nodes = parseSubscription(`ssd://${base64Encode(JSON.stringify(doc))}`);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.group).toBe("Airport");
  });
});

describe("explode", () => {
  it("leaves unknown nodes untouched", () => {
    const node = createProxy();
    explode("garbage", node);
    expect(node.type).toBe(ProxyType.Unknown);
  });

  it("round-trips base64 helpers", () => {
    expect(base64Decode(base64Encode("hello"))).toBe("hello");
  });
});
