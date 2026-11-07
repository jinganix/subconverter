import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runPreprocess } from "@subconverter/core";

import {
  collectNodes,
  fetchSubscription,
  loadNodes,
  prepareConversion,
  readCappedText,
  readSubscriptionFile,
  resolveSubscription,
  writeOutputFile,
  type SubscriptionSource,
} from "../src/index";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "subconverter-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
  vi.restoreAllMocks();
});

describe("node adapter", () => {
  it("reads a local subscription file", async () => {
    const path = join(dir, "sub.txt");
    await writeFile(path, "trojan://pw@1.2.3.4:443#Node", "utf-8");
    const text = await readSubscriptionFile(path);
    expect(text).toContain("trojan://");
    const nodes = await loadNodes({ kind: "file", path });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.remark).toBe("Node");
  });

  it("writes output files", async () => {
    const path = join(dir, "out.yaml");
    await writeOutputFile(path, "hello");
    expect(await readSubscriptionFile(path)).toBe("hello");
  });

  it("fetches remote subscriptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("trojan://pw@1.2.3.4:443#Remote", { status: 200 })),
    );
    const nodes = await loadNodes({ kind: "url", url: "https://example.com/sub" });
    expect(nodes[0]?.remark).toBe("Remote");
  });

  it("throws on non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500, statusText: "Server Error" })),
    );
    await expect(resolveSubscription({ kind: "url", url: "https://example.com" })).rejects.toThrow(
      /500/,
    );
  });

  it("resolves inline text and merges multiple sources", async () => {
    const nodes = await collectNodes([
      { kind: "text", text: "trojan://pw@1.2.3.4:443#A" },
      { kind: "text", text: "trojan://pw@5.6.7.8:443#B" },
    ]);
    expect(nodes.map((n) => n.remark)).toEqual(["A", "B"]);
  });

  it("prepares a conversion request", async () => {
    const input = await prepareConversion({
      sources: [{ kind: "text", text: "trojan://pw@1.2.3.4:443#A" }],
      target: "clash" as never,
    });
    expect(input.nodes).toHaveLength(1);
    expect(input.settings.appendProxyType).toBe(false);
  });
});

describe("ruleset loading", () => {
  it("detects ruleset dialects", async () => {
    const { collectRulesets, detectRulesetType, loadRuleset, parseRulesetSource } =
      await import("../src/index");
    expect(detectRulesetType("payload:\n  - a.com")).toBe("clash-domain");
    expect(detectRulesetType("host,example.com,G")).toBe("quanx");
    expect(detectRulesetType("DOMAIN,example.com,G")).toBe("surge");
    expect(parseRulesetSource("clash-ipcidr:https://x")).toEqual({
      type: "clash-ipcidr",
      url: "https://x",
    });
    expect(parseRulesetSource("https://x")).toEqual({ type: undefined, url: "https://x" });

    const path = join(dir, "rules.list");
    await writeFile(path, "DOMAIN,example.com", "utf-8");
    const loaded = await loadRuleset({ group: "G", interval: 0, url: path });
    expect(loaded.content).toContain("DOMAIN,example.com");
    expect(loaded.ruleType).toBe("surge");

    const remote = { kind: "text" as const };
    void remote;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("payload:\n  - a.com", { status: 200 })),
    );
    const fromUrl = await loadRuleset({
      group: "G",
      interval: 0,
      url: "https://example.com/rules",
    });
    expect(fromUrl.ruleType).toBe("clash-domain");
    vi.unstubAllGlobals();

    const collected = await collectRulesets([
      { group: "G", interval: 0, url: path },
      { group: "Bad", interval: 0, url: join(dir, "missing.list") },
    ]);
    expect(collected).toHaveLength(2);
    expect(collected[1]?.content).toBe("");
  });

  it("collects rulesets during conversion prep", async () => {
    const { prepareConversion } = await import("../src/index");
    const path = join(dir, "rules.list");
    await writeFile(path, "DOMAIN,example.com", "utf-8");
    const input = await prepareConversion({
      rulesets: [{ group: "G", interval: 0, url: path }],
      sources: [{ kind: "text", text: "trojan://pw@1.2.3.4:443#A" }],
      target: "surge" as never,
    });
    expect(input.rulesets).toHaveLength(1);
  });

  it("keeps inline [] rules without fetching", async () => {
    const { loadRuleset } = await import("../src/index");
    const loaded = await loadRuleset({ group: "G", interval: 0, url: "[]GEOIP,CN" });
    expect(loaded.content).toBe("[]GEOIP,CN");
  });

  it("injects bundled defaults when includeRules is set", async () => {
    const { prepareConversion } = await import("../src/index");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500, statusText: "err" })),
    );
    const input = await prepareConversion({
      includeRules: true,
      sources: [{ kind: "text", text: "trojan://pw@1.2.3.4:443#A" }],
      target: "clash" as never,
    });
    expect(input.extraProxyGroup.length).toBeGreaterThan(5);
    expect(input.rulesets.length).toBeGreaterThan(5);
    vi.unstubAllGlobals();
  });

  it("strips rules when includeRules is false", async () => {
    const { prepareConversion } = await import("../src/index");
    const path = join(dir, "rules.list");
    await writeFile(path, "DOMAIN,example.com", "utf-8");
    const input = await prepareConversion({
      includeRules: false,
      rulesets: [{ group: "G", interval: 0, url: path }],
      sources: [{ kind: "text", text: "trojan://pw@1.2.3.4:443#A" }],
      target: "clash" as never,
    });
    expect(input.rulesets).toHaveLength(0);
    expect(input.extraProxyGroup).toHaveLength(0);
  });
});

