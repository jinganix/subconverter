import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  return {
    ...actual,
    lookup: async (host: string, options?: unknown) => {
      if (host.includes("dns-fail-test")) {
        throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
      }
      // Simulated DNS-rebinding hostnames: literals pass the SSRF guard,
      // but resolution reveals loopback/link-local targets.
      if (host === "rebind-test.invalid") {
        return [{ address: "127.0.0.1", family: 4 }];
      }
      if (host === "rebind-meta-test.invalid") {
        return [{ address: "169.254.169.254", family: 4 }];
      }
      return (actual.lookup as (h: string, o?: unknown) => unknown)(host, options);
    },
  };
});

import {
  clearDefaultRulesetCache,
  collectRequestUrls,
  convertSubRequest,
  fetchSubscription,
  getCachedDefaultRulesets,
  resolveNodeCountries,
  splitSubscriptionUrls,
  type GeoIpDatabase,
} from "../src/index";

const SUB_BODY = "trojan://pw@1.2.3.4:443#Node";
const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init?: RequestInit) => unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:")) {
        const args = [input, init] as unknown as Parameters<typeof originalFetch>;
        return originalFetch(...args);
      }
      return handler(url, init) as Promise<Response>;
    }),
  );
}

function fakeDatabase(map: Record<string, string>): GeoIpDatabase {
  return {
    lookupCountry: (ip: string) => map[ip],
  };
}

function trojanNode(hostname: string): Parameters<typeof resolveNodeCountries>[0][number] {
  // Minimal proxy shape for `resolveNodeCountries` (only `hostname` matters).
  return { hostname } as never;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  clearDefaultRulesetCache();
});

describe("finding 1: SSRF literal + DNS fail-closed", () => {
  it("fails closed when DNS resolution fails", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw = `target=clash&url=${encodeURIComponent("https://dns-fail-test.invalid/sub")}`;
    await expect(convertSubRequest(raw, new URLSearchParams(raw))).rejects.toThrow(
      /Failed to resolve|Private or loopback/,
    );
  });

  it("blocks single-number and hex/octal loopback spellings", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    for (const blocked of [
      "http://0/sub",
      "http://2130706433/sub",
      "http://0x7f000001/sub",
      "http://0177.0.0.1/sub",
      "http://0x7f.0.0.1/sub",
      "http://[::ffff:127.0.0.1]/sub",
      "http://[0:0:0:0:0:ffff:7f00:1]/sub",
      "http://[0:0:0:0:0:0:0:1]/sub",
    ]) {
      const params = new URLSearchParams({ target: "clash", url: blocked });
      await expect(convertSubRequest(params.toString(), params)).rejects.toThrow(
        /Private or loopback|Failed to resolve|Invalid url URL/,
      );
    }
  });
});

describe("finding 9: combined cap and concurrent cap", () => {
  it("caps the combined subscription body at one single-fetch cap", async () => {
    const big = `${SUB_BODY}\n${"a".repeat(4 * 1024 * 1024)}`;
    stubFetch(() => new Response(big, { status: 200 }));
    const params = new URLSearchParams({ target: "clash" });
    params.append("url", "https://example.com/a");
    params.append("url", "https://example.com/b");
    // Two 4MB bodies (8MB total): each passes the 5MB single cap, but the
    // 5MB combined cap must reject.
    await expect(convertSubRequest(params.toString(), params)).rejects.toThrow(
      /Combined subscription body exceeds size limit/,
    );
  });

  it("rejects with 503 when too many conversions run concurrently", async () => {
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => resolve(new Response(SUB_BODY, { status: 200 })), 50);
        }),
    );
    const raw = `target=clash&url=${encodeURIComponent("https://example.com/sub")}&no_rules=true`;
    const pending = Array.from({ length: 25 }, () =>
      convertSubRequest(raw, new URLSearchParams(raw)),
    );
    const settled = await Promise.allSettled(pending);
    const busy = settled.filter(
      (result) =>
        result.status === "rejected" &&
        (result as PromiseRejectedResult).reason?.statusCode === 503,
    );
    expect(busy.length).toBeGreaterThan(0);
  });
});

