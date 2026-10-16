import { describe, expect, it } from "vitest";

import {
  ProxyType,
  base64Encode,
  createProxy,
  explode,
  explodeAnyTls,
  explodeHysteria2,
  explodeQuan,
  explodeShadowrocket,
  explodeSocks,
  explodeSs,
  explodeSsd,
  explodeSsr,
  explodeStdVmess,
  explodeTuic,
  explodeVless,
  explodeVmess,
  parseLink,
} from "../src/index";

describe("vmess edge cases", () => {
  const build = (data: Record<string, unknown>): string =>
    `vmess://${base64Encode(JSON.stringify(data))}`;

  it("handles every network type", () => {
    for (const net of ["tcp", "kcp", "http", "ws", "quic", "unknown-net"]) {
      const node = createProxy();
      explodeVmess(
        build({
          add: "1.2.3.4",
          aid: "0",
          host: "h",
          id: "u",
          net,
          path: "/p",
          port: "443",
          ps: "n",
          tls: "tls",
          type: "none",
          v: "2",
        }),
        node,
      );
      expect(node.type).toBe(ProxyType.VMess);
    }
  });

  it("handles the quic network specially", () => {
    const node = createProxy();
    explodeVmess(
      build({
        add: "1.2.3.4",
        aid: "0",
        host: "sec",
        id: "u",
        net: "quic",
        path: "key",
        port: "443",
        ps: "n",
        tls: "tls",
        type: "none",
        v: "2",
      }),
      node,
    );
    expect(node.quicSecure).toBe("sec");
    expect(node.quicSecret).toBe("key");
  });

  it("rejects missing or zero ports", () => {
    const node = createProxy();
    explodeVmess(build({ add: "1.2.3.4", port: "0" }), node);
    expect(node.type).toBe(ProxyType.Unknown);
    const node2 = createProxy();
    explodeVmess(build({ add: "1.2.3.4" }), node2);
    expect(node2.type).toBe(ProxyType.Unknown);
  });

  it("tolerates a non-JSON payload", () => {
    const node = createProxy();
    explodeVmess(`vmess://${base64Encode("not json")}`, node);
    expect(node.type).toBe(ProxyType.Unknown);
  });
});

describe("std vmess edge cases", () => {
  it("handles each network type and rejects unknown", () => {
    const nets = ["tcp", "kcp", "http", "ws", "quic", "bogus"];
    for (const net of nets) {
      const node = createProxy();
      explodeStdVmess(
        `vmess://${net}:b831381d-6324-4d53-ad4f-8cda48b30811-0@1.2.3.4:443?type=none&host=h&path=/p&security=auto`,
        node,
      );
      if (net === "bogus") {
        expect(node.type).toBe(ProxyType.Unknown);
      } else {
        expect(node.type).toBe(ProxyType.VMess);
      }
    }
  });

  it("derives a remark from the host:port when absent", () => {
    const node = createProxy();
    explodeStdVmess("vmess://tcp:b831381d-6324-4d53-ad4f-8cda48b30811-0@1.2.3.4:443", node);
    expect(node.remark).toBe("1.2.3.4:443");
  });

  it("rejects malformed ids", () => {
    const node = createProxy();
    explodeStdVmess("vmess://tcp:notahexid-0@1.2.3.4:443", node);
    expect(node.type).toBe(ProxyType.Unknown);
  });
});

describe("shadowrocket edge cases", () => {
  it("handles obfs vs plain and missing remarks", () => {
    const payload = base64Encode("auto:u@1.2.3.4:443");
    const a = parseLink(`vmess://${payload}?obfs=websocket&path=/p&obfsParam=h`);
    expect(a?.transferProtocol).toBe("ws");
    const b = parseLink(`vmess://${payload}?network=ws&wsHost=h&wspath=/p&aid=0&tls=1`);
    expect(b?.tlsSecure).toBe(true);
    const c = parseLink(`vmess://${payload}?ext=1`);
    expect(c?.remark).toBe("1.2.3.4:443");
  });

  it("ignores a zero port", () => {
    const node = createProxy();
    explodeShadowrocket(`vmess://${base64Encode("auto:u@1.2.3.4:0")}`, node);
    expect(node.type).toBe(ProxyType.Unknown);
  });
});

