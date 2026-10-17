/** Proxy group kinds, mirroring subconverter's `ProxyGroupType`. */
export enum ProxyGroupType {
  Select = "select",
  URLTest = "url-test",
  Fallback = "fallback",
  LoadBalance = "load-balance",
  Relay = "relay",
  SSID = "ssid",
  Smart = "smart",
}

/** Load-balance strategy, mirroring `BalanceStrategy`. */
export enum BalanceStrategy {
  ConsistentHashing = "consistent-hashing",
  RoundRobin = "round-robin",
}

/** A configured proxy group (`[Proxy Group]` entries). */
export interface ProxyGroupConfig {
  name: string;
  type: ProxyGroupType;
  proxies: string[];
  usingProvider: string[];
  url: string;
  interval: number;
  timeout: number;
  tolerance: number;
  strategy: BalanceStrategy;
  lazy: boolean | undefined;
  disableUdp: boolean | undefined;
  persistent: boolean | undefined;
  evaluateBeforeUse: boolean | undefined;
}

/** Create a proxy group with subconverter's default field values. */
export function createProxyGroupConfig(): ProxyGroupConfig {
  return {
    disableUdp: undefined,
    evaluateBeforeUse: undefined,
    interval: 0,
    lazy: undefined,
    name: "",
    persistent: undefined,
    proxies: [],
    strategy: BalanceStrategy.ConsistentHashing,
    timeout: 0,
    tolerance: 0,
    type: ProxyGroupType.Select,
    url: "",
    usingProvider: [],
  };
}

/**
 * Create one select group that fans out to every proxy type, mirroring the
 * CLI `--group` flag and the server `group` param. Shared so both
 * entrypoints build byte-identical groups.
 */
export function createSelectGroup(name: string): ProxyGroupConfig {
  return {
    disableUdp: undefined,
    evaluateBeforeUse: undefined,
    interval: 0,
    lazy: undefined,
    name,
    persistent: undefined,
    proxies: ["[]DIRECT", "!!TYPE=SS", "!!TYPE=SSR", "!!TYPE=VMESS", "!!TYPE=TROJAN"],
    strategy: BalanceStrategy.ConsistentHashing,
    timeout: 0,
    tolerance: 0,
    type: ProxyGroupType.Select,
    url: "",
    usingProvider: [],
  };
}

/** Resolve a textual group type (as found in config files). */
export function parseProxyGroupType(value: string): ProxyGroupType | undefined {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "select":
      return ProxyGroupType.Select;
    case "url-test":
      return ProxyGroupType.URLTest;
    case "fallback":
      return ProxyGroupType.Fallback;
    case "load-balance":
      return ProxyGroupType.LoadBalance;
    case "relay":
      return ProxyGroupType.Relay;
    case "ssid":
      return ProxyGroupType.SSID;
    case "smart":
      return ProxyGroupType.Smart;
    default:
      return undefined;
  }
}
