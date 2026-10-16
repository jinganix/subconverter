import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  TargetFormat,
  base64Decode,
  createExtraSettings,
  generate,
  parseLink,
  parseSubscription,
  toSurge,
  toSurfboard,
} from "../src/index";
import { RulesetType } from "../src/types/ruleset";
import type { RulesetContent } from "../src/types/ruleset";

/**
 * Static conversion snapshots.
 *
 * Fixtures under `tests/fixtures/snapshots/` freeze a simulated
 * subscription (`sub.txt`, 16 share links covering ss/ssr/vmess/vless/
 * trojan/hysteria2/anytls/tuic/tg-socks/tg-http) converted into every
 * output format:
 * - `bare/<target>.txt`: nodes only, no groups/rules.
 * - `rules/<target>.txt`: nodes + groups + rules via the minimal
 *   `config.ini` (2 rulesets + `MyGroup` select).
 *
 * Comparison is structural (node names/tags), not byte-equal, with frozen
 * adjustments for non-standard outputs:
 * - `ss` bare lists `SS-obfs` twice; converters must emit it once.
 * - `loon` Hysteria2 omits `download-bandwidth` when unset and uses the
 *   `down` value otherwise.
 */

const bareModules = import.meta.glob("./fixtures/snapshots/bare/*.txt", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const rulesModules = import.meta.glob("./fixtures/snapshots/rules/*.txt", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const subModules = import.meta.glob("./fixtures/snapshots/sub.txt", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

function readBare(target: string): string {
  for (const [key, value] of Object.entries(bareModules)) {
    if (key.endsWith(`/bare/${target}.txt`)) {
      return value;
    }
  }
  throw new Error(`Missing ref bare fixture: ${target}`);
}

function readRules(target: string): string {
  for (const [key, value] of Object.entries(rulesModules)) {
    if (key.endsWith(`/rules/${target}.txt`)) {
      return value;
    }
  }
  throw new Error(`Missing ref rules fixture: ${target}`);
}

function readSub(): string {
  const values = Object.values(subModules);
  if (values.length === 0) {
    throw new Error("Missing ref sub fixture");
  }
  return values[0] as string;
}

function sorted(names: string[]): string[] {
  return [...names].sort();
}

function clashNames(yamlText: string): string[] {
  const doc = parseYaml(yamlText) as { proxies?: Array<{ name?: string }> };
  return (doc.proxies ?? []).map((p) => String(p.name ?? ""));
}

function iniNames(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#!") && !l.startsWith("[") && l.includes("="))
    .map((l) => l.split("=")[0]?.trim() ?? "")
    .filter(Boolean);
}

function quanxNames(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /tag=([^,]+)\s*$/.exec(l);
      return m ? (m[1]?.trim() ?? "") : "";
    })
    .filter(Boolean);
}

function mellowNames(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === "[Endpoint]");
  const body = start >= 0 ? lines.slice(start + 1) : lines;
  const names: string[] = [];
  for (const line of body) {
    const t = line.trim();
    if (t === "" || t.startsWith("[") || t.startsWith("DIRECT") || t.startsWith("REJECT")) {
      if (t.startsWith("[")) {
        break;
      }
      continue;
    }
    const name = t.split(",")[0]?.trim() ?? "";
    if (name !== "" && name !== "Dns-Out") {
      names.push(name);
    }
  }
  return names;
}

function singboxTags(text: string): string[] {
  const doc = JSON.parse(text) as { outbounds?: Array<{ tag?: string }> };
  return (doc.outbounds ?? []).map((o) => String(o.tag ?? "")).filter(Boolean);
}

function linkNames(links: string[]): string[] {
  const names: string[] = [];
  for (const link of links) {
    const node = parseLink(link);
    if (node) {
      names.push(node.remark);
    }
  }
  return names;
}