describe("finding 11: geoip concurrency and timeout", () => {
  it("resolves many hosts concurrently", async () => {
    const db = fakeDatabase({ "1.2.3.4": "US" });
    const nodes = Array.from({ length: 10 }, (_, index) => trojanNode(`h${index}.example.com`));
    const started = Date.now();
    const codes = await resolveNodeCountries(nodes, db, {
      lookup: async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return ["1.2.3.4"];
      },
    });
    const elapsed = Date.now() - started;
    expect(codes.size).toBe(10);
    // Sequential would take 1500ms; concurrent (limit 20) takes ~150ms.
    expect(elapsed).toBeLessThan(1000);
  });

  it("times out a hanging DNS lookup instead of stalling", async () => {
    const db = fakeDatabase({ "1.2.3.4": "US" });
    const nodes = [trojanNode("hang.example.com")];
    const codes = await resolveNodeCountries(nodes, db, {
      lookup: () => new Promise<string[]>(() => undefined),
      timeoutMs: 100,
    });
    expect(codes.size).toBe(0);
  });
});

describe("finding 12: fetch SSRF and default timeout", () => {
  it("blocks private hosts before fetching", async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      return new Response(SUB_BODY, { status: 200 });
    });
    for (const blocked of [
      "http://127.0.0.1/sub",
      "http://0/sub",
      "http://2130706433/sub",
      "http://0x7f000001/sub",
      "http://10.0.0.5/sub",
      "http://[::1]/sub",
    ]) {
      await expect(fetchSubscription(blocked)).rejects.toThrow(/Private or loopback/);
    }
    expect(seen).toEqual([]);
  });

  it("applies a default 15s timeout without an explicit option", async () => {
    vi.useFakeTimers();
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    );
    // Use a public IP literal so no DNS lookup races the fetch timeout
    // (DNS now has its own 3s fail-closed timeout; domain names would win
    // the fake-timer race before the 15s fetch abort).
    const pending = fetchSubscription("https://93.184.216.34/sub");
    const assertion = expect(pending).rejects.toThrow(/abort/i);
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });
});

describe("finding 13: stale-while-revalidate defaults", () => {
  it("serves stale defaults while a slow upstream revalidates", async () => {
    clearDefaultRulesetCache();
    stubFetch(() => new Response("DOMAIN-SUFFIX,fast.example", { status: 200 }));
    const first = await getCachedDefaultRulesets();
    expect(first.some((entry) => entry.content.includes("fast.example"))).toBe(true);

    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 11 * 60 * 1000);
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(
            () => resolve(new Response("DOMAIN-SUFFIX,slow.example", { status: 200 })),
            2000,
          );
        }),
    );
    const started = Date.now();
    const second = await getCachedDefaultRulesets();
    const elapsed = Date.now() - started;
    // Must return the stale copy immediately instead of waiting ~2s.
    expect(elapsed).toBeLessThan(1000);
    expect(second.some((entry) => entry.content.includes("fast.example"))).toBe(true);
  });
});

describe("finding 1 (node): library fetch DNS-rebinding guard", () => {
  it("fails closed when a hostname resolves to loopback/metadata (no fetch)", async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      return new Response(SUB_BODY, { status: 200 });
    });
    await expect(fetchSubscription("http://rebind-test.invalid/sub")).rejects.toThrow(
      /Private or loopback/,
    );
    await expect(fetchSubscription("http://rebind-meta-test.invalid/sub")).rejects.toThrow(
      /Private or loopback/,
    );
    expect(seen).toEqual([]);
  });

  it("fails closed when DNS resolution fails", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    await expect(fetchSubscription("https://dns-fail-test.invalid/sub")).rejects.toThrow(
      /Failed to resolve/,
    );
  });
});

describe("finding 4 (node): encoded pipe stays inside one url", () => {
  it("does not split an encoded %7C token", () => {
    expect(splitSubscriptionUrls("https://example.com/sub?token=a|b")).toEqual([
      "https://example.com/sub?token=a|b",
    ]);
    // `%7C` decodes to `|` before splitting, so `?token=a|b` (no `http`
    // after the pipe) stays intact.
    expect(collectRequestUrls("url=https%3A%2F%2Fexample.com%2Fsub%3Ftoken%3Da%7Cb")).toEqual([
      "https://example.com/sub?token=a|b",
    ]);
  });

  it("still splits separators between urls (literal pipes and newlines)", () => {
    expect(splitSubscriptionUrls("https://a|https://b\nhttps://c")).toEqual([
      "https://a",
      "https://b",
      "https://c",
    ]);
    // Both literal `|` and encoded `%7C` split when followed by `http(s)`.
    expect(collectRequestUrls("url=https://a|https://b&url=https://c")).toEqual([
      "https://a",
      "https://b",
      "https://c",
    ]);
    expect(collectRequestUrls("url=https%3A%2F%2Fa%7Chttps%3A%2F%2Fb")).toEqual([
      "https://a",
      "https://b",
    ]);
  });

  it("splits a pipe before another url, like splitSubscriptionUrls", () => {
    expect(
      collectRequestUrls("url=https%3A%2F%2Fexample.com%2Fsub%3Ftoken%3Da%7Chttps%3A%2F%2Fb"),
    ).toEqual(["https://example.com/sub?token=a", "https://b"]);
    expect(splitSubscriptionUrls("https://example.com/sub?token=a|https://b")).toEqual([
      "https://example.com/sub?token=a",
      "https://b",
    ]);
  });

  it("converts a subscription whose token contains an encoded pipe", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw = `target=clash&no_rules=true&url=${encodeURIComponent("https://example.com/sub?token=a|b")}`;
    const result = await convertSubRequest(raw, new URLSearchParams(raw));
    expect(result.body).toContain("Node");
  });
});

