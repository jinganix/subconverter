import type { Proxy } from "./proxy";
import type { ProxyGroupConfig } from "./proxy-group";
import type { RulesetConfig } from "./ruleset";
import type { TriBool } from "./tribool";

/** Clash kernel flavor targeted by Clash output (`flavor=`). */
export type ClashFlavor = "mihomo" | "premium" | "stash";

/**
 * Parse a `flavor=` value (case-insensitive); unknown values fall back to
 * `mihomo`, mirroring subconverter-rs `ClashFlavor::from_str`.
 */
export function parseClashFlavor(value: string | undefined | null): ClashFlavor {
  const normalized = (value ?? "").trim().toLowerCase();
  if (
    normalized === "premium" ||
    normalized === "original" ||
    normalized === "classic" ||
    normalized === "clash"
  ) {
    return "premium";
  }
  if (normalized === "stash") {
    return "stash";
  }
  return "mihomo";
}

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
  /** Regex rewrites applied to node names before every other naming rule. */
  nameRegexArray: RegexMatchConfig[];
  /** Literal fragments stripped from node names before every other naming rule. */
  nameRemove: string[];
  addEmoji: boolean;
  removeEmoji: boolean;
  /** Prefix node names with the server's ISO country code when the name lacks one. */
  autoCountry: boolean;
  /**
   * Resolve a node's ISO 3166-1 alpha-2 country code. Platform-free: the Node
   * adapter supplies a GeoIP-backed lookup; browsers may supply their own.
   * Required by `autoCountry` and the country filters below.
   */
  countryResolver?: (node: Proxy) => string | undefined;
  /** Keep only nodes whose GeoIP country is in this ISO code list. */
  includeCountries: string[];
  /** Drop nodes whose GeoIP country is in this ISO code list. */
  excludeCountries: string[];
  /** Keep only nodes matching one of these remark rules (empty keeps all). */
  includeRemarks: string[];
  /** Drop nodes matching one of these remark rules. */
  excludeRemarks: string[];
  /** `false` keeps remote rulesets as `RULE-SET` references (Surge-family). */
  expandRulesets: boolean;
  appendProxyType: boolean;
  nodeList: boolean;
  sortFlag: boolean;
  filterDeprecated: boolean;
  clashNewFieldName: boolean;
  clashScript: boolean;
  clashClassicalRuleset: boolean;
  /** Target Clash kernel: dropped protocols/fields follow its capabilities. */
  clashFlavor: ClashFlavor;
  /** Template variables applied to `{{ var }}` placeholders in base configs. */
  templateVars: Record<string, string>;
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
    autoCountry: false,
    clashClassicalRuleset: false,
    clashFlavor: "mihomo",
    clashNewFieldName: true,
    clashProxiesStyle: "flow",
    clashProxyGroupsStyle: "flow",
    clashScript: false,
    countryResolver: undefined,
    dedupe: false,
    emojiArray: [],
    enableRuleGenerator: true,
    excludeCountries: [],
    excludeRemarks: [],
    expandRulesets: true,
    filterDeprecated: false,
    includeCountries: [],
    includeRemarks: [],
    managedConfigPrefix: "",
    nameRegexArray: [],
    nameRemove: [],
    nodeList: false,
    overwriteOriginalRules: true,
    quanxDevId: "",
    removeEmoji: false,
    renameArray: [],
    skipCertVerify: undefined,
    sortFlag: false,
    sortScript: "",
    surgeSsrPath: "",
    templateVars: {},
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
  /** Regex replacements applied to node names before renaming. */
  nameRegex: RegexMatchConfig[];
  /** Literal fragments removed from node names before renaming. */
  nameRemove: string[];
  includeRemarks: string[];
  excludeRemarks: string[];
  /** Keep only nodes whose GeoIP country is in this ISO code list. */
  includeCountries: string[];
  /** Drop nodes whose GeoIP country is in this ISO code list. */
  excludeCountries: string[];
  addEmoji: boolean;
  removeEmoji: boolean;
  autoCountry: boolean;
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
  /** Target Clash kernel (`flavor=`): mihomo (default), premium, or stash. */
  clashFlavor: ClashFlavor;
  /** `false` keeps remote rulesets as `RULE-SET` references (Surge-family). */
  expand: boolean;
  /** Managed-config `strict=` flag for Surge-family `#!MANAGED-CONFIG`. */
  strict: boolean;
  /** Download filename override (`filename=`). */
  filename: string;
  /** Quantumult X device ID for remote-script signatures (`dev_id=`). */
  devId: string;
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
