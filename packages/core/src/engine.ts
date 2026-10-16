import { buildClash, stringifyClash } from "./generator/clash";
import { getDefaultProxyGroups, getDefaultRulesets } from "./generator/default-profile";
import { proxyToSingle, proxyToSsd, proxyToSsSub } from "./generator/links";
import { toLoon } from "./generator/loon";
import { toMellow } from "./generator/mellow";
import { dedupeNodes, preprocessNodes } from "./generator/nodes";
import { toQuan } from "./generator/quan";
import { toQuanX } from "./generator/quanx";
import { rulesetToClashRules, rulesetToSurgeRules } from "./generator/ruleset";
import { toSingBox } from "./generator/singbox";
import { toSurfboard } from "./generator/surfboard";
import { toSurge } from "./generator/surge";
import type { Proxy } from "./types/proxy";
import type { ProxyGroupConfig } from "./types/proxy-group";
import type { RulesetContent } from "./types/ruleset";
import type { ExtraSettings } from "./types/settings";
import { TargetFormat, createExtraSettings } from "./types/settings";

/** Options controlling a single conversion. */
export interface GenerateOptions {
  target: TargetFormat;
  groups?: ProxyGroupConfig[];
  settings?: Partial<ExtraSettings>;
  baseConf?: string;
  surgeVersion?: number;
  rulesets?: RulesetContent[];
  /**
   * Whether to attach rules (and default proxy groups) like upstream
   * `tindy2013/subconverter` does with e.g. `config=ACL4SSR.ini`.
   *
   * - `true`: emit rules; when `rulesets` is empty, fall back to the bundled
   *   offline defaults. When `groups` is empty, fall back to the bundled
   *   default proxy groups so rule references resolve.
   * - `false`: never emit rules, even if `rulesets` are provided.
   * - `undefined` (default): legacy behavior — emit `rulesets` only when
   *   explicitly provided, preserving backward compatibility.
   */
  includeRules?: boolean;
}

const V2RAY_TYPE_MASK = 1 | 2 | 4 | 8;

/** Apply rename/emoji/sort preprocessing from settings to nodes. */
export function runPreprocess(nodes: Proxy[], settings: ExtraSettings): void {
  preprocessNodes(nodes, {
    addEmoji: settings.addEmoji,
    emojiArray: settings.emojiArray,
    removeEmoji: settings.removeEmoji,
    renameArray: settings.renameArray,
    sortFlag: settings.sortFlag,
  });
  if (settings.dedupe) {
    dedupeNodes(nodes);
  }
}

/**
 * Convert nodes into the requested output format.
 *
 * This is the isomorphic generation entry point used by the CLI, the Node
 * adapter, and the browser build.
 */
