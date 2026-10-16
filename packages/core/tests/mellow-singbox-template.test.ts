import { describe, expect, it } from "vitest";

import type { Proxy, RulesetContent } from "../src/index";
import {
  ProxyGroupType,
  RulesetType,
  TargetFormat,
  createExtraSettings,
  createProxy,
  createProxyGroupConfig,
  generate,
  parseExternalConfig,
  renderTemplate,
  rulesetToSingBoxRules,
  templateVariableNames,
  toMellow,
  toSingBox,
  vmessConstruct,
  ssConstruct,
  httpConstruct,
  socksConstruct,
  hasTemplatePlaceholders,
} from "../src/index";

function ss(remark = "SS"): Proxy {
  const n = createProxy();
  ssConstruct(n, {
    group: "G",
    method: "aes-256-gcm",
    password: "pw",
    port: 8388,
    remark,
    server: "1.1.1.1",
  });
  return n;
}

describe("Mellow generator", () => {
  it("emits Endpoint/EndpointGroup sections", () => {
    const settings = createExtraSettings();
    const vm = createProxy();
    vmessConstruct(vm, {
      add: "2.2.2.2",
      aid: "0",
      cipher: "auto",
      group: "G",
      host: "h",
      id: "uuid",
      net: "ws",
      path: "/p",
      port: 443,
      remark: "VM",
      tls: "tls",
    });
    const http = createProxy();
    httpConstruct(http, {
      group: "G",
      password: "pw",
      port: 8080,
      remark: "HP",
      server: "3.3.3.3",
      tls: false,
      username: "u",
    });
    const socks = createProxy();
    socksConstruct(socks, {
      group: "G",
      password: "pw",
      port: 1080,
      remark: "SK",
      server: "4.4.4.4",
      username: "u",
    });
    const out = toMellow([ss(), vm, http, socks], [], settings, { baseConf: "", nodeList: false });
    expect(out).toContain("[Endpoint]");
    expect(out).toContain("SS, ss, ss://");
    expect(out).toContain("VM, vmess1, vmess1://uuid@2.2.2.2:443/p?network=ws&ws.host=h&tls=true");
    expect(out).toContain("HP, builtin, http, address=3.3.3.3");
    expect(out).toContain("SK, builtin, socks, address=4.4.4.4");
  });

  it("builds groups and skips unsupported ones", () => {
    const settings = createExtraSettings();
    const group = createProxyGroupConfig();
    group.name = "Auto";
    group.type = ProxyGroupType.URLTest;
    group.proxies = ["!!TYPE=SS"];
    const relay = createProxyGroupConfig();
    relay.name = "relay";
    relay.type = "relay" as never;
    relay.proxies = ["!!TYPE=SS"];
    const out = toMellow([ss()], [group, relay], settings, { baseConf: "", nodeList: false });
    expect(out).toContain("[EndpointGroup]");
    expect(out).toContain("Auto, SS, latency, interval=300, timeout=6");
    expect(out).not.toContain("relay");
  });

  it("emits node lists and rulesets, preserving base config", () => {
    const settings = createExtraSettings();
    const list = toMellow([ss()], [], settings, { baseConf: "", nodeList: true });
    expect(list).toBe("SS, ss, ss://YWVzLTI1Ni1nY206cHc@1.1.1.1:8388");
    const rulesets: RulesetContent[] = [
      {
        content: "DOMAIN,example.com",
        ruleGroup: "G",
        rulePath: "",
        rulePathTyped: "",
        ruleType: RulesetType.Surge,
        updateInterval: 0,
      },
    ];
    const out = toMellow([ss()], [], settings, {
      baseConf: "[General]\nlog=trace",
      nodeList: false,
      rulesets,
    });
    expect(out).toContain("[General]");
    expect(out).toContain("log=trace");
    expect(out).toContain("[RoutingRule]");
    expect(out).toContain("DOMAIN,example.com,G");
  });

  it("dispatches through generate", () => {
    expect(generate([ss()], { target: TargetFormat.Mellow })).toContain("[Endpoint]");
  });
});

describe("sing-box rules", () => {
  function rs(content: string, ruleType = RulesetType.Surge, group = "G"): RulesetContent {
    return {
      content,
      ruleGroup: group,
      rulePath: "",
      rulePathTyped: "",
      ruleType,
      updateInterval: 0,
    };
  }

  it("converts rulesets into a route fragment", () => {
    const route = rulesetToSingBoxRules([
      rs("DOMAIN,example.com\nIP-CIDR,1.2.3.0/24\nBOGUS,x"),
      rs("[]FINAL", RulesetType.Surge, "Final"),
    ]);
    expect(route.rules[0]).toEqual({ outbound: "dns-out", protocol: "dns" });
    expect(route.rules[1]).toEqual({
      domain: ["example.com"],
      ip_cidr: ["1.2.3.0/24"],
      outbound: "G",
    });
    expect(route.final).toBe("Final");
  });

  it("handles inline matchers", () => {
    const route = rulesetToSingBoxRules([rs("[]DOMAIN,example.org", RulesetType.Surge, "D")]);
    expect(route.rules).toContainEqual({ domain: "example.org", outbound: "D" });
  });

  it("injects rules into sing-box output and re-parses", () => {
    const settings = createExtraSettings();
    const out = toSingBox([ss()], [], settings, {
      baseConf: "",
      nodeList: false,
      rulesets: [rs("DOMAIN,example.com")],
    });
    const doc = JSON.parse(out) as { route: { rules: unknown[]; final: string } };
    expect(doc.route.rules.length).toBeGreaterThan(0);
    expect(doc.route.final).toBe("");
  });
});

describe("template engine", () => {
  it("interpolates and detects variables", () => {
    const body = "port: {{ clash.dns.port }}\nname: {{name}}";
    expect(hasTemplatePlaceholders(body)).toBe(true);
    expect(renderTemplate(body, { "clash.dns.port": "5353", name: "x" })).toBe(
      "port: 5353\nname: x",
    );
    expect(renderTemplate("{{ missing }}", {})).toBe("");
    expect(templateVariableNames(body).sort()).toEqual(["clash.dns.port", "name"]);
    expect(hasTemplatePlaceholders("no vars")).toBe(false);
  });

  it("reads template variables from an external config", () => {
    const config = parseExternalConfig(
      "[custom]\nclash_rule_base=base/x.yml\n[template]\ntemplate_path=snippets\nclash.dns.port=5353",
    );
    expect(config.templatePath).toBe("snippets");
    expect(config.templateVars["clash.dns.port"]).toBe("5353");
  });
});

describe("generate dispatch includes all formats", () => {
  it("supports the full target matrix", () => {
    const targets = Object.values(TargetFormat).filter((t) => t !== TargetFormat.Auto);
    for (const target of targets) {
      const out = generate([ss()], { target });
      expect(typeof out).toBe("string");
    }
  });
});
