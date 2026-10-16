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

[tindy2013/subconverter](https://github.com/tindy2013/subconverter) 的 TypeScript 重写版本：
一个同构的订阅转换器，可运行于 **Node.js**、**浏览器** 以及 **CLI**。

它解析 subconverter 所支持的各种订阅与配置格式，将其统一归一化到同一个代理模型，
再按目标客户端需要的格式重新输出。

## 目录结构

这是一个 npm workspaces monorepo，依赖方向严格受限
（`core` ← `node`/`browser` ← `cli`）：

| 包                 | 用途                                                   |
| ------------------ | ------------------------------------------------------ |
| `packages/core`    | 与平台无关的转换引擎：解析器、生成器、节点操作。       |
| `packages/node`    | Node 适配层：文件系统 + `fetch` 订阅加载。             |
| `packages/browser` | 浏览器构建产物（ESM + IIFE 全局变量 `SubConverter`）。 |
| `packages/cli`     | `subconverter` 命令行工具。                            |

引擎从不导入 Node 内置模块或 DOM 全局对象，因此同一份代码可同时支撑以上三个运行目标。

## 安装

```bash
npm i @subconverter/core     # 仅引擎
npm i @subconverter/node     # + Node 加载层（fetch/fs）
npm i @subconverter/browser  # 浏览器 ESM / IIFE 全局变量 `SubConverter`
npm i -g @subconverter/cli  # CLI：`subconverter`
```

## 功能特性

**输入解析**（`@subconverter/core`）

- 分享链接：`ss://`、`ssr://`、`vmess://`（v2rayN / Shadowrocket / Kitsunebi / Quantumult）、
  `trojan://`、`hysteria2://` / `hy2://`、`anytls://`、`Netch://`、telegram socks/http。
- 订阅：base64 链接列表、纯文本链接列表、`ssd://`。
- 配置：Clash YAML、Surge/Loon `[Proxy]` INI、v2rayN JSON、Shadowsocks/SSR JSON、SSTap、
  Netch。
- 节点操作匹配器：`!!GROUP=`、`!!GROUPID=`/`!!INSERT=`、`!!TYPE=`、`!!PORT=`、
  `!!SERVER=`，以及重命名/emoji/子筛选规则。

**输出生成**

- Clash / ClashR YAML（`clashNewFieldName` 可切换 `proxies`/`proxy-groups` 与旧版
  `Proxy`/`Proxy Group`；新字段名下会输出 `dialer-proxy`）。
- Surge（proxy + proxy-group 段落、WireGuard 子段落、基础配置保留）。
- Quantumult X（`[server_local]`/`[policy]`）、Quantumult（`[SERVER]`/`[POLICY]`）、Loon。
- sing-box JSON（`outbounds`、selector/urltest 分组、由规则集生成的
  `route.rules`/`route.final`）。
- Mellow（`[Endpoint]`/`[EndpointGroup]`、由规则集生成的 `[RoutingRule]`）。
- 分享链接导出：`v2ray`、`ss`、`ssr`、`trojan`、`mixed`、`nodelist`、`ssd`、SIP008。

**规则集、分组与设置**

- 在 Surge / Quantumult X / Clash 方言之间转换规则集，并输出为 Clash、
  Surge/QuanX/Quan/Surfboard/Loon 规则或 sing-box `route` 片段。
- 代理组编译，支持所有 subconverter 匹配器与分组类型（select、url-test、
  fallback、load-balance、relay、ssid、smart）。
- 外部配置解析（`[custom]` INI：`ruleset`、`custom_proxy_group`、`rename`、`emoji`、
  备注包含/排除、基础文件）以及请求查询字符串解析。
- 由 `[template]` 变量驱动的轻量模板插值（`{{ var }}`）。

## Node 适配层

`@subconverter/node` 可从 URL、本地文件或内联文本加载订阅，并从远程 URL 或本地路径解析
规则集（支持 `surge:`/`quanx:`/`clash-domain:` 风格的类型前缀以及自动方言检测）。

## 开发

```bash
npm install
npm run build      # 使用 tsup 为每个包打包
npm run typecheck  # 逐包运行 tsc
npm run lint       # eslint（flat 配置），带 --max-warnings 0
npm test           # vitest
npm run format     # prettier
```

## CLI

```bash
# 将远程订阅转换为 Clash
subconverter convert --url https://example.com/sub --target clash --out clash.yaml

# 转换本地文件，并添加 emoji、重命名
subconverter convert --file sub.txt --target v2ray \
  --add-emoji --emoji 'HK@🇭🇰' --rename 'Netflix@NF'

# 解析单条链接
subconverter parse 'trojan://pw@1.2.3.4:443?sni=example.com#Node'
```

## 编程调用

```ts
import { generate, parseSubscription, TargetFormat } from "@subconverter/core";

const nodes = parseSubscription(await response.text());
const clash = generate(nodes, { target: TargetFormat.Clash });
```

## 发版

四个包同版本推进。根`package.json`的版本号是唯一可信源，`scripts/sync-versions.mjs`
负责同步到`packages/*`和`package-lock.json`。

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
