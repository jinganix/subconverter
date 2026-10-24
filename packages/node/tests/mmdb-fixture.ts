/**
 * Minimal MaxMind DB writer used by tests.
 *
 * Emits a valid `.mmdb` file containing only the IPv4 prefixes and country
 * codes requested, so GeoIP tests run offline without a GeoLite2 download.
 * See https://maxmind.github.io/MaxMind-DB/ for the binary format.
 */

const METADATA_MARKER = Buffer.from("abcdef4d61784d696e642e636f6d", "hex");

function controlByte(type: number, size: number): Buffer {
  if (size >= 29) {
    throw new Error(`fixture writer only supports payloads < 29 bytes (got ${String(size)})`);
  }
  if (type <= 7) {
    return Buffer.from([(type << 5) | size]);
  }
  // Extended types (8..15) use a zero type field plus a trailing type byte.
  return Buffer.from([size, type - 7]);
}

function encodeString(value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  return Buffer.concat([controlByte(2, body.length), body]);
}

function encodeUint(value: number, type: 5 | 6 | 9): Buffer {
  const bytes: number[] = [];
  let rest = value;
  do {
    bytes.unshift(rest & 0xff);
    rest = Math.floor(rest / 256);
  } while (rest > 0);
  if (type === 9) {
    while (bytes.length < 8) {
      bytes.unshift(0);
    }
  }
  return Buffer.concat([controlByte(type, bytes.length), Buffer.from(bytes)]);
}

type Encodable = Buffer;

function encodeMap(entries: Array<[string, Encodable]>): Buffer {
  return Buffer.concat([
    controlByte(7, entries.length),
    ...entries.flatMap(([key, value]) => [encodeString(key), value]),
  ]);
}

function encodeArray(items: Encodable[]): Buffer {
  return Buffer.concat([controlByte(11, items.length), ...items]);
}

function countryRecord(code: string): Buffer {
  return encodeMap([
    ["country", encodeMap([["iso_code", encodeString(code)]])],
    ["registered_country", encodeMap([["iso_code", encodeString(code)]])],
  ]);
}

function ipv4Bits(ip: string): number[] {
  return ip.split(".").flatMap((part) => {
    const octet = Number.parseInt(part, 10);
    return [7, 6, 5, 4, 3, 2, 1, 0].map((shift) => (octet >> shift) & 1);
  });
}

/**
 * Build a DB mapping each `ip -> code` entry to a country record.
 * Prefixes are exact `/32` entries; other addresses resolve to "not found".
 */
export function buildGeoIpFixture(entries: Record<string, string>): Buffer {
  // Build a trie of bit arrays so lookup walks the same structure MaxMind uses.
  interface TrieNode {
    left?: TrieNode;
    right?: TrieNode;
    code?: string;
  }
  const root: TrieNode = {};
  for (const [ip, code] of Object.entries(entries)) {
    let node = root;
    for (const bit of ipv4Bits(ip)) {
      node = bit === 1 ? (node.right ??= {}) : (node.left ??= {});
    }
    node.code = code;
  }

  // Number the trie nodes in DFS order; 0 is the root (MMDB root node index).
  const ordered: TrieNode[] = [];
  const index = new Map<TrieNode, number>();
  const visit = (node: TrieNode): void => {
    index.set(node, ordered.length);
    ordered.push(node);
    if (node.left) {
      visit(node.left);
    }
    if (node.right) {
      visit(node.right);
    }
  };
  visit(root);

  const nodeCount = ordered.length;
  const dataChunks: Buffer[] = [];
  const dataOffset = new Map<string, number>();
  let dataLength = 0;
  for (const node of ordered) {
    if (node.code === undefined) {
      continue;
    }
    const record = countryRecord(node.code);
    dataOffset.set(node.code, dataLength);
    dataChunks.push(record);
    dataLength += record.length;
  }

  const tree = Buffer.alloc(nodeCount * 6);
  const recordFor = (child: TrieNode | undefined): number => {
    if (child === undefined) {
      return nodeCount;
    }
    if (child.code !== undefined && child.left === undefined && child.right === undefined) {
      // Point at the data section: 16-byte separator + record offset.
      return nodeCount + 16 + (dataOffset.get(child.code) as number);
    }
    return index.get(child) as number;
  };
  ordered.forEach((node, nodeIndex) => {
    const offset = nodeIndex * 6;
    tree.writeUIntBE(recordFor(node.left), offset, 3);
    tree.writeUIntBE(recordFor(node.right), offset + 3, 3);
  });

  const separator = Buffer.alloc(16);
  const data = Buffer.concat(dataChunks);
  const metadata = encodeMap([
    ["binary_format_major_version", encodeUint(2, 5)],
    ["binary_format_minor_version", encodeUint(0, 5)],
    ["build_epoch", encodeUint(0, 9)],
    ["database_type", encodeString("GeoLite2-Country")],
    ["description", encodeMap([["en", encodeString("fixture")]])],
    ["ip_version", encodeUint(4, 5)],
    ["languages", encodeArray([encodeString("en")])],
    ["node_count", encodeUint(nodeCount, 6)],
    ["record_size", encodeUint(24, 5)],
  ]);

  return Buffer.concat([tree, separator, data, METADATA_MARKER, metadata]);
}
