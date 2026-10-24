import {
  type ExtraSettings,
  type ProxyGroupConfig,
  type RulesetConfig,
  type RulesetContent,
  ProxyType,
  TargetFormat,
  createSelectGroup,
  generate,
  parseExternalConfig,
  parseLink,
  parseRulesetConfig,
  parseSubscription,
  proxyTypeName,
  resolveNewFieldName,
} from "@subconverter/core";
import {
  buildCountryResolver,
  collectRulesets,
  fetchSubscription,
  startServer,
  writeOutputFile,
} from "@subconverter/node";
import { readFile } from "node:fs/promises";

const TARGET_VALUES = new Set(Object.values(TargetFormat));

/** Parse `--emoji match@replace` style rules. */
function parseEmojiRules(values: string[]): ExtraSettings["emojiArray"] {
  return values.map((value) => {
    const at = value.lastIndexOf("@");
    if (at === -1) {
      return { match: value, replace: "", script: "" };
    }
    return { match: value.slice(0, at), replace: value.slice(at + 1), script: "" };
  });
}

function parseRenameRules(values: string[]): ExtraSettings["renameArray"] {
  return values.map((value) => {
    const at = value.lastIndexOf("@");
    if (at === -1) {
      return { match: value, replace: "", script: "" };
    }
    return { match: value.slice(0, at), replace: value.slice(at + 1), script: "" };
  });
}

function parseNameRemove(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

interface ArgState {
  flags: Map<string, string[]>;
  positionals: string[];
}

const BOOLEAN_FLAGS = new Set([
  "add-emoji",
  "auto-country",
  "remove-emoji",
  "append-type",
  "node-list",
  "sort",
  "filter-deprecated",
  "new-field-name",
  "new-name",
  "legacy",
  "legacy-field-name",
  "classical-ruleset",
  "dedupe",
  "with-rules",
  "no-rules",
  "version",
  "help",
]);

function isBoolLiteral(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "true" ||
    normalized === "false" ||
    normalized === "1" ||
    normalized === "0" ||
    normalized === ""
  );
}

