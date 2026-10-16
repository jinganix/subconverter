import type { Proxy } from "../types/proxy";
import { ProxyType } from "../types/proxy";
import type { TriBool } from "../types/tribool";
import { base64Decode } from "../utils/base64";
import { isIpv4, isIpv6, toInt, trim } from "../utils/string";

function commonConstruct(
  node: Proxy,
  type: ProxyType,
  group: string,
  remark: string,
  server: string,
  port: string | number,
  udp: TriBool,
  tfo: TriBool,
  scv: TriBool,
  tls13: TriBool,
  underlyingProxy: string,
): void {
  node.type = type;
  node.group = group;
  node.remark = remark;
  node.hostname = server;
  node.underlyingProxy = underlyingProxy;
  node.port = toInt(port);
  node.udp = udp;
  node.tcpFastOpen = tfo;
  node.allowInsecure = scv;
  node.tls13 = tls13;
}

export interface VmessOptions {
  group: string;
  remark: string;
  add: string;
  port: string | number;
  type?: string;
  id?: string;
  aid?: string | number;
  net?: string;
  cipher?: string;
  path?: string;
  host?: string;
  edge?: string;
  tls?: string;
  sni?: string;
  udp?: TriBool;
  tfo?: TriBool;
  scv?: TriBool;
  tls13?: TriBool;
  underlyingProxy?: string;
}

/** Build a VMess node. Mirrors subparser.cpp `vmessConstruct`. */
export function vmessConstruct(node: Proxy, options: VmessOptions): void {
  const {
    add,
    aid = 0,
    cipher = "",
    edge = "",
    group,
    host = "",
    id = "",
    net = "",
    path = "",
    port,
    remark,
    scv,
    sni = "",
    tfo,
    tls = "",
    tls13,
    type = "",
    udp,
    underlyingProxy = "",
  } = options;

  commonConstruct(
    node,
    ProxyType.VMess,
    group,
    remark,
    add,
    port,
    udp,
    tfo,
    scv,
    tls13,
    underlyingProxy,
  );
  node.userId = id === "" ? "00000000-0000-0000-0000-000000000000" : id;
  node.alterId = toInt(aid);
  node.encryptMethod = cipher;
  node.transferProtocol = net === "" ? "tcp" : net;
  node.edge = edge;
  node.serverName = sni;

  if (net === "quic") {
    node.quicSecure = host;
    node.quicSecret = path;
  } else {
    node.host = host === "" && !isIpv4(add) && !isIpv6(add) ? add : trim(host);
    node.path = path === "" ? "/" : trim(path);
  }
  node.fakeType = type;
  node.tlsSecure = tls === "tls";
}

export interface SsrOptions {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  protocol: string;
  method: string;
  obfs: string;
  password: string;
  obfsParam?: string;
  protocolParam?: string;
  udp?: TriBool;
  tfo?: TriBool;
  scv?: TriBool;
  underlyingProxy?: string;
}

/** Build a ShadowsocksR node. Mirrors `ssrConstruct`. */
export function ssrConstruct(node: Proxy, options: SsrOptions): void {
  commonConstruct(
    node,
    ProxyType.ShadowsocksR,
    options.group,
    options.remark,
    options.server,
    options.port,
    options.udp,
    options.tfo,
    options.scv,
    undefined,
    options.underlyingProxy ?? "",
  );
  node.password = options.password;
  node.encryptMethod = options.method;
  node.protocol = options.protocol;
  node.protocolParam = options.protocolParam ?? "";
  node.obfs = options.obfs;
  node.obfsParam = options.obfsParam ?? "";
}

export interface SsOptions {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  password: string;
  method: string;
  plugin?: string;
  pluginOption?: string;
  udp?: TriBool;
  tfo?: TriBool;
  scv?: TriBool;
  tls13?: TriBool;
  underlyingProxy?: string;
}

