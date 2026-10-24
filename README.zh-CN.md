# subconverter-ts

[![CI](https://github.com/jinganix/subconverter/actions/workflows/ci.yml/badge.svg)](https://github.com/jinganix/subconverter/actions/workflows/ci.yml)
[![core coverage](https://codecov.io/gh/jinganix/subconverter/branch/main/graph/badge.svg?flag=core)](https://codecov.io/gh/jinganix/subconverter/flags/core)
[![node coverage](https://codecov.io/gh/jinganix/subconverter/branch/main/graph/badge.svg?flag=node)](https://codecov.io/gh/jinganix/subconverter/flags/node)
[![browser coverage](https://codecov.io/gh/jinganix/subconverter/branch/main/graph/badge.svg?flag=browser)](https://codecov.io/gh/jinganix/subconverter/flags/browser)
[![cli coverage](https://codecov.io/gh/jinganix/subconverter/branch/main/graph/badge.svg?flag=cli)](https://codecov.io/gh/jinganix/subconverter/flags/cli)
[![npm core](https://img.shields.io/npm/v/@subconverter/core)](https://www.npmjs.com/package/@subconverter/core)
[![npm node](https://img.shields.io/npm/v/@subconverter/node)](https://www.npmjs.com/package/@subconverter/node)
[![npm browser](https://img.shields.io/npm/v/@subconverter/browser)](https://www.npmjs.com/package/@subconverter/browser)
[![npm cli](https://img.shields.io/npm/v/@subconverter/cli)](https://www.npmjs.com/package/@subconverter/cli)

[English](README.md) | 简体中文

当前版本：**v0.2.0** —— 变更记录见 [CHANGELOG.md](CHANGELOG.md)。

[tindy2013/subconverter](https://github.com/tindy2013/subconverter) 的 TypeScript 重写版本：
一个同构的订阅转换器，可运行于 **Node.js**、**浏览器** 以及 **CLI**。

它解析 subconverter 所支持的各种订阅与配置格式，将其统一归一化到同一个代理模型，
再按目标客户端需要的格式重新输出。

## 目录结构

这是一个 npm workspaces monorepo，依赖方向严格受限
（`core` ← `node`/`browser` ← `cli`）：

| 包                 | 用途                                                              |
| ------------------ | ----------------------------------------------------------------- |
| `packages/core`    | 与平台无关的转换引擎：解析器、生成器、节点操作。                  |
| `packages/node`    | Node 适配层：文件系统 + `fetch` 加载、GeoIP 地区查询、HTTP 服务。 |
| `packages/browser` | 浏览器构建产物（ESM + IIFE 全局变量 `SubConverter`）。            |
| `packages/cli`     | `subconverter` 命令行工具。                                       |

引擎从不导入 Node 内置模块或 DOM 全局对象，因此同一份代码可同时支撑以上三个运行目标。

## 安装

```bash
npm i @subconverter/core     # 仅引擎
npm i @subconverter/node     # + Node 加载层（fetch/fs）与 /sub 服务
npm i @subconverter/browser  # 浏览器 ESM / IIFE 全局变量 `SubConverter`
npm i -g @subconverter/cli  # CLI：`subconverter`
```

## 支持的格式

### 输入：订阅与配置

以下格式均可被 `parseSubscription` 自动识别（顺序：结构化 JSON 配置 → `ssd://` →
Clash YAML → Surge INI → base64/明文链接列表）。

| 分类       | 格式                       | 示例 / 识别方式                                                   | 说明                                                                            |
| ---------- | -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 链接列表   | 明文分享链接               | 每行一条（或空格分隔）                                            | `parseSubscription` / `parseLink`                                               |
| 链接列表   | Base64 订阅                | 上述列表的 base64                                                 | 自动解码；与明文解析出相同节点                                                  |
| 链接列表   | `ssd://` 订阅              | `ssd://...`                                                       | SSD 服务器；`traffic_used`/`traffic_total` 按十进制 GB（1 GB = 1000³ 字节）计算 |
| 客户端配置 | Clash YAML                 | `proxies:` / `Proxy:`                                             | 全协议回环                                                                      |
| 客户端配置 | Surge / Loon `[Proxy]` INI | `[Proxy]`、`[WireGuard]` 段落                                     | WireGuard 子段落保留                                                            |
| 应用 JSON  | Shadowsocks / `ssconf`     | `"version"` + `"servers"`、`"configs"`、`"proxy_apps"`、ssandroid | 含 2 服务器 `ssconf` 用例                                                       |
| 应用 JSON  | SSR 配置                   | `"serverSubscribes"`、`"local_address"` + `"local_port"`          |                                                                                 |
| 应用 JSON  | v2rayN JSON                | `"uiItem"` / `"vnext"`                                            |                                                                                 |
| 应用 JSON  | SSTap JSON                 | `"idInUse"`                                                       |                                                                                 |
| 应用 JSON  | Netch 配置                 | `"ModeFileNameType"`                                              | 另支持 `Netch://` 链接                                                          |

### 节点协议与链接格式

`ProxyType` 定义见 `packages/core/src/types/proxy.ts`。链接由
`packages/core/src/parser/uri.ts` 的 `explode*` 解析；无链接格式的协议
（标注“仅配置”）来自 Clash/Surge 解析器。

| 协议（`ProxyType`）    | 链接格式                                       | 输入来源                                                          | 传输 / TLS 说明                                                  |
| ---------------------- | ---------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `ss` Shadowsocks       | `ss://`                                        | 链接（SIP002、明文、`simple-obfs`/`v2ray-plugin`）                | 保留 obfs / v2ray-plugin 参数                                    |
| `ssr` ShadowsocksR     | `ssr://`                                       | 链接                                                              | `origin`/`plain` 的 SSR 在纯 SS 目标中可降级为 SS                |
| `vmess` VMess          | `vmess://`、`vmess1://`                        | 链接（v2rayN JSON、Shadowrocket、Kitsunebi、Quantumult 分享格式） | `tcp`/`ws`；`tls`；`aid`/`aead`                                  |
| `vless` VLESS          | `vless://`                                     | 链接                                                              | `tcp`/`ws`/`grpc`；`tls`/`reality`，支持 `flow`/`fp`/`pbk`/`sid` |
| `trojan` Trojan        | `trojan://`                                    | 链接（直连 / `ws`）                                               | `sni`/`host`/`path`                                              |
| `socks5` SOCKS5        | `socks://`、`tg://socks`、`https://t.me/socks` | 链接（含 Telegram）                                               | 可选认证 / TLS                                                   |
| `http`/`https` HTTP    | 凭证 URL、`tg://http`、`https://t.me/http`     | 链接（含 Telegram、`http://` 凭证列表）                           | `username:password@host:port`                                    |
| `hysteria2` Hysteria2  | `hysteria2://`、`hy2://`                       | 链接                                                              | `password`、`sni`、速率、指纹                                    |
| `tuic` TUIC            | `tuic://`                                      | 链接                                                              | `uuid`/`password`、拥塞控制                                      |
| `anytls` AnyTLS        | `anytls://`                                    | 链接                                                              | `password`、`sni`                                                |
| `wireguard` WireGuard  | —（仅配置）                                    | Clash / Surge `[WireGuard]`                                       | 密钥、`self-ip`、DNS、MTU、对端                                  |
| `snell` Snell          | —（仅配置）                                    | Clash / Surge                                                     | `psk`、`obfs`、`version`                                         |
| `hysteria` Hysteria v1 | —（仅配置）                                    | Clash                                                             | 旧版 `up`/`down`、obfs、auth                                     |
| `Netch`                | `Netch://`                                     | 链接                                                              | Netch 分享格式                                                   |

节点操作匹配器：`!!GROUP=`、`!!GROUPID=`/`!!INSERT=`、`!!TYPE=`、`!!PORT=`、
`!!SERVER=`，以及重命名/emoji/子筛选规则。

### 输出：目标格式

`generate(nodes, { target, ... })`；`TargetFormat` 定义见
`packages/core/src/types/settings.ts`。每条先写输出形态，再写该目标会静默丢弃的节点类型。

- `clash`（`clash.yaml`，`text/yaml`）——`proxies`/`proxy-groups`/`rules`；`legacy=true`
  切回 `Proxy`/`Proxy Group`/`Rule`；新字段名下输出 `dialer-proxy`；VLESS 支持
  `flow`/`reality-opts`。不丢节点。
- `clashr`（`clashr.yaml`，`text/yaml`）——ClashR YAML，字段规则同 `clash`。不丢节点。
- `surge`（`surge.conf`，`text/plain`）——Surge v2–v5（`surge_version`，默认 5）；
  proxy + proxy-group 段落、WireGuard 子段落、基础配置保留；Trojan `ws` 参数、
  `hysteria2` 命名。丢弃 VLESS、TUIC、Hysteria v1；
  VMess/Trojan/WireGuard/Hysteria2/AnyTLS 需 v4+；SSR 需 `surgeSsrPath` 且 v2+。
- `surfboard`（`surfboard.conf`，`text/plain`）——固定最新版 Surge 行格式。丢弃 Surge
  丢弃的全部，另加 Hysteria2、AnyTLS。
- `quanx`（`quanx.conf`，`text/plain`）——`[server_local]`/`[policy]`，含 `vless`
  与 REALITY 参数。丢弃 Snell、WireGuard、Hysteria v1/v2、TUIC、AnyTLS。
- `quan`（`quan.conf`，`text/plain`）——`[SERVER]`/`[POLICY]`。丢弃 VLESS、Trojan、
  Snell、WireGuard、Hysteria*、TUIC、AnyTLS。
- `loon`（`loon.conf`，`text/plain`）——`Proxy`/`Proxy Group`，含 `VLESS` 与 REALITY
  参数。丢弃 Snell、Hysteria v1、TUIC、AnyTLS。
- `mellow`（`mellow.conf`，`text/plain`）——`[Endpoint]`/`[EndpointGroup]`，以及由规则集
  生成的 `[RoutingRule]`。仅保留无插件 SS、VMess、SOCKS5、HTTP。
- `singbox`（`singbox.json`，`application/json`）——`outbounds`（selector/urltest 分组）、
  由规则集生成的 `route.rules`/`route.final`。丢弃 SSR、Snell。
- `v2ray`（`v2ray.txt`，`text/plain`）——base64 VMess 链接列表。丢弃非 VMess。
- `ss`（`ss.txt`，`text/plain`）——base64 SS 链接列表（去重）；`origin`/`plain` 的 SSR
  可降级为 SS。丢弃非 SS。
- `ssr`（`ssr.txt`，`text/plain`）——base64 SSR 链接列表。丢弃非 SSR。
- `trojan`（`trojan.txt`，`text/plain`）——base64 Trojan 链接列表。丢弃非 Trojan。
- `mixed`（`mixed.txt`，`text/plain`）——base64 混合 SS/SSR/VMess/Trojan 列表（经典
  子集）。丢弃 VLESS、Hysteria2、TUIC、AnyTLS。
- `nodelist`（`nodelist.txt`，`text/plain`）——纯节点列表，无分组/包装。不丢节点。
- `ssd`（`ssd.txt`，`text/plain`）——`ssd://` 文档。丢弃非 SS。
- `sssub`（`sssub.json`，`application/json`）——SIP008 JSON。丢弃非 SS。
- `auto`——仅输入检测，不可作为 `/sub?target=`。

> 支持的协议与节点格式会持续补充：新增链接协议、传输方式（`ws`/`grpc`/`h2`/`http`）
> 或 TLS 模式（如 REALITY）时，请同步扩展 `packages/core/tests/` 下的静态矩阵
> （`protocol-matrix`、`conversion-snapshots`、`format-matrix`）与上表。

**规则集、分组与设置**

- 在 Surge / Quantumult X / Clash 方言之间转换规则集，并输出为 Clash、
  Surge/QuanX/Quan/Surfboard/Loon 规则或 sing-box `route` 片段。
- 代理组编译，支持所有 subconverter 匹配器与分组类型（select、url-test、
  fallback、load-balance、relay、ssid、smart）。
- 外部配置解析（`[custom]` INI：`ruleset`、`custom_proxy_group`、`rename`、`name_regex`、
  `name_remove`、`emoji`、备注包含/排除、基础文件）以及请求查询字符串解析。
- 由 `[template]` 变量驱动的轻量模板插值（`{{ var }}`）。
- 规则默认开启：未传 `rulesets`/`groups` 时回退到上游风格的远端默认规则
  （`@subconverter/node` 带 TTL 缓存 + 单飞请求，离线时回退内置静态规则）。传
  `no_rules` / `--no-rules`（`includeRules: false`）可整体去掉规则；
  `with_rules` 兼容保留。Surge 默认版本为 **5**。

## Node 适配层

`@subconverter/node` 可从 URL、本地文件或内联文本加载订阅，并从远程 URL 或本地路径解析
规则集（支持 `surge:`/`quanx:`/`clash-domain:` 风格的类型前缀以及自动方言检测）。
`collectRulesets` 并发拉取、失败跳过；`getCachedDefaultRulesets` 缓存默认远端列表。

## 开发

```bash
npm install
npm run build      # 使用 tsup 为每个包打包
npm run typecheck  # 逐包运行 tsc
npm run lint       # eslint（flat 配置），带 --max-warnings 0
npm test           # vitest
npm run format     # prettier
```

## 文档

- [`docs/API.md`](docs/API.md)——所有公开导出，含签名、枚举成员与接口字段。由
  `npm run docs:api` 从各包 barrel 生成；`npm run docs:check`（已并入 `npm run check`）
  会在文件过期时报错。
- [`llms.txt`](llms.txt)——面向 LLM 与 agent 工具的紧凑索引。
- [`CHANGELOG.md`](CHANGELOG.md)——版本变更记录。
- [`AGENTS.md`](AGENTS.md)——编码 agent 指南（分层、命令、约定）。

## CLI

```bash
# 将远程订阅转换为 Clash
subconverter convert --url https://example.com/sub --target clash --out clash.yaml

# 转换本地文件，并添加 emoji、重命名
subconverter convert --file sub.txt --target v2ray \
  --add-emoji --emoji 'HK@🇭🇰' --rename 'Netflix@NF'

# 解析单条链接
subconverter parse 'trojan://pw@1.2.3.4:443?sni=example.com#Node'

# 列出全部输出目标
subconverter formats

# 启动与上游 subconverter 类似的 HTTP 服务（默认端口 25500）
subconverter serve --port 25500 --host 0.0.0.0
```

转换参数：`--surge-version`（默认 **5**）、`--new-field-name`（默认 **true**，
`--new-field-name=false` 切回旧版 `Proxy`）、`--legacy`（旧版 Clash 字段名）、
`--with-rules`（默认开启，兼容保留）/ `--no-rules`（去掉规则与默认分组）。

### 重命名前的名字清理

`--name-regex <匹配@替换>` 用 JS 正则改写节点名（支持 `$1` 反向引用、替换全部匹配、可重复），
`--name-remove <a,b>` 按字面量删除片段（可重复、逗号分隔）。两者都在 `--rename`、emoji、
`--auto-country` 和排序**之前**执行，后续规则看到的是清理后的名字：

```bash
# abc@server1.xxx.yyy -> server1 -> 美国-server1
subconverter convert --file sub.txt --target clash \
  --name-regex '^abc@([^.]+)\..*$@$1' --auto-country --geoip ./GeoLite2-Country.mmdb

# foo.server1.bar -> server1（删除后残留的分隔符会被合并）
subconverter convert --file sub.txt --target clash --name-remove 'foo,bar'
```

结果为空时保留原名，非法正则会被忽略。外部 INI 配置中对应 `name_regex=匹配@替换` 与
`name_remove=a,b`；HTTP 请求使用 `name_regex`（可重复）与 `name_remove`（逗号分隔）。

### 按 IP 自动加国家/地区前缀

名字里没有国家/地区信息时，按服务器 IP 查询本地 MaxMind 数据库
（GeoLite2/GeoIP2 Country 或 City `.mmdb`），把国家/地区加到名字最前面：

```bash
subconverter convert --file sub.txt --target clash \
  --auto-country --geoip ./GeoLite2-Country.mmdb
# server1 -> 美国-server1
```

`--country-locale` 指定 `Intl.DisplayNames` 的区域语言（默认 `zh-CN`，`en` 会得到
`United States-server1`）。已经包含国家/地区的名字（`香港-01`、`US01`、`🇭🇰 HK`、
`Hong Kong 01`）保持不变；域名服务器会先做一次 DNS 解析（同一主机名只查一次）。
数据库需自行从 MaxMind 下载（GeoLite2 需免费账号）或使用兼容镜像，仓库不内置。
`data/` 已被 git 忽略，适合放本地副本：

```bash
mkdir -p data && curl -fL -o data/GeoLite2-Country.mmdb \
  https://raw.githubusercontent.com/P3TERX/GeoLite.mmdb/download/GeoLite2-Country.mmdb
```

## 服务端（Docker）

```bash
docker build -t subconverter-ts .
docker run -p 25500:25500 subconverter-ts
# 或（挂载 GeoIP 数据库，启用国家/地区前缀）
docker compose up --build
```

通过 URL 转换（对齐上游 `/sub`）：

```text
GET http://127.0.0.1:25500/sub?target=clash&url=https://example.com/sub
```

服务端用 `--geoip` 启动即启用国家/地区前缀（挂载数据库即可，单个请求可用
`auto_country=false` 关闭）；数据库路径只从命令行读取，不接受 query 参数：

```bash
subconverter serve --geoip /data/GeoLite2-Country.mmdb
# GET /sub?target=clash&url=...
```

另有 `GET /`（用法说明）与 `GET /version`。仅支持 `GET`/`HEAD`，已启用 CORS。
响应按目标设置 `Content-Type`（见上方目标格式列表）、`Content-Disposition: attachment`，
并在可用时透传 `subscription-userinfo` / `profile-update-interval`。
限制：仅 `http(s)` URL、最多 5 个订阅 URL（`|` 分隔或重复 `url` 参数）、
15 s 拉取超时、单体 5 MB 上限。服务端的 `config`/`base` 只接受远端 `http(s)`
URL（拒绝本地路径）；`[]RULE` 内联规则集不受影响。

### 查询参数

括号内为默认值；下划线参数同时接受连字符别名。

- `target`（`clash`）——输出格式（见上方目标格式列表；`auto` 非法）。
- `url`——订阅 URL，可重复，多个用 `|` 分隔。
- `config`——远端 `http(s)` 外部 INI（`[]` 忽略；拒绝本地路径）。
- `ruleset`（别名 `rulesets`）——`group,url[,interval]` 或 `group,[]RULE`，可重复，
  `|` 分隔。
- `group`——额外 select 分组名（可重复）。
- `interval`（上游值）——覆盖 `profile-update-interval` 响应头。
- `surge_version`（别名 `surge-version`、`ver`、`version`；默认 `5`）——Surge 目标版本。
- `new_field_name`（别名 `new_name` 及连字符变体；默认 `true`）——Clash 新字段名；
  裸 `?flag` 视为 `true`。
- `legacy`（别名 `legacy_field_name`、`legacy-field-name`；默认 `false`）——旧版
  `Proxy`/`Proxy Group`/`Rule`，优先于 `new_field_name`。
- `with_rules`（`with-rules`；默认 `true`）——附加规则 + 默认分组（兼容保留）。
- `no_rules`（`no-rules`；默认 `false`）——去掉规则与默认分组。
- `auto_country`（`auto-country`）——给缺少国家/地区的名字加前缀；服务端带 `--geoip`
  时默认开启。
- `name_regex`——重命名前对名字做 `匹配@替换` 正则替换（可重复）。
- `name_remove`——重命名前按逗号分隔的字面量删除名字片段。
- `userinfo_url`（别名 `userinfo-url`、`userinfo`）——额外流量接口（见下）。
- `userinfo_provider`（别名 `userinfo-provider`、`userinfo_type`、`userinfo-type`；
  自动识别）——流量转换器（见下）。
- `parseRequestSettings` 解析的其余开关（`rename`、`emoji`、`include`、`exclude`、
  `add_emoji`、`remove_emoji`、`append_type`、`sort`、`filter_deprecated`、`dedupe`、
  `tfo`、`udp`、`scv`、`tls13`、`insert`、`classical`…）均接受下划线/连字符，
  大小写不敏感。

### 流量信息（`userinfo_url`）

部分机场把用量放在单独接口。用 `userinfo_url` 指定接口，
`userinfo_provider` 选择转换器：

```text
GET /sub?target=clash&url=<订阅>&userinfo_url=<流量接口>&userinfo_provider=jms
```

`auto`（默认）依次尝试 JMS JSON、通用 JSON、header 字符串，并统一输出
`subscription-userinfo` 响应头值。各转换器：

- `jms`（别名 `justmysocks`、`just-my-socks`）——接受 Just-My-Socks JSON
  （`monthly_bw_limit_b`、`bw_counter_b`、`bw_reset_day_of_month`，兼容驼峰），输出
  `upload=0; download=…; total=…; expire=…`；十进制 GB 换算成二进制字节以便客户端显示
  标称值，`expire` 为下一个 UTC 零点。
- `subscription`（别名 `raw`、`sub`、`clash`、`subscription-userinfo`）——接受
  `subscription-userinfo` 风格的值或通用 JSON，规范化后透传。

不传 `userinfo_url` 时透传订阅自身的 `subscription-userinfo` 响应头；
传入后以前者为准（未显式指定 provider 时，仅转换 JMS 这类已知形状）。
同样的转换器也可通过 `@subconverter/core` 的
`convertUserinfo`、`parseJmsUserinfo`、`formatSubscriptionUserinfo`
以编程方式调用。

## 编程调用

```ts
import { generate, parseSubscription, TargetFormat } from "@subconverter/core";

const nodes = parseSubscription(await response.text());
const clash = generate(nodes, { target: TargetFormat.Clash });
```

```ts
import { convertUserinfo } from "@subconverter/core";
import { convertSubRequest, startServer } from "@subconverter/node";

const userinfo = convertUserinfo(rawQuotaBody, "jms");
const server = await startServer({ host: "0.0.0.0", port: 25500 });
```

## 发版

四个包同版本推进。根`package.json`的版本号是唯一可信源，`scripts/sync-versions.mjs`
负责同步到`packages/*`、`package-lock.json`，以及中英 README 的`当前版本`行，
保证发布页面与 npm 版本一致。

1. 先在仓库`Secrets`里配好`ACTION_TOKEN`（带`repo` + `workflow`权限的PAT）。npm
   认证不需要token：本仓库用[Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
   （OIDC）。在npmjs.com上打开每个包（`@subconverter/core`、`node`、`browser`、`cli`）
   → Settings → Trusted Publisher → GitHub Actions，填org `subconverter`、仓库
   `jinganix/subconverter`、工作流文件`release.yml`。`publish-npm`任务已申请
   `id-token: write`权限并会升级到最新npm CLI。
2. Actions → `RELEASE` → Run workflow。`version`留空即自动bump（用`bump`选
   `patch`/`minor`/`major`），填`x.y.z`则发指定版本。
3. 流水线会自动提`chore: release x.y.z`的PR并合并，打`vx.y.z`标签、建GitHub release，
   然后按依赖顺序发布：`core` → `node`/`browser` → `cli`。
4. 某个包发布失败时，用`publish_only: true` + `targets: <core|node|browser|cli>` +
   已有`version`单独重试。

注意：信任绑定只能建在npm上已存在的包上，所以每个包的首次发布需用一次性automation
token手动发一次（从release标签的干净checkout里跑`npm publish --access public`），绑好
信任关系后删掉token。之后每次发版都是无token的，且自动带provenance。

## 许可证

GPL-3.0，与上游项目保持一致。
