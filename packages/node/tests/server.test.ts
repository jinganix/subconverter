import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectRequestUrls,
  contentTypeForTarget,
  convertSubRequest,
  fetchSubscriptionDetailed,
  fetchUserinfoHeader,
  splitSubscriptionUrls,
  startServer,
} from "../src/index";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string) => Response | Promise<Response>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      // Let requests to the ephemeral test server hit the real network stack.
      if (url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:")) {
        const args = [input, init] as unknown as Parameters<typeof originalFetch>;
        return originalFetch(...args);
      }
      return handler(url);
    }),
  );
}

const SUB_BODY = "trojan://pw@1.2.3.4:443#Node";

describe("server helpers", () => {
  it("splits subscription urls", () => {
    expect(splitSubscriptionUrls("https://a|https://b\nhttps://c")).toEqual([
      "https://a",
      "https://b",
      "https://c",
    ]);
    expect(splitSubscriptionUrls("  ")).toEqual([]);
  });

  it("collects repeated url params", () => {
    const params = new URLSearchParams();
    params.append("url", "https://a|https://b");
    params.append("url", "https://c");
    expect(collectRequestUrls(params.toString())).toEqual(["https://a", "https://b", "https://c"]);
  });

  it("preserves plus signs in url params (no URLSearchParams space decoding)", () => {
    const raw = "target=clash&url=https%3A%2F%2Fexample.com%2Fsub%3Ftoken%3Dab%2Bcd";
    expect(collectRequestUrls(raw)).toEqual(["https://example.com/sub?token=ab+cd"]);
  });

  it("maps content types", () => {
    expect(contentTypeForTarget("singbox")).toContain("application/json");
    expect(contentTypeForTarget("clash")).toContain("yaml");
    expect(contentTypeForTarget("surge")).toContain("text/plain");
  });
});

describe("fetchSubscriptionDetailed", () => {
  it("captures quota headers", async () => {
    stubFetch(
      () =>
        new Response(SUB_BODY, {
          headers: {
            "profile-update-interval": "24",
            "subscription-userinfo": "upload=0; download=1; total=2; expire=3",
          },
          status: 200,
        }),
    );
    const result = await fetchSubscriptionDetailed("https://example.com/sub");
    expect(result.body).toBe(SUB_BODY);
    expect(result.userinfo).toBe("upload=0; download=1; total=2; expire=3");
    expect(result.profileUpdateInterval).toBe("24");
  });
});

describe("fetchUserinfoHeader", () => {
  it("converts a JMS quota endpoint", async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            bw_counter_b: 13958222812,
            bw_reset_day_of_month: 11,
            monthly_bw_limit_b: 500000000000,
          }),
          { status: 200 },
        ),
    );
    const header = await fetchUserinfoHeader("https://example.com/quota", "jms");
    expect(header).toContain("upload=0; download=14987527622; total=536870912000");
  });
});