export function generate(nodes: Proxy[], options: GenerateOptions): string {
  const settings: ExtraSettings = { ...createExtraSettings(), ...options.settings };
  runPreprocess(nodes, settings);
  const groups = resolveGroups(options);
  const rulesets = resolveRulesets(options, settings);

  switch (options.target) {
    case TargetFormat.Clash:
    case TargetFormat.ClashR: {
      const { doc } = buildClash(nodes, groups, settings, options.target === TargetFormat.ClashR);
      attachClashRules(doc, settings, rulesets);
      return stringifyClash(doc);
    }
    case TargetFormat.Surge: {
      const surgeVersion = options.surgeVersion ?? 4;
      const rules = rulesets ? rulesetToSurgeRules(rulesets, surgeVersion) : undefined;
      return toSurge(nodes, groups, settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
        rules,
        version: surgeVersion,
      });
    }
    case TargetFormat.QuantumultX: {
      const rules = rulesets ? rulesetToSurgeRules(rulesets, -1) : undefined;
      return toQuanX(nodes, groups, settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
        rules,
      });
    }
    case TargetFormat.Quantumult: {
      const rules = rulesets ? rulesetToSurgeRules(rulesets, -2) : undefined;
      return toQuan(nodes, groups, settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
        rules,
      });
    }
    case TargetFormat.Loon: {
      const rules = rulesets ? rulesetToSurgeRules(rulesets, -4) : undefined;
      return toLoon(nodes, groups, settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
        rules,
      });
    }
    case TargetFormat.SingBox:
      return toSingBox(nodes, groups, settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
        overwriteOriginalRules: settings.overwriteOriginalRules,
        rulesets,
      });
    case TargetFormat.Mellow:
      return toMellow(nodes, groups, settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
        overwriteOriginalRules: settings.overwriteOriginalRules,
        rulesets,
      });
    case TargetFormat.V2Ray:
      return proxyToSingle(nodes, 4, settings);
    case TargetFormat.Trojan:
      return proxyToSingle(nodes, 8, settings);
    case TargetFormat.Mixed:
      return proxyToSingle(nodes, V2RAY_TYPE_MASK, settings);
    case TargetFormat.SSC:
      return proxyToSingle(nodes, 1, settings);
    case TargetFormat.SSR:
      return proxyToSingle(nodes, 2, settings);
    case TargetFormat.SSD:
      return proxyToSsd(nodes, "", "");
    case TargetFormat.SSSub:
      return proxyToSsSub(nodes, options.baseConf ?? "");
    case TargetFormat.Surfboard: {
      const rules = rulesets ? rulesetToSurgeRules(rulesets, options.surgeVersion ?? 4) : undefined;
      return toSurfboard(nodes, groups, settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
        rules,
      });
    }
    case TargetFormat.NodeList: {
      settings.nodeList = true;
      return proxyToSingle(nodes, V2RAY_TYPE_MASK, settings);
    }
    default:
      throw new Error(`Unsupported target format: ${options.target}`);
  }
}

/** Export Shadowsocks nodes as a SIP008 document (`ssconf`). */
export function toSip008(nodes: Proxy[], baseConf = ""): string {
  return proxyToSsSub(nodes, baseConf);
}

/** Resolve effective proxy groups, injecting bundled defaults when opted in. */
function resolveGroups(options: GenerateOptions): ProxyGroupConfig[] {
  if (options.includeRules === true && (!options.groups || options.groups.length === 0)) {
    return getDefaultProxyGroups();
  }
  return options.groups ?? [];
}

/**
 * Resolve effective rulesets.
 *
 * - `includeRules: false` always strips rules.
 * - `includeRules: true` falls back to bundled offline defaults when no
 *   explicit rulesets are given (mirrors upstream `config=ACL4SSR.ini`).
 * - `includeRules: undefined` keeps the legacy behavior (explicit only).
 * `enableRuleGenerator: false` or `nodeList: true` always strips rules,
 * mirroring upstream `enable_rule_generator` / bare-list semantics.
 */
function resolveRulesets(
  options: GenerateOptions,
  settings: ExtraSettings,
): RulesetContent[] | undefined {
  if (options.includeRules === false) {
    return undefined;
  }
  if (!settings.enableRuleGenerator || settings.nodeList) {
    return undefined;
  }
  if (options.includeRules === true) {
    if (options.rulesets && options.rulesets.length > 0) {
      return options.rulesets;
    }
    return getDefaultRulesets();
  }
  return options.rulesets;
}

function attachClashRules(
  doc: Record<string, unknown>,
  settings: ExtraSettings,
  rulesets: RulesetContent[] | undefined,
): void {
  if (!settings.enableRuleGenerator || settings.nodeList) {
    return;
  }
  if (!rulesets || rulesets.length === 0) {
    return;
  }
  const field = settings.clashNewFieldName ? "rules" : "Rule";
  const generated = rulesetToClashRules(rulesets);
  if (generated.length === 0) {
    return;
  }
  const existing = doc[field];
  if (settings.overwriteOriginalRules || !Array.isArray(existing)) {
    doc[field] = generated;
  } else {
    doc[field] = [...(existing as string[]), ...generated];
  }
}
