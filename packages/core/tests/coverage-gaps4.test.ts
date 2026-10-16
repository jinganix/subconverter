import { describe, expect, it } from "vitest";

import {
  ProxyType,
  base64Encode,
  createProxy,
  explodeHysteria2,
  explodeHttpSub,
  explodeKitsunebi,
  explodeQuan,
  explodeShadowrocket,
  explodeSs,
  explodeSsd,
  explodeSsr,
  explodeTrojan,
  explodeTuic,
  explodeVless,
  parseLink,
  parseSubscription,
} from "../src/index";

describe("uri remaining branches", () => {
  it("covers vmess JSON defaults and version variants", () => {
    const vm = (data: Record<string, unknown>): string =>
      `vmess://${base64Encode(JSON.stringify(data))}`;
    expect(parseLink(vm({ add: "h", port: "1", ps: "n", v: "3" }))?.type).toBe(ProxyType.VMess);
    expect(parseLink(vm({ add: "h", host: "a.com", port: "1", ps: "n", v: "1" }))?.path).toBe("/");
    expect(parseLink(vm({ add: "h", host: "a;b;c", port: "1", ps: "n", v: "1" }))?.type).toBe(
      ProxyType.VMess,
    );
    expect(parseLink(`vmess://${base64Encode("123")}`)).toBeUndefined();
    expect(parseLink(`vmess://${base64Encode("x = y")}`)).toBeUndefined();
  });

  it("covers shadowrocket and kitsunebi branches", () => {
    const payload = base64Encode("auto:u@1.2.3.4:443");
    expect(parseLink(`vmess://${payload}?obfs=https&remarks=n`)?.type).toBe(ProxyType.VMess);
    const node = createProxy();
    explodeShadowrocket(`vmess://${base64Encode("bogus")}?remarks=n`, node);
    expect(node.type).toBe(ProxyType.Unknown);
    expect(parseLink("vmess1://u@1.2.3.4:443?network=tcp")?.remark).toBe("1.2.3.4:443");
    const kb = createProxy();
    explodeKitsunebi("vmess1://bogus", kb);
    expect(kb.type).toBe(ProxyType.Unknown);
    const kbZero = createProxy();
    explodeKitsunebi("vmess1://u@1.2.3.4:0", kbZero);
    expect(kbZero.type).toBe(ProxyType.Unknown);
  });

  it("covers Quantumult vmess variants", () => {
    const node = createProxy();
    explodeQuan(
      'n = vmess, 1.2.3.4, 443, auto, "u", obfs=ws, obfs-header="Host: h[Rr][Nn]Edge: e"',
      node,
    );
    expect(node.edge).toBe("e");
    const zero = createProxy();
    explodeQuan('n = vmess, 1.2.3.4, 0, auto, "u"', zero);
    expect(zero.type).toBe(ProxyType.Unknown);
    const short = createProxy();
    explodeQuan("n = vmess, 1.2.3.4", short);
    expect(short.type).toBe(ProxyType.Unknown);
    const unknown = createProxy();
    explodeQuan('n = vmess, 1.2.3.4, 443, auto, "u", bogus=1, weirds', unknown);
    expect(unknown.type).toBe(ProxyType.VMess);
  });

  it("covers ss secret/trojan/http edge paths", () => {
    const node = createProxy();
    explodeSs(`ss://${base64Encode("nocolon")}@1.2.3.4:8388`, node);
    expect(node.type).toBe(ProxyType.Unknown);
    const tj = createProxy();
    explodeTrojan("trojan://pw@1.2.3.4:443?type=ws&path=/p#N", tj);
    expect(tj.path).toBe("/p");
    const hs = createProxy();
    explodeHttpSub("http://@@@", hs);
    expect(hs.type).toBe(ProxyType.Unknown);
    const hsZero = createProxy();
    explodeHttpSub(`http://${base64Encode("1.2.3.4:0")}`, hsZero);
    expect(hsZero.type).toBe(ProxyType.Unknown);
  });

  it("covers ssd object/entry branches", () => {
    const nodes: ReturnType<typeof createProxy>[] = [];
    explodeSsd(
      `ssd://${base64Encode(JSON.stringify({ port: 80, servers: { a: null, b: { server: "s" } } }))}`,
      nodes,
    );
    expect(nodes).toHaveLength(1);
    const nodes2: ReturnType<typeof createProxy>[] = [];
    explodeSsd(`ssd://${base64Encode(JSON.stringify(42))}`, nodes2);
    expect(nodes2).toHaveLength(0);
  });

  it("covers socks/http group and credential branches", () => {
    expect(parseLink("socks://" + base64Encode("a:b:c@1.2.3.4:1080"))?.type).toBe(ProxyType.SOCKS5);
    const node = createProxy();
    parseSubscription("https://t.me/socks?server=1.2.3.4&port=1080&group=G&remarks=R");
    expect(parseLink("https://t.me/socks?server=1.2.3.4&port=1080&group=G&remarks=R")?.group).toBe(
      "G",
    );
    expect(parseLink("https://t.me/http?server=1.2.3.4&port=8080&group=G&remarks=R")?.group).toBe(
      "G",
    );
    void node;
  });

  it("covers hysteria2/vless/tuic parse failures", () => {
    const h = createProxy();
    explodeHysteria2("hysteria2://nopassword", h);
    expect(h.type).toBe(ProxyType.Unknown);
    const h2 = createProxy();
    explodeHysteria2("hysteria2://user@1.2.3.4", h2);
    expect(h2.type).toBe(ProxyType.Unknown);
    const v = createProxy();
    explodeVless("vless://u@1.2.3.4:0", v);
    expect(v.type).toBe(ProxyType.Unknown);
    const t = createProxy();
    explodeTuic("tuic://u:p@1.2.3.4:0", t);
    expect(t.type).toBe(ProxyType.Unknown);
    const t2 = createProxy();
    explodeTuic("tuic://nodivider", t2);
    expect(t2.type).toBe(ProxyType.Unknown);
  });

  it("covers ssr malformed and null-safe variants", () => {
    const node = createProxy();
    explodeSsr(`ssr://${base64Encode("1.2.3.4:0:origin:aes-256-gcm:plain:cHc")}`, node);
    expect(node.type).toBe(ProxyType.Unknown);
  });
});

