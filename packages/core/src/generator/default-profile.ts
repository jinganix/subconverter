import type { ProxyGroupConfig } from "../types/proxy-group";
import { BalanceStrategy, ProxyGroupType } from "../types/proxy-group";
import type { RulesetConfig, RulesetContent } from "../types/ruleset";
import { RulesetType } from "../types/ruleset";

const TEST_URL = "http://www.gstatic.com/generate_204";

function group(
  name: string,
  type: ProxyGroupType,
  proxies: string[],
  extra: Partial<ProxyGroupConfig> = {},
): ProxyGroupConfig {
  return {
    disableUdp: undefined,
    evaluateBeforeUse: undefined,
    interval: 0,
    lazy: undefined,
    name,
    persistent: undefined,
    proxies: [...proxies],
    strategy: BalanceStrategy.ConsistentHashing,
    timeout: 5,
    tolerance: 0,
    type,
    url: "",
    usingProvider: [],
    ...extra,
  };
}

/**
 * Bundled default proxy groups, mirroring upstream `ACL4SSR.ini`
 * (`tindy2013/subconverter/base/config/ACL4SSR.ini`).
 *
 * Used only when `generate(..., { includeRules: true })` is set and the caller
 * did not provide explicit groups. Kept offline so the core engine stays
 * platform-free (no fetch required).
 */
export function getDefaultProxyGroups(): ProxyGroupConfig[] {
  return [
    group("🚀 节点选择", ProxyGroupType.Select, ["[]♻️ 自动选择", "[]DIRECT", ".*"]),
    group("♻️ 自动选择", ProxyGroupType.URLTest, [".*"], {
      interval: 300,
      tolerance: 50,
      url: TEST_URL,
    }),
    group("🌍 国外媒体", ProxyGroupType.Select, [
      "[]🚀 节点选择",
      "[]♻️ 自动选择",
      "[]🎯 全球直连",
      ".*",
    ]),
    group("📲 电报信息", ProxyGroupType.Select, ["[]🚀 节点选择", "[]🎯 全球直连", ".*"]),
    group("Ⓜ️ 微软服务", ProxyGroupType.Select, ["[]🎯 全球直连", "[]🚀 节点选择", ".*"]),
    group("🍎 苹果服务", ProxyGroupType.Select, ["[]🚀 节点选择", "[]🎯 全球直连", ".*"]),
    group("🎯 全球直连", ProxyGroupType.Select, ["[]DIRECT", "[]🚀 节点选择", "[]♻️ 自动选择"]),
    group("🛑 全球拦截", ProxyGroupType.Select, ["[]REJECT", "[]DIRECT"]),
    group("🍃 应用净化", ProxyGroupType.Select, ["[]REJECT", "[]DIRECT"]),
    group("🐟 漏网之鱼", ProxyGroupType.Select, [
      "[]🚀 节点选择",
      "[]🎯 全球直连",
      "[]♻️ 自动选择",
      ".*",
    ]),
  ];
}

/** Inline `[]RULE` content helper (no remote fetch needed). */
function inline(group: string, rule: string): RulesetContent {
  return {
    content: `[]${rule}`,
    ruleGroup: group,
    rulePath: "",
    rulePathTyped: "",
    ruleType: RulesetType.Surge,
    updateInterval: 86400,
  };
}

function surge(group: string, lines: string[]): RulesetContent {
  return {
    content: lines.join("\n"),
    ruleGroup: group,
    rulePath: "",
    rulePathTyped: "",
    ruleType: RulesetType.Surge,
    updateInterval: 86400,
  };
}

/**
 * Bundled offline default rules, mirroring the structure of upstream
 * `ACL4SSR.ini` + its `rules/ACL4SSR` lists (LAN/China direct, ad reject,
 * messenger/media proxy, final catch-all).
 *
 * These are intentionally compact (≈60 rules) so `includeRules: true` works
 * without network access. Callers needing the full upstream lists should pass
 * explicit {@link RulesetContent} (or {@link getDefaultRulesetConfigs} via the
 * Node adapter, which fetches the remote lists).
 */
