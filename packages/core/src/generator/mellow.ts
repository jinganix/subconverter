import { groupGenerate, processRemark } from "./nodes";
import { rulesetToSurgeRules } from "./ruleset";
import type { Proxy } from "../types/proxy";
import { ProxyType, proxyTypeName } from "../types/proxy";
import type { ProxyGroupConfig } from "../types/proxy-group";
import type { RulesetContent } from "../types/ruleset";
import type { ExtraSettings } from "../types/settings";
import { urlSafeBase64Encode } from "../utils/base64";
import { parseRawIni, renderRawIni, setRawSection, type RawIniSection } from "../utils/ini";
import { urlEncode } from "../utils/url";

function buildMellowEndpoint(x: Proxy, remark: string): string | undefined {
  const hostname = x.hostname;
  const port = String(x.port);
  switch (x.type) {
    case ProxyType.Shadowsocks:
      if (x.plugin !== "") {
        return undefined;
      }
      return `${remark}, ss, ss://${urlSafeBase64Encode(`${x.encryptMethod}:${x.password}`)}@${hostname}:${port}`;
    case ProxyType.VMess: {
      let proxy = `${remark}, vmess1, vmess1://${x.userId}@${hostname}:${port}`;
      if (x.path !== "") {
        proxy += x.path;
      }
      proxy += `?network=${x.transferProtocol}`;
      switch (x.transferProtocol) {
        case "ws":
          proxy += `&ws.host=${urlEncode(x.host)}`;
          break;
        case "http":
          if (x.host !== "") {
            proxy += `&http.host=${urlEncode(x.host)}`;
          }
          break;
        case "quic":
          if (x.quicSecure !== "" || x.quicSecret !== "") {
            proxy += `&quic.security=${x.quicSecure}&quic.key=${x.quicSecret}`;
          }
          break;
        default:
          break;
      }
      proxy += `&tls=${x.tlsSecure ? "true" : "false"}`;
      if (x.tlsSecure && x.host !== "") {
        proxy += `&tls.servername=${urlEncode(x.host)}`;
      }
      if (x.allowInsecure !== undefined) {
        proxy += `&tls.allowinsecure=${x.allowInsecure ? "true" : "false"}`;
      }
      if (x.tcpFastOpen !== undefined) {
        proxy += `&sockopt.tcpfastopen=${x.tcpFastOpen ? "true" : "false"}`;
      }
      return proxy;
    }
    case ProxyType.SOCKS5:
      return `${remark}, builtin, socks, address=${hostname}, port=${port}, user=${x.username}, pass=${x.password}`;
    case ProxyType.HTTP:
      return `${remark}, builtin, http, address=${hostname}, port=${port}, user=${x.username}, pass=${x.password}`;
    default:
      return undefined;
  }
}

function buildMellowGroups(
  extraProxyGroup: ProxyGroupConfig[],
  nodelist: Proxy[],
  remarks: string[],
): string[] {
  const lines: string[] = [];
  for (const group of extraProxyGroup) {
    switch (group.type) {
      case "select":
      case "url-test":
      case "fallback":
      case "load-balance":
        break;
      default:
        continue;
    }
    const filtered: string[] = [];
    for (const rule of group.proxies) {
      groupGenerate(rule, nodelist, filtered, false);
    }
    if (filtered.length === 0) {
      if (remarks.length === 0) {
        filtered.push("DIRECT");
      } else {
        filtered.push(...remarks);
      }
    }
    lines.push(`${group.name}, ${filtered.join(":")}, latency, interval=300, timeout=6`);
  }
  return lines;
}

export interface MellowOptions {
  baseConf: string;
  nodeList: boolean;
  rulesets?: RulesetContent[];
  overwriteOriginalRules?: boolean;
}

/** Convert nodes into a Mellow (`mellow.conf`) configuration string. */
export function toMellow(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: MellowOptions,
): string {
  const remarksList: string[] = [];
  const endpoints: string[] = [];
  const nodelist: Proxy[] = [];

  for (const x of nodes) {
    if (settings.appendProxyType) {
      x.remark = `[${proxyTypeName(x.type)}] ${x.remark}`;
    }
    const remark = processRemark(x.remark, remarksList);
    x.remark = remark;
    const line = buildMellowEndpoint(x, remark);
    if (line === undefined) {
      continue;
    }
    endpoints.push(line);
    remarksList.push(remark);
    nodelist.push(x);
  }

  if (options.nodeList) {
    return endpoints.join("\n");
  }

  const sections: RawIniSection[] = options.baseConf === "" ? [] : parseRawIni(options.baseConf);
  const append = (name: string, lines: string[]): void => {
    if (lines.length === 0) {
      return;
    }
    const existing = sections.find((section) => section.name === name);
    if (existing && !(options.overwriteOriginalRules ?? true)) {
      existing.lines.push(...lines);
    } else {
      setRawSection(sections, name, lines);
    }
  };
  append("Endpoint", endpoints);
  append("EndpointGroup", buildMellowGroups(extraProxyGroup, nodelist, remarksList));
  if (options.rulesets && options.rulesets.length > 0) {
    const rules = rulesetToSurgeRules(options.rulesets, 0);
    append(rules.section, rules.lines);
  }
  return renderRawIni(sections);
}
