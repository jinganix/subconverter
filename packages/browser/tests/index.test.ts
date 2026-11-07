import { describe, expect, it, vi } from "vitest";

import { fetchSubscription, loadNodes } from "../src/index";

describe("browser adapter", () => {
  it("fetches and parses a subscription", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("trojan://pw@1.2.3.4:443#Web", { status: 200 })),
    );
    const text = await fetchSubscription("https://example.com/sub");
    expect(text).toContain("trojan://");
    const nodes = await loadNodes("https://example.com/sub");
    expect(nodes[0]?.remark).toBe("Web");
    vi.unstubAllGlobals();
  });

  it("throws on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })),
    );
    await expect(fetchSubscription("https://example.com")).rejects.toThrow(/404/);
    vi.unstubAllGlobals();
  });
});

describe("browser IIFE global", () => {
  it("exposes the API as `SubConverter` on globalThis", async () => {
    const mod = await import("../src/global");
    expect((globalThis as { SubConverter?: unknown }).SubConverter).toBeDefined();
    expect(mod.default.parseSubscription).toBeTypeOf("function");
    expect((globalThis as { SubConverter?: { loadNodes?: unknown } }).SubConverter?.loadNodes).toBe(
      mod.default.loadNodes,
    );
  });
});