export function getDefaultRulesets(): RulesetContent[] {
  return [
    surge("🎯 全球直连", [
      "DOMAIN-SUFFIX,localhost",
      "DOMAIN,localhost",
      "IP-CIDR,127.0.0.0/8",
      "IP-CIDR,10.0.0.0/8",
      "IP-CIDR,172.16.0.0/12",
      "IP-CIDR,192.168.0.0/16",
      "IP-CIDR,224.0.0.0/4",
      "DOMAIN-SUFFIX,cn",
      "DOMAIN-SUFFIX,126.com",
      "DOMAIN-SUFFIX,163.com",
      "DOMAIN-SUFFIX,qq.com",
      "DOMAIN-SUFFIX,baidu.com",
      "DOMAIN-SUFFIX,alibaba.com",
      "DOMAIN-SUFFIX,taobao.com",
    ]),
    surge("🛑 全球拦截", [
      "DOMAIN-SUFFIX,doubleclick.net",
      "DOMAIN-SUFFIX,googlesyndication.com",
      "DOMAIN-SUFFIX,googleadservices.com",
      "DOMAIN-SUFFIX,ads.yahoo.com",
      "DOMAIN-KEYWORD,adservice",
      "DOMAIN-KEYWORD,advertising",
    ]),
    surge("🍃 应用净化", [
      "DOMAIN-SUFFIX,app-measurement.com",
      "DOMAIN-SUFFIX,crashlytics.com",
      "DOMAIN-KEYWORD,analytics",
      "DOMAIN-KEYWORD,tracking",
    ]),
    surge("🌍 国外媒体", [
      "DOMAIN-SUFFIX,netflix.com",
      "DOMAIN-SUFFIX,nflxvideo.net",
      "DOMAIN-SUFFIX,youtube.com",
      "DOMAIN-SUFFIX,googlevideo.com",
      "DOMAIN-SUFFIX,disneyplus.com",
      "DOMAIN-SUFFIX,spotify.com",
      "DOMAIN-SUFFIX,tiktok.com",
    ]),
    surge("📲 电报信息", [
      "DOMAIN-SUFFIX,telegram.org",
      "DOMAIN-SUFFIX,t.me",
      "DOMAIN-SUFFIX,telegram.me",
      "IP-CIDR,149.154.160.0/20",
      "IP-CIDR,91.108.4.0/22",
    ]),
    surge("Ⓜ️ 微软服务", [
      "DOMAIN-SUFFIX,microsoft.com",
      "DOMAIN-SUFFIX,windows.com",
      "DOMAIN-SUFFIX,office.com",
      "DOMAIN-SUFFIX,live.com",
    ]),
    surge("🍎 苹果服务", [
      "DOMAIN-SUFFIX,apple.com",
      "DOMAIN-SUFFIX,icloud.com",
      "DOMAIN-SUFFIX,apple-cloudkit.com",
    ]),
    surge("🚀 节点选择", ["DOMAIN-SUFFIX,google.com", "DOMAIN-SUFFIX,github.com"]),
    inline("🎯 全球直连", "GEOIP,CN"),
    inline("🐟 漏网之鱼", "FINAL"),
  ];
}

/**
 * Remote ruleset configs matching upstream `ACL4SSR.ini` for callers that can
 * fetch (Node adapter / CLI `--config`). Paths follow the public ACL4SSR
 * mirror; `collectRulesets` in `@subconverter/node` resolves them.
 */
export function getDefaultRulesetConfigs(): RulesetConfig[] {
  const base = "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash";
  const list = (group: string, file: string): RulesetConfig => ({
    group,
    interval: 86400,
    url: `${base}/${file}`,
  });
  return [
    list("🎯 全球直连", "LocalAreaNetwork.list"),
    list("🛑 全球拦截", "BanAD.list"),
    list("🍃 应用净化", "BanProgramAD.list"),
    list("🎯 全球直连", "GoogleCN.list"),
    list("Ⓜ️ 微软服务", "Microsoft.list"),
    list("🍎 苹果服务", "Apple.list"),
    list("🌍 国外媒体", "ProxyMedia.list"),
    list("📲 电报信息", "Telegram.list"),
    list("🚀 节点选择", "ProxyLite.list"),
    list("🎯 全球直连", "ChinaDomain.list"),
    list("🎯 全球直连", "ChinaCompanyIp.list"),
    { group: "🎯 全球直连", interval: 86400, url: "[]GEOIP,CN" },
    { group: "🐟 漏网之鱼", interval: 86400, url: "[]FINAL" },
  ];
}
