import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Shared server-side fetch guard (SSRF mitigation) for the library
 * `fetchSubscription` and the HTTP server. Single source of truth: both
 * entrypoints must agree on which hosts are fetchable, including the
 * DNS-rebinding check that literal-only validation misses.
 */

/** Per-host DNS lookup timeout (fail-closed; firewall-drop must not hang past fetch timeout). */
export const DNS_LOOKUP_TIMEOUT_MS = 3000;

/** Race a promise against a timeout (same shape as `geoip` `withTimeout`). */
function withDnsTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("DNS lookup timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }) as Promise<T>;
}

/** Parse a dotted quad with decimal/hex/octal octets; `undefined` when not dotted. */
function parseDottedIPv4(host: string): number | undefined {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return undefined;
  }
  let value = 0;
  for (const part of parts) {
    if (part === undefined || part === "") {
      return undefined;
    }
    let base = 10;
    let digits = part;
    if (/^0x[0-9a-f]+$/i.test(part)) {
      base = 16;
      digits = part.slice(2);
    } else if (/^0[0-7]*$/.test(part) && part.length > 1) {
      base = 8;
    } else if (!/^\d+$/.test(part)) {
      return undefined;
    }
    const octet = Number.parseInt(digits, base);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return undefined;
    }
    value = value * 256 + octet;
  }
  return value;
}

/** Parse a single-number IPv4 (`0`, `2130706433`, `0x7f000001`, octal). */
function parseSingleIPv4Number(host: string): number | undefined {
  let value: number;
  if (/^0x[0-9a-f]+$/i.test(host)) {
    value = Number.parseInt(host.slice(2), 16);
  } else if (/^0[0-7]+$/.test(host)) {
    value = Number.parseInt(host, 8);
  } else if (/^\d+$/.test(host)) {
    value = Number.parseInt(host, 10);
  } else {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 0 || value > 4294967295) {
    return undefined;
  }
  return value;
}

/** IPv4 literal (dotted or single-number) to a 32-bit int; `undefined` if not IPv4. */
function ipv4ToInt(host: string): number | undefined {
  const normalized = host.trim().toLowerCase();
  if (normalized === "") {
    return undefined;
  }
  if (isIP(normalized) === 4) {
    let value = 0;
    for (const part of normalized.split(".")) {
      value = value * 256 + Number.parseInt(part, 10);
    }
    return value;
  }
  const dotted = parseDottedIPv4(normalized);
  if (dotted !== undefined) {
    return dotted;
  }
  return parseSingleIPv4Number(normalized);
}

/** Expand IPv6 (with optional embedded IPv4) to 8 hextets; `undefined` if invalid. */
function expandIPv6(host: string): number[] | undefined {
  let v6part = host;
  if (host.includes(".")) {
    const lastColon = host.lastIndexOf(":");
    if (lastColon === -1) {
      return undefined;
    }
    const v4int = ipv4ToInt(host.slice(lastColon + 1));
    if (v4int === undefined) {
      return undefined;
    }
    const hi = Math.floor(v4int / 65536).toString(16);
    const lo = (v4int % 65536).toString(16);
    v6part = `${host.slice(0, lastColon)}:${hi}:${lo}`;
  }
  if ((v6part.match(/::/g) ?? []).length > 1) {
    return undefined;
  }
  let full: string[];
  if (v6part.includes("::")) {
    const [head, tail] = v6part.split("::");
    const headParts = head === "" ? [] : (head as string).split(":");
    const tailParts = tail === "" ? [] : (tail as string).split(":");
    const missing = 8 - (headParts.length + tailParts.length);
    if (missing < 0) {
      return undefined;
    }
    full = [...headParts, ...new Array<string>(missing).fill("0"), ...tailParts];
  } else {
    full = v6part.split(":");
    if (full.length !== 8) {
      return undefined;
    }
  }
  if (full.length !== 8 || full.some((part) => part === "" || part.length > 4)) {
    return undefined;
  }
  const nums = full.map((part) => Number.parseInt(part, 16));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) {
    return undefined;
  }
  return nums;
}

/**
 * `true` when a 32-bit IPv4 int targets loopback, private, link-local,
 * CGNAT, multicast, or unspecified space — i.e. addresses that can reach
 * cloud metadata or the host itself. Documentation/benchmarking ranges are
 * deliberately *not* blocked (unroutable, harmless, and sandbox DNS often
 * maps test domains into them).
 */
function isBlockedIPv4Int(ipv4: number): boolean {
  const b0 = Math.floor(ipv4 / 16777216) % 256;
  const b1 = Math.floor(ipv4 / 65536) % 256;
  if (b0 === 127 || b0 === 0 || b0 >= 224) {
    return true;
  }
  if (b0 === 10) {
    return true;
  }
  if (b0 === 172 && b1 >= 16 && b1 <= 31) {
    return true;
  }
  if (b0 === 192 && b1 === 168) {
    return true;
  }
  if (b0 === 169 && b1 === 254) {
    return true;
  }
  if (b0 === 100 && b1 >= 64 && b1 <= 127) {
    return true;
  }
  return false;
}