describe("convertSubRequest", () => {
  it("converts a subscription and forwards upstream userinfo", async () => {
    stubFetch(
      () =>
        new Response(SUB_BODY, {
          headers: { "subscription-userinfo": "upload=0; download=1; total=2; expire=3" },
          status: 200,
        }),
    );
    const params = new URLSearchParams({ target: "clash", url: "https://example.com/sub" });
    const result = await convertSubRequest(params.toString(), params);
    expect(result.body).toContain("Node");
    expect(result.userinfo).toBe("upload=0; download=1; total=2; expire=3");
    expect(result.contentType).toContain("yaml");
  });

  it("prefers userinfo_url over the upstream header", async () => {
    stubFetch((url) => {
      if (url.includes("quota")) {
        return new Response(
          JSON.stringify({
            bw_counter_b: 10,
            bw_reset_day_of_month: 1,
            monthly_bw_limit_b: 100,
          }),
          { status: 200 },
        );
      }
      return new Response(SUB_BODY, {
        headers: { "subscription-userinfo": "upload=0; download=1; total=2; expire=3" },
        status: 200,
      });
    });
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fsub" +
      "&userinfo_url=https%3A%2F%2Fexample.com%2Fquota&userinfo_provider=jms";
    const params = new URLSearchParams(raw);
    const result = await convertSubRequest(raw, params);
    expect(result.userinfo).toContain("download=11; total=107");
    expect(result.userinfo).not.toBe("upload=0; download=1; total=2; expire=3");
  });

  it("rejects missing urls and unknown targets", async () => {
    await expect(
      convertSubRequest("target=clash", new URLSearchParams({ target: "clash" })),
    ).rejects.toThrow(/Missing url/);
    const badParams = new URLSearchParams({ target: "bogus", url: "https://example.com" });
    await expect(convertSubRequest(badParams.toString(), badParams)).rejects.toThrow(
      /Unknown target/,
    );
  });

  it("rejects non-http urls and too many urls", async () => {
    const fileParams = new URLSearchParams({ target: "clash", url: "/etc/passwd" });
    await expect(convertSubRequest(fileParams.toString(), fileParams)).rejects.toThrow(
      /Only http\(s\)/,
    );
    const many = new URLSearchParams({ target: "clash" });
    for (let index = 0; index < 6; index += 1) {
      many.append("url", `https://example.com/${String(index)}`);
    }
    await expect(convertSubRequest(many.toString(), many)).rejects.toThrow(/Too many/);
  });

  it("reports empty subscriptions", async () => {
    stubFetch(() => new Response("nothing here", { status: 200 }));
    const params = new URLSearchParams({ target: "clash", url: "https://example.com" });
    await expect(convertSubRequest(params.toString(), params)).rejects.toThrow(/No proxy nodes/);
  });

  it("surfaces fetch failures as 502", async () => {
    stubFetch(() => new Response("err", { status: 500, statusText: "boom" }));
    const params = new URLSearchParams({ target: "clash", url: "https://example.com" });
    const error = await convertSubRequest(params.toString(), params).catch(
      (err: unknown) => err as { statusCode?: number },
    );
    expect((error as { statusCode?: number }).statusCode).toBe(502);
  });

  it("attaches bundled rules with with_rules (offline fallback)", async () => {
    // Remote default rulesets fail to fetch, so bundled offline defaults apply.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = typeof input === "string" ? input : String(input);
        if (url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:")) {
          const args = [input] as unknown as Parameters<typeof fetch>;
          return originalFetch(...args);
        }
        if (url === "https://example.com/sub") {
          return new Response(SUB_BODY, { status: 200 });
        }
        return new Response("", { status: 500, statusText: "offline" });
      }),
    );
    const raw = "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&with_rules=true";
    const params = new URLSearchParams(raw);
    const result = await convertSubRequest(raw, params);
    // New Clash field names are the default (`rules:`, `proxies:`).
    expect(result.body).toContain("rules:");
    expect(result.body).toContain("proxies:");
    expect(result.body).toContain("GEOIP,CN");
  });

  it("infers the JMS provider from the userinfo URL when no provider is passed", async () => {
    stubFetch((url) => {
      if (url.includes("getbwcounter")) {
        return new Response(
          JSON.stringify({
            bw_counter_b: 10,
            bw_reset_day_of_month: 1,
            monthly_bw_limit_b: 500000000000,
          }),
          { status: 200 },
        );
      }
      return new Response(SUB_BODY, {
        headers: { "subscription-userinfo": "upload=0; download=1; total=2; expire=3" },
        status: 200,
      });
    });
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fsub" +
      "&userinfo_url=https%3A%2F%2Fjustmysocks6.net%2Fmembers%2Fgetbwcounter.php%3Fservice%3D1";
    const params = new URLSearchParams(raw);
    const result = await convertSubRequest(raw, params);
    expect(result.userinfo).toContain("download=11; total=536870912000");
  });

  it("skips userinfo conversion for unknown URLs without a provider", async () => {
    stubFetch((url) => {
      if (url.includes("quota")) {
        throw new Error("userinfo endpoint must not be fetched without a provider");
      }
      return new Response(SUB_BODY, {
        headers: { "subscription-userinfo": "upload=0; download=1; total=2; expire=3" },
        status: 200,
      });
    });
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fsub" +
      "&userinfo_url=https%3A%2F%2Fexample.com%2Fquota";
    const params = new URLSearchParams(raw);
    const result = await convertSubRequest(raw, params);
    expect(result.userinfo).toBe("upload=0; download=1; total=2; expire=3");
  });

  it("surfaces userinfo fetch/convert failures as 502", async () => {
    stubFetch((url) => {
      if (url.includes("getbwcounter")) {
        return new Response("boom", { status: 500, statusText: "quota down" });
      }
      return new Response(SUB_BODY, { status: 200 });
    });
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fsub" +
      "&userinfo_url=https%3A%2F%2Fjustmysocks6.net%2Fmembers%2Fgetbwcounter.php%3Fservice%3D1";
    const params = new URLSearchParams(raw);
    const error = await convertSubRequest(raw, params).catch(
      (err: unknown) => err as { statusCode?: number; message?: string },
    );
    expect((error as { statusCode?: number }).statusCode).toBe(502);

    stubFetch((url) => {
      if (url.includes("getbwcounter")) {
        return new Response("not convertible", { status: 200 });
      }
      return new Response(SUB_BODY, { status: 200 });
    });
    const error2 = await convertSubRequest(raw, new URLSearchParams(raw)).catch(
      (err: unknown) => err as { statusCode?: number },
    );
    expect((error2 as { statusCode?: number }).statusCode).toBe(502);
  });

  it("opts back into legacy keys with legacy=true", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw = "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&legacy=true";
    const params = new URLSearchParams(raw);
    const result = await convertSubRequest(raw, params);
    expect(result.body).toContain("Proxy:");
  });

  it("emits bundled rules by default and strips them with no_rules", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const params = new URLSearchParams({ target: "clash", url: "https://example.com/sub" });
    const result = await convertSubRequest(params.toString(), params);
    expect(result.body).toContain("GEOIP,CN");
    const noRulesParams = new URLSearchParams({
      no_rules: "true",
      target: "clash",
      url: "https://example.com/sub",
    });
    const stripped = await convertSubRequest(noRulesParams.toString(), noRulesParams);
    expect(stripped.body).not.toContain("GEOIP,CN");
  });

  it("rejects private/loopback subscription hosts (SSRF guard)", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    for (const blocked of [
      "http://127.0.0.1/sub",
      "http://10.0.0.5/sub",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/sub",
      "http://[::ffff:127.0.0.1]/sub",
      "http://[::ffff:7f00:1]/sub",
      "http://[fd00::1]/sub",
      "http://[ff02::1]/sub",
    ]) {
      const params = new URLSearchParams({ target: "clash", url: blocked });
      await expect(convertSubRequest(params.toString(), params)).rejects.toThrow(
        /Private or loopback|Only http/,
      );
    }
  });

  it("fetches userinfo_url concurrently with subscriptions", async () => {
    const seen: string[] = [];
    let resolveSub!: (response: Response) => void;
    const subGate = new Promise<Response>((resolve) => {
      resolveSub = resolve;
    });
    stubFetch((url) => {
      seen.push(url);
      if (url.includes("quota")) {
        return new Response(JSON.stringify({ download: 5, total: 10, upload: 1 }), {
          status: 200,
        });
      }
      return subGate;
    });
    const quota = "https://example.com/quota";
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fsub" +
      `&userinfo_url=${encodeURIComponent(quota)}&userinfo_provider=subscription`;
    const pending = convertSubRequest(raw, new URLSearchParams(raw));
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The quota endpoint must already be in flight while the subscription
    // response is still gated — not fetched sequentially afterwards.
    expect(seen).toContain(quota);
    resolveSub(new Response(SUB_BODY, { status: 200 }));
    const result = await pending;
    expect(result.userinfo).toBe("upload=1; download=5; total=10; expire=0");
  });

  it("fetches prefixed remote rulesets instead of dropping them", async () => {
    const fetchedUrls: string[] = [];
    stubFetch((url) => {
      fetchedUrls.push(url);
      if (url.includes("r.list")) {
        return new Response("DOMAIN-SUFFIX,prefix-test.example,DIRECT", { status: 200 });
      }
      return new Response(SUB_BODY, { status: 200 });
    });
    const params = new URLSearchParams({ target: "clash", url: "https://example.com/sub" });
    params.append("ruleset", "MyGroup,surge:https://example.com/r.list");
    const result = await convertSubRequest(params.toString(), params);
    expect(fetchedUrls).toContain("https://example.com/r.list");
    expect(result.body).toContain("prefix-test.example");
  });

  it("rejects too many rulesets (outbound amplification guard)", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const params = new URLSearchParams({ target: "clash", url: "https://example.com/sub" });
    for (let index = 0; index < 25; index += 1) {
      params.append("ruleset", `G${String(index)},https://example.com/${String(index)}.list`);
    }
    await expect(convertSubRequest(params.toString(), params)).rejects.toThrow(/Too many rulesets/);
  });

  it("does not apply rename rules twice", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    // `e@ee` is non-idempotent on "Node": once -> "Nodee", twice -> "Nodeee".
    const raw = "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&rename=e%40ee&no_rules=true";
    const params = new URLSearchParams(raw);
    const result = await convertSubRequest(raw, params);
    expect(result.body).toContain("Nodee");
    expect(result.body).not.toContain("Nodeee");
  });
});

