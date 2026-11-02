/**
 * ISO 3166-1 alpha-2 region helpers.
 *
 * Emitted prefixes are always the uppercase ISO code (`US-server1`) so node
 * names stay stable across locales. Multilingual names (Chinese/English
 * spellings, flag emoji) are only recognized by `hasRegionName` so existing
 * names are never double-prefixed.
 */

/** All ISO 3166-1 alpha-2 codes, sorted, used for alias detection. */
const REGION_CODES = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
] as const;

const REGION_CODE_SET = new Set<string>(REGION_CODES);

/** Compact Chinese names for regions whose CLDR name is too long for a node. */
const ZH_OVERRIDES: Record<string, string> = {
  AE: "阿联酋",
  BN: "文莱",
  BO: "玻利维亚",
  CD: "刚果（金）",
  CG: "刚果（布）",
  CV: "佛得角",
  CZ: "捷克",
  DO: "多米尼加",
  HK: "香港",
  KH: "柬埔寨",
  KP: "朝鲜",
  KR: "韩国",
  LA: "老挝",
  MD: "摩尔多瓦",
  MK: "北马其顿",
  MM: "缅甸",
  MO: "澳门",
  NL: "荷兰",
  PS: "巴勒斯坦",
  RU: "俄罗斯",
  SY: "叙利亚",
  SZ: "斯威士兰",
  TL: "东帝汶",
  TW: "台湾",
  TZ: "坦桑尼亚",
  VA: "梵蒂冈",
  VE: "委内瑞拉",
};

/** Compact names for regions whose CLDR name is too long for a node. */
const EN_OVERRIDES: Record<string, string> = {
  HK: "Hong Kong",
  MO: "Macau",
  PS: "Palestine",
  TW: "Taiwan",
};

/** Extra spellings seen in subscription node names. */
const EXTRA_ALIASES = [
  "Burma",
  "Cape Verde",
  "Czechia",
  "East Timor",
  "Holland",
  "Hong Kong",
  "Macao",
  "Macau",
  "North Korea",
  "South Korea",
  "UAE",
  "UK",
  "USA",
  "United Kingdom",
  "United States",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const displayNameCache = new Map<string, Intl.DisplayNames>();

function displayNames(locale: string): Intl.DisplayNames | undefined {
  const cached = displayNameCache.get(locale);
  if (cached) {
    return cached;
  }
  try {
    const created = new Intl.DisplayNames([locale], { fallback: "code", type: "region" });
    displayNameCache.set(locale, created);
    return created;
  } catch {
    return undefined;
  }
}

/** Normalize a region code, returning `""` when it is not two ASCII letters. */
function normalizeRegionCode(code: string): string {
  const upper = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : "";
}

/**
 * Normalize user input to an ISO 3166-1 alpha-2 code (`"us"` -> `"US"`),
 * or `undefined` when it is not a known region. Used for country filters.
 */
export function normalizeCountryCode(code: string): string | undefined {
  const upper = normalizeRegionCode(code);
  return upper !== "" && isRegionCode(upper) ? upper : undefined;
}

/** Localized country/region name for alias detection only (never emitted). */
function displayName(code: string, locale: string): string {
  const upper = normalizeRegionCode(code);
  if (upper === "") {
    return code.trim();
  }
  if (locale.toLowerCase().startsWith("zh") && ZH_OVERRIDES[upper] !== undefined) {
    return ZH_OVERRIDES[upper] as string;
  }
  if (locale.toLowerCase().startsWith("en") && EN_OVERRIDES[upper] !== undefined) {
    return EN_OVERRIDES[upper] as string;
  }
  const names = displayNames(locale);
  return names?.of(upper) ?? upper;
}

/** Flag emoji for a region code, or `""` when the code is invalid. */
function regionFlag(code: string): string {
  const upper = normalizeRegionCode(code);
  if (upper === "") {
    return "";
  }
  const base = 0x1f1e6;
  return String.fromCodePoint(base + upper.charCodeAt(0) - 65, base + upper.charCodeAt(1) - 65);
}

/** `true` when the code is a known ISO 3166-1 alpha-2 region. */
export function isRegionCode(code: string): boolean {
  return REGION_CODE_SET.has(normalizeRegionCode(code));
}

let aliasRegex: RegExp | undefined;

function buildAliasRegex(): RegExp {
  const ascii: string[] = [];
  const other: string[] = [];
  const seen = new Set<string>();
  const add = (alias: string): void => {
    const trimmed = alias.trim();
    if (trimmed.length < 2 || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    if (/^[\x20-\x7e]+$/.test(trimmed)) {
      ascii.push(escapeRegExp(trimmed));
    } else {
      other.push(escapeRegExp(trimmed));
    }
  };
  for (const code of REGION_CODES) {
    add(displayName(code, "zh-CN"));
    add(displayName(code, "en"));
    add(regionFlag(code));
  }
  for (const alias of EXTRA_ALIASES) {
    add(alias);
  }
  const parts: string[] = [];
  if (ascii.length > 0) {
    parts.push(`(?<![A-Za-z])(?:${ascii.join("|")})(?![A-Za-z])`);
  }
  if (other.length > 0) {
    parts.push(`(?:${other.join("|")})`);
  }
  return new RegExp(parts.join("|"), "iu");
}

function getAliasRegex(): RegExp {
  aliasRegex ??= buildAliasRegex();
  return aliasRegex;
}

/**
 * `true` when a node name already mentions a country/region — a localized
 * name, a common English spelling, a flag emoji, or an ISO code token such as
 * `US` in `US-01` / `US01`.
 */
export function hasRegionName(remark: string): boolean {
  const text = remark.trim();
  if (text === "") {
    return false;
  }
  if (getAliasRegex().test(text)) {
    return true;
  }
  for (const token of text.split(/[^\p{L}\p{N}]+/u)) {
    if (token === "") {
      continue;
    }
    if (/^\p{Lu}{2}$/u.test(token) && isRegionCode(token)) {
      return true;
    }
    // `US01` / `us01`: an uppercase code prefix, or a lowercase one followed
    // by at least two digits (so `no1`, `in1` are not read as Norway/India).
    if (/^[A-Za-z]{2}\d{2}/.test(token) && isRegionCode(token.slice(0, 2))) {
      return true;
    }
  }
  return false;
}

/**
 * Prefix a remark with the ISO country code (e.g. `server1` -> `US-server1`).
 * An empty remark becomes just the code. Invalid codes leave the remark
 * unchanged.
 */
export function formatCountryRemark(remark: string, code: string): string {
  const normalized = normalizeCountryCode(code);
  const trimmed = remark.trim();
  if (normalized === undefined) {
    return trimmed;
  }
  return trimmed === "" ? normalized : `${normalized}-${trimmed}`;
}
