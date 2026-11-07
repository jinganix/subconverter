import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../src/index";

let dir = "";
let stdout = "";
let stderr = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "subconverter-cli-"));
  stdout = "";
  stderr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function writeSub(content: string): Promise<string> {
  const path = join(dir, "sub.txt");
  await writeFile(path, content, "utf-8");
  return path;
}

describe("cli e2e", () => {
  it("prints usage", async () => {
    expect(await runCli([])).toBe(0);
    expect(stdout).toContain("subconverter-ts");
  });

  it("lists formats", async () => {
    expect(await runCli(["formats"])).toBe(0);
    expect(stdout).toContain("clash");
    expect(stdout).toContain("singbox");
  });

  it("parses a single link", async () => {
    expect(await runCli(["parse", "trojan://pw@1.2.3.4:443#Node"])).toBe(0);
    expect(stdout).toContain("Trojan");
    expect(stdout).toContain("Node");
    expect(await runCli(["parse", "not-a-link"])).toBe(0);
    expect(stdout).toContain("unknown");
  });

  it("does not let a boolean flag swallow a positional argument", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#A");
    for (const flag of ["--classical", "--no-expand", "--classical-ruleset", "--dedupe"]) {
      stdout = "";
      expect(await runCli(["convert", flag, path, "--target", "clash"])).toBe(0);
      expect(stdout).toContain("proxies:");
    }
  });

  it("converts a file to Clash on stdout", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#A\ntrojan://pw@5.6.7.8:443#B");
    expect(await runCli(["convert", "--file", path, "--target", "clash"])).toBe(0);
    expect(stdout).toContain("trojan");
    expect(stdout).toContain("A");
  });

  it("writes output to a file with groups and renames", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#JP-01");
    const out = join(dir, "out.yaml");
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--out",
        out,
        "--group",
        "Auto",
        "--rename",
        "JP@Japan",
        "--append-type",
        "--sort",
      ]),
    ).toBe(0);
    expect(stderr).toContain("Wrote");
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(out, "utf-8")).toContain("[Trojan]");
  });

  it("accepts inline links and node-list output", async () => {
    expect(
      await runCli(["convert", "trojan://pw@1.2.3.4:443#A", "--target", "v2ray", "--node-list"]),
    ).toBe(0);
  });

  it("reports errors for bad input", async () => {
    expect(await runCli(["convert", "--target", "bogus", "--file", "/nope"])).toBe(1);
    expect(stderr).toContain("Unknown target");
    expect(await runCli(["convert"])).toBe(1);
    expect(stderr).toContain("No input");
    expect(await runCli(["bogus"])).toBe(1);
  });

  it("warns when no nodes are found", async () => {
    const path = await writeSub("this is not a subscription");
    expect(await runCli(["convert", "--file", path, "--target", "clash"])).toBe(1);
    expect(stderr).toContain("No proxy nodes");
  });

  it("emits bundled rules by default and strips them with --no-rules", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#A");
    stdout = "";
    expect(await runCli(["convert", "--file", path, "--target", "clash"])).toBe(0);
    expect(stdout).toContain("proxy-groups:");
    expect(stdout).toContain("rules:");
    expect(stdout).toContain("GEOIP,CN");
    stdout = "";
    expect(await runCli(["convert", "--file", path, "--target", "clash", "--no-rules"])).toBe(0);
    expect(stdout).not.toContain("GEOIP,CN");
  });

  it("loads inline rulesets via --ruleset and strips them with --no-rules", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#A");
    stdout = "";
    expect(
      await runCli(["convert", "--file", path, "--target", "clash", "--ruleset", "G,[]GEOIP,CN"]),
    ).toBe(0);
    expect(stdout).toContain("GEOIP,CN");
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--ruleset",
        "G,[]GEOIP,CN",
        "--no-rules",
      ]),
    ).toBe(0);
    expect(stdout).not.toContain("GEOIP,CN");
  });

  it("loads groups and rules from --config", async () => {
    const sub = await writeSub("trojan://pw@1.2.3.4:443#A");
    const configPath = join(dir, "external.ini");
    await writeFile(
      configPath,
      "[custom]\nruleset=G,[]GEOIP,CN\ncustom_proxy_group=MyGroup`select`.*\n",
      "utf-8",
    );
    stdout = "";
    expect(
      await runCli(["convert", "--file", sub, "--target", "clash", "--config", configPath]),
    ).toBe(0);
    expect(stdout).toContain("GEOIP,CN");
    expect(stdout).toContain("MyGroup");
  });

  it("mentions serve usage and rejects invalid ports", async () => {
    stdout = "";
    expect(await runCli([])).toBe(0);
    expect(stdout).toContain("serve");
    expect(await runCli(["serve", "--port", "not-a-port"])).toBe(1);
    expect(stderr).toContain("Invalid port");
    // `parseInt` would accept trailing garbage; port 0 would bind an
    // ephemeral port behind Docker's fixed 25500:25500 mapping.
    expect(await runCli(["serve", "--port", "25500abc"])).toBe(1);
    expect(await runCli(["serve", "--port", "0"])).toBe(1);
  });

  it("splits rename on the last @ like core parseRegexMatch", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#My@Node");
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--no-rules",
        "--rename",
        "My@Node@Renamed",
      ]),
    ).toBe(0);
    expect(stdout).toContain("Renamed");
  });

  it("falls back to surge v5 for invalid --surge-version", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#A");
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "surge",
        "--no-rules",
        "--surge-version",
        "bogus",
      ]),
    ).toBe(0);
    expect(stdout).toContain("A");
  });

  it("accepts space-separated boolean values", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#A");
    stdout = "";
    expect(
      await runCli(["convert", "--file", path, "--target", "clash", "--no-rules", "false"]),
    ).toBe(0);
    expect(stdout).toContain("GEOIP,CN");
  });

  it("accepts new-name and legacy-field-name aliases", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#A");
    stdout = "";
    expect(
      await runCli(["convert", "--file", path, "--target", "clash", "--legacy-field-name"]),
    ).toBe(0);
    expect(stdout).toContain("Proxy:");
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--no-rules",
        "--new-name",
        "false",
      ]),
    ).toBe(0);
    expect(stdout).toContain("Proxy:");
  });
});

