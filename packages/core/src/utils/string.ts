/** Strip a leading UTF-8 BOM (some providers serve one). */
export function stripBom(input: string): string {
  return input.startsWith("\uFEFF") ? input.slice(1) : input;
}

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
  const match = /^\s*[+-]?\d+/.exec(value);
  if (!match) {
    return 0;
  }
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Maximum length for a user-supplied regex pattern (ReDoS guard). */
export const MAX_USER_PATTERN_LENGTH = 100;

/**
 * `true` when a user-supplied regex pattern risks catastrophic backtracking:
 * over the length cap, containing nested quantifiers, or piling up too many
 * quantified atoms. Callers should reject such patterns instead of compiling
 * them.
 *
 * Detects nested quantifiers with a linear stack scan instead of a regex:
 * a group `(`...`)` that is itself quantified (`*`/`+`/`?`/`{` follows the
 * closing paren) and contains a quantified token inside (e.g. `((a+))+`
 * defeats `[^)]*`-based guards because the inner `)` breaks the match).
 * Consecutive quantifiers from the legacy guard (`++`, `*+`, `+*`) are
 * rejected too; lazy forms (`+?`, `*?`, `??`) stay allowed. Escapes and
 * character classes are skipped so literals like `\+` or `[+]` stay safe.
 *
 * Sequential quantified atoms (`a*a*a*...`) are budgeted: more than two
 * unescaped/unclassed `*`/`+`/`?`/`{` (group quantifiers included) is unsafe.
 * The budget keeps common filters (`\d+`, `(ab)+`, `香港|HK`) working
 * while blocking partition explosions (`a*` x 25 vs `a` x 30, `a*a*a*b`
 * on `a` x 20000 which is O(n^3) with three atoms).
 */
export function isUnsafeRegexPattern(pattern: string): boolean {
  if (pattern.length > MAX_USER_PATTERN_LENGTH) {
    return true;
  }
  const groupStarts: number[] = [];
  let escaped = false;
  let inClass = false;
  let prevQuant: string | null = null;
  let quantCount = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i] as string;
    if (escaped) {
      escaped = false;
      prevQuant = null;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      prevQuant = null;
      continue;
    }
    if (inClass) {
      if (c === "]") {
        inClass = false;
      }
      prevQuant = null;
      continue;
    }
    if (c === "[") {
      inClass = true;
      prevQuant = null;
      continue;
    }
    if (c === "(") {
      groupStarts.push(i);
      prevQuant = null;
      continue;
    }
    if (c === ")") {
      const start = groupStarts.pop();
      const next = pattern[i + 1] as string | undefined;
      const quantified = next === "*" || next === "+" || next === "?" || next === "{";
      if (quantified && start !== undefined) {
        let innerEscaped = false;
        let innerClass = false;
        let innerDepth = 0;
        for (let j = start + 1; j < i; j += 1) {
          const d = pattern[j] as string;
          if (innerEscaped) {
            innerEscaped = false;
            continue;
          }
          if (d === "\\") {
            innerEscaped = true;
            continue;
          }
          if (innerClass) {
            if (d === "]") {
              innerClass = false;
            }
            continue;
          }
          if (d === "[") {
            innerClass = true;
            continue;
          }
          if (d === "(") {
            innerDepth += 1;
            continue;
          }
          if (d === ")") {
            if (innerDepth > 0) {
              innerDepth -= 1;
            }
            continue;
          }
          // Skip the `?` of a `(?:…)`, `(?=…)`, `(?!…)` opener: it is group
          // syntax, not a quantifier.
          if (d === "?" && pattern[j - 1] === "(") {
            continue;
          }
          if (d === "*" || d === "+" || d === "?" || d === "{") {
            return true;
          }
          // Alternation at the group's own level (`(a|aa)+$`) can overlap
          // and backtrack exponentially; kept from the legacy guard.
          if (d === "|" && innerDepth === 0) {
            return true;
          }
        }
      }
      if (quantified) {
        quantCount += 1;
        if (quantCount > 2) {
          return true;
        }
        // Consume the group's own quantifier so it cannot trip the
        // consecutive check below; a further quantifier (`(...)+*`) still
        // does via `prevQuant`.
        if (next === "{") {
          let k = i + 2;
          while (k < pattern.length && pattern[k] !== "}") {
            k += 1;
          }
          i = k;
        } else {
          i += 1;
        }
        prevQuant = next ?? null;
      } else {
        prevQuant = null;
      }
      continue;
    }
    if (c === "*" || c === "+" || c === "?") {
      // The `?` of a `(?:…)`, `(?=…)`, `(?!…)` opener is group syntax,
      // not a quantifier, so it does not spend the atom budget. Likewise a
      // lazy trailing `?` (`+?`/`*?`/`??`/`{m,n}?`) modifies the preceding
      // atom instead of adding a new one (`^abc@(.+?)\..*$` is two atoms,
      // not three), so it does not spend the budget either.
      const isGroupSyntax = c === "?" && i > 0 && pattern[i - 1] === "(";
      const prev = i > 0 ? pattern[i - 1] : "";
      const isLazy = c === "?" && (prev === "*" || prev === "+" || prev === "?" || prev === "}");
      if (!(isGroupSyntax || isLazy)) {
        quantCount += 1;
        if (quantCount > 2) {
          return true;
        }
      }
      if ((prevQuant === "+" && (c === "+" || c === "*")) || (prevQuant === "*" && c === "+")) {
        return true;
      }
      prevQuant = c;
      continue;
    }
    if (c === "{") {
      quantCount += 1;
      if (quantCount > 2) {
        return true;
      }
      prevQuant = c;
      continue;
    }
    prevQuant = null;
  }
  return false;
}

/** Parse a boolean-ish value ("true"/"yes"/"1"/"on" and the matching negatives). */
export function toBool(value: string | undefined | null): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
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
 * An empty `replacement` removes the matches. Invalid patterns leave the
 * input untouched instead of throwing (rules come from configs and URLs).
 */
export function regReplace(input: string, pattern: string, replacement = ""): string {
  try {
    return input.replace(new RegExp(pattern, "g"), replacement);
  } catch {
    return input;
  }
}

/** `true` when `pattern` (a JS regex source) matches anywhere in `input`. */
export function regMatch(input: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(input);
  } catch {
    return false;
  }
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