/** `true` when an unbracketed IPv6 address is non-public. */
function isBlockedIPv6(host: string): boolean {
  const groups = expandIPv6(host);
  if (groups === undefined) {
    return false;
  }
  const at = (index: number): number => groups[index] as number;
  if (groups.every((part) => part === 0)) {
    return true;
  }
  if (groups.slice(0, 7).every((part) => part === 0) && at(7) === 1) {
    return true;
  }
  if (groups.slice(0, 5).every((part) => part === 0) && at(5) === 0xffff) {
    return isBlockedIPv4Int(at(6) * 65536 + at(7));
  }
  if ((at(0) & 0xfe00) === 0xfc00) {
    return true;
  }
  if ((at(0) & 0xffc0) === 0xfe80) {
    return true;
  }
  if ((at(0) & 0xff00) === 0xff00) {
    return true;
  }
  return false;
}

/** `true` when a hostname must never be fetched server-side (SSRF guard). */
function isBlockedHost(hostname: string): boolean {
  // `URL.hostname` preserves brackets for IPv6 literals and already
  // normalizes single-number (`http://0/`) and full-form IPv6 spellings.
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  // Reject IPv6 zone identifiers (`fe80::1%eth0`, decoded from `%25eth0`):
  // `expandIPv6` returns `undefined` for them, which would otherwise pass.
  if (host.includes("%")) {
    return true;
  }
  if (host === "" || host === "localhost" || host === "metadata.google.internal") {
    return true;
  }
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) {
    return true;
  }
  const ipv4 = ipv4ToInt(host);
  if (ipv4 !== undefined) {
    return isBlockedIPv4Int(ipv4);
  }
  if (host.includes(":")) {
    return isBlockedIPv6(host);
  }
  return false;
}

/** `true` when a resolved address string (unbracketed) is non-public. */
function isBlockedIPString(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.includes("%")) {
    return true;
  }
  const v4 = ipv4ToInt(normalized);
  if (v4 !== undefined) {
    return isBlockedIPv4Int(v4);
  }
  if (normalized.includes(":")) {
    return isBlockedIPv6(normalized);
  }
  return false;
}

/**
 * Resolve a non-literal hostname and reject it when any address is
 * non-public. Closes `*.nip.io`-style static rebinding; IP literals are
 * already covered by {@link isBlockedHost} so they skip DNS. A lookup
 * failure fails closed (blocks the fetch) instead of allowing it.
 */
export async function validateResolvedHost(
  hostname: string,
  param = "url",
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
  }
  const host = hostname.trim().replace(/^\[|\]$/g, "");
  if (
    host === "" ||
    ipv4ToInt(host.toLowerCase()) !== undefined ||
    isIP(host.replace(/\.$/, "")) !== 0
  ) {
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    if (signal) {
      // The abort listener is removed after the race settles: without
      // cleanup every DNS check leaks one listener (~50 per request ->
      // MaxListenersExceededWarning). The late-reject swallow avoids an
      // unhandled rejection if the signal aborts after DNS already won.
      let onAbort: (() => void) | undefined;
      try {
        const aborted = new Promise<never>((_, reject) => {
          onAbort = () =>
            reject(Object.assign(new Error("Request timed out"), { statusCode: 504 }));
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        });
        aborted.catch(() => undefined);
        addresses = await Promise.race([
          withDnsTimeout(dnsLookup(host, { all: true }), DNS_LOOKUP_TIMEOUT_MS),
          aborted,
        ]);
      } finally {
        if (onAbort !== undefined) {
          signal.removeEventListener("abort", onAbort);
        }
      }
    } else {
      addresses = await withDnsTimeout(dnsLookup(host, { all: true }), DNS_LOOKUP_TIMEOUT_MS);
    }
  } catch (error) {
    if ((error as { statusCode?: unknown })?.statusCode === 504) {
      throw error;
    }
    throw Object.assign(new Error(`Failed to resolve ${param} host: ${hostname}`), {
      statusCode: 400,
    });
  }
  for (const entry of addresses) {
    const address = entry.address.toLowerCase().replace(/^\[|\]$/g, "");
    if (isBlockedIPString(address)) {
      throw Object.assign(
        new Error(`Private or loopback ${param} host resolved for: ${hostname}`),
        { statusCode: 400 },
      );
    }
  }
}

/**
 * Reject non-`http(s)` URLs and private/loopback/link-local hosts before any
 * server-side fetch (SSRF mitigation). Every redirect hop must pass this too.
 */
export function assertHttpUrl(url: string, param = "url"): void {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw Object.assign(new Error(`Only http(s) ${param} URLs are allowed: ${url.slice(0, 200)}`), {
      statusCode: 400,
    });
  }
  let hostname = "";
  try {
    hostname = new URL(trimmed).hostname;
  } catch {
    throw Object.assign(new Error(`Invalid ${param} URL: ${url.slice(0, 200)}`), {
      statusCode: 400,
    });
  }
  if (isBlockedHost(hostname)) {
    throw Object.assign(
      new Error(`Private or loopback ${param} hosts are not allowed: ${url.slice(0, 200)}`),
      {
        statusCode: 400,
      },
    );
  }
}