/** Build a Shadowsocks node. Mirrors `ssConstruct`. */
export function ssConstruct(node: Proxy, options: SsOptions): void {
  commonConstruct(
    node,
    ProxyType.Shadowsocks,
    options.group,
    options.remark,
    options.server,
    options.port,
    options.udp,
    options.tfo,
    options.scv,
    options.tls13,
    options.underlyingProxy ?? "",
  );
  node.password = options.password;
  node.encryptMethod = options.method;
  node.plugin = options.plugin ?? "";
  node.pluginOption = options.pluginOption ?? "";
}

export interface SocksOptions {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  username?: string;
  password?: string;
  udp?: TriBool;
  tfo?: TriBool;
  scv?: TriBool;
  underlyingProxy?: string;
}

/** Build a SOCKS5 node. Mirrors `socksConstruct`. */
export function socksConstruct(node: Proxy, options: SocksOptions): void {
  commonConstruct(
    node,
    ProxyType.SOCKS5,
    options.group,
    options.remark,
    options.server,
    options.port,
    options.udp,
    options.tfo,
    options.scv,
    undefined,
    options.underlyingProxy ?? "",
  );
  node.username = options.username ?? "";
  node.password = options.password ?? "";
}

export interface HttpOptions {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  username?: string;
  password?: string;
  tls: boolean;
  tfo?: TriBool;
  scv?: TriBool;
  tls13?: TriBool;
  underlyingProxy?: string;
}

/** Build an HTTP/HTTPS node. Mirrors `httpConstruct`. */
export function httpConstruct(node: Proxy, options: HttpOptions): void {
  commonConstruct(
    node,
    options.tls ? ProxyType.HTTPS : ProxyType.HTTP,
    options.group,
    options.remark,
    options.server,
    options.port,
    undefined,
    options.tfo,
    options.scv,
    options.tls13,
    options.underlyingProxy ?? "",
  );
  node.username = options.username ?? "";
  node.password = options.password ?? "";
  node.tlsSecure = options.tls;
}

export interface TrojanOptions {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  password: string;
  network?: string;
  host?: string;
  path?: string;
  tlsSecure?: boolean;
  udp?: TriBool;
  tfo?: TriBool;
  scv?: TriBool;
  tls13?: TriBool;
  sni?: string;
  underlyingProxy?: string;
}

/** Build a Trojan node. Mirrors `trojanConstruct`. */
export function trojanConstruct(node: Proxy, options: TrojanOptions): void {
  commonConstruct(
    node,
    ProxyType.Trojan,
    options.group,
    options.remark,
    options.server,
    options.port,
    options.udp,
    options.tfo,
    options.scv,
    options.tls13,
    options.underlyingProxy ?? "",
  );
  node.password = options.password;
  node.host = options.host ?? "";
  node.tlsSecure = options.tlsSecure ?? true;
  node.transferProtocol =
    options.network === undefined || options.network === "" ? "tcp" : options.network;
  node.path = options.path ?? "";
  node.serverName = options.sni ?? "";
}

export interface SnellOptions {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  password: string;
  obfs?: string;
  host?: string;
  version?: number;
  udp?: TriBool;
  tfo?: TriBool;
  scv?: TriBool;
  underlyingProxy?: string;
}

/** Build a Snell node. Mirrors `snellConstruct`. */
export function snellConstruct(node: Proxy, options: SnellOptions): void {
  commonConstruct(
    node,
    ProxyType.Snell,
    options.group,
    options.remark,
    options.server,
    options.port,
    options.udp,
    options.tfo,
    options.scv,
    undefined,
    options.underlyingProxy ?? "",
  );
  node.password = options.password;
  node.obfs = options.obfs ?? "";
  node.host = options.host ?? "";
  node.snellVersion = options.version ?? 0;
}

export interface AnyTlsOptions {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  password: string;
  sni?: string;
  udp?: TriBool;
  tfo?: TriBool;
  scv?: TriBool;
  underlyingProxy?: string;
}

/** Build an AnyTLS node. Mirrors `anyTLSConstruct`. */
export function anyTlsConstruct(node: Proxy, options: AnyTlsOptions): void {
  commonConstruct(
    node,
    ProxyType.AnyTLS,
    options.group,
    options.remark,
    options.server,
    options.port,
    options.udp,
    options.tfo,
    options.scv,
    undefined,
    options.underlyingProxy ?? "",
  );
  node.tlsSecure = true;
  node.password = options.password;
  node.sni = options.sni ?? "";
}

