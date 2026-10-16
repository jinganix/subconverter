/** Shadowsocks AEAD/stream ciphers recognized by the parser. */
export const SS_CIPHERS = [
  "2022-blake3-aes-128-gcm",
  "2022-blake3-aes-256-gcm",
  "2022-blake3-chacha20-poly1305",
  "2022-blake3-chacha12-poly1305",
  "2022-blake3-chacha8-poly1305",
  "aes-128-cfb",
  "aes-128-ctr",
  "aes-128-gcm",
  "aes-192-cfb",
  "aes-192-ctr",
  "aes-192-gcm",
  "aes-256-cfb",
  "aes-256-ctr",
  "aes-256-gcm",
  "bf-cfb",
  "camellia-128-cfb",
  "camellia-192-cfb",
  "camellia-256-cfb",
  "chacha20",
  "chacha20-ietf",
  "chacha20-ietf-poly1305",
  "rc4-md5",
  "salsa20",
  "xchacha20-ietf-poly1305",
];

/** ShadowsocksR stream ciphers recognized by the parser. */
export const SSR_CIPHERS = [
  "aes-128-cfb",
  "aes-128-ctr",
  "aes-192-cfb",
  "aes-192-ctr",
  "aes-256-cfb",
  "aes-256-ctr",
  "bf-cfb",
  "camellia-128-cfb",
  "camellia-192-cfb",
  "camellia-256-cfb",
  "cast5-cfb",
  "chacha20",
  "chacha20-ietf",
  "des-cfb",
  "idea-cfb",
  "none",
  "rc2-cfb",
  "rc4",
  "rc4-md5",
  "salsa20",
  "seed-cfb",
  "table",
];

/** `true` when `cipher` is a Shadowsocks cipher. */
export function isSsCipher(cipher: string): boolean {
  return SS_CIPHERS.includes(cipher.toLowerCase());
}

/**
 * True when an SSR node can be flattened to plain Shadowsocks: a known SS
 * cipher with no meaningful obfs/protocol. Mirrors subparser.cpp:713.
 */
export function isFlattenableSsr(method: string, obfs: string, protocol: string): boolean {
  return (
    isSsCipher(method) &&
    (obfs === "" || obfs === "plain") &&
    (protocol === "" || protocol === "origin")
  );
}