describe("cli auto country", () => {
  it("prefixes names lacking a country using a local GeoIP database", async () => {
    const { buildGeoIpFixture } = await import("../../node/tests/mmdb-fixture");
    const geoipPath = join(dir, "geo.mmdb");
    await writeFile(geoipPath, buildGeoIpFixture({ "1.2.3.4": "US", "5.6.7.8": "JP" }));
    const path = await writeSub(
      ["trojan://pw@1.2.3.4:443#server1", "trojan://pw@5.6.7.8:443#JP-02"].join("\n"),
    );
    const code = await runCli([
      "convert",
      "--file",
      path,
      "--target",
      "clash",
      "--no-rules",
      "--auto-country",
      "--geoip",
      geoipPath,
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("US-server1");
    expect(stdout).toContain("JP-02");
    expect(stdout).not.toContain("JP-JP-02");
  });

  it("requires --geoip with --auto-country", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#server1");
    expect(await runCli(["convert", "--file", path, "--target", "clash", "--auto-country"])).toBe(
      1,
    );
    expect(stderr).toContain("--geoip");
  });

  it("reports a missing database", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#server1");
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--auto-country",
        "--geoip",
        join(dir, "missing.mmdb"),
      ]),
    ).toBe(1);
  });

  it("keeps only --include-country nodes and drops --exclude-country nodes", async () => {
    const { buildGeoIpFixture } = await import("../../node/tests/mmdb-fixture");
    const geoipPath = join(dir, "geo.mmdb");
    await writeFile(geoipPath, buildGeoIpFixture({ "1.2.3.4": "US", "5.6.7.8": "NL" }));
    const path = await writeSub(
      ["trojan://pw@1.2.3.4:443#server1", "trojan://pw@5.6.7.8:443#server2"].join("\n"),
    );
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--no-rules",
        "--geoip",
        geoipPath,
        "--auto-country=false",
        "--include-country",
        "US",
      ]),
    ).toBe(0);
    expect(stdout).toContain("server1");
    expect(stdout).not.toContain("server2");
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--no-rules",
        "--geoip",
        geoipPath,
        "--auto-country=false",
        "--exclude-country",
        "nl",
      ]),
    ).toBe(0);
    expect(stdout).toContain("server1");
    expect(stdout).not.toContain("server2");
  });

  it("requires --geoip with country filters", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#server1");
    expect(
      await runCli(["convert", "--file", path, "--target", "clash", "--include-country", "US"]),
    ).toBe(1);
    expect(stderr).toContain("--geoip");
  });
});

