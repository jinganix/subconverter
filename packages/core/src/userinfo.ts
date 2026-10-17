import { toInt } from "./utils/string";

/** Normalized traffic counters for a `subscription-userinfo` header. */
export interface UserinfoData {
  /** Downloaded bytes. */
  download: number;
  /** Expiration as a unix timestamp in seconds (`0` when unknown). */
  expire: number;
  /** Total monthly bytes (`0` when unknown/unlimited). */
  total: number;
  /** Uploaded bytes. */
  upload: number;
}

/** Raw Just-My-Socks API payload (`bw_counter_b`, `monthly_bw_limit_b`, ...). */
export interface JmsUserinfoPayload {
  bwCounterB?: number | string;
  bwResetDayOfMonth?: number | string;
  monthlyBwLimitB?: number | string;
}

/** Supported `userinfo_provider` values for `/sub?userinfo_url=...`. */
export type UserinfoProvider = "auto" | "jms" | "subscription";

const PROVIDER_ALIASES: Record<string, UserinfoProvider> = {
  auto: "auto",
  clash: "subscription",
  jms: "jms",
  "just-my-socks": "jms",
  justmysocks: "jms",
  raw: "subscription",
  sub: "subscription",
  subscription: "subscription",
  "subscription-userinfo": "subscription",
};

/** Normalize a provider name (`JMS`, `justMySocks`, ...); unknown falls back to `auto`. */
export function normalizeUserinfoProvider(provider: string | undefined | null): UserinfoProvider {
  if (!provider) {
    return "auto";
  }
  const key = provider.trim().toLowerCase().replace(/_/g, "-");
  return PROVIDER_ALIASES[key] ?? "auto";
}

/**
 * Guess the quota provider from a `userinfo_url` when the caller did not pass
 * one explicitly. Just-My-Socks quota endpoints (`justmysocks*`,
 * `jmssub*`, `getbwcounter*`) use the JMS JSON shape; anything else yields
 * `undefined` (no suitable provider — the caller must skip conversion
 * instead of guessing).
 */
export function inferUserinfoProviderFromUrl(url: string): UserinfoProvider | undefined {
  const squished = url.trim().toLowerCase().replace(/[-_]/g, "");
  if (
    squished.includes("justmysocks") ||
    squished.includes("jmssub") ||
    squished.includes("getbwcounter")
  ) {
    return "jms";
  }
  return undefined;
}

/** Clamp a value to a non-negative safe integer. */
function toNonNegativeNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  }
  if (typeof value === "string") {
    const parsed = toInt(value);
    return parsed > 0 ? parsed : 0;
  }
  return 0;
}

/** Days in a UTC month (`month` is 0-based). */
function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * JMS bills quota in decimal GB (1 GB = 1000^3 bytes) while Clash clients
 * render `subscription-userinfo` with 1024^3, which would show 500 GB as
 * ~466 GiB. Scale decimal bytes to binary bytes so clients display the
 * advertised GB. `expire` (a timestamp) is never scaled.
 */
const DECIMAL_TO_BINARY = 1024 ** 3 / 1000 ** 3;

function scaleDecimalBytes(value: number): number {
  return Math.round(value * DECIMAL_TO_BINARY);
}

/** Scale every byte counter of normalized quota data (decimal -> binary). */
function scaleUserinfoDecimal(data: UserinfoData): UserinfoData {
  return {
    download: scaleDecimalBytes(data.download),
    expire: data.expire,
    total: scaleDecimalBytes(data.total),
    upload: scaleDecimalBytes(data.upload),
  };
}

/**
 * Compute the next reset timestamp (unix seconds, UTC midnight) for a
 * monthly reset day, mirroring how providers reset quotas on a fixed
 * day-of-month. Returns `0` when the reset day is invalid.
 */
export function nextMonthlyResetTimestamp(resetDay: number, nowSec?: number): number {
  const day = Math.trunc(resetDay);
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    return 0;
  }
  const now = nowSec && nowSec > 0 ? Math.trunc(nowSec) : Math.trunc(Date.now() / 1000);
  const current = new Date(now * 1000);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const today = current.getUTCDate();
  const useCurrentMonth = today < day;
  const targetYear = useCurrentMonth ? year : month === 11 ? year + 1 : year;
  const targetMonth = useCurrentMonth ? month : (month + 1) % 12;
  const clampedDay = Math.min(day, daysInUtcMonth(targetYear, targetMonth));
  return Math.trunc(Date.UTC(targetYear, targetMonth, clampedDay) / 1000);
}

