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
