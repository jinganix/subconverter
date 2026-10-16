import { describe, expect, it } from "vitest";

import { parseSubscription } from "../src/index";

describe("surge malformed and optional branches", () => {
  const surge = [
    "[Proxy]",
    "nokey",
    "customShort = custom, 1.1.1.1, 8388, aes-256-gcm",
    "customZero = custom, 1.1.1.1, 0, aes-256-gcm, pw, x, obfs=http, obfs-host=h, tfo=true, udp-relay=true",
    "customFull = custom, 1.1.1.1, 8388, aes-256-gcm, pw, x, obfs=http, obfs-host=h, tfo=true, udp-relay=true",
    "ssBadItem = ss, 1.1.1.1, 8388, encrypt-method=aes-256-gcm, password=pw, noequals",
    "ssTfo = ss, 1.1.1.1, 8388, encrypt-method=aes-256-gcm, password=pw, tfo=true, udp-relay=true",
    "ssObfsNoHost = ss, 1.1.1.1, 8388, encrypt-method=aes-256-gcm, password=pw, obfs=http",
    "ssScv = ss, 1.1.1.1, 8388, encrypt-method=aes-256-gcm, password=pw, skip-cert-verify=true",
    "socksShort = socks5, 1.1.1.1, 1080",
    "socksZero = socks5, 1.1.1.1, 0, u, p",
    "socksScv = socks5, 1.1.1.1, 1080, u, p, skip-cert-verify=true, tfo=true, udp-relay=true",
    "vmessZero = vmess, 1.1.1.1, 0, username=u",
    "vmessBad = vmess, 1.1.1.1, 443, username=u, noequals",
    "vmessWsOff = vmess, 1.1.1.1, 443, username=u, ws=false, tls=false",
    "vmessWsOn = vmess, 1.1.1.1, 443, username=u, ws=true, tls=true, ws-path=/p",
    "vmessHeaders = vmess, 1.1.1.1, 443, username=u, ws=true, ws-headers=badheader, ws-path=/p",
    "vmessHeadersEdge = vmess, 1.1.1.1, 443, username=u, ws=true, ws-headers=Edge:e|Host:h|Bad:x",
    "httpZero = http, 1.1.1.1, 0",
    "httpBad = http, 1.1.1.1, 8080, noequals",
    "httpScv = http, 1.1.1.1, 8080, username=u, password=p, skip-cert-verify=true",
    "trojanZero = trojan, 1.1.1.1, 0",
    "trojanBad = trojan, 1.1.1.1, 443, noequals",
    "trojanScv = trojan, 1.1.1.1, 443, password=pw, skip-cert-verify=true, tfo=true, udp-relay=true",
    "snellZero = snell, 1.1.1.1, 0",
    "snellBad = snell, 1.1.1.1, 443, noequals",
    "snellTfo = snell, 1.1.1.1, 443, psk=pw, tfo=true, udp-relay=true",
    "httpsLine = https, 1.1.1.1, 443, u, p, skip-cert-verify=true",
  ].join("\n");

  it("parses the well-formed lines and skips malformed ones", () => {
    const nodes = parseSubscription(surge);
    const names = nodes.map((n) => n.remark);
    expect(names).toContain("customFull");
    expect(names).toContain("ssTfo");
    expect(names).toContain("ssObfsNoHost");
    expect(names).toContain("socksScv");
    expect(names).toContain("vmessWsOn");
    expect(names).toContain("vmessHeadersEdge");
    expect(names).toContain("httpScv");
    expect(names).toContain("trojanScv");
    expect(names).toContain("snellTfo");
    expect(names).not.toContain("nokey");
    expect(names).not.toContain("customShort");
    expect(names).not.toContain("customZero");
    expect(names).not.toContain("socksZero");
    expect(names).not.toContain("vmessZero");
    expect(names).not.toContain("httpZero");
    expect(names).not.toContain("trojanZero");
    expect(names).not.toContain("snellZero");
  });
});

describe("json conf parser optional branches", () => {
  it("parses minimal ssconf entries", () => {
    const nodes = parseSubscription(
      JSON.stringify({
        servers: [{ method: "aes-128-gcm", password: "p", server: "s", server_port: 80 }],
        version: 1,
      }),
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.remark).toBe("s:80");
  });

  it("parses ssconf with plugin and remark", () => {
    const nodes = parseSubscription(
      JSON.stringify({
        configs: [
          {
            method: "aes-128-gcm",
            password: "p",
            plugin: "obfs-local",
            plugin_opts: "obfs=http",
            remarks: "n",
            server: "s",
            server_port: 80,
          },
        ],
        version: 1,
      }),
    );
    expect(nodes[0]?.plugin).toBe("obfs-local");
  });

  it("parses ssr list minimal entries", () => {
    const nodes = parseSubscription(
      JSON.stringify({
        configs: [
          {
            method: "aes-256-cfb",
            obfs: "plain",
            password: "p",
            protocol: "origin",
            server: "s",
            server_port: 80,
          },
        ],
        serverSubscribes: [],
      }),
    );
    expect(nodes).toHaveLength(1);
  });

  it("parses v2rayN vmess entries with optional fields", () => {
    const nodes = parseSubscription(
      JSON.stringify({
        subItem: [{ id: "x", remarks: "Group" }],
        uiItem: {},
        vmess: [
          {
            address: "s",
            configType: 1,
            id: "u",
            network: "ws",
            port: 443,
            remarks: "a",
            security: "auto",
            streamSecurity: "tls",
          },
          {
            address: "s",
            allowInsecure: true,
            configType: 1,
            headerType: "http",
            id: "u",
            network: "tcp",
            path: "/p",
            port: 443,
            requestHost: "h",
            security: "auto",
            subid: "x",
          },
          { address: null, configType: 1, port: 1 },
        ],
      }),
    );
    expect(nodes.length).toBe(2);
  });

  it("parses SSTap minimal and unknown types", () => {
    const nodes = parseSubscription(
      JSON.stringify({
        configs: [
          { server: "s", server_port: 80, type: 5 },
          {
            method: "aes-256-gcm",
            obfs: "plain",
            password: "p",
            protocol: "origin",
            server: "s",
            server_port: 80,
            type: 6,
          },
          { server: "s", server_port: 80, type: 99 },
          { server: "s", server_port: 0, type: 5 },
        ],
        idInUse: true,
      }),
    );
    expect(nodes).toHaveLength(2);
  });

  it("parses Netch minimal entries", () => {
    expect(
      parseSubscription(
        JSON.stringify({
          ModeFileNameType: 0,
          Server: [
            { EncryptMethod: "aes-256-gcm", Hostname: "h", Password: "p", Port: 1, Type: "SS" },
          ],
        }),
      ),
    ).toHaveLength(1);
  });

  it("handles invalid JSON bodies", () => {
    expect(parseSubscription('{"version":1,"servers":[]}')).toHaveLength(0);
    expect(parseSubscription('{"uiItem":1}')).toHaveLength(0);
    expect(parseSubscription('{"proxy_apps":1}')).toHaveLength(0);
    expect(parseSubscription('{"idInUse":1}')).toHaveLength(0);
    expect(parseSubscription('{"ModeFileNameType":1}')).toHaveLength(0);
    expect(parseSubscription('{"serverSubscribes":1}')).toHaveLength(0);
  });
});
