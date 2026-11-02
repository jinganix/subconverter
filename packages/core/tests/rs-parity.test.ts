import { describe, expect, it } from "vitest";

import {
  RulesetType,
  TargetFormat,
  convertRuleset,
  createExtraSettings,
  generate,
  isBlacklistedPattern,
  parseClashFlavor,
  parseLink,
  parseRequestSettings,
  parseSubscription,
  toBool,
} from "../src/index";

/**
 * Parity with lonelam/subconverter-rs: link formats, output knobs, and
 * request parameters that were missing or divergent.
 */

const SNELL = "snell://psk123@10.0.0.1:8388?obfs=tls&host=example.com&version=3&udp=true#SNELL-01";
const HYSTERIA =
  "hysteria://10.0.0.2:443?auth=secret&protocol=udp&upmbps=20&downmbps=100&alpn=h3&obfs=xor&obfsParam=param&peer=sni.example.com&insecure=1#HY-01";
const WIREGUARD =
  "wireguard://10.0.0.3:51820?privateKey=PRIV&publicKey=PUB&presharedKey=PSK&selfIP=10.0.0.2&mtu=1400&keepAlive=20&dns=1.1.1.1,8.8.8.8#WG-01";
const AEAD_SS =
  "ss://2022-blake3-aes-128-gcm:NWIyYjgyYzU1MzZkYzYzMA%3D%3D%3AZWUyYzc4ODMtZDkxYi00NQ%3D%3D@a01.example.com:52011#HK01";

describe("ss AEAD-2022 plaintext userinfo", () => {
  it("decodes percent-encoded method:password", () => {
    const node = parseLink(AEAD_SS);
    expect(node?.encryptMethod).toBe("2022-blake3-aes-128-gcm");
    expect(node?.password).toBe("NWIyYjgyYzU1MzZkYzYzMA==:ZWUyYzc4ODMtZDkxYi00NQ==");
    expect(node?.hostname).toBe("a01.example.com");
    expect(node?.port).toBe(52011);
  });

  it("still parses classic base64 userinfo", () => {
    const node = parseLink("ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@www.example.com:1080#SS");
    expect(node?.encryptMethod).toBe("aes-256-gcm");
    expect(node?.password).toBe("password");
  });
});

describe("bool parsing", () => {
  it.each(["true", "1", "yes", "on", "TRUE", " Yes "])("accepts %s as true", (value) => {
    expect(toBool(value)).toBe(true);
  });

  it.each(["false", "0", "no", "off", "", undefined, null])("rejects %s", (value) => {
    expect(toBool(value as string)).toBe(false);
  });
});

describe("regex blacklist", () => {
  it("flags catastrophic patterns", () => {
    expect(isBlacklistedPattern("(.*)*")).toBe(true);
    expect(isBlacklistedPattern("HK|TW")).toBe(false);
  });
});

describe("clash per-node tolerance", () => {
  it("skips malformed entries instead of failing the subscription", () => {
    const nodes = parseSubscription(
      "proxies:\n  - name: GOOD\n    type: ss\n    server: 1.2.3.4\n    port: 8388\n    cipher: aes-256-gcm\n    password: pw\n  - null\n  - name: BAD\n    type: nope\n    server: 5.6.7.8\n    port: 443\n",
    );
    expect(nodes.map((node) => node.remark)).toEqual(["GOOD"]);
  });
});