describe("auto country", () => {
  it("prefixes country names using a local GeoIP database", async () => {
    const { buildGeoIpFixture } = await import("./mmdb-fixture");
    const path = join(dir, "geo.mmdb");
    await writeFile(path, buildGeoIpFixture({ "1.2.3.4": "US", "5.6.7.8": "HK" }));
    const input = await prepareConversion({
      geoipPath: path,
      settings: { autoCountry: true },
      sources: [
        { kind: "text", text: "trojan://pw@1.2.3.4:443#server1" },
        { kind: "text", text: "trojan://pw@5.6.7.8:443#香港-01" },
      ],
      target: "clash" as never,
    });
    runPreprocess(input.nodes, input.settings);
    expect(input.nodes.map((node) => node.remark)).toEqual(["US-server1", "香港-01"]);
  });

  it("filters by country using the GeoIP database", async () => {
    const { buildGeoIpFixture } = await import("./mmdb-fixture");
    const path = join(dir, "geo.mmdb");
    await writeFile(path, buildGeoIpFixture({ "1.2.3.4": "US", "5.6.7.8": "NL" }));
    const input = await prepareConversion({
      geoipPath: path,
      settings: { excludeCountries: ["NL"] },
      sources: [
        { kind: "text", text: "trojan://pw@1.2.3.4:443#server1" },
        { kind: "text", text: "trojan://pw@5.6.7.8:443#server2" },
      ],
      target: "clash" as never,
    });
    runPreprocess(input.nodes, input.settings);
    expect(input.nodes.map((node) => node.remark)).toEqual(["server1"]);
  });

  it("requires a database for country filters", async () => {
    await expect(
      prepareConversion({
        settings: { includeCountries: ["US"] },
        sources: [{ kind: "text", text: "trojan://pw@1.2.3.4:443#A" }],
        target: "clash" as never,
      }),
    ).rejects.toThrow(/geoipPath/);
  });

  it("requires a database when autoCountry is on", async () => {
    await expect(
      prepareConversion({
        settings: { autoCountry: true },
        sources: [{ kind: "text", text: "trojan://pw@1.2.3.4:443#A" }],
        target: "clash" as never,
      }),
    ).rejects.toThrow(/geoipPath/);
  });

  it("leaves names alone when autoCountry is off", async () => {
    const input = await prepareConversion({
      sources: [{ kind: "text", text: "trojan://pw@1.2.3.4:443#server1" }],
      target: "clash" as never,
    });
    expect(input.nodes[0]?.remark).toBe("server1");
    expect(input.settings.countryResolver).toBeUndefined();
  });
});

describe("fetch guards", () => {
  it("caps a response with no readable body stream", async () => {
    const big = new Response(null, { headers: {} });
    Object.defineProperty(big, "body", { value: null });
    Object.defineProperty(big, "text", {
      value: async () => "x".repeat(6 * 1024 * 1024),
    });
    await expect(readCappedText(big, 1024)).rejects.toThrow(/exceeds size limit/);
    const small = new Response(null);
    Object.defineProperty(small, "body", { value: null });
    Object.defineProperty(small, "text", { value: async () => "ok" });
    await expect(readCappedText(small, 1024)).resolves.toBe("ok");
  });

  it("caps a streamed body as it arrives", async () => {
    const chunk = new Uint8Array(2048);
    let reads = 0;
    const body = new ReadableStream({
      pull(controller) {
        reads += 1;
        controller.enqueue(chunk);
        if (reads > 100) {
          controller.close();
        }
      },
    });
    const response = new Response(body);
    await expect(readCappedText(response, 4096)).rejects.toThrow(/exceeds size limit/);
  });

  it("times out a slow fetch and reports HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          }),
      ),
    );
    await expect(fetchSubscription("https://example.com/sub", { timeoutMs: 10 })).rejects.toThrow(
      /aborted/i,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500, statusText: "Internal Server Error" })),
    );
    await expect(fetchSubscription("https://example.com/sub")).rejects.toThrow(/500/);
    vi.unstubAllGlobals();
  });

  it("rejects unknown subscription sources", async () => {
    await expect(
      resolveSubscription({ kind: "bogus" } as unknown as SubscriptionSource),
    ).rejects.toThrow(/Unknown subscription source/);
  });
});
