/**
 * FNV-1a 64-bit hash, matching subconverter's `hash_` (used for WireGuard
 * section names and other deterministic identifiers).
 */
export function fnv1a64(input: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const char of input) {
    hash ^= BigInt(char.codePointAt(0) as number);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash;
}

/** Lowercase hex representation of {@link fnv1a64}. */
export function fnv1a64Hex(input: string): string {
  return fnv1a64(input).toString(16);
}