export interface WireGuardOptions {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  selfIp?: string;
  selfIpv6?: string;
  privateKey?: string;
  publicKey?: string;
  preSharedKey?: string;
  dnsServers?: string[];
  mtu?: string | number;
  keepAlive?: string | number;
  testUrl?: string;
  clientId?: string;
  udp?: TriBool;
  underlyingProxy?: string;
}

/** Build a WireGuard node. Mirrors `wireguardConstruct`. */
export function wireGuardConstruct(node: Proxy, options: WireGuardOptions): void {
  commonConstruct(
    node,
    ProxyType.WireGuard,
    options.group,
    options.remark,
    options.server,
    options.port,
    options.udp,
    undefined,
    undefined,
    undefined,
    options.underlyingProxy ?? "",
  );
  node.selfIp = options.selfIp ?? "";
  node.selfIpv6 = options.selfIpv6 ?? "";
  node.privateKey = options.privateKey ?? "";
  node.publicKey = options.publicKey ?? "";
  node.preSharedKey = options.preSharedKey ?? "";
  node.dnsServers = options.dnsServers ?? [];
  node.mtu = toInt(options.mtu);
  node.keepAlive = toInt(options.keepAlive);
  node.testUrl = options.testUrl ?? "";
  node.clientId = options.clientId ?? "";
}

export interface HysteriaOptions {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  ports?: string;
  protocol?: string;
  obfsProtocol?: string;
  up?: string;
  upSpeed?: string;
  down?: string;
  downSpeed?: string;
  auth?: string;
  authStr?: string;
  obfs?: string;
  sni?: string;
  fingerprint?: string;
  ca?: string;
  caStr?: string;
  recvWindowConn?: string | number;
  recvWindow?: string | number;
  disableMtuDiscovery?: string;
  hopInterval?: string | number;
  alpn?: string;
  tfo?: TriBool;
  scv?: TriBool;
  underlyingProxy?: string;
}

/** Build a Hysteria (v1) node. Mirrors `hysteriaConstruct`. */
export function hysteriaConstruct(node: Proxy, options: HysteriaOptions): void {
  commonConstruct(
    node,
    ProxyType.Hysteria,
    options.group,
    options.remark,
    options.server,
    options.port,
    undefined,
    options.tfo,
    options.scv,
    undefined,
    options.underlyingProxy ?? "",
  );
  node.ports = options.ports ?? "";
  node.protocol = options.protocol ?? "";
  node.obfsParam = options.obfsProtocol ?? "";

  const up = options.up ?? "";
  if (up !== "") {
    if (up.length > 4 && up.endsWith("bps")) {
      node.up = up;
    } else if (toInt(up)) {
      node.upSpeed = toInt(up);
      node.up = `${up} Mbps`;
    }
  }
  if (options.upSpeed) {
    node.upSpeed = toInt(options.upSpeed);
  }
  const down = options.down ?? "";
  if (down !== "") {
    if (down.length > 4 && down.endsWith("bps")) {
      node.down = down;
    } else if (toInt(down)) {
      node.downSpeed = toInt(down);
      node.down = `${down} Mbps`;
    }
  }
  if (options.downSpeed) {
    node.downSpeed = toInt(options.downSpeed);
  }

  node.authStr = options.authStr ?? "";
  if (options.auth) {
    node.authStr = base64Decode(options.auth);
  }
  node.tlsSecure = true;
  node.obfs = options.obfs ?? "";
  node.sni = options.sni ?? "";
  node.fingerprint = options.fingerprint ?? "";
  node.ca = options.ca ?? "";
  node.caStr = options.caStr ?? "";
  node.recvWindowConn = toInt(options.recvWindowConn);
  node.recvWindow = toInt(options.recvWindow);
  node.disableMtuDiscovery = options.disableMtuDiscovery
    ? options.disableMtuDiscovery === "true"
    : undefined;
  node.hopInterval = toInt(options.hopInterval);
  if (options.alpn) {
    node.alpn = [options.alpn];
  }
}

