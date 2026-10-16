import type { TriBool } from "./tribool";

/** Proxy protocol kinds supported by the converter. */
export enum ProxyType {
  Unknown = "unknown",
  Shadowsocks = "ss",
  ShadowsocksR = "ssr",
  VMess = "vmess",
  VLESS = "vless",
  Trojan = "trojan",
  Snell = "snell",
  HTTP = "http",
  HTTPS = "https",
  SOCKS5 = "socks5",
  WireGuard = "wireguard",
  Hysteria = "hysteria",
  Hysteria2 = "hysteria2",
  TUIC = "tuic",
  AnyTLS = "anytls",
}

/** Human-readable name used by generators that prefix the remark. */
export function proxyTypeName(type: ProxyType): string {
  switch (type) {
    case ProxyType.Shadowsocks:
      return "SS";
    case ProxyType.ShadowsocksR:
      return "SSR";
    case ProxyType.VMess:
      return "VMess";
    case ProxyType.VLESS:
      return "VLESS";
    case ProxyType.Trojan:
      return "Trojan";
    case ProxyType.Snell:
      return "Snell";
    case ProxyType.HTTP:
      return "HTTP";
    case ProxyType.HTTPS:
      return "HTTPS";
    case ProxyType.SOCKS5:
      return "SOCKS5";
    case ProxyType.WireGuard:
      return "WireGuard";
    case ProxyType.Hysteria:
      return "Hysteria";
    case ProxyType.Hysteria2:
      return "Hysteria2";
    case ProxyType.TUIC:
      return "TUIC";
    case ProxyType.AnyTLS:
      return "AnyTLS";
    default:
      return "Unknown";
  }
}

/** Default provider group names, mirrored from the C++ `*_DEFAULT_GROUP`. */
export const DEFAULT_GROUPS = {
  anytls: "AnyTLSProvider",
  http: "HTTPProvider",
  hysteria: "HysteriaProvider",
  hysteria2: "Hysteria2Provider",
  snell: "SnellProvider",
  socks: "SocksProvider",
  ss: "SSProvider",
  ssr: "SSRProvider",
  trojan: "TrojanProvider",
  tuic: "TUICProvider",
  v2ray: "V2RayProvider",
  wireguard: "WireGuardProvider",
} as const;

/**
 * A single proxy node.
 *
 * The field set intentionally mirrors subconverter's `Proxy` struct so ports of
 * the C++ parsers/generators stay one-to-one and easy to audit.
 */
export interface Proxy {
  type: ProxyType;
  id: number;
  groupId: number;
  group: string;
  remark: string;
  hostname: string;
  port: number;

  username: string;
  password: string;
  encryptMethod: string;
  plugin: string;
  pluginOption: string;
  protocol: string;
  protocolParam: string;
  obfs: string;
  obfsParam: string;
  userId: string;
  alterId: number;
  transferProtocol: string;
  fakeType: string;
  tlsSecure: boolean;

  host: string;
  path: string;
  edge: string;

  /** VLESS `flow` control (e.g. `xtls-rprx-vision`). */
  flow: string;
  /** TUIC congestion control algorithm. */
  congestionControl: string;

  quicSecure: string;
  quicSecret: string;

  udp: TriBool;
  tcpFastOpen: TriBool;
  allowInsecure: TriBool;
  tls13: TriBool;

  underlyingProxy: string;

  snellVersion: number;
  serverName: string;

  selfIp: string;
  selfIpv6: string;
  publicKey: string;
  privateKey: string;
  preSharedKey: string;
  dnsServers: string[];
  mtu: number;
  allowedIps: string;
  keepAlive: number;
  testUrl: string;
  clientId: string;

  ports: string;
  up: string;
  upSpeed: number;
  down: string;
  downSpeed: number;
  authStr: string;
  sni: string;
  fingerprint: string;
  ca: string;
  caStr: string;
  recvWindowConn: number;
  recvWindow: number;
  disableMtuDiscovery: TriBool;
  hopInterval: number;
  alpn: string[];

  cwnd: number;
}

/** Create a proxy with subconverter's default field values. */
export function createProxy(): Proxy {
  return {
    allowedIps: "0.0.0.0/0, ::/0",
    allowInsecure: undefined,
    alpn: [],
    alterId: 0,
    authStr: "",
    ca: "",
    caStr: "",
    clientId: "",
    congestionControl: "",
    cwnd: 0,
    disableMtuDiscovery: undefined,
    dnsServers: [],
    down: "",
    downSpeed: 0,
    edge: "",
    encryptMethod: "",
    fakeType: "",
    fingerprint: "",
    flow: "",
    group: "",
    groupId: 0,
    hopInterval: 0,
    host: "",
    hostname: "",
    id: 0,
    keepAlive: 0,
    mtu: 0,
    obfs: "",
    obfsParam: "",
    password: "",
    path: "",
    plugin: "",
    pluginOption: "",
    port: 0,
    ports: "",
    preSharedKey: "",
    privateKey: "",
    protocol: "",
    protocolParam: "",
    publicKey: "",
    quicSecret: "",
    quicSecure: "",
    recvWindow: 0,
    recvWindowConn: 0,
    remark: "",
    selfIp: "",
    selfIpv6: "",
    serverName: "",
    snellVersion: 0,
    sni: "",
    tcpFastOpen: undefined,
    testUrl: "",
    tls13: undefined,
    tlsSecure: false,
    transferProtocol: "",
    type: ProxyType.Unknown,
    udp: undefined,
    underlyingProxy: "",
    up: "",
    upSpeed: 0,
    userId: "",
    username: "",
  };
}
