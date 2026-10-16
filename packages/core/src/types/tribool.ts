/**
 * A three-valued boolean mirroring subconverter's `tribool`.
 *
 * `undefined` means "unspecified" and callers decide whether to apply a
 * default; `true`/`false` are explicit overrides (e.g. from URL parameters).
 */
export type TriBool = boolean | undefined;

/** Treat `undefined` as `false`. */
export function triBoolOr(value: TriBool, fallback: boolean): boolean {
  return value === undefined ? fallback : value;
}

/** Parse a loose string (e.g. `"1"`, `"true"`, `"0"`) into a {@link TriBool}. */
export function parseTriBool(value: string | undefined | null): TriBool {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}
