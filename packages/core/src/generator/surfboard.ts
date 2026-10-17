import { toSurge } from "./surge";
import type { Proxy } from "../types/proxy";
import { ProxyType } from "../types/proxy";
import type { ProxyGroupConfig } from "../types/proxy-group";
import type { ExtraSettings } from "../types/settings";

export interface SurfboardOptions {
  baseConf: string;
  nodeList: boolean;
  rules?: { section: string; lines: string[] };
}

/**
 * Convert nodes into a Surfboard configuration.
 *
 * Surfboard is Surge-compatible but drops Hysteria2/AnyTLS nodes while keeping the same
 * latest-Surge proxy-line format for the rest (SS/SSR-less VMess/Trojan/
 * SOCKS/HTTP subset). Reuse the Surge generator on the filtered node list
 * so proxy-line fixes stay in one place.
 */
export function toSurfboard(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: SurfboardOptions,
): string {
  const filtered = nodes.filter(
    (n) => n.type !== ProxyType.Hysteria2 && n.type !== ProxyType.AnyTLS,
  );
  return toSurge(filtered, extraProxyGroup, settings, {
    baseConf: options.baseConf,
    nodeList: options.nodeList,
    rules: options.rules,
    version: 5,
  });
}