function parseArgs(argv: string[]): ArgState {
  const flags = new Map<string, string[]>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (eq !== -1) {
        pushFlag(flags, name, arg.slice(eq + 1));
      } else if (BOOLEAN_FLAGS.has(name) && name !== "version") {
        // Accept both `--flag` (true) and `--flag false` / `--flag 0`.
        const next = argv[i + 1];
        if (next !== undefined && isBoolLiteral(next) && !next.startsWith("--")) {
          pushFlag(flags, name, next);
          i += 1;
        } else {
          pushFlag(flags, name, "true");
        }
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
          pushFlag(flags, name, "true");
        } else {
          pushFlag(flags, name, next);
          i += 1;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const short = arg.slice(1);
      const map: Record<string, string> = {
        e: "emoji",
        f: "file",
        g: "group",
        H: "host",
        h: "help",
        o: "out",
        p: "port",
        r: "rename",
        t: "target",
        u: "url",
      };
      const name = map[short] ?? short;
      if (BOOLEAN_FLAGS.has(name)) {
        pushFlag(flags, name, "true");
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          pushFlag(flags, name, next);
          i += 1;
        } else {
          pushFlag(flags, name, "true");
        }
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

function pushFlag(flags: Map<string, string[]>, name: string, value: string): void {
  const existing = flags.get(name);
  if (existing) {
    existing.push(value);
  } else {
    flags.set(name, [value]);
  }
}

function flag(state: ArgState, name: string): string | undefined {
  // Last occurrence wins, mirroring core `getUrlArg`.
  const values = state.flags.get(name);
  return values?.[values.length - 1];
}

function flagBool(state: ArgState, name: string): boolean {
  // Any `true`/`1`/bare occurrence wins, mirroring server `queryBoolFlag`
  // OR semantics (e.g. `--with-rules=false --with-rules` is on).
  const values = state.flags.get(name);
  if (!values) {
    return false;
  }
  return values.some((raw) => {
    const normalized = raw.trim().toLowerCase();
    // Mirror core `boolArg`: bare flags arrive as `"true"`, and `=1` counts.
    return normalized === "true" || normalized === "1" || normalized === "";
  });
}

function flagAll(state: ArgState, name: string): string[] {
  return state.flags.get(name) ?? [];
}

/**
 * Resolve the Clash field-name style by delegating to core
 * `resolveNewFieldName` so CLI and server share one source of truth.
 * Defaults to the new `proxies` / `proxy-groups` keys; `--legacy` or
 * `--new-field-name=false` opts back into the legacy keys.
 */
function resolveClashNewFieldName(state: ArgState): boolean {
  const parts: string[] = [];
  for (const [name, values] of state.flags) {
    const normalized = name.toLowerCase().replace(/_/g, "-");
    if (normalized === "legacy" || normalized === "legacy-field-name") {
      for (const value of values) {
        parts.push(`legacy=${encodeURIComponent(value)}`);
      }
    }
    if (normalized === "new-field-name" || normalized === "new-name") {
      for (const value of values) {
        parts.push(`new_field_name=${encodeURIComponent(value)}`);
      }
    }
  }
  return resolveNewFieldName(parts.join("&"));
}

const USAGE = `subconverter-ts

Usage:
  subconverter convert [options] [<url-or-file> ...]
  subconverter serve [--port 25500] [--host 0.0.0.0]
  subconverter parse <proxy-link ...>
  subconverter formats

Convert options:
  -u, --url <url>       Subscription URL (repeatable)
  -f, --file <path>     Local subscription/config file (repeatable)
  -t, --target <fmt>    Output format (${[...TARGET_VALUES].join(", ")})
  -o, --out <path>      Write output to a file (default: stdout)
  -g, --group <name>    Add a select group containing all nodes
  -r, --rename <m@r>    Rename rule: match-regex@replacement
      --name-regex <m@r>    Regex replace applied to names before rename rules (repeatable; $1 backrefs)
      --name-remove <list>  Comma-separated literal fragments removed from names (repeatable)
  -e, --emoji <m@r>     Emoji rule: match-regex@emoji
      --add-emoji       Prepend emoji using the emoji rules
      --remove-emoji    Strip leading emoji from names
      --auto-country    Prefix names lacking a country with the server's country
      --geoip <mmdb>    GeoLite2/GeoIP2 database (required by --auto-country)
      --country-locale <l>  Locale for country names (default zh-CN)
      --append-type     Prefix node names with their proxy type
      --node-list       Emit a bare node list (no groups/wrapper)
      --sort            Sort nodes by name
      --new-field-name  Use Clash's new field names (proxies/proxy-groups, default true; use --new-field-name=false for legacy Proxy keys)
      --legacy          Use legacy Clash field names (Proxy/Proxy Group/Rule)
      --dedupe          Drop duplicate nodes (same type/server/port/name)
      --surge-version <n> Surge version for the surge target (default 5)
      --with-rules      Attach rules + default proxy groups (default: on, kept for compat)
      --no-rules        Strip rules and default groups (default: off)
      --ruleset <g,u>   Ruleset: group,url[,interval] or group,[]RULE (repeatable)
      --config <p|url>  External INI config with [custom] ruleset/groups (like upstream config=)
      --base <path>     Base config file merged under generated proxies/groups/rules

Serve options:
  -p, --port <n>      HTTP port for serve (default 25500, env PORT)
  -H, --host <addr>   Bind address for serve (default 0.0.0.0, env HOST)
      --geoip <mmdb>    GeoLite2/GeoIP2 database enabling auto_country
                      Example: /sub?target=clash&url=<sub-url>
                               &userinfo_url=<quota-url>&userinfo_provider=jms
  -h, --help            Show this help
`;

/** Entry point for the CLI. Returns a process exit code. */
export async function runCli(argv: string[]): Promise<number> {
  const command = argv[0];
  const state = parseArgs(argv.slice(1));

  if (command === undefined || command === "help" || flagBool(state, "help")) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (command === "formats") {
    process.stdout.write(`${[...TARGET_VALUES].join("\n")}\n`);
    return 0;
  }

  if (command === "parse") {
    return runParse(state);
  }

  if (command === "convert") {
    return runConvert(state);
  }

  if (command === "serve") {
    return runServe(state);
  }

  process.stderr.write(`Unknown command: ${command}\n${USAGE}`);
  return 1;
}

async function runServe(state: ArgState): Promise<number> {
  const portRaw = flag(state, "port") ?? process.env["PORT"] ?? "25500";
  const host = flag(state, "host") ?? process.env["HOST"] ?? "0.0.0.0";
  // Strict digits-only parse: `parseInt` would accept `25500abc`, and port
  // `0` would listen on an unpredictable ephemeral port behind Docker's
  // fixed `25500:25500` mapping.
  const port = /^\d+$/.test(portRaw.trim()) ? Number.parseInt(portRaw, 10) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write(`Invalid port: ${portRaw}\n`);
    return 1;
  }
  try {
    const geoipPath = flag(state, "geoip");
    const server = await startServer({
      geoipPath: geoipPath && geoipPath !== "true" ? geoipPath : undefined,
      host,
      port,
    });
    const shutdown = (): void => {
      server.close(() => {
        process.exit(0);
      });
      setTimeout(() => {
        process.exit(0);
      }, 1000).unref();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    // Keep serving until the process is stopped; the open socket holds the
    // event loop alive so this never resolves under normal operation.
    return new Promise<never>(() => {});
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function runParse(state: ArgState): number {
  const links = state.positionals;
  if (links.length === 0) {
    process.stderr.write("No links provided.\n");
    return 1;
  }
  for (const link of links) {
    const node = parseLink(link);
    if (!node) {
      process.stdout.write(`unknown\t${link}\n`);
      continue;
    }
    process.stdout.write(
      `${proxyTypeName(node.type)}\t${node.hostname}:${node.port}\t${node.remark}\n`,
    );
  }
  return 0;
}

async function runConvert(state: ArgState): Promise<number> {
  const targetValue = flag(state, "target") ?? "clash";
  if (!TARGET_VALUES.has(targetValue as TargetFormat)) {
    process.stderr.write(`Unknown target format: ${targetValue}\n`);
    return 1;
  }
  const target = targetValue as TargetFormat;

  const sources: string[] = [...flagAll(state, "url"), ...flagAll(state, "file")];
  sources.push(...state.positionals);
  if (sources.length === 0) {
    process.stderr.write("No input provided. Use --url, --file, or a positional path.\n");
    return 1;
  }

  let text = "";
  for (const source of sources) {
    if (/^https?:\/\//i.test(source)) {
      text += `\n${await fetchSubscription(source)}`;
    } else if (source === "-") {
      text += `\n${await readStdin()}`;
    } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source)) {
      // A proxy share link (e.g. ss://, vmess://, trojan://).
      text += `\n${source}`;
    } else {
      text += `\n${await readFile(source, "utf-8")}`;
    }
  }

  const nodes = parseSubscription(text);
  if (nodes.length === 0) {
    process.stderr.write("No proxy nodes found in the input.\n");
    return 1;
  }

  const groups: ProxyGroupConfig[] = flagAll(state, "group").map((name) => createSelectGroup(name));

  const settings: Partial<ExtraSettings> = {
    addEmoji: flagBool(state, "add-emoji"),
    appendProxyType: flagBool(state, "append-type"),
    // Supplying `--geoip` turns the country prefix on; `--auto-country=false`
    // still wins when it is passed explicitly.
    autoCountry: state.flags.has("auto-country")
      ? flagBool(state, "auto-country")
      : flag(state, "geoip") !== undefined,
    clashNewFieldName: resolveClashNewFieldName(state),
    countryLocale: flag(state, "country-locale") ?? "zh-CN",
    dedupe: flagBool(state, "dedupe"),
    emojiArray: parseEmojiRules(flagAll(state, "emoji")),
    filterDeprecated: flagBool(state, "filter-deprecated"),
    nameRegexArray: parseRenameRules([
      ...flagAll(state, "name-regex"),
      ...flagAll(state, "name_regex"),
    ]),
    nameRemove: parseNameRemove([
      ...flagAll(state, "name-remove"),
      ...flagAll(state, "name_remove"),
    ]),
    nodeList: flagBool(state, "node-list"),
    removeEmoji: flagBool(state, "remove-emoji"),
    renameArray: parseRenameRules(flagAll(state, "rename")),
    sortFlag: flagBool(state, "sort"),
  };

  // Rule handling (mirrors upstream `config=` + `ruleset=`).
  const rulesetConfigs: RulesetConfig[] = [];
  for (const raw of flagAll(state, "ruleset")) {
    const parsed = parseRulesetConfig(raw);
    if (parsed) {
      rulesetConfigs.push(parsed);
    }
  }
  const configSource = flag(state, "config");
  if (configSource) {
    const raw =
      /^https?:\/\//i.test(configSource) || configSource === "-"
        ? configSource === "-"
          ? await readStdin()
          : await fetchSubscription(configSource)
        : await readFile(configSource, "utf-8");
    const external = parseExternalConfig(raw);
    groups.push(...external.groups);
    rulesetConfigs.push(...external.rulesets);
    if (external.rename.length > 0) {
      settings.renameArray = [...(settings.renameArray ?? []), ...external.rename];
    }
    if (external.emoji.length > 0) {
      settings.emojiArray = [...(settings.emojiArray ?? []), ...external.emoji];
    }
    if (external.nameRegex.length > 0) {
      settings.nameRegexArray = [...(settings.nameRegexArray ?? []), ...external.nameRegex];
    }
    if (external.nameRemove.length > 0) {
      settings.nameRemove = [...(settings.nameRemove ?? []), ...external.nameRemove];
    }
    settings.enableRuleGenerator = external.enableRuleGenerator;
    settings.overwriteOriginalRules = external.overwriteOriginalRules;
    if (external.addEmoji) {
      settings.addEmoji = true;
    }
    if (external.autoCountry) {
      settings.autoCountry = true;
    }
    if (external.removeEmoji) {
      settings.removeEmoji = true;
    }
  }
  let rulesets: RulesetContent[] | undefined;
  if (rulesetConfigs.length > 0) {
    rulesets = await collectRulesets(rulesetConfigs);
  }

  let baseConf = "";
  const basePath = flag(state, "base");
  if (basePath) {
    baseConf = /^https?:\/\//i.test(basePath)
      ? await fetchSubscription(basePath)
      : await readFile(basePath, "utf-8");
  }

  // Rules are on by default (bundled upstream-like defaults, offline);
  // `--no-rules` strips everything and wins over `--with-rules` (compat).
  // NOTE: default-on is a breaking change vs pre-serve releases; use
  // `--no-rules` to restore the old bare output.
  const wantRules = state.flags.has("with-rules") ? flagBool(state, "with-rules") : true;
  let includeRules: boolean | undefined;
  if (flagBool(state, "no-rules")) {
    includeRules = false;
  } else {
    includeRules = wantRules;
  }

  const surgeRaw = flag(state, "surge-version") ?? "5";
  const surgeVersion = Number.parseInt(surgeRaw.trim(), 10) || 5;

  if (settings.autoCountry) {
    const geoipPath = flag(state, "geoip");
    if (geoipPath === undefined || geoipPath === "" || geoipPath === "true") {
      process.stderr.write("--auto-country requires --geoip <path to GeoLite2/GeoIP2 .mmdb>.\n");
      return 1;
    }
    try {
      settings.countryResolver = await buildCountryResolver(nodes, geoipPath);
    } catch (error) {
      process.stderr.write(
        `Failed to load GeoIP database ${geoipPath}: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
      return 1;
    }
  }

  const output = generate(nodes, {
    baseConf,
    groups,
    includeRules,
    rulesets,
    settings,
    surgeVersion,
    target,
  });

  const outPath = flag(state, "out");
  if (outPath) {
    await writeOutputFile(outPath, output);
    process.stderr.write(`Wrote ${nodes.length} nodes to ${outPath}\n`);
  } else {
    process.stdout.write(output);
  }
  return 0;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/** `true` when `node.type` names a known proxy type (helper for consumers). */
export function isKnownType(type: string): boolean {
  return Object.values(ProxyType).includes(type as ProxyType);
}