describe("surge parser remaining branches", () => {
  it("covers wireguard/snell/vmess item branches", () => {
    const surge = [
      "[Proxy]",
      "custom = custom, 1.1.1.1, 8388, aes-256-gcm, pw, x, obfs=http, noequals, tfo=true",
      "socks = socks5, 1.1.1.1, 1080, u, p, noequals, skip-cert-verify=true",
      "vmess = vmess, 1.1.1.1, 443, username=u, noequals, ws=false, tls=false",
      "http = http, 1.1.1.1, 8080, noequals, skip-cert-verify=true",
      "trojan = trojan, 1.1.1.1, 443, noequals, skip-cert-verify=true",
      "snell = snell, 1.1.1.1, 443, noequals, version=3",
      "wg = wireguard, section-name=wg1, test-url=http://x",
      "wgEmpty = wireguard, section-name=missing, test-url=http://x",
      "[WireGuard wg1]",
      "private-key = p",
      "self-ip = 10.0.0.1",
      "noequals",
      "mtu = 1420",
      'peer = (public-key = u, allowed-ips = "0.0.0.0/0", endpoint = h:2408, client-id = 1/2/3)',
    ].join("\n");
    const nodes = parseSubscription(surge);
    const names = nodes.map((n) => n.remark);
    expect(names).toContain("custom");
    expect(names).toContain("socks");
    expect(names).toContain("vmess");
    expect(names).toContain("http");
    expect(names).toContain("trojan");
    expect(names).toContain("snell");
    expect(names).toContain("wg");
    expect(names).not.toContain("wgEmpty");
  });
});