describe("kitsunebi edge cases", () => {
  it("parses a path with hash and without tls", () => {
    const a = parseLink("vmess1://u@1.2.3.4:443/p?network=ws#N");
    expect(a?.type).toBe(ProxyType.VMess);
    const b = parseLink("vmess1://u@1.2.3.4:443?network=tcp");
    expect(b?.remark).toBe("1.2.3.4:443");
  });
});

describe("quan edge cases", () => {
  it("parses tls variants", () => {
    const a = createProxy();
    explodeQuan('n = vmess, 1.2.3.4, 443, auto, "u", group=g, obfs=ws, obfs-header="Host: h"', a);
    expect(a.group).toBe("g");
    expect(a.host).toBe("h");
    const b = createProxy();
    explodeQuan('n = vmess, 1.2.3.4, 443, auto, "u", over-tls=true', b);
    expect(b.tlsSecure).toBe(true);
  });
});

describe("ss edge cases", () => {
  it("handles plain userinfo and group", () => {
    const node = createProxy();
    explodeSs(
      `ss://${base64Encode("aes-256-gcm:pw")}@1.2.3.4:8388?group=${base64Encode("G")}#N`,
      node,
    );
    expect(node.group).toBe("G");
  });

  it("handles a plugin without options", () => {
    const node = createProxy();
    explodeSs(`ss://${base64Encode("aes-256-gcm:pw")}@1.2.3.4:8388/?plugin=obfs-local#N`, node);
    expect(node.plugin).toBe("obfs-local");
    expect(node.pluginOption).toBe("");
  });

  it("rejects zero ports and malformed links", () => {
    for (const link of [
      "ss://badsecret@1.2.3.4:0",
      `ss://${base64Encode("onlyonefield")}@1.2.3.4:8388`,
      "ss://@:0",
    ]) {
      const node = createProxy();
      explodeSs(link, node);
      expect(node.type).toBe(ProxyType.Unknown);
    }
  });
});

describe("ssr edge cases", () => {
  it("parses obfs/protocol params and group", () => {
    const payload =
      `1.2.3.4:443:auth_sha1_v4:aes-256-cfb:http_simple:${base64Encode("pw")}` +
      `/?group=${base64Encode("G")}&remarks=${base64Encode("N")}&obfsparam=${base64Encode("op")}&protoparam=${base64Encode("pp")}`;
    const node = createProxy();
    explodeSsr(`ssr://${base64Encode(payload)}`, node);
    expect(node.group).toBe("G");
    expect(node.obfsParam).toBe("op");
    expect(node.protocolParam).toBe("pp");
  });

  it("handles a payload without obfs params", () => {
    const payload = `1.2.3.4:443:auth_sha1_v4:aes-256-cfb:http_simple:${base64Encode("pw")}`;
    const node = createProxy();
    explodeSsr(`ssr://${base64Encode(payload)}`, node);
    expect(node.remark).toBe("1.2.3.4:443");
  });

  it("rejects malformed payloads", () => {
    const node = createProxy();
    explodeSsr(`ssr://${base64Encode("garbage")}`, node);
    expect(node.type).toBe(ProxyType.Unknown);
  });
});

describe("ssd edge cases", () => {
  it("ignores array servers and missing airports", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeSsd(
      `ssd://${base64Encode(JSON.stringify({ servers: [{ port: 80, server: "1.2.3.4" }] }))}`,
      nodes,
    );
    expect(nodes).toHaveLength(1);
  });

  it("ignores malformed ssd payloads", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeSsd("ssd://@@@", nodes);
    explodeSsd(`ssd://${base64Encode("not json")}`, nodes);
    explodeSsd(`ssd://${base64Encode(JSON.stringify({ servers: "nope" }))}`, nodes);
    explodeSsd(
      `ssd://${base64Encode(JSON.stringify({ servers: [{ port: "", server: "" }] }))}`,
      nodes,
    );
    expect(nodes).toHaveLength(0);
  });
});

