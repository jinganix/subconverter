/** Percent-decode a URL component, tolerating malformed sequences. */
export function urlDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input.replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  }
}

/** Percent-encode a URL component (RFC 3986 unreserved kept intact). */
export function urlEncode(input: string): string {
  return encodeURIComponent(input).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Normalize a query key: case-insensitive with `_`/`-` equivalent. */
export function normalizeQueryKey(key: string): string {
  return key.toLowerCase().replace(/_/g, "-");
}

/**
 * Read every occurrence of a parameter from a query string in document
 * order (case-insensitive key with `_`/`-` equivalent, each value
 * percent-decoded, `+` preserved).
 * Shared by `getUrlArg` and server-side repeatable params (`url`, `group`,
 * `ruleset`) so both entrypoints decode identically.
 */
export function getAllUrlArgs(query: string, key: string): string[] {
  if (query === "") {
    return [];
  }
  // Tolerate full links (`tg://socks?server=...`, `vless://...?type=...`):
  // strip any fragment and everything up to the first `?` so the first
  // parameter is not swallowed by the scheme prefix.
  const hashCut = query.split("#", 1)[0] as string;
  const qIndex = hashCut.indexOf("?");
  const rawQuery = qIndex >= 0 ? hashCut.slice(qIndex + 1) : hashCut;
  const normalized = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;
  const values: string[] = [];
  const target = normalizeQueryKey(key);
  for (const part of normalized.split("&")) {
    if (part === "") {
      continue;
    }
    const eq = part.indexOf("=");
    const rawKey = eq >= 0 ? part.slice(0, eq) : part;
    // Keys are rarely encoded, but decode before normalizing so
    // `add%5Femoji` matches `add_emoji` like values already do.
    if (normalizeQueryKey(urlDecode(rawKey)) !== target) {
      continue;
    }
    values.push(urlDecode(eq >= 0 ? part.slice(eq + 1) : ""));
  }
  return values;
}

/**
 * Read a parameter from a query string, mirroring subconverter's
 * `getUrlArg` (last occurrence wins, value percent-decoded).
 */
export function getUrlArg(query: string, key: string): string {
  const values = getAllUrlArgs(query, key);
  return values.length > 0 ? (values[values.length - 1] as string).trim() : "";
}

/** Split a URL into its scheme/authority-specific parts without a URL parser. */
export function splitUrl(raw: string): { base: string; query: string } {
  const hashIndex = raw.indexOf("#");
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex < 0) {
    return { base: withoutHash, query: "" };
  }
  return { base: withoutHash.slice(0, queryIndex), query: withoutHash.slice(queryIndex + 1) };
}

/** Strip a scheme prefix (e.g. `ss://`) from a link. */
export function stripScheme(link: string): string {
  const index = link.indexOf("://");
  return index >= 0 ? link.slice(index + 3) : link;
}
