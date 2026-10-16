/** Trim ASCII whitespace from both ends. */
export function trim(input: string): string {
  return input.replace(/^\s+|\s+$/g, "");
}

/** Trim and lowercase. */
export function trimLowerCase(input: string): string {
  return trim(input).toLowerCase();
}

/** Parse the leading integer of a string; `0` when none is present. */
export function toInt(value: string | number | undefined | null): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  const match = /[+-]?\d+/.exec(value);
  if (!match) {
    return 0;
  }
  const parsed = Number.parseInt(match[0], 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Parse a boolean-ish value ("true"/"false"/"1"/"0"). */
export function toBool(value: string | undefined | null): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

/** `true` when `needle` occurs in `haystack`. */
export function strFind(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

/** `true` when `input` starts with `prefix`. */
export function startsWith(input: string, prefix: string): boolean {
  return input.startsWith(prefix);
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
export function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") {
    return 0;
  }
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Split a string on a literal delimiter, dropping trailing empties when asked. */
export function split(input: string, delimiter: string, removeEmpty = false): string[] {
  const parts = input.split(delimiter);
  return removeEmpty ? parts.filter((part) => part !== "") : parts;
}

/**
 * Replace every regex match, mirroring subconverter's `regReplace`.
 * An empty `replacement` removes the matches.
 */
export function regReplace(input: string, pattern: string, replacement = ""): string {
  return input.replace(new RegExp(pattern, "g"), replacement);
}

/** `true` when `pattern` (a JS regex source) matches anywhere in `input`. */
export function regMatch(input: string, pattern: string): boolean {
  return new RegExp(pattern).test(input);
}

/**
 * Replace distinct consecutive occurrences of `from` with `to`.
 * Kept for API parity; equivalent to a global literal replace.
 */
export function replaceAllDistinct(input: string, from: string, to: string): string {
  if (from === "") {
    return input;
  }
  return input.split(from).join(to);
}

/** `true` when the string is a dotted-quad IPv4 literal. */
export function isIpv4(input: string): boolean {
  const parts = input.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** `true` when the string is a bracketed/unbracketed IPv6 literal. */
export function isIpv6(input: string): boolean {
  return /^\[?[0-9A-Fa-f:]{2,}\]?$/.test(input) && input.includes(":");
}

/** `true` when the host is an IP literal (v4 or v6). */
export function isIp(input: string): boolean {
  return isIpv4(input) || isIpv6(input);
}

/** Pad a value to two digits. */
export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** `true` when the string is empty or only whitespace. */
export function isBlank(input: string | undefined | null): boolean {
  return input === undefined || input === null || trim(input) === "";
}