describe("cli geoip implies auto country", () => {
  it("prefixes names when only --geoip is given", async () => {
    const { buildGeoIpFixture } = await import("../../node/tests/mmdb-fixture");
    const geoipPath = join(dir, "geo.mmdb");
    await writeFile(geoipPath, buildGeoIpFixture({ "1.2.3.4": "US" }));
    const path = await writeSub("trojan://pw@1.2.3.4:443#server1");
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--node-list",
        "--geoip",
        geoipPath,
      ]),
    ).toBe(0);
    expect(stdout).toContain("US-server1");
  });

  it("lets --auto-country=false disable the implicit enable", async () => {
    const { buildGeoIpFixture } = await import("../../node/tests/mmdb-fixture");
    const geoipPath = join(dir, "geo.mmdb");
    await writeFile(geoipPath, buildGeoIpFixture({ "1.2.3.4": "US" }));
    const path = await writeSub("trojan://pw@1.2.3.4:443#server1");
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--node-list",
        "--geoip",
        geoipPath,
        "--auto-country=false",
      ]),
    ).toBe(0);
    expect(stdout).not.toContain("US-server1");
  });
});

describe("cli name regex and removal", () => {
  it("rewrites names with --name-regex before --rename", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#abc@server1.xxx.yyy");
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--no-rules",
        "--name-regex",
        "^abc@(.+?)\\..*$@$1",
        "--rename",
        "^server@node",
      ]),
    ).toBe(0);
    expect(stdout).toContain("name: node1");
  });

  it("removes literal fragments with --name-remove", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#foo.server1.bar");
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--no-rules",
        "--name-remove",
        "foo,bar",
      ]),
    ).toBe(0);
    expect(stdout).toContain("name: server1");
  });
});

describe("cli argument parsing", () => {
  it("accepts --flag=value and short flags", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#A");
    stdout = "";
    expect(await runCli(["convert", `--target=clash`, "--file", path, "--no-rules"])).toBe(0);
    expect(stdout).toContain("proxies:");
    stdout = "";
    expect(await runCli(["convert", "-t", "surge", "-f", path, "-H", "127.0.0.1"])).toBe(0);
    expect(stdout).toContain("[Proxy]");
  });

  it("accepts an explicit boolean value after a flag", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#B\ntrojan://pw@5.6.7.8:443#A");
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--no-rules",
        "--sort",
        "false",
      ]),
    ).toBe(0);
    expect(stdout.indexOf("name: B")).toBeLessThan(stdout.indexOf("name: A"));
  });

  it("parses emoji and rename rules with and without a delimiter", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#US node");
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--no-rules",
        "--emoji",
        "US@🇺🇸",
        "--add-emoji",
        "--rename",
        "node",
      ]),
    ).toBe(0);
    expect(stdout).toContain("🇺🇸 US ");
    // A rule without `@` matches the whole name and removes it; the empty
    // result is discarded, so the original name is kept.
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--no-rules",
        "--rename",
        "US node",
      ]),
    ).toBe(0);
    expect(stdout).toContain("name: US node");
  });

  it("trims --name-remove lists and merges a local --base", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#foo.server1.bar");
    const base = join(dir, "base.conf");
    await writeFile(base, "[General]\nloglevel = warning\n", "utf-8");
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "surge",
        "--no-rules",
        "--name-remove",
        " foo , bar ",
        "--base",
        base,
      ]),
    ).toBe(0);
    expect(stdout).toContain("[General]");
    expect(stdout).toContain("server1 =");
  });

  it("reports missing links and honours --with-rules=false", async () => {
    expect(await runCli(["parse"])).toBe(1);
    expect(stderr).toContain("No links");
    const path = await writeSub("trojan://pw@1.2.3.4:443#A");
    stdout = "";
    expect(
      await runCli(["convert", "--file", path, "--target", "clash", "--with-rules=false"]),
    ).toBe(0);
    expect(stdout).not.toContain("rules:");
  });

  it("fails when the GeoIP database cannot be loaded", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#A");
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--geoip",
        join(dir, "missing.mmdb"),
      ]),
    ).toBe(1);
    expect(stderr).toContain("Failed to load GeoIP");
  });
});