describe("finding 8: node and host caps", () => {
  it("rejects more than 3000 nodes with a 400", async () => {
    const links = Array.from(
      { length: 3001 },
      (_, index) => `trojan://pw@1.2.3.4:443#n${String(index)}`,
    );
    stubFetch(() => new Response(links.join("\n"), { status: 200 }));
    const raw = `target=clash&no_rules=true&url=${encodeURIComponent("https://example.com/sub")}`;
    const error = await convertSubRequest(raw, new URLSearchParams(raw)).catch(
      (cause: unknown) => cause,
    );
    expect(error).toMatchObject({ statusCode: 400 });
    expect(String((error as Error).message)).toMatch(/Too many proxy nodes/);
  });

  it("skips hostnames beyond the 100-host GeoIP cap", async () => {
    const db = fakeDatabase({ "1.2.3.4": "US" });
    let calls = 0;
    const nodes = Array.from({ length: 150 }, (_, index) =>
      trojanNode(`cap${String(index)}.example.com`),
    );
    const codes = await resolveNodeCountries(nodes, db, {
      lookup: async () => {
        calls += 1;
        return ["1.2.3.4"];
      },
    });
    expect(calls).toBe(100);
    expect(codes.size).toBe(100);
  });
});

describe("finding 9: one shared SSRF guard for library and server fetches", () => {
  it("blocks a rebinding hostname on both entrypoints without fetching", async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      return new Response(SUB_BODY, { status: 200 });
    });
    await expect(fetchSubscription("http://rebind-test.invalid/sub")).rejects.toThrow(
      /Private or loopback/,
    );
    const raw = `target=clash&url=${encodeURIComponent("http://rebind-test.invalid/sub")}`;
    await expect(convertSubRequest(raw, new URLSearchParams(raw))).rejects.toThrow(
      /Private or loopback/,
    );
    expect(seen).toEqual([]);
  });
});

describe("finding 7: library post-body SSRF re-validate", () => {
  it("discards the body when DNS flips between pre- and post-checks", async () => {
    const dns = await import("node:dns/promises");
    const original = dns.lookup;
    let calls = 0;
    (dns as { lookup: unknown }).lookup = async (host: string) => {
      calls += 1;
      if (host === "flip-test.invalid") {
        // First (pre-fetch) lookup is clean; the post-headers lookup flips
        // to loopback, simulating a TTL-0 rebinding attack.
        if (calls === 1) {
          return [{ address: "93.184.216.34", family: 4 }] as never;
        }
        return [{ address: "127.0.0.1", family: 4 }] as never;
      }
      return [{ address: "93.184.216.34", family: 4 }] as never;
    };
    try {
      stubFetch(() => new Response(SUB_BODY, { status: 200 }));
      await expect(fetchSubscription("http://flip-test.invalid/sub")).rejects.toThrow(
        /Private or loopback/,
      );
      expect(calls).toBeGreaterThanOrEqual(2);
    } finally {
      (dns as { lookup: unknown }).lookup = original;
    }
  });
});

describe("finding 8: ruleset pipe does not truncate query tokens", () => {
  it("keeps `?x=a|b` inside one ruleset url", async () => {
    stubFetch((url) => {
      if (url.includes("r.list")) {
        return new Response("DOMAIN-SUFFIX,pipe-token.example,DIRECT", { status: 200 });
      }
      return new Response(SUB_BODY, { status: 200 });
    });
    const ruleset = encodeURIComponent("G,https://example.com/r.list?x=a|b");
    const raw = `target=clash&url=${encodeURIComponent("https://example.com/sub")}&ruleset=${ruleset}&no_rules=false`;
    const result = await convertSubRequest(raw, new URLSearchParams(raw));
    expect(result.body).toContain("pipe-token.example");
  });
});

