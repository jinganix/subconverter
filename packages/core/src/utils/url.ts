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

/**
 * Read a parameter from a query string, mirroring subconverter's
 * `getUrlArg` (last occurrence wins, value percent-decoded).
 */
export function getUrlArg(query: string, key: string): string {
  if (query === "") {
    return "";
  }
  const normalized = query.startsWith("?") ? query.slice(1) : query;
  const parts = normalized.split("&");
  let found = "";
  const target = key.toLowerCase();
  for (const part of parts) {
    if (part === "") {
      continue;
    }
    const eq = part.indexOf("=");
    const rawKey = eq >= 0 ? part.slice(0, eq) : part;
    if (rawKey.toLowerCase() !== target) {
      continue;
    }
    const rawValue = eq >= 0 ? part.slice(eq + 1) : "";
    found = urlDecode(rawValue);
  }
  return found.trim();
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