describe("socks/http edge cases", () => {
  it("parses socks with credentials and telegram variants", () => {
    const a = parseLink(`socks://${base64Encode("u:p@1.2.3.4:1080")}`);
    expect(a?.username).toBe("u");
    const b = parseLink("https://t.me/socks?server=1.2.3.4&port=1080");
    expect(b?.type).toBe(ProxyType.SOCKS5);
    const c = parseLink("tg://socks?server=1.2.3.4&port=1080");
    expect(c?.type).toBe(ProxyType.SOCKS5);
  });

  it("rejects malformed socks links", () => {
    for (const link of [
      "socks://@@@",
      "socks://" + base64Encode("u:p@1.2.3.4"),
      "tg://socks?server=1.2.3.4",
    ]) {
      const node = createProxy();
      explodeSocks(link, node);
      expect(node.type).toBe(ProxyType.Unknown);
    }
  });

  it("parses http sub links with and without auth", () => {
    expect(parseLink(`http://${base64Encode("1.2.3.4:8080")}?remarks=n&group=g`)?.remark).toBe("n");
    expect(parseLink(`http://${base64Encode("u:p@1.2.3.4:8080")}`)?.type).toBe(ProxyType.HTTP);
  });
});

describe("trojan edge cases", () => {
  it("parses ws variants and insecure flags", () => {
    const a = parseLink(
      "trojan://pw@1.2.3.4:443?ws=1&wspath=%2Fp&sni=h&tfo=1&allowInsecure=0&group=g#N",
    );
    expect(a?.transferProtocol).toBe("ws");
    expect(a?.tcpFastOpen).toBe(true);
    expect(a?.allowInsecure).toBe(false);
    expect(a?.group).toBe("g");
    const b = parseLink("trojan://pw@1.2.3.4:443?type=ws&path=%2Fp#N");
    expect(b?.path).toBe("/p");
    const c = parseLink("trojan://pw@1.2.3.4:443");
    expect(c?.remark).toBe("1.2.3.4:443");
  });

  it("rejects zero ports and malformed links", () => {
    for (const link of ["trojan://pw@1.2.3.4:0", "trojan://noatsign"]) {
      expect(parseLink(link)).toBeUndefined();
    }
  });
});

describe("hysteria2 edge cases", () => {
  it("parses the password-arg form", () => {
    const a = parseLink(
      "hy2://1.2.3.4:443?password=pw&obfs=salamander&obfs-password=x&alpn=h3&pinSHA256=fp&up=1&down=2#N",
    );
    expect(a?.type).toBe(ProxyType.Hysteria2);
    expect(a?.fingerprint).toBe("fp");
  });

  it("rejects malformed hysteria2 links", () => {
    for (const link of ["hysteria2://", "hysteria2://nopassword"]) {
      const node = createProxy();
      explodeHysteria2(link, node);
      expect(node.type).toBe(ProxyType.Unknown);
    }
  });
});

describe("anytls/vless/tuic edge cases", () => {
  it("parses anytls variants", () => {
    const a = parseLink("anytls://pw@1.2.3.4:443#N");
    expect(a?.remark).toBe("N");
    const b = parseLink("anytls://pw@1.2.3.4:0");
    const node = createProxy();
    explodeAnyTls("anytls://garbage", node);
    expect(node.type).toBe(ProxyType.Unknown);
    void b;
  });

  it("parses vless reality and allowInsecure", () => {
    const a = parseLink(
      "vless://u@1.2.3.4:443?security=reality&sni=h&fp=chrome&alpn=h2,h3&allowInsecure=1&flow=xtls#N",
    );
    expect(a?.tlsSecure).toBe(true);
    expect(a?.alpn).toEqual(["h2", "h3"]);
    expect(a?.allowInsecure).toBe(true);
    const node = createProxy();
    explodeVless("vless://garbage", node);
    expect(node.type).toBe(ProxyType.Unknown);
  });

  it("parses tuic variants", () => {
    const a = parseLink(
      "tuic://u:p@1.2.3.4:443?congestion-controller=cubic&alpn=h3&allow_insecure=1#N",
    );
    expect(a?.congestionControl).toBe("cubic");
    expect(a?.allowInsecure).toBe(true);
    const node = createProxy();
    explodeTuic("tuic://garbage", node);
    expect(node.type).toBe(ProxyType.Unknown);
  });
});

describe("dispatcher edge cases", () => {
  it("leaves unknown schemes untouched", () => {
    const node = createProxy();
    explode("randomstring", node);
    expect(node.type).toBe(ProxyType.Unknown);
  });
});
