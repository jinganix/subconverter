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
  const codes = new Map<Proxy, string>();
  const hostCache = new Map<string, string | undefined>();

  for (const node of nodes) {
    const host = node.hostname.trim();
    if (host === "") {
      continue;
    }
    let code = hostCache.get(host);
    if (code === undefined) {
      if (hostCache.has(host)) {
        continue;
      }
      if (isHostIp(host)) {
        code = database.lookupCountry(host);
      } else {
        try {
          for (const address of await lookup(host)) {
            code = database.lookupCountry(address);
            if (code !== undefined) {
              break;
            }
          }
        } catch {
          code = undefined;
        }
      }
      hostCache.set(host, code);
    }
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
  return (node) => codes.get(node);
}