describe("startServer", () => {
  it("serves /sub end to end with a JMS quota endpoint", async () => {
    stubFetch((url) => {
      if (url.includes("quota")) {
        return new Response(
          JSON.stringify({
            bw_counter_b: 10,
            bw_reset_day_of_month: 1,
            monthly_bw_limit_b: 100,
          }),
          { status: 200 },
        );
      }
      return new Response(SUB_BODY, { status: 200 });
    });
    const server = await startServer({ host: "127.0.0.1", port: 0 });
    try {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        throw new Error("server did not bind a port");
      }
      const port = address.port;
      const response = await fetch(
        `http://127.0.0.1:${String(port)}/sub?target=clash` +
          `&url=${encodeURIComponent("https://example.com/sub")}` +
          `&userinfo_url=${encodeURIComponent("https://example.com/quota")}` +
          `&userinfo_provider=jms`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("subscription-userinfo")).toContain("download=11");
      const text = await response.text();
      expect(text).toContain("Node");
      const missing = await fetch(`http://127.0.0.1:${String(port)}/sub?target=clash`);
      expect(missing.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      vi.unstubAllGlobals();
    }
  });
});

describe("convertSubRequest auto_country", () => {
  it("prefixes country names from the server GeoIP database", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { buildGeoIpFixture } = await import("./mmdb-fixture");
    const dir = await mkdtemp(join(tmpdir(), "subconverter-server-geoip-"));
    const geoipPath = join(dir, "geo.mmdb");
    await writeFile(geoipPath, buildGeoIpFixture({ "1.2.3.4": "US" }));
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    try {
      const raw =
        "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&auto_country=true&no_rules=true";
      const params = new URLSearchParams(raw);
      const result = await convertSubRequest(raw, params, { geoipPath });
      expect(result.body).toContain("美国-Node");
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it("can be disabled explicitly", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { buildGeoIpFixture } = await import("./mmdb-fixture");
    const dir = await mkdtemp(join(tmpdir(), "subconverter-server-geoip-"));
    const geoipPath = join(dir, "geo.mmdb");
    await writeFile(geoipPath, buildGeoIpFixture({ "1.2.3.4": "US" }));
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    try {
      const raw =
        "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&auto_country=false&no_rules=true";
      const params = new URLSearchParams(raw);
      const result = await convertSubRequest(raw, params, { geoipPath });
      expect(result.body).not.toContain("美国-Node");
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it("rejects auto_country without a configured database", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw = "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&auto_country=true";
    const params = new URLSearchParams(raw);
    await expect(convertSubRequest(raw, params)).rejects.toThrow(/--geoip/);
  });

  it("ignores a geoip query param (database path is CLI-only)", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&auto_country=true&geoip=/etc/passwd";
    const params = new URLSearchParams(raw);
    const error = await convertSubRequest(raw, params).catch((cause: unknown) => cause);
    expect((error as { statusCode?: number }).statusCode).toBe(400);
  });
});