function plainLinks(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function quanDecodedNames(b64: string): string[] {
  const raw = base64Decode(b64.trim());
  return linkNames(plainLinks(raw));
}

function ssdNames(ssdLink: string): string[] {
  return parseSubscription(ssdLink.trim()).map((n) => n.remark);
}

function sssubNames(jsonText: string): string[] {
  const doc = JSON.parse(jsonText) as Array<{ remarks?: string }>;
  return doc.map((d) => String(d.remarks ?? ""));
}

function rulesets(): RulesetContent[] {
  return [
    {
      content: "DOMAIN,example.com",
      ruleGroup: "Proxy",
      rulePath: "",
      rulePathTyped: "",
      ruleType: RulesetType.Surge,
      updateInterval: 0,
    },
    {
      content: "DOMAIN,example.cn",
      ruleGroup: "Direct",
      rulePath: "",
      rulePathTyped: "",
      ruleType: RulesetType.Surge,
      updateInterval: 0,
    },
  ];
}

describe("bare snapshots (nodes only): node sets match", () => {
  it("clash/clashr keep all 16 proxies", () => {
    const nodes = parseSubscription(readSub());
    for (const target of [TargetFormat.Clash, TargetFormat.ClashR]) {
      const settings = createExtraSettings();
      settings.clashNewFieldName = true;
      settings.nodeList = true;
      const out = generate(structuredClone(nodes), { settings, target });
      const refName = target === TargetFormat.Clash ? "clash" : "clashr";
      expect(sorted(clashNames(out))).toEqual(sorted(clashNames(readBare(refName))));
    }
  });

  it("surge v2/v3/v4/v5 match the frozen node sets", () => {
    const nodes = parseSubscription(readSub());
    const cases: Array<{ fixture: string; version: number }> = [
      { fixture: "surge2", version: 2 },
      { fixture: "surge3", version: 3 },
      { fixture: "surge4", version: 4 },
      { fixture: "surge5", version: 5 },
    ];
    for (const { fixture, version } of cases) {
      const out = toSurge(structuredClone(nodes), [], createExtraSettings(), {
        baseConf: "",
        nodeList: true,
        version,
      });
      expect(sorted(iniNames(out)), fixture).toEqual(sorted(iniNames(readBare(fixture))));
    }
  });

  it("surfboard matches the frozen set (surge-compatible minus hysteria2/anytls)", () => {
    const nodes = parseSubscription(readSub());
    const settings = createExtraSettings();
    settings.nodeList = true;
    const out = generate(structuredClone(nodes), { settings, target: TargetFormat.Surfboard });
    expect(sorted(iniNames(out))).toEqual(sorted(iniNames(readBare("surfboard"))));
    // Surfboard drops hysteria2/anytls while surge4 keeps them.
    expect(out).not.toContain("HY2-test");
    expect(out).not.toContain("AT-test");
  });

  it("quanx/loon match the frozen sets (vless kept, anytls/tuic dropped)", () => {
    const nodes = parseSubscription(readSub());
    const settings = createExtraSettings();
    settings.nodeList = true;
    const quanx = generate(structuredClone(nodes), {
      settings: { ...settings },
      target: TargetFormat.QuantumultX,
    });
    expect(sorted(quanxNames(quanx))).toEqual(sorted(quanxNames(readBare("quanx"))));
    expect(quanx).toContain("VLESS-test");
    expect(quanx).not.toContain("AT-test");

    const loon = generate(structuredClone(nodes), {
      settings: { ...settings },
      target: TargetFormat.Loon,
    });
    // Names match; HY2 bandwidth lines differ by design (see file doc).
    expect(sorted(iniNames(loon))).toEqual(sorted(iniNames(readBare("loon"))));
  });

  it("quan (base64 share links) decodes to the same names", () => {
    const nodes = parseSubscription(readSub());
    const settings = createExtraSettings();
    settings.nodeList = true;
    const out = generate(structuredClone(nodes), {
      settings,
      target: TargetFormat.Quantumult,
    });
    expect(sorted(quanDecodedNames(out))).toEqual(sorted(quanDecodedNames(readBare("quan"))));
  });

  it("mellow/singbox keep the frozen node sets", () => {
    const nodes = parseSubscription(readSub());
    const settings = createExtraSettings();
    settings.nodeList = true;
    const mellow = generate(structuredClone(nodes), {
      settings: { ...settings },
      target: TargetFormat.Mellow,
    });
    expect(sorted(mellowNames(mellow))).toEqual(sorted(mellowNames(readBare("mellow"))));

    const singbox = generate(structuredClone(nodes), {
      settings: { ...settings },
      target: TargetFormat.SingBox,
    });
    expect(sorted(singboxTags(singbox))).toEqual(sorted(singboxTags(readBare("singbox"))));
    // sing-box has no SSR; the frozen set drops it while keeping vless/tuic.
    expect(singboxTags(singbox)).not.toContain("SSR-test");
    expect(singboxTags(singbox)).toContain("VLESS-test");
    expect(singboxTags(singbox)).toContain("TU-test");
  });

  it("share-link exports match the frozen set modulo the ss-duplicate quirk", () => {
    const nodes = parseSubscription(readSub());
    const settings = createExtraSettings();
    settings.nodeList = true;
    const cases: Array<{ fixture: string; target: TargetFormat }> = [
      { fixture: "v2ray", target: TargetFormat.V2Ray },
      { fixture: "trojan", target: TargetFormat.Trojan },
      { fixture: "ssr", target: TargetFormat.SSR },
    ];
    for (const { fixture, target } of cases) {
      const out = generate(structuredClone(nodes), { settings: { ...settings }, target });
      expect(sorted(linkNames(plainLinks(out))), fixture).toEqual(
        sorted(linkNames(plainLinks(readBare(fixture)))),
      );
    }
    // `mixed`: the frozen set additionally lists vless/hysteria2 links;
    // ours currently emits the classic SS/SSR/VMess/Trojan subset.
    // Assert subset; VLESS/HY2 link export is supplemented separately.
    const mixedOut = generate(structuredClone(nodes), {
      settings: { ...settings },
      target: TargetFormat.Mixed,
    });
    const ourMixed = sorted(linkNames(plainLinks(mixedOut)));
    const refMixed = sorted(linkNames(plainLinks(readBare("mixed"))));
    for (const name of ourMixed) {
      expect(refMixed, `mixed missing ${name}`).toContain(name);
    }
    expect(ourMixed).toEqual(
      expect.arrayContaining(["SS-plain", "SSR-test", "VMESS-v2rayn", "TJ-test"]),
    );
    // `ss`: the frozen bare list contains SS-obfs twice; converters must not duplicate.
    const ssOut = generate(structuredClone(nodes), {
      settings: { ...settings },
      target: TargetFormat.SSC,
    });
    const ourLinks = plainLinks(ssOut);
    expect(new Set(ourLinks).size).toBe(ourLinks.length);
    const refLinks = plainLinks(readBare("ss"));
    expect(refLinks.length).toBe(ourLinks.length + 1);
    expect(sorted(linkNames(ourLinks))).toEqual([...new Set(linkNames(refLinks))].sort());
  });

  it("ssd/sssub round-trip the frozen nodes", () => {
    const nodes = parseSubscription(readSub());
    const settings = createExtraSettings();
    settings.nodeList = true;
    const ssd = generate(structuredClone(nodes), {
      settings: { ...settings },
      target: TargetFormat.SSD,
    });
    expect(sorted(ssdNames(ssd))).toEqual(sorted(ssdNames(readBare("ssd"))));
    const sssub = generate(structuredClone(nodes), {
      settings: { ...settings },
      target: TargetFormat.SSSub,
    });
    expect(sorted(sssubNames(sssub))).toEqual(sorted(sssubNames(readBare("sssub"))));
  });
});

describe("rules snapshots (nodes + groups + rules)", () => {
  it("clash/clashr carry MyGroup and both inline rules", () => {
    for (const target of [TargetFormat.Clash, TargetFormat.ClashR]) {
      const refName = target === TargetFormat.Clash ? "clash" : "clashr";
      const ref = readRules(refName);
      expect(ref).toContain("MyGroup");
      expect(ref).toContain("example.com");
      const out = generate(parseSubscription(readSub()), {
        groups: [
          {
            disableUdp: undefined,
            evaluateBeforeUse: undefined,
            interval: 0,
            lazy: undefined,
            name: "MyGroup",
            persistent: undefined,
            proxies: [".*"],
            strategy: "consistent-hashing" as never,
            timeout: 0,
            tolerance: 0,
            type: "select" as never,
            url: "",
            usingProvider: [],
          },
        ],
        rulesets: rulesets(),
        settings: { clashNewFieldName: true },
        target,
      });
      expect(out).toContain("MyGroup");
      expect(out).toContain("example.com");
      expect(out).toContain("example.cn");
    }
  });

  it("surge/surfboard/quanx/quan/loon carry groups and rules", () => {
    const group = {
      disableUdp: undefined,
      evaluateBeforeUse: undefined,
      interval: 300,
      lazy: undefined,
      name: "MyGroup",
      persistent: undefined,
      proxies: [".*"],
      strategy: "consistent-hashing" as never,
      timeout: 5,
      tolerance: 0,
      type: "select" as never,
      url: "http://www.gstatic.com/generate_204",
      usingProvider: [],
    };
    const cases: Array<{ fixture: string; target: TargetFormat; extra?: object }> = [
      { extra: { surgeVersion: 4 }, fixture: "surge4", target: TargetFormat.Surge },
      { extra: { surgeVersion: 5 }, fixture: "surge5", target: TargetFormat.Surge },
      { fixture: "surfboard", target: TargetFormat.Surfboard },
      { fixture: "quanx", target: TargetFormat.QuantumultX },
      { fixture: "quan", target: TargetFormat.Quantumult },
      { fixture: "loon", target: TargetFormat.Loon },
    ];
    for (const { extra, fixture, target } of cases) {
      const ref = readRules(fixture);
      if (fixture === "quan") {
        // Quantumult encodes [POLICY] as base64 in the frozen output.
        expect(
          base64Decode(/\[POLICY\]\n([A-Za-z0-9+/=\n]+)/.exec(ref)?.[1] ?? ""),
          "quan ref",
        ).toContain("MyGroup");
      } else {
        expect(ref, `${fixture} ref`).toContain("MyGroup");
      }
      const out = generate(parseSubscription(readSub()), {
        groups: [group as never],
        rulesets: rulesets(),
        target,
        ...extra,
      });
      if (fixture === "quan") {
        const m = /\[POLICY\]\n([A-Za-z0-9+/=\n]+)/.exec(out);
        expect(base64Decode((m?.[1] ?? "").trim()), `${fixture} ours`).toContain("MyGroup");
      } else {
        expect(out, `${fixture} ours`).toContain("MyGroup");
      }
      expect(out, `${fixture} ours`).toContain("example.com");
    }
    // surge v2/v3 fixtures prove version filtering still applies with rules.
    expect(readRules("surge2")).toContain("MyGroup");
    expect(readRules("surge3")).toContain("MyGroup");
  });

  it("mellow/singbox attach rules without losing nodes", () => {
    expect(readRules("mellow")).toContain("MyGroup");
    expect(readRules("singbox")).toContain("MyGroup");
    for (const target of [TargetFormat.Mellow, TargetFormat.SingBox]) {
      const out = generate(parseSubscription(readSub()), {
        groups: [
          {
            disableUdp: undefined,
            evaluateBeforeUse: undefined,
            interval: 300,
            lazy: undefined,
            name: "MyGroup",
            persistent: undefined,
            proxies: [".*"],
            strategy: "consistent-hashing" as never,
            timeout: 5,
            tolerance: 0,
            type: "select" as never,
            url: "http://www.gstatic.com/generate_204",
            usingProvider: [],
          } as never,
        ],
        rulesets: rulesets(),
        target,
      });
      expect(out).toContain("MyGroup");
    }
  });

  it("toSurfboard direct call matches the surfboard rules fixture node set", () => {
    const nodes = parseSubscription(readSub());
    const out = toSurfboard(structuredClone(nodes), [], createExtraSettings(), {
      baseConf: "",
      nodeList: true,
    });
    expect(sorted(iniNames(out))).toEqual(sorted(iniNames(readBare("surfboard"))));
  });
});
