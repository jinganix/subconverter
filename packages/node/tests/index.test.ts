import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  collectNodes,
  loadNodes,
  prepareConversion,
  readSubscriptionFile,
  resolveSubscription,
  writeOutputFile,
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
});
