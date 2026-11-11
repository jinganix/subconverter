import { describe, expect, it } from "vitest";

import {
  ProxyType,
  base64Encode,
  createExtraSettings,
  convertNodes,
  createProxy,
  dedupeNodes,
  generate,
  generatePeer,
  hysteria2Construct,
  parseIni,
  parseLink,
  parseSubscription,
  type Proxy,
  ssConstruct,
  toClash,
  toSurge,
  wireGuardConstruct,
  TargetFormat,
} from "../src/index";

describe("regression: ISSUE 897 / PR 849 — ss special characters", () => {
  it("round-trips an SS2022 password containing base64-significant characters", () => {
    const password = "pa/ss+word/with+special==";
    const link = `ss://${base64Encode(`2022-blake3-aes-256-gcm:${password}`)}@1.2.3.4:8388#SS2022`;
    const node = parseLink(link);
    expect(node?.type).toBe(ProxyType.Shadowsocks);
    expect(node?.encryptMethod).toBe("2022-blake3-aes-256-gcm");
    expect(node?.password).toBe(password);
  });
});

describe("regression: ISSUE 877 — net:+tls standard vmess", () => {
  it("parses tcp+tls standard vmess links", () => {
    const node = parseLink(
      "vmess://tcp+tls:b831381d-6324-4d53-ad4f-8cda48b30811-0@1.2.3.4:443#TCPTLS",
    );
    expect(node?.type).toBe(ProxyType.VMess);
    expect(node?.transferProtocol).toBe("tcp");
    expect(node?.tlsSecure).toBe(true);
  });
});

