import {
  type ExtraSettings,
  type ProxyGroupConfig,
  type RulesetConfig,
  type RulesetContent,
  BalanceStrategy,
  ProxyGroupType,
  ProxyType,
  TargetFormat,
  generate,
  parseExternalConfig,
  parseLink,
  parseRulesetConfig,
  parseSubscription,
  proxyTypeName,
} from "@subconverter/core";
import { collectRulesets, fetchSubscription, writeOutputFile } from "@subconverter/node";
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
    const [match = "", replace = ""] = value.split("@");
    return { match, replace, script: "" };
  });
}

interface ArgState {
  flags: Map<string, string[]>;
  positionals: string[];
}

const BOOLEAN_FLAGS = new Set([
  "add-emoji",
  "remove-emoji",
  "append-type",
  "node-list",
  "sort",
  "filter-deprecated",
  "new-field-name",
  "classical-ruleset",
  "dedupe",
  "with-rules",
  "no-rules",
  "version",
  "help",
]);

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
        pushFlag(flags, name, "true");
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
        h: "help",
        o: "out",
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
  return state.flags.get(name)?.[0];
}

function flagBool(state: ArgState, name: string): boolean {
  return state.flags.get(name)?.[0] === "true";
}

function flagAll(state: ArgState, name: string): string[] {
  return state.flags.get(name) ?? [];
}

const USAGE = `subconverter-ts

Usage:
  subconverter convert [options] [<url-or-file> ...]
  subconverter parse <proxy-link ...>
  subconverter formats

Convert options:
  -u, --url <url>       Subscription URL (repeatable)
  -f, --file <path>     Local subscription/config file (repeatable)
  -t, --target <fmt>    Output format (${[...TARGET_VALUES].join(", ")})
  -o, --out <path>      Write output to a file (default: stdout)
  -g, --group <name>    Add a select group containing all nodes
  -r, --rename <m@r>    Rename rule: match-regex@replacement
  -e, --emoji <m@r>     Emoji rule: match-regex@emoji
      --add-emoji       Prepend emoji using the emoji rules
      --remove-emoji    Strip leading emoji from names
      --append-type     Prefix node names with their proxy type
      --node-list       Emit a bare node list (no groups/wrapper)
      --sort            Sort nodes by name
      --new-field-name  Use Clash's new field names (proxies/proxy-groups)
      --dedupe          Drop duplicate nodes (same type/server/port/name)
      --surge-version <n> Surge version for the surge target (default 4)
      --with-rules      Attach rules + default proxy groups (like upstream config=ACL4SSR.ini)
      --no-rules        Never emit rules, even if --ruleset/--config is given
      --ruleset <g,u>   Ruleset: group,url[,interval] or group,[]RULE (repeatable)
      --config <p|url>  External INI config with [custom] ruleset/groups (like upstream config=)
      --base <path>     Base config file merged under generated proxies/groups/rules
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

  process.stderr.write(`Unknown command: ${command}\n${USAGE}`);
  return 1;
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

  const groups: ProxyGroupConfig[] = flagAll(state, "group").map((name) => ({
    disableUdp: undefined,
    evaluateBeforeUse: undefined,
    interval: 0,
    lazy: undefined,
    name,
    persistent: undefined,
    proxies: ["[]DIRECT", "!!TYPE=SS", "!!TYPE=SSR", "!!TYPE=VMESS", "!!TYPE=TROJAN"],
    strategy: BalanceStrategy.ConsistentHashing,
    timeout: 0,
    tolerance: 0,
    type: ProxyGroupType.Select,
    url: "",
    usingProvider: [],
  }));

  const settings: Partial<ExtraSettings> = {
    addEmoji: flagBool(state, "add-emoji"),
    appendProxyType: flagBool(state, "append-type"),
    clashNewFieldName: flagBool(state, "new-field-name"),
    dedupe: flagBool(state, "dedupe"),
    emojiArray: parseEmojiRules(flagAll(state, "emoji")),
    filterDeprecated: flagBool(state, "filter-deprecated"),
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
    settings.enableRuleGenerator = external.enableRuleGenerator;
    settings.overwriteOriginalRules = external.overwriteOriginalRules;
    if (external.addEmoji) {
      settings.addEmoji = true;
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

  // `--with-rules` opts into bundled upstream-like defaults (offline);
  // `--ruleset`/`--config` imply it unless `--no-rules` strips everything.
  let includeRules: boolean | undefined;
  if (flagBool(state, "no-rules")) {
    includeRules = false;
  } else if (flagBool(state, "with-rules")) {
    includeRules = true;
  } else if (rulesetConfigs.length > 0 || configSource) {
    includeRules = true;
  }

  const output = generate(nodes, {
    baseConf,
    groups,
    includeRules,
    rulesets,
    settings,
    surgeVersion: Number(flag(state, "surge-version") ?? 4),
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
