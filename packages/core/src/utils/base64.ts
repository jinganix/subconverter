const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_URLSAFE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64_ALPHABET.length; i += 1) {
  B64_LOOKUP[B64_ALPHABET[i] as string] = i;
}
B64_LOOKUP["-"] = 62;
B64_LOOKUP["_"] = 63;

/** UTF-8 encode a string to bytes (browser + Node safe). */
export function utf8Encode(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

/** Decode UTF-8 bytes back to a string. */
export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function encodeWithAlphabet(input: string, alphabet: string): string {
  const bytes = utf8Encode(input);
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    output += alphabet[(triple >> 18) & 0x3f];
    output += alphabet[(triple >> 12) & 0x3f];
    output += i + 1 < bytes.length ? alphabet[(triple >> 6) & 0x3f] : "=";
    output += i + 2 < bytes.length ? alphabet[triple & 0x3f] : "=";
  }
  return output;
}

function decodeBytes(input: string): Uint8Array {
  const normalized = input.replace(/\s+/g, "");
  const clean = normalized.replace(/=+$/, "");
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = B64_LOOKUP[char];
    if (value === undefined) {
      continue;
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** Standard base64 encode (with padding). */
export function base64Encode(input: string): string {
  return encodeWithAlphabet(input, B64_ALPHABET);
}

/** URL-safe base64 encode without padding. */
export function urlSafeBase64Encode(input: string): string {
  return encodeWithAlphabet(input, B64_URLSAFE_ALPHABET).replace(/=+$/, "");
}

/** Standard base64 decode; tolerant of URL-safe input and missing padding. */
export function base64Decode(input: string): string {
  return utf8Decode(decodeBytes(input));
}

/** URL-safe base64 decode; alias of {@link base64Decode} (same tolerance). */
export function urlSafeBase64Decode(input: string): string {
  return base64Decode(input);
}

/**
 * Best-effort base64 decode used for subscription bodies: subconverter expects
 * a base64 blob but real-world providers sometimes serve plain text.
 */
export function tryBase64Decode(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") {
    return "";
  }
  if (!/^[A-Za-z0-9+/\-_=\s]+$/.test(trimmed)) {
    return input;
  }
  try {
    const decoded = base64Decode(trimmed);
    return decoded.includes("\uFFFD") ? input : decoded;
  } catch {
    return input;
  }
}
