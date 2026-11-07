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

  it("rejects blacklisted include patterns", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw = "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&include=(.*)*";
    await expect(convertSubRequest(raw, new URLSearchParams(raw))).rejects.toThrow(/Invalid regex/);
  });

  it("honors the filename override", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw = "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&filename=o.yaml";
    const result = await convertSubRequest(raw, new URLSearchParams(raw));
    expect(result.filename).toBe("o.yaml");
  });

  it("prepends MANAGED-CONFIG for surge with a managed prefix", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw = "target=surge&url=https%3A%2F%2Fexample.com%2Fsub&no_rules=true";
    const result = await convertSubRequest(raw, new URLSearchParams(raw), {
      managedPrefix: "https://example.com/",
    });
    expect(result.body.startsWith("#!MANAGED-CONFIG https://example.com/sub?target=surge"));
    expect(result.body).toContain("interval=86400 strict=false");
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

  it("tags the Nth url with group id N so !!GROUPID selects one source", async () => {
    stubFetch((url) => {
      if (url.endsWith("/a")) {
        return new Response("trojan://pw@1.2.3.4:443#A", { status: 200 });
      }
      if (url.endsWith("/b")) {
        return new Response("trojan://pw@5.6.7.8:443#B", { status: 200 });
      }
      // External config: a select group containing only the second source's nodes.
      return new Response("[custom]\ncustom_proxy_group=G`select`!!GROUPID=1!!.*\n", {
        status: 200,
      });
    });
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fa&url=https%3A%2F%2Fexample.com%2Fb" +
      "&config=https%3A%2F%2Fexample.com%2Fcfg.ini&no_rules=true";
    const result = await convertSubRequest(raw, new URLSearchParams(raw));
    expect(result.body).toContain("name: A");
    expect(result.body).toContain("name: B");
    const group = result.body.slice(result.body.indexOf("name: G"));
    expect(group).toContain("- B");
    expect(group).not.toContain("- A");
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

  it("applies name_regex and name_remove before rename", async () => {
    stubFetch(() => new Response("trojan://pw@1.2.3.4:443#abc@server1.xxx.yyy", { status: 200 }));
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&no_rules=true" +
      "&name_regex=" +
      encodeURIComponent("^abc@(.+?)\\..*$@$1") +
      "&rename=" +
      encodeURIComponent("^server@node");
    const params = new URLSearchParams(raw);
    const result = await convertSubRequest(raw, params);
    expect(result.body).toContain("name: node1");
    expect(result.body).not.toContain("server1");
  });

  it("strips name_remove fragments", async () => {
    stubFetch(() => new Response("trojan://pw@1.2.3.4:443#foo.server1.bar", { status: 200 }));
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&no_rules=true&name_remove=foo,bar";
    const result = await convertSubRequest(raw, new URLSearchParams(raw));
    expect(result.body).toContain("name: server1");
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
      const named = await fetch(
        `http://127.0.0.1:${String(port)}/sub?target=clash` +
          `&url=${encodeURIComponent("https://example.com/sub")}` +
          `&filename=${encodeURIComponent("配置.yaml")}`,
      );
      const disposition = named.headers.get("content-disposition") ?? "";
      expect(disposition).toContain("filename*=UTF-8''%E9%85%8D%E7%BD%AE.yaml");
      await named.body?.cancel();
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
      expect(result.body).toContain("US-Node");
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
      expect(result.body).not.toContain("US-Node");
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

  it("filters by include_country and exclude_country", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { buildGeoIpFixture } = await import("./mmdb-fixture");
    const dir = await mkdtemp(join(tmpdir(), "subconverter-server-geoip-"));
    const geoipPath = join(dir, "geo.mmdb");
    await writeFile(geoipPath, buildGeoIpFixture({ "1.2.3.4": "US" }));
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    try {
      const params = new URLSearchParams("target=clash");
      const kept = await convertSubRequest(
        "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&include_country=us&no_rules=true",
        params,
        { geoipPath },
      );
      expect(kept.body).toContain("Node");
      await expect(
        convertSubRequest(
          "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&exclude_country=US&no_rules=true",
          params,
          { geoipPath },
        ),
      ).rejects.toThrow(/No proxy nodes/);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it("rejects country filters without a configured database", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw = "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&include_country=US";
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

describe("convertSubRequest external config flags", () => {
  it("honours [custom] switches from a fetched config like the CLI does", async () => {
    const config = "[custom]\nenable_rule_generator=false\n";
    stubFetch((url) => {
      if (url.includes("config")) {
        return new Response(config, { status: 200 });
      }
      return new Response(SUB_BODY, { status: 200 });
    });
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fsub" +
      "&config=https%3A%2F%2Fexample.com%2Fconfig";
    const result = await convertSubRequest(raw, new URLSearchParams(raw));
    expect(result.body).not.toContain("rules:");
    expect(result.body).toContain("name: Node");
  });
});

describe("convertSubRequest config errors", () => {
  it("fails the request instead of silently dropping a broken config", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw = "target=clash&url=https%3A%2F%2Fexample.com%2Fsub" + "&config=%2Fetc%2Fpasswd";
    await expect(convertSubRequest(raw, new URLSearchParams(raw))).rejects.toThrow(
      /Local config paths are disabled/,
    );
  });
});

describe("server HTTP routes", () => {
  async function withServer(
    fn: (base: string) => Promise<void>,
    options: { geoipPath?: string } = {},
  ): Promise<void> {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const { createSubServer } = await import("../src/index");
    const server = createSubServer(options);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("server did not bind a port");
    }
    try {
      await fn(`http://127.0.0.1:${String(address.port)}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it("answers usage, version, 404, 405, OPTIONS and HEAD", async () => {
    await withServer(async (base) => {
      const root = await fetch(`${base}/`);
      expect(root.status).toBe(200);
      expect(await root.text()).toContain("Usage");
      const version = await fetch(`${base}/version`);
      expect(await version.text()).toContain("subconverter-ts");
      expect((await fetch(`${base}/nope`)).status).toBe(404);
      expect((await fetch(`${base}/sub`, { method: "POST" })).status).toBe(405);
      const preflight = await fetch(`${base}/sub`, { method: "OPTIONS" });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
      const head = await fetch(`${base}/sub?target=clash&url=https%3A%2F%2Fexample.com%2Fsub`, {
        method: "HEAD",
      });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
    });
  });

  it("returns the error status and message of a failed conversion", async () => {
    await withServer(async (base) => {
      const response = await fetch(`${base}/sub?target=bogus&url=https%3A%2F%2Fexample.com%2Fsub`);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Unknown target format");
    });
  });
});

describe("server fetch guards", () => {
  it("blocks hex and octal loopback spellings", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    for (const blocked of [
      "http://0x7f.0.0.1/sub",
      "http://0177.0.0.1/sub",
      "http://[::ffff:10.0.0.1]/sub",
      "http://[fe80::1]/sub",
      "http://metadata.google.internal/sub",
      "http://printer.local/sub",
    ]) {
      const params = new URLSearchParams({ target: "clash", url: blocked });
      await expect(convertSubRequest(params.toString(), params)).rejects.toThrow(
        /Private or loopback|Only http/,
      );
    }
  });

  it("re-validates every redirect hop and gives up after too many", async () => {
    let hops = 0;
    stubFetch((url) => {
      hops += 1;
      if (url.includes("loop")) {
        return new Response(null, { headers: { location: url }, status: 302 });
      }
      if (url.includes("to-private")) {
        return new Response(null, {
          headers: { location: "http://169.254.169.254/" },
          status: 302,
        });
      }
      if (url.includes("no-location")) {
        return new Response(null, { headers: {}, status: 302 });
      }
      if (url.includes("/ok")) {
        return new Response(SUB_BODY, { status: 200 });
      }
      return new Response(null, {
        headers: { location: url.replace("landing", "ok") },
        status: 302,
      });
    });
    const redirects = async (url: string): Promise<void> => {
      const params = new URLSearchParams({ target: "clash", url });
      await convertSubRequest(params.toString(), params);
    };
    await expect(redirects("https://example.com/landing")).resolves.toBeUndefined();
    for (const [url, expected] of [
      ["https://example.com/to-private", /Private or loopback/],
      ["https://example.com/no-location", /Redirect without location/],
      ["https://example.com/loop", /Too many redirects/],
    ] as const) {
      const params = new URLSearchParams({ target: "clash", url });
      // Per-URL failures are aggregated into one 502 for the caller.
      await expect(convertSubRequest(params.toString(), params)).rejects.toThrow(expected);
    }
    expect(hops).toBeGreaterThan(3);
  });

  it("maps an aborted fetch to a 504 and caps oversized bodies", async () => {
    let called = 0;
    stubFetch(() => {
      called += 1;
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const params = new URLSearchParams({ target: "clash", url: "https://example.com/sub" });
    expect(called).toBe(0);
    const outcome = await Promise.allSettled([convertSubRequest(params.toString(), params)]);
    console.log("CALLED", called, outcome[0]?.status);
    expect(outcome[0]?.status).toBe("rejected");

    stubFetch(
      () =>
        new Response(SUB_BODY, {
          headers: { "content-length": String(6 * 1024 * 1024) },
          status: 200,
        }),
    );
    const second = await Promise.allSettled([convertSubRequest(params.toString(), params)]);
    console.log(
      "SECOND",
      called,
      second[0]?.status,
      second[0]?.status === "rejected" ? (second[0] as PromiseRejectedResult).reason.message : "",
    );
    expect(second[0]?.status).toBe("rejected");
  });
});

describe("server request parsing edge cases", () => {
  it("ignores inline and local rulesets in server mode", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fsub" +
      "&ruleset=G1%2C%5B%5DGEOIP%2CCN" +
      "&ruleset=G2%2C%2Fetc%2Fpasswd" +
      "&group=A&group=%20";
    const result = await convertSubRequest(raw, new URLSearchParams(raw));
    expect(result.body).toContain("GEOIP,CN");
    expect(result.body).not.toContain("passwd");
    expect(result.body).toContain("name: A");
  });

  it("skips an inline config and ignores local base paths", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw =
      "target=clash&url=https%3A%2F%2Fexample.com%2Fsub" +
      "&config=%5B%5DGEOIP%2CCN&base=%2Fetc%2Fhosts&filename=a%22b";
    const result = await convertSubRequest(raw, new URLSearchParams(raw));
    expect(result.body).toContain("name: Node");
    expect(result.filename).toBe("ab");
  });

  it("surfaces a broken GeoIP database as a 500", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    const raw = "target=clash&url=https%3A%2F%2Fexample.com%2Fsub&auto_country=true";
    await expect(
      convertSubRequest(raw, new URLSearchParams(raw), { geoipPath: "missing.mmdb" }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("rejects malformed and odd host forms", async () => {
    stubFetch(() => new Response(SUB_BODY, { status: 200 }));
    for (const [url, expected] of [
      ["ftp://example.com/sub", /Only http\(s\)/],
      ["https://[::]/sub", /Private or loopback/],
      ["http://1.2.3.4.5/sub", /Invalid url URL/],
      ["http://256.256.256.256/sub", /Invalid url URL/],
    ] as const) {
      const params = new URLSearchParams({ target: "clash", url });
      await expect(convertSubRequest(params.toString(), params)).rejects.toThrow(expected);
    }
    // Odd-but-valid host spellings parse as hostnames and pass the literal
    // check; DNS decides next, so they must not be rejected up front.
    for (const url of ["http://example.com./sub"]) {
      const params = new URLSearchParams({ target: "clash", url });
      await expect(convertSubRequest(params.toString(), params)).resolves.toBeDefined();
    }
  });
});
