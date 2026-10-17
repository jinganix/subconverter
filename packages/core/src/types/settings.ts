import type { ProxyGroupConfig } from "./proxy-group";
import type { RulesetConfig } from "./ruleset";
import type { TriBool } from "./tribool";

/** A regex/script rewrite rule, mirroring `RegexMatchConfig`. */
export interface RegexMatchConfig {
  match: string;
  replace: string;
  script: string;
}

/** Target output formats. */
export enum TargetFormat {
  Clash = "clash",
  ClashR = "clashr",
  Surge = "surge",
  Surfboard = "surfboard",
  QuantumultX = "quanx",
  Quantumult = "quan",
  Loon = "loon",
  Mellow = "mellow",
  V2Ray = "v2ray",
  Trojan = "trojan",
  SSD = "ssd",
  SSC = "ss",
  SSSub = "sssub",
  SSR = "ssr",
  SingBox = "singbox",
  Mixed = "mixed",
  NodeList = "nodelist",
  Auto = "auto",
}

/** Per-run conversion settings, mirroring `extra_settings`. */
export interface ExtraSettings {
  enableRuleGenerator: boolean;
  overwriteOriginalRules: boolean;
  renameArray: RegexMatchConfig[];
  emojiArray: RegexMatchConfig[];
  addEmoji: boolean;
  removeEmoji: boolean;
  appendProxyType: boolean;
  nodeList: boolean;
  sortFlag: boolean;
  filterDeprecated: boolean;
  clashNewFieldName: boolean;
  clashScript: boolean;
  clashClassicalRuleset: boolean;
  dedupe: boolean;
  surgeSsrPath: string;
  managedConfigPrefix: string;
  quanxDevId: string;
  udp: TriBool;
  tfo: TriBool;
  skipCertVerify: TriBool;
  tls13: TriBool;
  sortScript: string;
  clashProxiesStyle: string;
  clashProxyGroupsStyle: string;
  authorized: boolean;
}

/** Create `ExtraSettings` with subconverter's defaults. */
export function createExtraSettings(): ExtraSettings {
  return {
    addEmoji: false,
    appendProxyType: false,
    authorized: false,
    clashClassicalRuleset: false,
    clashNewFieldName: true,
    clashProxiesStyle: "flow",
    clashProxyGroupsStyle: "flow",
    clashScript: false,
    dedupe: false,
    emojiArray: [],
    enableRuleGenerator: true,
    filterDeprecated: false,
    managedConfigPrefix: "",
    nodeList: false,
    overwriteOriginalRules: true,
    quanxDevId: "",
    removeEmoji: false,
    renameArray: [],
    skipCertVerify: undefined,
    sortFlag: false,
    sortScript: "",
    surgeSsrPath: "",
    tfo: undefined,
    tls13: undefined,
    udp: undefined,
  };
}

/** Structured request/config parameters used by the engine. */
export interface RequestSettings {
  target: TargetFormat;
  url: string;
  group: ProxyGroupConfig[];
  ruleset: RulesetConfig[];
  rename: RegexMatchConfig[];
  emoji: RegexMatchConfig[];
  includeRemarks: string[];
  excludeRemarks: string[];
  addEmoji: boolean;
  removeEmoji: boolean;
  appendType: boolean;
  nodeList: boolean;
  dedupe: boolean;
  sort: boolean;
  filterDeprecated: boolean;
  list: boolean;
  tfo: TriBool;
  udp: TriBool;
  scv: TriBool;
  tls13: TriBool;
  newFieldName: boolean;
  classicalRuleset: boolean;
  insert: boolean;
  mixin: string;
  interval: number;
  script: string;
  clashScript: boolean;
  proxiesStyle: string;
  proxyGroupsStyle: string;
  autoExtract: boolean;
  uploadPath: string;
  /** Extra quota endpoint fetched server-side (`userinfo_url` / `userinfo-url`). */
  userinfoUrl: string;
  /** Converter for the quota endpoint (`jms` for Just-My-Socks, `subscription`, `auto`). */
  userinfoProvider: string;
}