describe("cli external config coverage", () => {
  it("merges every [custom] key and template variables", async () => {
    const sub = await writeSub(
      "trojan://pw@1.2.3.4:443#US-server1\ntrojan://pw@5.6.7.8:443#NL-server2",
    );
    const configPath = join(dir, "external.ini");
    await writeFile(
      configPath,
      [
        "[custom]",
        "include_remarks=server1",
        "exclude_remarks=never",
        "add_emoji=false",
        "remove_emoji=false",
        "auto_country=false",
        "enable_rule_generator=false",
        "overwrite_original_rules=false",
        "name_remove=.com",
        "[template]",
        "clash.dns.port=7874",
        "",
      ].join("\n"),
      "utf-8",
    );
    const base = join(dir, "base.yaml");
    await writeFile(base, "dns:\n  port: {{ clash.dns.port }}\n", "utf-8");
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--file",
        sub,
        "--target",
        "clash",
        "--config",
        configPath,
        "--base",
        base,
      ]),
    ).toBe(0);
    expect(stdout).toContain("port: 7874");
    expect(stdout).toContain("US-server1");
    expect(stdout).not.toContain("NL-server2");
    expect(stdout).not.toContain("rules:");
  });

  it("reads the subscription body from stdin with -", async () => {
    const { Readable } = await import("node:stream");
    const stdin = Object.getOwnPropertyDescriptor(process, "stdin");
    Object.defineProperty(process, "stdin", {
      configurable: true,
      value: Readable.from([Buffer.from("trojan://pw@1.2.3.4:443#A\n")]),
    });
    try {
      stdout = "";
      expect(await runCli(["convert", "-", "--target", "clash", "--no-rules"])).toBe(0);
      expect(stdout).toContain("name: A");
    } finally {
      if (stdin) {
        Object.defineProperty(process, "stdin", stdin);
      }
    }
  });

  it("fails when filtering removes every node", async () => {
    const { buildGeoIpFixture } = await import("../../node/tests/mmdb-fixture");
    const geoipPath = join(dir, "geo.mmdb");
    await writeFile(geoipPath, buildGeoIpFixture({ "1.2.3.4": "US" }));
    const path = await writeSub("trojan://pw@1.2.3.4:443#server1");
    expect(
      await runCli([
        "convert",
        "--file",
        path,
        "--target",
        "clash",
        "--geoip",
        geoipPath,
        "--include-country",
        "JP",
      ]),
    ).toBe(1);
    expect(stderr).toContain("No proxy nodes left");
  });
});

describe("cli remote sources and flag variants", () => {
  it("fetches --url, remote --config, remote --base and repeatable flags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("config")) {
          return new Response("[custom]\nruleset=G,[]GEOIP,CN\n", { status: 200 });
        }
        if (url.includes("base")) {
          return new Response("[General]\nloglevel = warning\n", { status: 200 });
        }
        return new Response("trojan://pw@1.2.3.4:443#Node", { status: 200 });
      }),
    );
    stdout = "";
    expect(
      await runCli([
        "convert",
        "--url",
        "https://example.com/sub",
        "-u",
        "https://example.com/sub2",
        "-t",
        "surge",
        "-o",
        join(dir, "out.conf"),
        "-g",
        "Auto",
        "-e",
        "Node@🌟",
        "-r",
        "Node@Renamed",
        "--config",
        "https://example.com/config",
        "--base",
        "https://example.com/base",
        "--dev-id",
        "dev",
        "--no-expand",
        "--classical",
        "--filter-deprecated",
        "--surge-version",
        "4",
      ]),
    ).toBe(0);
    const { readFile } = await import("node:fs/promises");
    const written = await readFile(join(dir, "out.conf"), "utf-8");
    expect(written).toContain("[General]");
    expect(written).toContain("Renamed");
    expect(stderr).toContain("Wrote 2 nodes");
    vi.unstubAllGlobals();
  });

  it("switches Clash field names with --legacy and --new-field-name=false", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#A");
    for (const flags of [["--legacy"], ["--new-field-name=false"], ["--legacy-field-name"]]) {
      stdout = "";
      expect(await runCli(["convert", "--file", path, "--target", "clash", ...flags])).toBe(0);
      expect(stdout).toContain("Proxy:");
      expect(stdout).not.toContain("proxy-groups:");
    }
  });

  it("uses the new field names by default and with --new-field-name", async () => {
    const path = await writeSub("trojan://pw@1.2.3.4:443#A");
    stdout = "";
    expect(await runCli(["convert", "--file", path, "--target", "clash", "--new-field-name"])).toBe(
      0,
    );
    expect(stdout).toContain("proxies:");
  });
});
