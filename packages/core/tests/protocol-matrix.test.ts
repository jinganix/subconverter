import { describe, expect, it } from "vitest";

import {
  TargetFormat,
  createExtraSettings,
  generate,
  parseLink,
  parseSubscription,
} from "../src/index";

/**
 * Static support matrix: every input link/config format must parse, and
 * every output format must handle (emit or explicitly drop) each node type.
 *
 * These are frozen对照 expectations (no network): if a generator starts
 * emitting a previously-dropped type (or vice versa), update the matrix and
 * the supported-formats documentation together.
 */

const LINKS: Record<string, string> = {
  anytls: "anytls://pw@8.8.8.8:443?sni=h.example.com#AT",
  httpSub: "http://dXNlcjpwYXNzQDEwLjAuMC4xOjgwODA=#HTTP-SUB",
  hy2: "hysteria2://pw@7.7.7.7:443?sni=h.example.com&up=50&down=100#HY2",
  socks: "tg://socks?server=10.10.10.1&port=1080&user=u&pass=p&remarks=SOCKS",
  ssObfs:
    "ss://YWVzLTI1Ni1nY206cHc=@1.1.1.2:8388?plugin=obfs-local%3Bobfs%3Dhttp%3Bobfs-host%3Dwww.bing.com#SS-OBFS",
  ssPlain: "ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpwYXNzd29yZA==@www.example.com:1080#SS",
  ssr: "ssr://MS4yLjMuNDo4Mzg4OmF1dGhfc2hhMV92NDphZXMtMjU2LWNmYjpodHRwX3NpbXBsZTpjSGMvP29iZnNwYXJhbT0mcHJvdG9wYXJhbT0mcmVtYXJrcz1VMU5TTFhSbGMzUSZncm91cD1Sdw==",
  trojanWs: "trojan://pw@6.6.6.7:443?sni=h.example.com&type=ws&path=%2Fws#TJ-WS",
  tuic: "tuic://b831381d-6324-4d53-ad4f-8cda48b30811:pw@9.9.9.9:443?sni=h.example.com&congestion_control=bbr&alpn=h3#TU",
  vlessGrpcReality:
    "vless://b831381d-6324-4d53-ad4f-8cda48b30811@5.5.5.7:443?encryption=none&security=reality&sni=h.example.com&fp=firefox&pbk=PUBKEY0123456789ABCDEFGHIJKLMNOPQRSTUV&sid=eeff0011&type=grpc&serviceName=gun#VLESS-GRPC",
  vlessTcpReality:
    "vless://b831381d-6324-4d53-ad4f-8cda48b30811@5.5.5.6:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=h.example.com&fp=chrome&pbk=PUBKEY0123456789ABCDEFGHIJKLMNOPQRSTUV&sid=aabbccdd&type=tcp&headerType=none#VLESS-REALITY",
  vlessWsTls:
    "vless://b831381d-6324-4d53-ad4f-8cda48b30811@5.5.5.5:443?encryption=none&security=tls&sni=h.example.com&type=ws&host=h.example.com&path=%2Fp#VLESS-WS",
  vmessStd: "vmess://tcp+tls:b831381d-6324-4d53-ad4f-8cda48b30811-0@4.4.4.4:443#VMESS-STD",
};

describe("input formats: every documented link type parses", () => {
  for (const [name, link] of Object.entries(LINKS)) {
    it(`parses ${name}`, () => {
      expect(parseLink(link)?.remark ?? "").not.toBe("");
    });
  }

  it("parses vless reality public-key and short-id", () => {
    const node = parseLink(LINKS.vlessTcpReality as string);
    expect(node?.publicKey).toBe("PUBKEY0123456789ABCDEFGHIJKLMNOPQRSTUV");
    expect(node?.shortId).toBe("aabbccdd");
    expect(node?.flow).toBe("xtls-rprx-vision");
    expect(node?.tlsSecure).toBe(true);
  });

  it("parses grpc serviceName into path", () => {
    expect(parseLink(LINKS.vlessGrpcReality as string)?.path).toBe("gun");
  });
});

