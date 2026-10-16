import { isFlattenableSsr } from "./ciphers";
import {
  anyTlsConstruct,
  httpConstruct,
  hysteria2Construct,
  socksConstruct,
  ssConstruct,
  ssrConstruct,
  trojanConstruct,
  tuicConstruct,
  vlessConstruct,
  vmessConstruct,
} from "./construct";
import type { Proxy } from "../types/proxy";
import { DEFAULT_GROUPS, createProxy } from "../types/proxy";
import type { TriBool } from "../types/tribool";
import { urlSafeBase64Decode } from "../utils/base64";
import { split, toInt, trim } from "../utils/string";
import { getUrlArg, urlDecode } from "../utils/url";

/** `true` when the link is a plain HTTP(S) subscription URL. */
export function isLink(link: string): boolean {
  return link.startsWith("http://") || link.startsWith("https://");
}

function firstMatch(input: string, pattern: string): string[] | null {
  const match = new RegExp(pattern).exec(input);
  return match ? match.slice() : null;
}

/** Parse `vmess://<base64 json>` or a variant link into `node`. */
export function explodeVmess(vmess: string, node: Proxy): void {
  if (/^vmess:\/\/[A-Za-z0-9-_]+\?.*/.test(vmess)) {
    explodeShadowrocket(vmess, node);
    return;
  }
  if (/^vmess:\/\/.*?@.*/.test(vmess)) {
    explodeStdVmess(vmess, node);
    return;
  }
  if (/^vmess1:\/\/.*?\?.*/.test(vmess)) {
    explodeKitsunebi(vmess, node);
    return;
  }

  const decoded = urlSafeBase64Decode(vmess.replace(/(vmess|vmess1):\/\//, ""));
  if (/.*?\s=\s.*/.test(decoded)) {
    explodeQuan(decoded, node);
    return;
  }

  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(decoded);
    if (parsed === null || typeof parsed !== "object") {
      return;
    }
    data = parsed as Record<string, unknown>;
  } catch {
    return;
  }

  let version = "1";
  if (data["v"] !== undefined) {
    version = String(data["v"]);
  }
  const ps = String(data["ps"] ?? "");
  let add = String(data["add"] ?? "");
  const port = String(data["port"] ?? "");
  if (port === "0" || port === "") {
    return;
  }
  const type = String(data["type"] ?? "");
  const id = String(data["id"] ?? "");
  const aid = String(data["aid"] ?? "");
  const net = String(data["net"] ?? "");
  const tls = String(data["tls"] ?? "");
  let host = String(data["host"] ?? "");
  const sni = String(data["sni"] ?? "");
  let path = "";

  switch (toInt(version)) {
    case 1: {
      if (host !== "") {
        const parts = split(host, ";");
        if (parts.length === 2) {
          host = parts[0] as string;
          path = parts[1] as string;
        }
      }
      break;
    }
    case 2: {
      path = String(data["path"] ?? "");
      break;
    }
    default:
      break;
  }
  add = trim(add);

  vmessConstruct(node, {
    add,
    aid,
    cipher: "auto",
    group: DEFAULT_GROUPS.v2ray,
    host,
    id,
    net,
    path,
    port,
    remark: ps,
    sni,
    tls,
    type,
  });
}

/** Parse the `net:uuid-aid@host:port` VMess variant. */
export function explodeStdVmess(vmess: string, node: Proxy): void {
  let body = vmess.slice(8);
  let remark = "";
  const hashPos = body.lastIndexOf("#");
  if (hashPos !== -1) {
    remark = urlDecode(body.slice(hashPos + 1));
    body = body.slice(0, hashPos);
  }
  const matcher =
    /^([a-z]+)(?:\+([a-z]+))?:([\da-f]{4}(?:[\da-f]{4}-){4}[\da-f]{12})-(\d+)@(.+):(\d+)(?:\/?\?(.*))?$/;
  const match = matcher.exec(body);
  if (!match) {
    return;
  }
  const net = match[1] as string;
  const tls = match[2] ?? "";
  const id = match[3] as string;
  const aid = match[4] as string;
  const add = match[5] as string;
  const port = match[6] as string;
  const addition = match[7] ?? "";

  let type = "";
  let host = "";
  let path = "";
  switch (net) {
    case "tcp":
    case "kcp":
      type = getUrlArg(addition, "type");
      break;
    case "http":
    case "ws":
      host = getUrlArg(addition, "host");
      path = getUrlArg(addition, "path");
      break;
    case "quic":
      type = getUrlArg(addition, "security");
      host = getUrlArg(addition, "type");
      path = getUrlArg(addition, "key");
      break;
    default:
      return;
  }
  if (remark === "") {
    remark = `${add}:${port}`;
  }
  vmessConstruct(node, {
    add,
    aid,
    cipher: "auto",
    group: DEFAULT_GROUPS.v2ray,
    host,
    id,
    net,
    path,
    port,
    remark,
    tls,
    type,
  });
}

/** Parse a Shadowrocket-style VMess link. */
export function explodeShadowrocket(rocket: string, node: Proxy): void {
  let body = rocket.slice(8);
  let net = "tcp";
  const qpos = body.indexOf("?");
  const addition = qpos >= 0 ? body.slice(qpos + 1) : "";
  body = qpos >= 0 ? body.slice(0, qpos) : body;

  const match = firstMatch(urlSafeBase64Decode(body), "(.*?):(.*)@(.*):(.*)");
  if (!match) {
    return;
  }
  const cipher = match[1] as string;
  const id = match[2] as string;
  const add = match[3] as string;
  const port = match[4] as string;
  if (port === "0") {
    return;
  }
  let remark = urlDecode(getUrlArg(addition, "remarks"));
  const obfs = getUrlArg(addition, "obfs");
  let host = "";
  let path = "";
  const type = "";
  if (obfs !== "") {
    if (obfs === "websocket") {
      net = "ws";
      host = getUrlArg(addition, "obfsParam");
      path = getUrlArg(addition, "path");
    }
  } else {
    net = getUrlArg(addition, "network");
    host = getUrlArg(addition, "wsHost");
    path = getUrlArg(addition, "wspath");
  }
  const tls = getUrlArg(addition, "tls") === "1" ? "tls" : "";
  let aid = getUrlArg(addition, "aid");
  if (aid === "") {
    aid = "0";
  }
  if (remark === "") {
    remark = `${add}:${port}`;
  }
  vmessConstruct(node, {
    add,
    aid,
    cipher,
    group: DEFAULT_GROUPS.v2ray,
    host,
    id,
    net,
    path,
    port,
    remark,
    tls,
    type,
  });
}

/** Parse a Kitsunebi-style `vmess1://` link. */
export function explodeKitsunebi(kit: string, node: Proxy): void {
  let body = kit.slice(9);
  let remark = "";
  let path = "";
  const hashPos = body.indexOf("#");
  if (hashPos !== -1) {
    remark = body.slice(hashPos + 1);
    body = body.slice(0, hashPos);
  }
  const qpos = body.indexOf("?");
  const addition = qpos >= 0 ? body.slice(qpos + 1) : "";
  body = qpos >= 0 ? body.slice(0, qpos) : body;

  const match = firstMatch(body, "(.*?)@(.*):(.*)");
  if (!match) {
    return;
  }
  const id = match[1] as string;
  const add = match[2] as string;
  let port = match[3] as string;
  const slash = port.indexOf("/");
  if (slash !== -1) {
    path = port.slice(slash);
    port = port.slice(0, slash);
  }
  if (port === "0") {
    return;
  }
  const net = getUrlArg(addition, "network");
  const tls = getUrlArg(addition, "tls") === "true" ? "tls" : "";
  const host = getUrlArg(addition, "ws.host");
  if (remark === "") {
    remark = `${add}:${port}`;
  }
  vmessConstruct(node, {
    add,
    aid: "0",
    cipher: "auto",
    group: DEFAULT_GROUPS.v2ray,
    host,
    id,
    net,
    path,
    port,
    remark,
    tls,
    type: "",
  });
}

/** Parse a Quantumult `remarks = vmess, ...` definition. */
export function explodeQuan(quan: string, node: Proxy): void {
  const normalized = quan.replace(/(.*?)\s=\s(.*)/, "$1,$2");
  const configs = split(normalized, ",");
  if (configs.length < 6 || configs[1] !== "vmess") {
    return;
  }
  const remark = trim(configs[0] as string);
  const add = trim(configs[2] as string);
  const port = trim(configs[3] as string);
  if (port === "0") {
    return;
  }
  const cipher = trim(configs[4] as string);
  const id = trim((configs[5] as string).replace(/"/g, ""));

  let group: string = DEFAULT_GROUPS.v2ray;
  let tls = "";
  let host = "";
  let path = "";
  let net = "tcp";
  let edge = "";

  for (let i = 6; i < configs.length; i += 1) {
    const vArray = split(configs[i] as string, "=");
    if (vArray.length < 2) {
      continue;
    }
    const itemName = trim(vArray[0] as string);
    const itemVal = trim(vArray.slice(1).join("="));
    switch (itemName) {
      case "group":
        group = itemVal;
        break;
      case "over-tls":
        tls = itemVal === "true" ? "tls" : "";
        break;
      case "tls-host":
        host = itemVal;
        break;
      case "obfs-path":
        path = itemVal.replace(/"/g, "");
        break;
      case "obfs-header": {
        const headers = split(itemVal.replace(/"/g, "").replace(/\[Rr\]\[Nn\]/g, "|"), "|");
        for (const header of headers) {
          if (/Host: /i.test(header)) {
            host = header.slice(6);
          } else if (/Edge: /i.test(header)) {
            edge = header.slice(6);
          }
        }
        break;
      }
      case "obfs":
        if (itemVal === "ws") {
          net = "ws";
        }
        break;
      default:
        break;
    }
  }
  if (path === "") {
    path = "/";
  }
  vmessConstruct(node, {
    add,
    aid: "0",
    cipher,
    edge,
    group,
    host,
    id,
    net,
    path,
    port,
    remark,
    tls,
    type: "none",
  });
}

/** Parse a `ss://` link into `node`. */
export function explodeSs(ss: string, node: Proxy): void {
  let body = ss.slice(5).replace(/\/\?/g, "?");
  const group: string = DEFAULT_GROUPS.ss;
  let remark = "";
  let addition = "";
  let plugin = "";
  let pluginOption = "";
  let resolvedGroup: string = group;

  const hashPos = body.indexOf("#");
  if (hashPos !== -1) {
    remark = urlDecode(body.slice(hashPos + 1));
    body = body.slice(0, hashPos);
  }

  const qpos = body.indexOf("?");
  if (qpos !== -1) {
    addition = body.slice(qpos + 1);
    const plugins = urlDecode(getUrlArg(addition, "plugin"));
    const pluginPos = plugins.indexOf(";");
    plugin = pluginPos === -1 ? plugins : plugins.slice(0, pluginPos);
    pluginOption = pluginPos === -1 ? "" : plugins.slice(pluginPos + 1);
    const rawGroup = getUrlArg(addition, "group");
    if (rawGroup !== "") {
      resolvedGroup = urlSafeBase64Decode(rawGroup);
    }
    body = body.slice(0, qpos);
  }

  let method = "";
  let password = "";
  let server = "";
  let port = "";

  if (body.includes("@")) {
    const match = firstMatch(body, "(\\S+?)@(\\S+):(\\d+)");
    if (!match) {
      return;
    }
    const secret = match[1] as string;
    server = match[2] as string;
    port = match[3] as string;
    const secretMatch = firstMatch(urlSafeBase64Decode(secret), "(\\S+?):(\\S+)");
    if (!secretMatch) {
      return;
    }
    method = secretMatch[1] as string;
    password = secretMatch[2] as string;
  } else {
    const match = firstMatch(urlSafeBase64Decode(body), "(\\S+?):(\\S+)@(\\S+):(\\d+)");
    if (!match) {
      return;
    }
    method = match[1] as string;
    password = match[2] as string;
    server = match[3] as string;
    port = match[4] as string;
  }

  if (port === "0") {
    return;
  }
  if (remark === "") {
    remark = `${server}:${port}`;
  }
  ssConstruct(node, {
    group: resolvedGroup,
    method,
    password,
    plugin,
    pluginOption,
    port,
    remark,
    server,
  });
}

/** Parse a `ssr://` link into `node`. */
export function explodeSsr(ssr: string, node: Proxy): void {
  let body = ssr.slice(6).replace(/\r/g, "");
  body = urlSafeBase64Decode(body);

  let group = "";
  let remark = "";
  let obfsParam = "";
  let protocolParam = "";

  const obfsPos = body.indexOf("/?");
  if (obfsPos !== -1) {
    const strobfs = body.slice(obfsPos + 2);
    body = body.slice(0, obfsPos);
    group = urlSafeBase64Decode(getUrlArg(strobfs, "group"));
    remark = urlSafeBase64Decode(getUrlArg(strobfs, "remarks"));
    obfsParam = urlSafeBase64Decode(getUrlArg(strobfs, "obfsparam")).replace(/\s/g, "");
    protocolParam = urlSafeBase64Decode(getUrlArg(strobfs, "protoparam")).replace(/\s/g, "");
  }

  const match = firstMatch(body, "(\\S+):(\\d+?):(\\S+?):(\\S+?):(\\S+?):(\\S+)");
  if (!match) {
    return;
  }
  const server = match[1] as string;
  const port = match[2] as string;
  const protocol = match[3] as string;
  const method = match[4] as string;
  const obfs = match[5] as string;
  const password = urlSafeBase64Decode(match[6] as string);
  if (port === "0") {
    return;
  }

  const resolvedGroup = group === "" ? DEFAULT_GROUPS.ssr : group;
  const resolvedRemark = remark === "" ? `${server}:${port}` : remark;

  if (isFlattenableSsr(method, obfs, protocol)) {
    ssConstruct(node, {
      group: resolvedGroup,
      method,
      password,
      port,
      remark: resolvedRemark,
      server,
    });
  } else {
    ssrConstruct(node, {
      group: resolvedGroup,
      method,
      obfs,
      obfsParam,
      password,
      port,
      protocol,
      protocolParam,
      remark: resolvedRemark,
      server,
    });
  }
}

/** Parse an `ssd://` (ShadowsocksD) subscription. */
export function explodeSsd(link: string, nodes: Proxy[]): void {
  let index = nodes.length;
  const decoded = urlSafeBase64Decode(link.slice(6));
  let data: any;
  try {
    data = JSON.parse(decoded);
  } catch {
    return;
  }
  if (data === null || typeof data !== "object" || !("servers" in data)) {
    return;
  }
  const group = String(data.airport ?? "");
  const servers = data.servers;

  let entries: any[];
  if (Array.isArray(servers)) {
    entries = servers;
  } else if (servers !== null && typeof servers === "object") {
    entries = Object.keys(servers).map((key) => servers[key]);
  } else {
    return;
  }

  for (const entry of entries) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    const server = String(entry.server ?? "");
    const port = String(entry.port ?? data.port ?? "");
    if (server === "" || port === "" || port === "0") {
      continue;
    }
    const remark = String(entry.remarks ?? "");
    const method = String(entry.encryption ?? data.encryption ?? "");
    const password = String(entry.password ?? data.password ?? "");
    const plugin = String(entry.plugin ?? data.plugin ?? "");
    const pluginOption = String(entry.plugin_options ?? data.plugin_options ?? "");
    const node = createProxy();
    ssConstruct(node, {
      group,
      method,
      password,
      plugin,
      pluginOption,
      port,
      remark,
      server,
    });
    node.id = index;
    nodes.push(node);
    index += 1;
  }
}

/** Parse `socks://`, `tg://socks`, or `https://t.me/socks` links. */
export function explodeSocks(link: string, node: Proxy): void {
  let group = "";
  let remark = "";
  let server = "";
  let port = "";
  let username = "";
  let password = "";

  if (link.includes("socks://")) {
    let body = link;
    const hashPos = body.indexOf("#");
    if (hashPos !== -1) {
      remark = urlDecode(body.slice(hashPos + 1));
      body = body.slice(0, hashPos);
    }
    body = urlSafeBase64Decode(body.slice(8));
    if (body.includes("@")) {
      const userinfo = split(body, "@");
      if (userinfo.length < 2) {
        return;
      }
      body = userinfo[1] as string;
      const creds = split(userinfo[0] as string, ":");
      if (creds.length < 2) {
        return;
      }
      username = creds[0] as string;
      password = creds[1] as string;
    }
    const args = split(body, ":");
    if (args.length < 2) {
      return;
    }
    server = args[0] as string;
    port = args[1] as string;
  } else if (link.includes("https://t.me/socks") || link.includes("tg://socks")) {
    server = getUrlArg(link, "server");
    port = getUrlArg(link, "port");
    username = urlDecode(getUrlArg(link, "user"));
    password = urlDecode(getUrlArg(link, "pass"));
    remark = urlDecode(getUrlArg(link, "remarks"));
    group = urlDecode(getUrlArg(link, "group"));
  }

  if (group === "") {
    group = DEFAULT_GROUPS.socks;
  }
  if (remark === "") {
    remark = `${server}:${port}`;
  }
  if (port === "0" || port === "") {
    return;
  }
  socksConstruct(node, { group, password, port, remark, server, username });
}

/** Parse a telegram-style HTTP proxy link. */
export function explodeHttp(link: string, node: Proxy): void {
  const server = getUrlArg(link, "server");
  const port = getUrlArg(link, "port");
  const username = urlDecode(getUrlArg(link, "user"));
  const password = urlDecode(getUrlArg(link, "pass"));
  let remark = urlDecode(getUrlArg(link, "remarks"));
  let group = urlDecode(getUrlArg(link, "group"));
  if (group === "") {
    group = DEFAULT_GROUPS.http;
  }
  if (remark === "") {
    remark = `${server}:${port}`;
  }
  if (port === "0" || port === "") {
    return;
  }
  httpConstruct(node, {
    group,
    password,
    port,
    remark,
    server,
    tls: link.includes("/https"),
    username,
  });
}

/** Parse an HTTP(S) link with base64-encoded credentials. */
export function explodeHttpSub(link: string, node: Proxy): void {
  let body = link;
  let remarks = "";
  let group = "";
  const tls = body.includes("https://");
  const qpos = body.indexOf("?");
  if (qpos !== -1) {
    const addition = body.slice(qpos + 1);
    body = body.slice(0, qpos);
    remarks = urlDecode(getUrlArg(addition, "remarks"));
    group = urlDecode(getUrlArg(addition, "group"));
  }
  body = body.slice(body.indexOf("://") + 3);
  body = urlSafeBase64Decode(body);

  let server = "";
  let port = "";
  let username = "";
  let password = "";
  if (body.includes("@")) {
    const match = firstMatch(body, "(.*?):(.*?)@(.*):(.*)");
    if (!match) {
      return;
    }
    username = match[1] as string;
    password = match[2] as string;
    server = match[3] as string;
    port = match[4] as string;
  } else {
    const match = firstMatch(body, "(.*):(.*)");
    if (!match) {
      return;
    }
    server = match[1] as string;
    port = match[2] as string;
  }
  if (group === "") {
    group = DEFAULT_GROUPS.http;
  }
  if (remarks === "") {
    remarks = `${server}:${port}`;
  }
  if (port === "0") {
    return;
  }
  httpConstruct(node, {
    group,
    password,
    port,
    remark: remarks,
    server,
    tls,
    username,
  });
}

/** Parse a `trojan://` link. */
export function explodeTrojan(trojan: string, node: Proxy): void {
  let body = trojan.slice(9);
  let remark = "";
  let addition = "";
  let host = "";
  let path = "";
  let network = "";

  const hashPos = body.lastIndexOf("#");
  if (hashPos !== -1) {
    remark = urlDecode(body.slice(hashPos + 1));
    body = body.slice(0, hashPos);
  }
  const qpos = body.indexOf("?");
  if (qpos !== -1) {
    addition = body.slice(qpos + 1);
    body = body.slice(0, qpos);
  }

  const match = firstMatch(body, "(.*?)@(.*):(.*)");
  if (!match) {
    return;
  }
  const password = match[1] as string;
  const server = match[2] as string;
  const port = match[3] as string;
  if (port === "0") {
    return;
  }

  host = getUrlArg(addition, "sni");
  if (host === "") {
    host = getUrlArg(addition, "peer");
  }
  const tfo = getUrlArg(addition, "tfo");
  const group = urlDecode(getUrlArg(addition, "group"));

  if (getUrlArg(addition, "ws") === "1") {
    path = getUrlArg(addition, "wspath");
    network = "ws";
  } else if (getUrlArg(addition, "type") === "ws") {
    path = getUrlArg(addition, "path");
    if (path.startsWith("%2F")) {
      path = urlDecode(path);
    }
    network = "ws";
  }

  const type = getUrlArg(addition, "type");
  const sni = getUrlArg(addition, "sni");
  const insecure = getUrlArg(addition, "allowInsecure");

  if (remark === "") {
    remark = `${server}:${port}`;
  }
  trojanConstruct(node, {
    group: group === "" ? DEFAULT_GROUPS.trojan : group,
    host,
    network,
    password,
    path,
    port,
    remark,
    scv: insecure === "" ? undefined : parseTri(insecure),
    server,
    sni,
    tfo: tfo === "" ? undefined : parseTri(tfo),
    tlsSecure: type !== "" || true,
  });
}

function parseTri(value: string): TriBool {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

/** Parse a `hysteria2://` / `hy2://` link. */
export function explodeHysteria2(link: string, node: Proxy): void {
  const body = link.replace(/(hysteria2|hy2):\/\//, "hysteria2://").replace(/\/\?/g, "?");
  if (/hysteria2:\/\/.*?[:].*/.test(body)) {
    explodeStdHysteria2(body, node);
  }
}

function explodeStdHysteria2(link: string, node: Proxy): void {
  let body = link.slice(12);
  let remark = "";
  let addition = "";
  const hashPos = body.lastIndexOf("#");
  if (hashPos !== -1) {
    remark = urlDecode(body.slice(hashPos + 1));
    body = body.slice(0, hashPos);
  }
  const qpos = body.lastIndexOf("?");
  if (qpos !== -1) {
    addition = body.slice(qpos + 1);
    body = body.slice(0, qpos);
  }

  let password = "";
  let add = "";
  let port = "";
  if (body.includes("@")) {
    const match = /^(.*?)@(.*)[:](\d+)$/.exec(body);
    if (!match) {
      return;
    }
    password = match[1] as string;
    add = match[2] as string;
    port = match[3] as string;
  } else {
    password = getUrlArg(addition, "password");
    if (password === "") {
      return;
    }
    if (!body.includes(":")) {
      return;
    }
    const match = /^(.*)[:](\d+)$/.exec(body);
    if (!match) {
      return;
    }
    add = match[1] as string;
    port = match[2] as string;
  }

  const scv = getUrlArg(addition, "insecure");
  const up = getUrlArg(addition, "up");
  const down = getUrlArg(addition, "down");
  const alpn = getUrlArg(addition, "alpn");
  const obfs = getUrlArg(addition, "obfs");
  const obfsPassword = getUrlArg(addition, "obfs-password");
  const sni = getUrlArg(addition, "sni");
  const fingerprint = getUrlArg(addition, "pinSHA256");
  const mport = getUrlArg(addition, "mport");
  const portsArg = getUrlArg(addition, "ports");
  const ports = portsArg !== "" ? portsArg : mport !== "" ? mport : port;
  if (remark === "") {
    remark = `${add}:${port}`;
  }
  hysteria2Construct(node, {
    alpn,
    down,
    fingerprint,
    group: DEFAULT_GROUPS.hysteria2,
    obfs,
    obfsPassword,
    password,
    port,
    ports,
    remark,
    scv: scv === "" ? undefined : parseTri(scv),
    server: add,
    sni,
    up,
  });
}

/** Parse an `anytls://` link. */
export function explodeAnyTls(link: string, node: Proxy): void {
  let body = link.slice(9);
  let remark = "";
  let addition = "";
  const hashPos = body.lastIndexOf("#");
  if (hashPos !== -1) {
    remark = urlDecode(body.slice(hashPos + 1));
    body = body.slice(0, hashPos);
  }
  const qpos = body.lastIndexOf("?");
  if (qpos !== -1) {
    addition = body.slice(qpos + 1);
    body = body.slice(0, qpos);
  }
  const match = /^(.*?)@(.*)[:](\d+)$/.exec(body);
  if (!match) {
    return;
  }
  const password = match[1] as string;
  const add = match[2] as string;
  const port = match[3] as string;
  if (port === "0") {
    return;
  }
  const sni = getUrlArg(addition, "sni");
  const udp = getUrlArg(addition, "udp");
  const scv = getUrlArg(addition, "insecure");
  if (remark === "") {
    remark = `${add}:${port}`;
  }
  anyTlsConstruct(node, {
    group: DEFAULT_GROUPS.anytls,
    password,
    port,
    remark,
    scv: scv === "" ? undefined : parseTri(scv),
    server: add,
    sni,
    udp: udp === "" ? undefined : parseTri(udp),
  });
}

/** Parse a `vless://` link. */
export function explodeVless(link: string, node: Proxy): void {
  let body = link.slice(8);
  let remark = "";
  let addition = "";
  const hashPos = body.lastIndexOf("#");
  if (hashPos !== -1) {
    remark = urlDecode(body.slice(hashPos + 1));
    body = body.slice(0, hashPos);
  }
  const qpos = body.indexOf("?");
  if (qpos !== -1) {
    addition = body.slice(qpos + 1);
    body = body.slice(0, qpos);
  }
  const match = /^(.*?)@\[?(.*?)\]?:(\d+)$/.exec(body);
  if (!match) {
    return;
  }
  const userId = match[1] as string;
  const server = match[2] as string;
  const port = match[3] as string;
  if (port === "0") {
    return;
  }
  const network = getUrlArg(addition, "type");
  const security = getUrlArg(addition, "security");
  const host = getUrlArg(addition, "host");
  const rawPath = urlDecode(getUrlArg(addition, "path"));
  const serviceName = urlDecode(getUrlArg(addition, "serviceName"));
  const path = rawPath !== "" ? rawPath : serviceName;
  const sni = getUrlArg(addition, "sni");
  const flow = getUrlArg(addition, "flow");
  const fingerprint = getUrlArg(addition, "fp");
  const publicKey = getUrlArg(addition, "pbk");
  const shortId = getUrlArg(addition, "sid");
  const alpn = getUrlArg(addition, "alpn");
  if (remark === "") {
    remark = `${server}:${port}`;
  }
  vlessConstruct(node, {
    alpn: alpn === "" ? undefined : alpn.split(","),
    fingerprint,
    flow,
    group: DEFAULT_GROUPS.v2ray,
    host,
    network,
    path,
    port,
    publicKey,
    remark,
    scv:
      getUrlArg(addition, "allowInsecure") === ""
        ? undefined
        : parseTri(getUrlArg(addition, "allowInsecure")),
    server,
    shortId,
    sni,
    tls: security,
    userId,
  });
}

/** Parse a `tuic://` link. */
export function explodeTuic(link: string, node: Proxy): void {
  let body = link.slice(7);
  let remark = "";
  let addition = "";
  const hashPos = body.lastIndexOf("#");
  if (hashPos !== -1) {
    remark = urlDecode(body.slice(hashPos + 1));
    body = body.slice(0, hashPos);
  }
  const qpos = body.indexOf("?");
  if (qpos !== -1) {
    addition = body.slice(qpos + 1);
    body = body.slice(0, qpos);
  }
  const match = /^(.*?):(.*?)@\[?(.*?)\]?:(\d+)$/.exec(body);
  if (!match) {
    return;
  }
  const userId = match[1] as string;
  const password = match[2] as string;
  const server = match[3] as string;
  const port = match[4] as string;
  if (port === "0") {
    return;
  }
  const congestionControl =
    getUrlArg(addition, "congestion_control") || getUrlArg(addition, "congestion-controller");
  const alpn = getUrlArg(addition, "alpn");
  const sni = getUrlArg(addition, "sni");
  if (remark === "") {
    remark = `${server}:${port}`;
  }
  tuicConstruct(node, {
    alpn: alpn === "" ? undefined : alpn.split(","),
    congestionControl,
    group: DEFAULT_GROUPS.v2ray,
    password,
    port,
    remark,
    scv:
      getUrlArg(addition, "allow_insecure") === ""
        ? undefined
        : parseTri(getUrlArg(addition, "allow_insecure")),
    server,
    sni,
    userId,
  });
}
