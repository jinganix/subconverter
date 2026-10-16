import { buildClash, stringifyClash } from "./generator/clash";
import { proxyToSingle, proxyToSsd, proxyToSsSub } from "./generator/links";
import { toLoon } from "./generator/loon";
import { toMellow } from "./generator/mellow";
import { dedupeNodes, preprocessNodes } from "./generator/nodes";
import { toQuan } from "./generator/quan";
import { toQuanX } from "./generator/quanx";
import { rulesetToClashRules, rulesetToSurgeRules } from "./generator/ruleset";
import { toSingBox } from "./generator/singbox";
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

  switch (options.target) {
    case TargetFormat.Clash:
    case TargetFormat.ClashR: {
      const { doc } = buildClash(
        nodes,
        options.groups ?? [],
        settings,
        options.target === TargetFormat.ClashR,
      );
      attachClashRules(doc, settings, options.rulesets);
      return stringifyClash(doc);
    }
    case TargetFormat.Surge: {
      const surgeVersion = options.surgeVersion ?? 4;
      const rules = options.rulesets
        ? rulesetToSurgeRules(options.rulesets, surgeVersion)
        : undefined;
      return toSurge(nodes, options.groups ?? [], settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
        rules,
        version: surgeVersion,
      });
    }
    case TargetFormat.QuantumultX:
      return toQuanX(nodes, options.groups ?? [], settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
      });
    case TargetFormat.Quantumult:
      return toQuan(nodes, options.groups ?? [], settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
      });
    case TargetFormat.Loon:
      return toLoon(nodes, options.groups ?? [], settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
      });
    case TargetFormat.SingBox:
      return toSingBox(nodes, options.groups ?? [], settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
        overwriteOriginalRules: settings.overwriteOriginalRules,
        rulesets: options.rulesets,
      });
    case TargetFormat.Mellow:
      return toMellow(nodes, options.groups ?? [], settings, {
        baseConf: options.baseConf ?? "",
        nodeList: settings.nodeList,
        overwriteOriginalRules: settings.overwriteOriginalRules,
        rulesets: options.rulesets,
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

function attachClashRules(
  doc: Record<string, unknown>,
  settings: ExtraSettings,
  rulesets: RulesetContent[] | undefined,
): void {
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