describe("output formats: vless reality round-trips", () => {
  const sub = [LINKS.vlessTcpReality, LINKS.vlessGrpcReality].join("\n");

  it("clash carries flow and reality-opts", () => {
    const out = generate(parseSubscription(sub), { target: TargetFormat.Clash });
    expect(out).toContain("flow: xtls-rprx-vision");
    expect(out).toContain("reality-opts:");
    expect(out).toContain("public-key: PUBKEY0123456789ABCDEFGHIJKLMNOPQRSTUV");
    expect(out).toContain("short-id: aabbccdd");
  });

  it("singbox carries flow, utls and reality", () => {
    const out = generate(parseSubscription(sub), { target: TargetFormat.SingBox });
    const doc = JSON.parse(out) as { outbounds: Array<Record<string, unknown>> };
    const tcp = doc.outbounds.find((o) => o.tag === "VLESS-REALITY");
    expect(tcp?.flow).toBe("xtls-rprx-vision");
    const tls = tcp?.tls as Record<string, unknown>;
    expect((tls.utls as Record<string, unknown>)?.fingerprint).toBe("chrome");
    expect((tls.reality as Record<string, unknown>)?.public_key).toBe(
      "PUBKEY0123456789ABCDEFGHIJKLMNOPQRSTUV",
    );
  });

  it("quanx carries pubkey, shortid and flow", () => {
    const settings = createExtraSettings();
    settings.nodeList = true;
    const out = generate(parseSubscription(sub), { settings, target: TargetFormat.QuantumultX });
    expect(out).toContain("reality-base64-pubkey=PUBKEY0123456789ABCDEFGHIJKLMNOPQRSTUV");
    expect(out).toContain("reality-hex-shortid=aabbccdd");
    expect(out).toContain("vless-flow=xtls-rprx-vision");
  });

  it("loon carries flow/pubkey (grpc dropped)", () => {
    const settings = createExtraSettings();
    settings.nodeList = true;
    const out = generate(parseSubscription(sub), { settings, target: TargetFormat.Loon });
    expect(out).toContain("VLESS-REALITY");
    expect(out).toContain('public-key="PUBKEY0123456789ABCDEFGHIJKLMNOPQRSTUV"');
    expect(out).not.toContain("VLESS-GRPC");
  });

  it("surge drops vless reality (no vless mapping)", () => {
    const settings = createExtraSettings();
    settings.nodeList = true;
    const out = generate(parseSubscription(sub), {
      settings,
      surgeVersion: 4,
      target: TargetFormat.Surge,
    });
    expect(out.trim()).toBe("");
  });
});

describe("output formats: support matrix per node type", () => {
  function emits(target: TargetFormat, link: string): boolean {
    const settings = createExtraSettings();
    settings.nodeList = true;
    const extra = target === TargetFormat.Surge ? { surgeVersion: 4 } : {};
    const out = generate(parseSubscription(link), { settings, target, ...extra });
    const remark = parseLink(link)?.remark ?? "";
    return out.includes(remark);
  }

  it("clash/singbox keep every link node", () => {
    for (const link of Object.values(LINKS)) {
      // http-sub remark differs after decode; check parse only.
      if (link.startsWith("http://")) {
        continue;
      }
      expect(emits(TargetFormat.Clash, link), `clash ${link.slice(0, 12)}`).toBe(true);
    }
    for (const link of Object.values(LINKS)) {
      if (link.startsWith("http://") || link.includes("ssr://")) {
        continue;
      }
      expect(emits(TargetFormat.SingBox, link), `singbox ${link.slice(0, 12)}`).toBe(true);
    }
    // sing-box has no SSR support.
    expect(emits(TargetFormat.SingBox, LINKS.ssr as string)).toBe(false);
  });

  it("quanx/loon drop anytls/hysteria2/tuic, keep vless", () => {
    for (const target of [TargetFormat.QuantumultX, TargetFormat.Loon]) {
      expect(emits(target, LINKS.vlessWsTls as string)).toBe(true);
      expect(emits(target, LINKS.vlessTcpReality as string)).toBe(true);
      expect(emits(target, LINKS.anytls as string)).toBe(false);
      expect(emits(target, LINKS.tuic as string)).toBe(false);
      expect(emits(target, LINKS.hy2 as string)).toBe(target === TargetFormat.Loon);
    }
  });

  it("surge keeps hysteria2/anytls, drops vless/tuic/ssr", () => {
    expect(emits(TargetFormat.Surge, LINKS.hy2 as string)).toBe(true);
    expect(emits(TargetFormat.Surge, LINKS.anytls as string)).toBe(true);
    expect(emits(TargetFormat.Surge, LINKS.vlessWsTls as string)).toBe(false);
    expect(emits(TargetFormat.Surge, LINKS.tuic as string)).toBe(false);
    expect(emits(TargetFormat.Surge, LINKS.ssr as string)).toBe(false);
  });

  it("surfboard matches surge minus hysteria2/anytls", () => {
    expect(emits(TargetFormat.Surfboard, LINKS.hy2 as string)).toBe(false);
    expect(emits(TargetFormat.Surfboard, LINKS.anytls as string)).toBe(false);
    expect(emits(TargetFormat.Surfboard, LINKS.ssPlain as string)).toBe(true);
  });
});