describe("new share-link formats", () => {
  it("parses snell://", () => {
    const node = parseLink(SNELL);
    expect(node?.type).toBe("snell");
    expect(node?.password).toBe("psk123");
    expect(node?.port).toBe(8388);
    expect(node?.obfs).toBe("tls");
    expect(node?.host).toBe("example.com");
    expect(node?.snellVersion).toBe(3);
    expect(node?.udp).toBe(true);
  });

  it("rejects snell:// without a password", () => {
    expect(parseLink("snell://@10.0.0.1:8388#X")).toBeUndefined();
  });

  it("parses hysteria:// v1", () => {
    const node = parseLink(HYSTERIA);
    expect(node?.type).toBe("hysteria");
    expect(node?.authStr).toBe("secret");
    expect(node?.protocol).toBe("udp");
    expect(node?.upSpeed).toBe(20);
    expect(node?.downSpeed).toBe(100);
    expect(node?.obfs).toBe("xor");
    expect(node?.obfsParam).toBe("param");
    expect(node?.sni).toBe("sni.example.com");
  });

  it("parses wg:// and wireguard:// with key defaults", () => {
    for (const link of [WIREGUARD, WIREGUARD.replace("wireguard://", "wg://")]) {
      const node = parseLink(link);
      expect(node?.type).toBe("wireguard");
      expect(node?.privateKey).toBe("PRIV");
      expect(node?.publicKey).toBe("PUB");
      expect(node?.preSharedKey).toBe("PSK");
      expect(node?.selfIp).toBe("10.0.0.2");
      expect(node?.mtu).toBe(1400);
      expect(node?.keepAlive).toBe(20);
      expect(node?.dnsServers).toEqual(["1.1.1.1", "8.8.8.8"]);
    }
  });

  it("rejects wireguard:// without keys", () => {
    expect(parseLink("wireguard://10.0.0.3:51820#X")).toBeUndefined();
  });

  it("round-trips the new protocols through clash", () => {
    const out = generate(parseSubscription([SNELL, HYSTERIA, WIREGUARD].join("\n")), {
      target: TargetFormat.Clash,
    });
    expect(out).toContain("SNELL-01");
    expect(out).toContain("HY-01");
    expect(out).toContain("WG-01");
  });
});

describe("singbox snell", () => {
  it("emits snell outbounds but still drops ssr", () => {
    const nodes = parseSubscription(
      [
        SNELL,
        "ssr://MS4yLjMuNDo4Mzg4OmF1dGhfc2hhMV92NDphZXMtMjU2LWNmYjpodHRwX3NpbXBsZTpjSGMvP29iZnNwYXJhbT0mcHJvdG9wYXJhbT0mcmVtYXJrcz1VMU5TTFhSbGMzUSZncm91cD1Sdw==",
      ].join("\n"),
    );
    const doc = JSON.parse(generate(nodes, { target: TargetFormat.SingBox })) as {
      outbounds: Array<Record<string, unknown>>;
    };
    const snell = doc.outbounds.find((o) => o.type === "snell") as Record<string, unknown>;
    expect(snell.psk).toBe("psk123");
    expect(snell.version).toBe(3);
    expect(snell.obfs_mode).toBe("tls");
    expect(snell.obfs_host).toBe("example.com");
    expect(doc.outbounds.some((o) => o.type === "shadowsocksr")).toBe(false);
  });
});

describe("clash flavor", () => {
  const VLESS_REALITY =
    "vless://b831381d-6324-4d53-ad4f-8cda48b30811@5.5.5.6:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=h.example.com&fp=chrome&pbk=PUBKEY0123456789ABCDEFGHIJKLMNOPQRSTUV&sid=aabbccdd&type=tcp&headerType=none#VLESS-REALITY";
  const TUIC = "tuic://b831381d-6324-4d53-ad4f-8cda48b30811:pw@9.9.9.9:443?sni=h.example.com#TU";
  const SS = "ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@www.example.com:1080#SS";

  function clashWith(sub: string, flavor: string): string {
    const settings = createExtraSettings();
    settings.nodeList = true;
    settings.clashFlavor = parseClashFlavor(flavor);
    return generate(parseSubscription(sub), { settings, target: TargetFormat.Clash });
  }

  it("parses flavor names, defaulting to mihomo", () => {
    expect(parseClashFlavor("premium")).toBe("premium");
    expect(parseClashFlavor("STASH")).toBe("stash");
    expect(parseClashFlavor("original")).toBe("premium");
    expect(parseClashFlavor("bogus")).toBe("mihomo");
    expect(parseClashFlavor("")).toBe("mihomo");
  });

  it("mihomo keeps everything", () => {
    const out = clashWith([VLESS_REALITY, TUIC, SS].join("\n"), "mihomo");
    expect(out).toContain("VLESS-REALITY");
    expect(out).toContain("reality-opts:");
    expect(out).toContain("client-fingerprint: chrome");
  });

  it("premium drops vless/tuic and reality nodes", () => {
    const out = clashWith([VLESS_REALITY, TUIC, SS].join("\n"), "premium");
    expect(out).not.toContain("VLESS-REALITY");
    expect(out).not.toContain("type: tuic");
    expect(out).toContain("SS");
  });

  it("stash keeps reality but strips fingerprints", () => {
    const out = clashWith([VLESS_REALITY, TUIC].join("\n"), "stash");
    expect(out).toContain("VLESS-REALITY");
    expect(out).toContain("reality-opts:");
    expect(out).not.toContain("client-fingerprint");
  });
});