describe("finding 10: group count cap", () => {
  it("rejects more than 20 groups with a 400", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const params = new URLSearchParams({ target: "clash", url: "https://example.com/sub" });
    for (let index = 0; index < 21; index += 1) {
      params.append("group", `G${String(index)}`);
    }
    await expect(convertSubRequest(params.toString(), params)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("finding 12: IPv6 zone identifier bypass", () => {
  it("blocks hosts containing a zone id on both entrypoints", async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      return new Response(SUB_BODY, { status: 200 });
    });
    await expect(fetchSubscription("http://[fe80::1%25eth0]/sub")).rejects.toThrow(
      /Private or loopback|Invalid url/,
    );
    const params = new URLSearchParams({
      target: "clash",
      url: "http://[fe80::1%25eth0]/sub",
    });
    await expect(convertSubRequest(params.toString(), params)).rejects.toThrow(
      /Private or loopback|Invalid url/,
    );
    expect(seen).toEqual([]);
  });
});

describe("finding 15: shared node cap for library conversions", () => {
  it("rejects more than 3000 nodes from collectNodes", async () => {
    const { collectNodes } = await import("../src/index");
    const links = Array.from(
      { length: 3001 },
      (_, index) => `trojan://pw@1.2.3.4:443#n${String(index)}`,
    );
    await expect(collectNodes([{ kind: "text", text: links.join("\n") }])).rejects.toThrow(
      /Too many proxy nodes/,
    );
  });
});

describe("round-3 must 5: external config list caps", () => {
  it("rejects an evil config with too many renames", async () => {
    const evil = ["[custom]", ...Array.from({ length: 51 }, (_, i) => `rename=a${i}@b`)].join("\n");
    stubFetch((url) => {
      if (url.includes("evil")) {
        return new Response(evil, { status: 200 });
      }
      return new Response(SUB_BODY, { status: 200 });
    });
    const raw =
      `target=clash&no_rules=true&url=${encodeURIComponent("https://example.com/sub")}` +
      `&config=${encodeURIComponent("https://example.com/evil.ini")}`;
    await expect(convertSubRequest(raw, new URLSearchParams(raw))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects an evil config exceeding the char cap", async () => {
    const evil = ["[custom]", `rename=${"a".repeat(2001)}@b`].join("\n");
    stubFetch((url) => {
      if (url.includes("evil")) {
        return new Response(evil, { status: 200 });
      }
      return new Response(SUB_BODY, { status: 200 });
    });
    const raw =
      `target=clash&no_rules=true&url=${encodeURIComponent("https://example.com/sub")}` +
      `&config=${encodeURIComponent("https://example.com/evil.ini")}`;
    await expect(convertSubRequest(raw, new URLSearchParams(raw))).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("round-3 must 6: ruleset size caps", () => {
  it("rejects an inline ruleset over 10KB", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const big = `G,[]${"A".repeat(11 * 1024)}`;
    const raw =
      `target=clash&no_rules=false&url=${encodeURIComponent("https://example.com/sub")}` +
      `&ruleset=${encodeURIComponent(big)}`;
    await expect(convertSubRequest(raw, new URLSearchParams(raw))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects combined remote rulesets over 200KB", async () => {
    const chunk = "DOMAIN-SUFFIX,example.com,DIRECT\n".repeat(5000); // ~165KB
    stubFetch((url) => {
      if (url.includes("r1.list") || url.includes("r2.list")) {
        return new Response(chunk, { status: 200 });
      }
      return new Response(SUB_BODY, { status: 200 });
    });
    const raw =
      `target=clash&no_rules=false&url=${encodeURIComponent("https://example.com/sub")}` +
      `&ruleset=${encodeURIComponent("G1,https://example.com/r1.list")}` +
      `&ruleset=${encodeURIComponent("G2,https://example.com/r2.list")}`;
    await expect(convertSubRequest(raw, new URLSearchParams(raw))).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("round-3 must 7: filename cap", () => {
  it("truncates an unbounded filename to 100 chars", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const longName = "a".repeat(500);
    const raw =
      `target=clash&no_rules=true&url=${encodeURIComponent("https://example.com/sub")}` +
      `&filename=${encodeURIComponent(longName)}`;
    const result = await convertSubRequest(raw, new URLSearchParams(raw));
    expect(result.filename.length).toBeLessThanOrEqual(100);
    expect(result.filename).toBe("a".repeat(100));
  });
});
