import { type Proxy, parseSubscription } from "@subconverter/core";
import { readFile, writeFile } from "node:fs/promises";

import { assertHttpUrl, validateResolvedHost } from "./ssrf";

/** Options for {@link fetchSubscription}. */
export interface LoadOptions {
  /** Optional request headers (e.g. `User-Agent`, `Authorization`). */
  headers?: Record<string, string>;
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
  /** Abort when the response body exceeds this many bytes. */
  maxBytes?: number;
  /** Overall-deadline signal: aborts DNS/fetch/body when the `/sub` budget expires. */
  signal?: AbortSignal;
}

/** Default cap for a single fetched body (mirrors the server limit). */
export const MAX_FETCH_BYTES = 5 * 1024 * 1024;

/** Default fetch timeout when none is passed (matches the server limit). */
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

/**
 * Read a `Response` body as text while enforcing `maxBytes`.
 * Shared by `fetchSubscription` and the HTTP server so both entrypoints
 * enforce the same cap with the same semantics.
 */
export async function readCappedText(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) {
    throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
  }
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader !== null) {
    const declared = Number.parseInt(lengthHeader.trim(), 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw Object.assign(new Error("Response body exceeds size limit"), { statusCode: 502 });
    }
  }
  if (!response.body) {
    if (signal) {
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
        const text = await Promise.race([response.text(), aborted]);
        if (new TextEncoder().encode(text).length > maxBytes) {
          throw Object.assign(new Error("Response body exceeds size limit"), { statusCode: 502 });
        }
        return text;
      } finally {
        if (onAbort !== undefined) {
          signal.removeEventListener("abort", onAbort);
        }
      }
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxBytes) {
      throw Object.assign(new Error("Response body exceeds size limit"), { statusCode: 502 });
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let onAbort: (() => void) | undefined;
  let abortPromise: Promise<never> | undefined;
  if (signal) {
    abortPromise = new Promise<never>((_, reject) => {
      onAbort = () => reject(Object.assign(new Error("Request timed out"), { statusCode: 504 }));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    // Avoid an unhandled rejection when the body completes without aborting.
    abortPromise.catch(() => undefined);
  }
  try {
    for (;;) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
      }
      const readPromise = reader.read();
      const { done, value } = abortPromise
        ? await Promise.race([readPromise, abortPromise])
        : await readPromise;
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw Object.assign(new Error("Response body exceeds size limit"), { statusCode: 502 });
      }
      chunks.push(value);
    }
  } finally {
    if (signal && onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
    // If the abort won the race above, `reader.read()` is still pending and
    // holds the reader lock: cancel it so the socket releases instead of
    // dangling until GC.
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Max manual redirect hops (mirrors the server `MAX_REDIRECTS`). */
const MAX_FETCH_REDIRECTS = 3;
/** Cap redirect target URLs (mirrors the server `MAX_URL_CHARS` 4KB). */
const MAX_FETCH_URL_CHARS = 4 * 1024;

/** Fetch a remote subscription body as text. */
export async function fetchSubscription(url: string, options: LoadOptions = {}): Promise<string> {
  let current = url.trim();
  if (current.length > MAX_FETCH_URL_CHARS) {
    throw Object.assign(
      new Error(`url exceeds size limit (max ${String(MAX_FETCH_URL_CHARS)} chars).`),
      {
        statusCode: 400,
      },
    );
  }
  assertHttpUrl(current);
  if (options.signal?.aborted) {
    throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_FETCH_BYTES;
  // S2: manual per-hop loop (mirrors server `fetchCappedText`). The previous
  // auto-follow fetched intermediate hops without `assertHttpUrl` /
  // `validateResolvedHost`, so `start --302--> 169.254.. --302--> end` sent
  // one request to the metadata address. Every hop is now validated
  // pre-connect and re-validated post-headers.
  for (let hop = 0; hop <= MAX_FETCH_REDIRECTS; hop += 1) {
    if (options.signal?.aborted) {
      throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
    }
    assertHttpUrl(current);
    if (current.length > MAX_FETCH_URL_CHARS) {
      throw Object.assign(
        new Error(`Redirect target exceeds size limit: ${current.slice(0, 200)}`),
        {
          statusCode: 502,
        },
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onOuterAbort = (): void => controller.abort();
    options.signal?.addEventListener("abort", onOuterAbort, { once: true });
    try {
      // Reject DNS-rebinding hostnames before connecting: a non-literal host
      // resolving to loopback/private/link-local space fails closed here.
      // The DNS check is bounded by both the per-fetch timeout (`controller`)
      // and the overall deadline (`options.signal`) via `AbortSignal.any`, so
      // a stalled resolver fails closed via the abort instead of hanging past
      // `timeoutMs`. No dangling `abortGuard` listener: the combined signal is
      // GC'd with the request and `validateResolvedHost` cleans up its own
      // abort listener after the race settles.
      const dnsSignal = options.signal
        ? AbortSignal.any([controller.signal, options.signal])
        : controller.signal;
      await validateResolvedHost(new URL(current).hostname, "url", dnsSignal);
      const response = await fetch(current, {
        headers: { "User-Agent": "subconverter-ts", ...options.headers },
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) {
          throw Object.assign(new Error(`Redirect without location: ${current.slice(0, 200)}`), {
            statusCode: 502,
          });
        }
        if (location.length > MAX_FETCH_URL_CHARS) {
          throw Object.assign(
            new Error(`Redirect location exceeds size limit: ${current.slice(0, 200)}`),
            {
              statusCode: 502,
            },
          );
        }
        try {
          current = new URL(location, current).toString();
        } catch {
          throw Object.assign(new Error(`Invalid redirect location: ${current.slice(0, 200)}`), {
            statusCode: 502,
          });
        }
        if (current.length > MAX_FETCH_URL_CHARS) {
          throw Object.assign(
            new Error(`Redirect target exceeds size limit: ${current.slice(0, 200)}`),
            {
              statusCode: 502,
            },
          );
        }
        continue;
      }
      if (!response.ok) {
        // Release the socket before throwing: otherwise the body stays
        // buffered and the FD is held until GC.
        await response.body?.cancel().catch(() => undefined);
        throw new Error(
          `Failed to fetch ${current.slice(0, 200)}: ${response.status} ${response.statusText}`,
        );
      }
      // Re-validate after headers arrive (same TOCTOU guard as the server): a
      // TTL-0 rebinding attack must win the race twice to exfiltrate, and a
      // flipped answer discards the body before it is ever used.
      try {
        await validateResolvedHost(new URL(current).hostname, "url", options.signal);
      } catch (error) {
        await response.body?.cancel().catch(() => undefined);
        throw error;
      }
      return await readCappedText(
        response,
        maxBytes,
        options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
      );
    } catch (error) {
      if (options.signal?.aborted) {
        throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
      }
      // Per-fetch timeouts surface as a bare `AbortError` (no statusCode): map
      // them to 504 like the server `fetchCappedText` so callers see a timeout
      // instead of a raw abort leak. The message keeps "aborted" so existing
      // `/abort/i` assertions still match while carrying the timeout context.
      if (error instanceof Error && error.name === "AbortError") {
        throw Object.assign(new Error(`Fetch timed out (aborted): ${current.slice(0, 200)}`), {
          statusCode: 504,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onOuterAbort);
    }
  }
  throw Object.assign(new Error(`Too many redirects: ${url.slice(0, 200)}`), { statusCode: 502 });
}

/** Read a local subscription/config file as text. */
export async function readSubscriptionFile(path: string): Promise<string> {
  return readFile(path, "utf-8");
}

/** Write generated output to a local file. */
export async function writeOutputFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf-8");
}

/** A subscription source: a URL, a local path, or an inline body. */
export type SubscriptionSource =
  | { kind: "url"; url: string; headers?: Record<string, string> }
  | { kind: "file"; path: string }
  | { kind: "text"; text: string };

/** Resolve any {@link SubscriptionSource} to raw text. */
export async function resolveSubscription(
  source: SubscriptionSource,
  signal?: AbortSignal,
): Promise<string> {
  switch (source.kind) {
    case "url":
      return fetchSubscription(source.url, { headers: source.headers, signal });
    case "file":
      if (signal?.aborted) {
        throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
      }
      return readSubscriptionFile(source.path);
    case "text":
      if (signal?.aborted) {
        throw Object.assign(new Error("Request timed out"), { statusCode: 504 });
      }
      return source.text;
    default:
      throw new Error("Unknown subscription source");
  }
}

/** Load and parse a subscription source into proxy nodes (tagged with `groupId`). */
export async function loadNodes(
  source: SubscriptionSource,
  groupId = 0,
  signal?: AbortSignal,
): Promise<Proxy[]> {
  return parseSubscription(await resolveSubscription(source, signal), groupId);
}
