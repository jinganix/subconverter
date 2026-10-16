import { isFlattenableSsr } from "./ciphers";
import {
  httpConstruct,
  snellConstruct,
  socksConstruct,
  ssConstruct,
  ssrConstruct,
  trojanConstruct,
  vmessConstruct,
} from "./construct";
import type { Proxy } from "../types/proxy";
import { DEFAULT_GROUPS } from "../types/proxy";
import { urlSafeBase64Decode } from "../utils/base64";
import { toInt } from "../utils/string";

function tri(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return String(value).toLowerCase() === "true";
}

function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

/** Parse a `Netch://<base64 json>` link into `node`. */
export function explodeNetch(netch: string, node: Proxy): void {
  let data: any;
  try {
    data = JSON.parse(urlSafeBase64Decode(netch.slice(8)));
  } catch {
    return;
  }
  if (data === null || typeof data !== "object") {
    return;
  }
  const type = str(data.Type);
  const group = str(data.Group);
  let remark = str(data.Remark);
  const address = str(data.Hostname);
  const udp = tri(data.EnableUDP);
  const tfo = tri(data.EnableTFO);
  const scv = tri(data.AllowInsecure);
  const port = str(data.Port);
  if (port === "0" || port === "") {
    return;
  }
  const method = str(data.EncryptMethod);
  const password = str(data.Password);
  if (remark === "") {
    remark = `${address}:${port}`;
  }

  switch (type) {
    case "SS":
      ssConstruct(node, {
        group: group === "" ? DEFAULT_GROUPS.ss : group,
        method,
        password,
        plugin: str(data.Plugin),
        pluginOption: str(data.PluginOption),
        port,
        remark,
        scv,
        server: address,
        tfo,
        udp,
      });
      break;
    case "SSR": {
      const protocol = str(data.Protocol);
      const obfs = str(data.OBFS);
      if (isFlattenableSsr(method, obfs, protocol)) {
        ssConstruct(node, {
          group: group === "" ? DEFAULT_GROUPS.ss : group,
          method,
          password,
          plugin: str(data.Plugin),
          pluginOption: str(data.PluginOption),
          port,
          remark,
          scv,
          server: address,
          tfo,
          udp,
        });
      } else {
        ssrConstruct(node, {
          group: group === "" ? DEFAULT_GROUPS.ssr : group,
          method,
          obfs,
          obfsParam: str(data.OBFSParam),
          password,
          port,
          protocol,
          protocolParam: str(data.ProtocolParam),
          remark,
          scv,
          server: address,
          tfo,
          udp,
        });
      }
      break;
    }
    case "VMess":
      vmessConstruct(node, {
        add: address,
        aid: str(data.AlterID),
        cipher: method,
        edge: str(data.Edge),
        group: group === "" ? DEFAULT_GROUPS.v2ray : group,
        host: str(data.Host),
        id: str(data.UserID),
        net: str(data.TransferProtocol),
        path: str(data.Path),
        port,
        remark,
        scv,
        sni: str(data.ServerName),
        tfo,
        tls: str(data.TLSSecure),
        type: str(data.FakeType),
        udp,
      });
      break;
    case "Socks5":
      socksConstruct(node, {
        group: group === "" ? DEFAULT_GROUPS.socks : group,
        password,
        port,
        remark,
        scv,
        server: address,
        tfo,
        udp,
        username: str(data.Username),
      });
      break;
    case "HTTP":
    case "HTTPS":
      httpConstruct(node, {
        group: group === "" ? DEFAULT_GROUPS.http : group,
        password,
        port,
        remark,
        scv,
        server: address,
        tfo,
        tls: type === "HTTPS",
      });
      break;
    case "Trojan":
      trojanConstruct(node, {
        group: group === "" ? DEFAULT_GROUPS.trojan : group,
        host: str(data.Host),
        network: str(data.TransferProtocol),
        password,
        path: str(data.Path),
        port,
        remark,
        scv,
        server: address,
        tfo,
        tlsSecure: str(data.TLSSecure) === "true",
        udp,
      });
      break;
    case "Snell":
      snellConstruct(node, {
        group: group === "" ? DEFAULT_GROUPS.snell : group,
        host: str(data.Host),
        obfs: str(data.OBFS),
        password,
        port,
        remark,
        scv,
        server: address,
        tfo,
        udp,
        version: toInt(str(data.SnellVersion)),
      });
      break;
    default:
      break;
  }
}