/** Parse a Just-My-Socks JSON payload into normalized counters. */
export function parseJmsUserinfo(raw: string, nowSec?: number): UserinfoData | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  // Only claim payloads with provider-specific keys; generic
  // `upload`/`download`/`total` JSON is handled by the generic parser so
  // `auto` detection preserves all fields.
  const hasJmsKeys =
    record["monthly_bw_limit_b"] !== undefined ||
    record["monthlyBwLimitB"] !== undefined ||
    record["bw_counter_b"] !== undefined ||
    record["bwCounterB"] !== undefined ||
    record["bw_reset_day_of_month"] !== undefined ||
    record["bwResetDayOfMonth"] !== undefined;
  if (!hasJmsKeys) {
    return undefined;
  }
  // Tolerate both snake_case API keys and camelCase aliases.
  const limitRaw = record["monthly_bw_limit_b"] ?? record["monthlyBwLimitB"];
  const usedRaw = record["bw_counter_b"] ?? record["bwCounterB"];
  const resetRaw =
    record["bw_reset_day_of_month"] ??
    record["bwResetDayOfMonth"] ??
    record["reset_day"] ??
    record["resetDay"];
  const payload: JmsUserinfoPayload = {
    bwCounterB: usedRaw as number | string | undefined,
    bwResetDayOfMonth: resetRaw as number | string | undefined,
    monthlyBwLimitB: limitRaw as number | string | undefined,
  };
  // JMS bills decimal GB: scale to binary bytes so clients dividing by
  // 1024^3 display the advertised quota (500 GB -> 536870912000 bytes).
  const total = scaleDecimalBytes(toNonNegativeNumber(payload.monthlyBwLimitB));
  const download = scaleDecimalBytes(toNonNegativeNumber(payload.bwCounterB));
  const resetDay = toInt(
    typeof payload.bwResetDayOfMonth === "number"
      ? String(payload.bwResetDayOfMonth)
      : ((payload.bwResetDayOfMonth ?? "") as string),
  );
  return {
    download,
    expire: resetDay > 0 ? nextMonthlyResetTimestamp(resetDay, nowSec) : 0,
    total,
    upload: 0,
  };
}

/** Parse a `subscription-userinfo` header value into normalized counters. */
export function parseSubscriptionUserinfo(header: string): UserinfoData | undefined {
  if (!header || header.trim() === "") {
    return undefined;
  }
  const data: UserinfoData = { download: 0, expire: 0, total: 0, upload: 0 };
  let found = false;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (value === "") {
      continue;
    }
    switch (key) {
      case "download":
      case "down":
        data.download = toNonNegativeNumber(toInt(value));
        found = true;
        break;
      case "expire":
      case "expires":
        data.expire = toNonNegativeNumber(toInt(value));
        found = true;
        break;
      case "total":
      case "limit":
        data.total = toNonNegativeNumber(toInt(value));
        found = true;
        break;
      case "upload":
      case "up":
        data.upload = toNonNegativeNumber(toInt(value));
        found = true;
        break;
      default:
        break;
    }
  }
  return found ? data : undefined;
}

/** Render normalized counters as a `subscription-userinfo` header value. */
export function formatSubscriptionUserinfo(data: UserinfoData): string {
  const upload = toNonNegativeNumber(data.upload);
  const download = toNonNegativeNumber(data.download);
  const total = toNonNegativeNumber(data.total);
  const expire = toNonNegativeNumber(data.expire);
  return `upload=${upload}; download=${download}; total=${total}; expire=${expire}`;
}

/** Parse a generic JSON quota payload (`upload`/`download`/`total`/`expire` aliases). */
function parseGenericJsonUserinfo(raw: string): UserinfoData | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  const pick = (...keys: string[]): unknown => {
    for (const key of keys) {
      if (record[key] !== undefined) {
        return record[key];
      }
    }
    return undefined;
  };
  const uploadRaw = pick("upload", "upload_b", "up", "u");
  const downloadRaw = pick(
    "download",
    "download_b",
    "down",
    "d",
    "used",
    "bw_counter_b",
    "bwCounterB",
  );
  const totalRaw = pick(
    "total",
    "total_b",
    "limit",
    "bandwidth",
    "monthly_bw_limit_b",
    "monthlyBwLimitB",
  );
  const expireRaw = pick("expire", "expires", "expire_at", "expireAt", "reset");
  if (uploadRaw === undefined && downloadRaw === undefined && totalRaw === undefined) {
    return undefined;
  }
  return {
    download: toNonNegativeNumber(downloadRaw),
    expire: toNonNegativeNumber(expireRaw),
    total: toNonNegativeNumber(totalRaw),
    upload: toNonNegativeNumber(uploadRaw),
  };
}

/**
 * Convert a raw `userinfo_url` response body into a `subscription-userinfo`
 * header value using the given provider (`jms` for Just-My-Socks).
 * Returns `undefined` when the payload cannot be understood.
 */
export function convertUserinfo(
  raw: string,
  provider?: string,
  nowSec?: number,
): string | undefined {
  if (!raw || raw.trim() === "") {
    return undefined;
  }
  const normalized = normalizeUserinfoProvider(provider);
  if (normalized === "jms") {
    const jms = parseJmsUserinfo(raw, nowSec);
    if (jms) {
      return formatSubscriptionUserinfo(jms);
    }
    // Explicit `jms` provider with a generic JSON shape: still decimal.
    const generic = parseGenericJsonUserinfo(raw);
    return generic ? formatSubscriptionUserinfo(scaleUserinfoDecimal(generic)) : undefined;
  }
  if (normalized === "subscription") {
    const parsed = parseSubscriptionUserinfo(raw) ?? parseGenericJsonUserinfo(raw);
    return parsed ? formatSubscriptionUserinfo(parsed) : undefined;
  }
  // `auto`: JMS shape first, then generic JSON, then header string.
  const jms = parseJmsUserinfo(raw, nowSec);
  if (jms) {
    return formatSubscriptionUserinfo(jms);
  }
  const generic = parseGenericJsonUserinfo(raw);
  if (generic) {
    return formatSubscriptionUserinfo(generic);
  }
  const header = parseSubscriptionUserinfo(raw);
  return header ? formatSubscriptionUserinfo(header) : undefined;
}
