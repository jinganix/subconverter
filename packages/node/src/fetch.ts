import { type Proxy, parseSubscription } from "@subconverter/core";
import { readFile, writeFile } from "node:fs/promises";

/** Options for {@link fetchSubscription}. */
export interface LoadOptions {
  /** Optional request headers (e.g. `User-Agent`, `Authorization`). */
  headers?: Record<string, string>;
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
  /** Abort when the response body exceeds this many bytes. */
  maxBytes?: number;
}

/** Default cap for a single fetched body (mirrors the server limit). */
export const MAX_FETCH_BYTES = 5 * 1024 * 1024;

/**
 * Read a `Response` body as text while enforcing `maxBytes`.
 * Shared by `fetchSubscription` and the HTTP server so both entrypoints
 * enforce the same cap with the same semantics.
 */
export async function readCappedText(response: Response, maxBytes: number): Promise<string> {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader !== null) {
    const declared = Number.parseInt(lengthHeader.trim(), 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw Object.assign(new Error("Response body exceeds size limit"), { statusCode: 502 });
    }
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxBytes) {
      throw Object.assign(new Error("Response body exceeds size limit"), { statusCode: 502 });
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
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
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Fetch a remote subscription body as text. */
export async function fetchSubscription(url: string, options: LoadOptions = {}): Promise<string> {
  const controller = new AbortController();
  const timeout = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "subconverter-ts", ...options.headers },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return readCappedText(response, options.maxBytes ?? MAX_FETCH_BYTES);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
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
export async function resolveSubscription(source: SubscriptionSource): Promise<string> {
  switch (source.kind) {
    case "url":
      return fetchSubscription(source.url, { headers: source.headers });
    case "file":
      return readSubscriptionFile(source.path);
    case "text":
      return source.text;
    default:
      throw new Error("Unknown subscription source");
  }
}

/** Load and parse a subscription source into proxy nodes (tagged with `groupId`). */
export async function loadNodes(source: SubscriptionSource, groupId = 0): Promise<Proxy[]> {
  return parseSubscription(await resolveSubscription(source), groupId);
}