describe("regression: PR 889 / 876 — hysteria2 port ranges", () => {
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

describe("regression: PR 904 / 903 — hysteria2 bandwidth and fingerprint", () => {
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

describe("regression: PR 848 / ISSUE 881 — clash dialer-proxy", () => {
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

describe("regression: PR 840 / ISSUE 855 — wireguard preshared-key and keepalive", () => {
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

describe("regression: PR 898 — identification headers", () => {
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

  it("keeps vmess nodes that differ only by user id", () => {
    const a = createProxy();
    a.hostname = "1.2.3.4";
    a.port = 443;
    a.remark = "dup";
    a.type = ProxyType.VMess;
    a.userId = "11111111-1111-1111-1111-111111111111";
    const b = createProxy();
    b.hostname = "1.2.3.4";
    b.port = 443;
    b.remark = "dup";
    b.type = ProxyType.VMess;
    b.userId = "22222222-2222-2222-2222-222222222222";
    expect(dedupeNodes([a, b])).toBe(0);
  });
});

describe("regression: generation must not mutate input nodes", () => {
  function twoNodes(): Proxy[] {
    return parseSubscription(
      "ss://YWVzLTI1Ni1nY206cGFzcw==@1.2.3.4:8388#nm\n" +
        "ss://YWVzLTI1Ni1nY206cGFzcw==@5.6.7.8:8388#other",
    );
  }

  it("keeps remarks intact across repeated generate calls", () => {
    const nodes = twoNodes();
    const options = {
      includeRules: false,
      settings: { appendProxyType: true },
      target: TargetFormat.Surge,
    };
    const first = generate(nodes, options);
    const second = generate(nodes, options);
    expect(second).toBe(first);
    expect(nodes.map((node) => node.remark)).toEqual(["nm", "other"]);
  });

  it("report the nodes that survived filtering without touching the input", () => {
    const nodes = twoNodes();
    const { nodes: effective, output } = convertNodes(nodes, {
      includeRules: false,
      settings: { includeRemarks: ["nm"] },
      target: TargetFormat.Surge,
    });
    expect(effective.map((node) => node.remark)).toEqual(["nm"]);
    expect(nodes).toHaveLength(2);
    expect(output).not.toContain("other");
  });

  it("keeps remarks intact across direct generator calls", () => {
    const nodes = twoNodes();
    const settings = { ...createExtraSettings(), appendProxyType: true };
    const clash = toClash(nodes, [], settings);
    expect(clash).toContain("[SS] nm");
    const surge = toSurge(nodes, [], settings, { baseConf: "", nodeList: false, version: 5 });
    // No compounding (`[SS] [SS] nm`) and no leak between formats.
    expect(surge).toContain("[SS] nm");
    expect(surge).not.toContain("[SS] [SS]");
    expect(nodes.map((node) => node.remark)).toEqual(["nm", "other"]);
  });
});

describe("regression: malformed user regex is skipped", () => {
  it("does not fail the conversion on an invalid rename pattern", () => {
    const nodes = parseSubscription("ss://YWVzLTI1Ni1nY206cGFzcw==@1.2.3.4:8388#nm");
    for (const pattern of ["*", "(", "[", "a{2,1}"]) {
      expect(() =>
        generate(nodes, {
          includeRules: false,
          settings: { renameArray: [{ match: pattern, replace: "x", script: "" }] },
          target: TargetFormat.Clash,
        }),
      ).not.toThrow();
    }
  });
});

describe("regression: remarks cannot break line-based output", () => {
  function node(remark: string): Proxy {
    const created = createProxy();
    ssConstruct(created, {
      group: "G",
      method: "aes-256-gcm",
      password: "pw",
      port: 8388,
      remark,
      server: "1.2.3.4",
    });
    return created;
  }

  it("collapses line breaks", () => {
    const surge = generate([node("a\nb")], { includeRules: false, target: TargetFormat.Surge });
    expect(surge).toContain("a b = ss, 1.2.3.4");
    expect(surge.trimEnd().split("\n")).toHaveLength(3);
  });

  it("escapes inner quotes when the remark is quoted for a comma", () => {
    const surge = generate([node('a"b,c')], {
      includeRules: false,
      target: TargetFormat.Surge,
    });
    expect(surge).toContain('"a\'b,c" = ss, 1.2.3.4');
  });
});

describe("regression: UTF-8 BOM does not hide the first entry", () => {
  it("keeps the first node of a BOM-prefixed subscription", () => {
    const link = "ss://YWVzLTI1Ni1nY206cGFzcw==@1.2.3.4:8388#nm";
    expect(parseSubscription(`\uFEFF${link}`)).toHaveLength(1);
    expect(parseSubscription(`\uFEFF${link}\n${link}`)).toHaveLength(2);
  });

  it("keeps the first item of a BOM-prefixed ini file", () => {
    const doc = parseIni("\uFEFF[custom]\nruleset=g,https://x/y\n", { keepEmptyValues: true });
    expect(doc.sections[0]?.name).toBe("custom");
  });

  it("skips comment lines", () => {
    const doc = parseIni("[custom]\n;ruleset=g,https://x/y\nruleset=h,https://x/z\n");
    expect(doc.sections[0]?.items).toEqual([["ruleset", "h,https://x/z"]]);
  });
});

describe("regression: a Clash base config is merged like upstream", () => {
  const node = (): Proxy => parseSubscription("trojan://pw@1.2.3.4:443#A")[0] as Proxy;

  it("keeps base keys and replaces the generated sections", () => {
    const base = [
      "port: 7890",
      "mode: global",
      "proxies:",
      "  - name: Stale",
      "    type: ss",
      "rules:",
      "  - MATCH,Stale",
      "",
    ].join("\n");
    const out = generate([node()], {
      baseConf: base,
      groups: [],
      includeRules: false,
      target: TargetFormat.Clash,
    });
    expect(out).toContain("port: 7890");
    expect(out).toContain("mode: global");
    expect(out).toContain("name: A");
    expect(out).not.toContain("Stale");
    expect(out).not.toContain("rules:");
  });

  it("ignores a malformed base instead of failing", () => {
    const out = generate([node()], {
      baseConf: "not: [valid",
      groups: [],
      includeRules: false,
      target: TargetFormat.Clash,
    });
    expect(out).toContain("name: A");
  });
});