export interface Hysteria2Options {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  ports?: string;
  up?: string;
  down?: string;
  password?: string;
  obfs?: string;
  obfsPassword?: string;
  sni?: string;
  fingerprint?: string;
  alpn?: string;
  ca?: string;
  caStr?: string;
  cwnd?: string | number;
  hopInterval?: string | number;
  tfo?: TriBool;
  scv?: TriBool;
  underlyingProxy?: string;
}

/** Build a Hysteria2 node. Mirrors `hysteria2Construct`. */
export function hysteria2Construct(node: Proxy, options: Hysteria2Options): void {
  commonConstruct(
    node,
    ProxyType.Hysteria2,
    options.group,
    options.remark,
    options.server,
    options.port,
    undefined,
    options.tfo,
    options.scv,
    undefined,
    options.underlyingProxy ?? "",
  );
  node.tlsSecure = true;
  node.upSpeed = toInt(options.up);
  node.downSpeed = toInt(options.down);
  node.ports = options.ports ?? "";
  node.password = options.password ?? "";
  node.obfs = options.obfs ?? "";
  node.obfsParam = options.obfsPassword ?? "";
  node.sni = options.sni ?? "";
  node.fingerprint = options.fingerprint ?? "";
  if (options.alpn) {
    node.alpn = [options.alpn];
  }
  node.ca = options.ca ?? "";
  node.caStr = options.caStr ?? "";
  node.cwnd = toInt(options.cwnd);
  node.hopInterval = toInt(options.hopInterval);
}

export interface VlessOptions {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  userId: string;
  flow?: string;
  encryption?: string;
  network?: string;
  tls?: string;
  sni?: string;
  host?: string;
  path?: string;
  fingerprint?: string;
  publicKey?: string;
  shortId?: string;
  alpn?: string[];
  udp?: TriBool;
  tfo?: TriBool;
  scv?: TriBool;
  underlyingProxy?: string;
}

/** Build a VLESS node. */
export function vlessConstruct(node: Proxy, options: VlessOptions): void {
  commonConstruct(
    node,
    ProxyType.VLESS,
    options.group,
    options.remark,
    options.server,
    options.port,
    options.udp,
    options.tfo,
    options.scv,
    undefined,
    options.underlyingProxy ?? "",
  );
  node.userId = options.userId;
  node.flow = options.flow ?? "";
  node.encryptMethod = options.encryption ?? "none";
  node.transferProtocol =
    options.network === undefined || options.network === "" ? "tcp" : options.network;
  node.tlsSecure = options.tls === "tls" || options.tls === "reality";
  node.serverName = options.sni ?? "";
  node.host = options.host ?? "";
  node.path = options.path ?? "";
  node.fingerprint = options.fingerprint ?? "";
  node.publicKey = options.publicKey ?? "";
  node.shortId = options.shortId ?? "";
  if (options.alpn) {
    node.alpn = options.alpn;
  }
}

export interface TuicOptions {
  group: string;
  remark: string;
  server: string;
  port: string | number;
  userId: string;
  password: string;
  congestionControl?: string;
  alpn?: string[];
  sni?: string;
  udp?: TriBool;
  tfo?: TriBool;
  scv?: TriBool;
  underlyingProxy?: string;
}

/** Build a TUIC node. */
export function tuicConstruct(node: Proxy, options: TuicOptions): void {
  commonConstruct(
    node,
    ProxyType.TUIC,
    options.group,
    options.remark,
    options.server,
    options.port,
    options.udp,
    options.tfo,
    options.scv,
    undefined,
    options.underlyingProxy ?? "",
  );
  node.tlsSecure = true;
  node.userId = options.userId;
  node.password = options.password;
  node.congestionControl = options.congestionControl ?? "";
  node.serverName = options.sni ?? "";
  if (options.alpn) {
    node.alpn = options.alpn;
  }
}
