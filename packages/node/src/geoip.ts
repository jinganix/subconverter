import type { Proxy } from "@subconverter/core";
import { type CountryResponse, open } from "maxmind";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Minimal GeoIP surface used by the country-prefix feature (mockable in tests). */
export interface GeoIpDatabase {
  /** ISO 3166-1 alpha-2 country code for an IP literal, or `undefined`. */
  lookupCountry(ip: string): string | undefined;
}

function countryFromResponse(response: CountryResponse | null): string | undefined {
  if (!response) {
    return undefined;
  }
  return (
    response.country?.iso_code ??
    response.registered_country?.iso_code ??
    response.represented_country?.iso_code
  );
}

/**
 * Open a local MaxMind GeoLite2/GeoIP2 `.mmdb` database (Country or City).
 *
 * `maxmind` loads the whole file into memory with an LRU decode cache, so the
 * returned handle should be created once per process and reused.
 */
export async function openGeoIpDatabase(path: string): Promise<GeoIpDatabase> {
  const reader = await open<CountryResponse>(path, { cache: { max: 10000 } });
  return {
    lookupCountry(ip: string): string | undefined {
      const value = ip.trim();
      if (isIP(value) === 0) {
        return undefined;
      }
      return countryFromResponse(reader.get(value));
    },
  };
}

const databaseCache = new Map<string, Promise<GeoIpDatabase>>();

/** Open (and cache) a GeoIP database by path so repeated conversions reuse it. */
export function getGeoIpDatabase(path: string): Promise<GeoIpDatabase> {
  const cached = databaseCache.get(path);
  if (cached) {
    return cached;
  }
  const pending = openGeoIpDatabase(path).catch((error: unknown) => {
    databaseCache.delete(path);
    throw error;
  });
  databaseCache.set(path, pending);
  return pending;
}

/** Drop cached GeoIP handles (tests only). */
export function clearGeoIpCache(): void {
  databaseCache.clear();
}

/** `true` when the host is an IP literal (rather than a domain name). */
export function isHostIp(host: string): boolean {
  return isIP(host.trim().replace(/^\[|\]$/g, "")) !== 0;
}

/** Options for {@link resolveNodeCountries}. */
export interface ResolveCountryOptions {
  /** DNS lookup override (tests). Defaults to `node:dns/promises`. */
  lookup?: (host: string) => Promise<string[]>;
  /** Max concurrent DNS lookups (default 20). */
  concurrency?: number;
  /** Per-host DNS timeout in ms (default 3000). */
  timeoutMs?: number;
  /** Overall-deadline signal: aborts pending DNS lookups when the `/sub` budget expires. */
  signal?: AbortSignal;
}

const GEOIP_CONCURRENCY = 20;
const GEOIP_LOOKUP_TIMEOUT_MS = 500;
/** Cap unique hostnames resolved per call; extras are skipped (DoS mitigation). */
const MAX_UNIQUE_HOSTS = 100;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
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

async function defaultLookup(host: string): Promise<string[]> {
  const records = await dnsLookup(host, { all: true });
  return records.map((record) => record.address);
}

/**
 * Resolve a country code for every node by its server IP.
 *
 * Literal IPs are looked up directly; domain names are resolved once per
 * hostname (cached for the whole call). Unresolvable hosts and unknown IPs are
 * skipped, leaving the node name untouched.
 */
export async function resolveNodeCountries(
  nodes: Proxy[],
  database: GeoIpDatabase,
  options: ResolveCountryOptions = {},
): Promise<Map<Proxy, string>> {
  const lookup = options.lookup ?? defaultLookup;
  const concurrency = options.concurrency ?? GEOIP_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? GEOIP_LOOKUP_TIMEOUT_MS;
  const signal = options.signal;
  if (signal?.aborted) {
    throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
  }
  const codes = new Map<Proxy, string>();
  const hostCache = new Map<string, string | undefined>();
  // Slice before resolving: each skipped host keeps its name untouched while
  // bounding DNS work (100 hosts x 500ms timeout) and the `byHost` map below.
  const uniqueHosts = [...new Set(nodes.map((node) => node.hostname.trim()))]
    .filter((host) => host !== "")
    .slice(0, MAX_UNIQUE_HOSTS);

  async function resolveHost(host: string): Promise<void> {
    if (signal?.aborted) {
      throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
    }
    if (isHostIp(host)) {
      hostCache.set(host, database.lookupCountry(host));
      return;
    }
    try {
      const lookupPromise = withTimeout(lookup(host), timeoutMs);
      let addresses: string[];
      if (signal) {
        // Remove the abort listener after the race settles: one leaked
        // listener per hostname (~50 per request) trips MaxListeners.
        let onAbort: (() => void) | undefined;
        try {
          const abortPromise = new Promise<never>((_, reject) => {
            onAbort = () =>
              reject(Object.assign(new Error("Request timed out"), { statusCode: 504 }));
            if (signal.aborted) {
              onAbort();
              return;
            }
            signal.addEventListener("abort", onAbort, { once: true });
          });
          abortPromise.catch(() => undefined);
          addresses = await Promise.race([lookupPromise, abortPromise]);
        } finally {
          if (onAbort !== undefined) {
            signal.removeEventListener("abort", onAbort);
          }
        }
      } else {
        addresses = await lookupPromise;
      }
      let code: string | undefined;
      for (const address of addresses) {
        code = database.lookupCountry(address);
        if (code !== undefined) {
          break;
        }
      }
      hostCache.set(host, code);
    } catch (error) {
      // Overall/client timeouts (504) must fail fast, not resolve to a
      // skipped host (200 with a missing country prefix). Only per-host DNS
      // failures (timeout/unresolvable) are skipped.
      if (signal?.aborted) {
        throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
      }
      if ((error as { statusCode?: unknown })?.statusCode === 504) {
        throw error;
      }
      hostCache.set(host, undefined);
    }
  }

  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      if (signal?.aborted) {
        throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
      }
      const current = next;
      next += 1;
      if (current >= uniqueHosts.length) {
        return;
      }
      await resolveHost(uniqueHosts[current] as string);
    }
  }
  const workers = Math.min(Math.max(concurrency, 1), Math.max(uniqueHosts.length, 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));

  for (const node of nodes) {
    const code = hostCache.get(node.hostname.trim());
    if (code !== undefined && code !== "") {
      codes.set(node, code);
    }
  }
  return codes;
}

/** Build a synchronous core resolver from a precomputed code map. */
export function countryResolverFrom(
  codes: Map<Proxy, string>,
): (node: Proxy) => string | undefined {
  // Country depends only on the server hostname, so key by host too: the
  // engine copies nodes before preprocessing, which would break identity keys.
  const byHost = new Map<string, string>();
  for (const [node, code] of codes) {
    const host = node.hostname.trim();
    if (host !== "" && !byHost.has(host)) {
      byHost.set(host, code);
    }
  }
  return (node) => byHost.get(node.hostname.trim()) ?? codes.get(node);
}