describe("expand and classical", () => {
  const RULESET = {
    content: "DOMAIN-SUFFIX,example.com\nIP-CIDR,10.0.0.0/8",
    ruleGroup: "G",
    rulePath: "https://example.com/list.list",
    rulePathTyped: "surge:https://example.com/list.list",
    ruleType: RulesetType.Surge,
    updateInterval: 86400,
  };

  it("emits RULE-SET references for surge when expand=false", () => {
    const settings = createExtraSettings();
    settings.expandRulesets = false;
    const out = generate(parseSubscription("ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@h:8388#S"), {
      rulesets: [RULESET],
      settings,
      surgeVersion: 4,
      target: TargetFormat.Surge,
    });
    expect(out).toContain("RULE-SET,https://example.com/list.list,G,update-interval=86400");
  });

  it("still expands inline rules with expand=false", () => {
    const settings = createExtraSettings();
    settings.expandRulesets = false;
    const out = generate(parseSubscription("ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@h:8388#S"), {
      rulesets: [{ ...RULESET, content: "[]DOMAIN-SUFFIX,inline.example" }],
      settings,
      surgeVersion: 4,
      target: TargetFormat.Surge,
    });
    expect(out).toContain("DOMAIN-SUFFIX,inline.example,G");
  });

  it("clash always expands even with expand=false", () => {
    const settings = createExtraSettings();
    settings.expandRulesets = false;
    const out = generate(parseSubscription("ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@h:8388#S"), {
      rulesets: [RULESET],
      settings,
      target: TargetFormat.Clash,
    });
    expect(out).toContain("DOMAIN-SUFFIX,example.com");
  });
});

describe("classical rulesets", () => {
  const payload = "payload:\n  - DOMAIN-SUFFIX,example.com\n  - bare.example\n";

  it("passes payload lists through verbatim", () => {
    const out = convertRuleset(payload, RulesetType.ClashClassical);
    expect(out).toContain("DOMAIN-SUFFIX,example.com");
    expect(out).toContain("bare.example");
  });

  it("domain conversion prefixes bare entries", () => {
    expect(convertRuleset(payload, RulesetType.ClashDomain)).toContain("DOMAIN,bare.example");
  });
});

describe("request params", () => {
  it("parses flavor/expand/strict/filename/dev_id", () => {
    const settings = parseRequestSettings(
      "target=clash&flavor=stash&expand=false&strict=true&filename=o.yaml&dev_id=abc",
    );
    expect(settings.clashFlavor).toBe("stash");
    expect(settings.expand).toBe(false);
    expect(settings.strict).toBe(true);
    expect(settings.filename).toBe("o.yaml");
    expect(settings.devId).toBe("abc");
  });

  it("defaults expand to true", () => {
    expect(parseRequestSettings("target=clash").expand).toBe(true);
  });
});

describe("base template vars", () => {
  it("substitutes {{ var }} placeholders", () => {
    const settings = createExtraSettings();
    settings.templateVars = { dns_port: "1053" };
    const out = generate(parseSubscription("ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@h:8388#S"), {
      baseConf: "[General]\ndns-server = 127.0.0.1:{{ dns_port }}\n[Proxy]\n",
      settings,
      target: TargetFormat.Surge,
    });
    expect(out).toContain("127.0.0.1:1053");
  });
});
