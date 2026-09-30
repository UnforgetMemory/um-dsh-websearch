<div align="center">

<img src="./Hero.png" width="900" alt="um-dsh-websearch — Exa + Parallel + DeepSeek 官方多源网页搜索 · DeepSeek Harness 插件" />

# 🌊 um-dsh-websearch

[![License: MIT](https://img.shields.io/badge/License-MIT-4d9fff?style=flat-square)](./LICENSE) [![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.0--rc.1%20%3C0.3.0-4d9fff?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness) [![Node](https://img.shields.io/badge/Node-%3E%3D20-2ea44f?style=flat-square)](https://nodejs.org) [![Tests](https://img.shields.io/badge/tests-175%20host%20%2B%2016%20visual-blueviolet?style=flat-square)](./tests) [![Lang](https://img.shields.io/badge/lang-CN%20%7C%20EN-8a6d3b?style=flat-square)](./README.en.md) <a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

**为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供的多源网页搜索插件** —— 一个 provider 之下，让 Exa、Parallel 与 DeepSeek 官方一起出海 🌊

🧭 有序 provider 链　·　🔀 双档位门控回退　·　🗝️ 多密钥策略　·　⚡ 并发扇出　·　💾 乐观缓存　·　🎨 官方 primitives 双语设置卡

[🌐 English](./README.en.md)　·　🇨🇳 简体中文

</div>

---

## 📖 目录

- [✨ 特性](#features)
- [🌍 支持的数据源](#sources)
- [📦 环境要求](#requirements)
- [🚀 快速开始](#quickstart)
- [⚙️ 配置](#config)
- [🔄 回退语义](#fallback)
- [🔐 凭据](#credentials)
- [🩺 故障排查](#troubleshooting)
- [🧪 测试](#tests)
- [🧩 开发版本](#devversions)
- [🚚 迁移说明](#migration)
- [🏛️ 架构决策与调研](#adr)
- [🙏 支持](#support)
- [📄 许可证](#license)

<a id="features"></a>

## ✨ 特性

- **🧭 多 provider 策略层** — `providers[]` 有序列表即优先级：每个数据源独立启停，`defaultProvider` 决定顺序链起点，主源被服务器拒绝时逐级降级
- **🔀 付费 / 免费双档位 + 门控回退** — 每个数据源各带一个付费 REST 档与一个免密钥匿名 MCP 档，各自独立开关；跨档必须**同时满足**「耗尽密钥的方向开关」与「目标档位已开启」，绝不擅自降级
- **🗝️ 多密钥策略** — 每个数据源可挂多条凭据引用，`ordered` 按序 / `random` 每次搜索洗牌；每把 key 单独控制 `allowFreeToPaid` / `allowPaidToFree`
- **⚡ 并发扇出** — `concurrency > 1` 时一次搜索并发分发到全部启用源（provider × 档位 × key），结果按 URL 去重合并；`= 1` 保持顺序回退链
- **💾 乐观缓存** — 内存结果缓存，1–86400 秒 TTL、64 条上限，配置指纹变化即时失效
- **🤖 DeepSeek 官方接入** — 伞内包装框架自带 `DeepSeekSearchProvider`（官方 API 对等、零协议漂移），从不以官方 id 注册，`WEB_DUPLICATE_PROVIDER` 永不触发
- **🔒 凭据安全（`UM_WS_` 命名空间）** — 配置只存引用名，密钥本体留在凭据库或环境变量；引用默认带 `UM_WS_` 前缀与官方包隔离，旧引用值一次性拷贝迁移且**绝不删除**
- **🎨 官方 primitives 设置卡** — 卡片整体重建在 DSH 官方 `SettingsForm` / `SettingsFormModel` / `SettingsValueField` / `SettingsSecretField` 之上：插件页行内直接渲染总开关、默认源、并发、缓存与 provider 列表，密钥值经官方凭据接口写入凭据库，密钥字面量绝不落设置文件
- **🛡️ 写前双闸校验** — 宿主侧按 `this?.runtime` 的 `Config` 身份与插件名双重限定本插件行的预持久化瀑布 + 客户端保存前镜像校验：被拒绝的写入不会落盘，非法候选在离开浏览器前即被双语警示拦下，不会出现部分落盘

<a id="sources"></a>

## 🌍 支持的数据源

| 数据源 | 付费档（REST + 密钥） | 免费档（匿名 MCP） | 默认凭据引用 | 出厂状态 |
| --- | --- | --- | --- | --- |
| **Exa** 🥇 | `POST /search`<br />`https://api.exa.ai` | JSON-RPC 直发，工具 `web_search_exa`<br />`https://mcp.exa.ai/mcp` | `UM_WS_EXA_API_KEY` | ✅ 启用 · 默认源 |
| **Parallel** | `POST /v1/search`<br />`https://api.parallel.ai` | JSON-RPC 直发，工具 `web_search`<br />`https://search.parallel.ai/mcp` | `UM_WS_PARALLEL_API_KEY` | ⏸️ 停用 |
| **DeepSeek 官方** 🤖 | 伞内包装官方 `DeepSeekSearchProvider`<br />`https://api.deepseek.com/anthropic/v1` | — （强制关闭） | `UM_WS_DEEPSEEK_API_KEY` | ⏸️ 停用 |

<small>
MCP 传输使用协议版本 `2025-06-18`（JSON-RPC over streamable HTTP）；Parallel 端在 `initialize` 后额外发送 `notifications/initialized`。
结果片段双上限：请求侧 700 字符、本地留存 800 字符。REST 侧 `numResults` 由服务端截断（Exa 1–10、Parallel 1–20）。
</small>

<a id="requirements"></a>

## 📦 环境要求

| 依赖 | 要求 |
| --- | --- |
| DeepSeek Harness | **≥ 0.2.0-rc.1 且 < 0.3.0**（已在 Desktop 0.2.0-rc.2 实测；0.1.7 系列不再支持，见 [ADR-0007](./.um.agents/constraints/ADR-0007-dsh-020-rc2-single-track.md)） |
| Node.js | ≥ 20 |

> ⚠️ **为什么不再支持 0.1.7**
> 初版 0.7.0 的窗口 `>=0.1.7-alpha.2 <0.3.0` 在普通 semver 下匹配不到 `0.2.0-rc.*`（预发布版只被同 `[major,minor,patch]` 元组的比较器命中），宿主升到 0.2.0 桌面版后 pnpm 会把插件的运行时闭包解析到 `0.1.7-rc.2`，与宿主形成双份运行时副本。本修订收窄为 `>=0.2.0-rc.1 <0.3.0`，重装/刷新即与宿主同版；0.1.7 宿主上修订版会被兼容性门禁直接拒装（fail-fast）。

<a id="quickstart"></a>

## 🚀 快速开始

```powershell
pnpm exec dsh plugin --profile web add <本仓库路径>        # 本地 checkout
pnpm exec dsh plugin --profile web add github:UnforgetMemory/um-dsh-websearch
```

安装后重启，在 **设置 → 插件 → UM 网页搜索** 打开 `enabled`（出厂默认关闭）。

### 🧰 安装即接管默认搜索

本包声明了 `dsh.bundle`，`dsh plugin add` 会把它追加进 `dsh.profile.bundles` 并自动挂载自带的补丁层（`cordis.patch.yml`），无需再往 profile 手工插行：

```yaml
- insert:
    - id: um-web-search
      name: um-dsh-websearch

# 自动接管 web 行的搜索后端（安装即生效，卸载随层移除）
- id: web
  config:
    searchProvider: um-web-search
    fetchProvider: http
```

安装即接管默认搜索、卸载即自动回退到部署原默认后端（`deepseek-official`）。部署如需固定其他后端，在 profile 的 `cordis.patch.yml` 显式写 `web` 行即可（后层覆盖前层，**同样要重述两个键**）——模板见 [`cordis.patch.snippet.yml`](./cordis.patch.snippet.yml)。

> ⚠️ 按 id 定向的 patch **整体替换**目标行的 `config`（不是深合并），所以这一行必须重述 `web` 行拥有的**全部**键。base `web` 行同时拥有 `searchProvider` 与 `fetchProvider`；漏写后者会被静默删除，等 profile 里出现第二个 fetch provider 时 `web_fetch` 就会报 `WEB_PROVIDER_AMBIGUOUS`。

> ⚠️ **接管窗口**：出厂默认 `enabled: false`，接管之后、开启 `enabled` 之前搜索不可用 —— `web` 行已指向本插件，关闭状态下搜索返回 `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`。安装后请立即在设置卡开启 `enabled`。

> 📌 **迁移提示**：若你按旧版 README 手工插过 `id: web-search-exa` 的注册行，请先从 profile 的 `cordis.patch.yml` 删除该行，否则 bundle 层挂载后会与新行同时存在、插件被重复加载。

### 🖥️ Desktop（桌面版）

desktop profile 由 Electron 应用独占管理。桌面内置的 dsh 命令（菜单栏「Manage dsh command」安装，或 `resources\runtime\cli\bin\dsh.cmd`）只放行 `plugin` 子命令，其余命令（如 `--dump-config`）对 desktop profile 一律拒绝。桌面端安装/更新即走上述同款 `dsh plugin --profile desktop add …`，或在应用的插件管理 UI 里操作；装完重启桌面应用生效。

<small>注意 pnpm 11 默认的 24 小时 release-age 门会拦住刚发布的 `0.2.0-rc.*`：桌面 profile 的 `pnpm-workspace.yaml` 需要 `minimumReleaseAgeExclude` 白名单（本仓库同款列表）才能解析到最新预发布版（[ADR-0007](./.um.agents/constraints/ADR-0007-dsh-020-rc2-single-track.md)）。</small>

<a id="config"></a>

## ⚙️ 配置

设置在 **设置 → 插件 → UM 网页搜索** 卡片里编辑，落盘到 profile patch 中 `um-web-search` 行的 `config`。表单由插件导出的 `Config` schema 派生；可实时生效的字段声明为 volatile（`enabled`、`defaultProvider`、`concurrency`、`cache`、`providers`）——保存后无需重挂插件，下一次搜索即生效。

### 🌐 全局

| Key | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `false` | 插件总开关 |
| `defaultProvider` | `exa` | 顺序链起点（须为某 provider 的 `id`） |
| `concurrency` | `1` | `1` = 顺序回退链；`2–8` = 并发扇出所有启用源 |
| `cache.enabled` | `false` | 内存结果缓存开关 |
| `cache.ttlSeconds` | `60` | 缓存保鲜时长（1–86400 秒） |

### 🧱 Provider（`providers[]`，数组索引 = 优先级）

| Key | 说明 |
| --- | --- |
| `id` | provider 标识（内置：`exa` / `parallel` / `deepseek`） |
| `name` | 显示名（设置卡列表与角色徽章用） |
| `enabled` | 本 provider 启停 |
| `primaryTier` | 首选档位：`free`（匿名 MCP）或 `paid`（REST + 密钥） |
| `paid.enabled` / `paid.baseURL` | 付费档开关与 REST 端点 |
| `free.enabled` / `free.baseURL` | 免费档开关与匿名 MCP 端点（deepseek 强制关闭） |
| `keys[].ref` | 凭据引用名，自动生成 `UM_WS_<ID>_API_KEY`，追加的依次为 `_1`、`_2`… |
| `keys[].enabled` | 该密钥启停 |
| `keys[].allowFreeToPaid` / `.allowPaidToFree` | 该密钥的双向跨档门控开关 |
| `keysStrategy` | `ordered`（数组序）/ `random`（每次搜索洗牌） |
| `numResults` | 默认结果数 1–20（Exa / DeepSeek 默认 5，Parallel 默认 10） |
| `params` | Exa `searchType`（`auto` / `neural` / `keyword`）；Parallel `mode`（`turbo` / `fast` / `basic` / `advanced`）；DeepSeek `model`（默认 `deepseek-v4-flash`）与 `maxUses`（默认 5） |

> 📌 **手写数组的注意点**：数组元素不能声明 volatile（schemastery 限制），所以 `providers` 是**整数组** volatile、`cache` 是**整对象** volatile，设置服务只能整体写入 —— 手工在 profile patch 里改 provider 列表时请一次写全整个数组。

### 🎨 设置卡界面

插件页里该行先显示一行**有效策略摘要**（启用源顺序 → 并发数；全部关闭时提示不可用），展开后是官方 `SettingsForm`：

- **总开关、默认源、并发、缓存** —— 行内直接编辑
- **provider 列表** —— 每行带角色徽章（`默认` / `备用` / `停用`）、↑↓ 排序、启停开关与「详细配置…」
- **详细配置** —— 在 Modal 里编辑单个 provider 的档位、端点、密钥与参数，每把 key 显示**已配置 / 未配置**徽章

<a id="fallback"></a>

## 🔄 回退语义

### 顺序模式（`concurrency = 1`）

```text
 首选档位 ──▶ 同档 keys（按 keysStrategy）
    │
    ├─ 门控跨档 ──▶ 另一档位的 keys
    │        ▲
    │        └─ 需同时满足「当前 key 方向开关 ∧ 目标档位已开启」
    │
    └─ 本 provider 终态失败 ──▶ 下一个 provider
```

### 并发模式（`concurrency > 1`）

所有启用源（provider × 档位 × key）并行执行，单源失败不影响其他源，成功结果按 URL 去重合并。这里没有「回退」概念 —— 免费档是否参与由其自身开关决定。

### 什么会触发回退

| ✅ 触发回退 | ❌ 永不回退 |
| --- | --- |
| 401 / 402 / 403 / 429 / 5xx（服务端拒绝） | 取消（`WEB_ABORTED`） |
| | 密钥缺失（`CREDENTIAL_MISSING`） |
| | 客户端 4xx（含 422） |
| | 契约错误（响应不符合 API 形状） |
| | 网络失败 |

<small>DeepSeek 官方档不暴露 HTTP 状态，按其官方类的消息形态做三档分类：消息含 `(HTTP NNN)` 时按上表判定；已知不可降级形态（无 `web_search_tool_result`、unprocessable body、`search request failed`、`credential resolution failed`）不降级。</small>

<a id="credentials"></a>

## 🔐 凭据

- **📝 设置卡里直接输入密钥值** —— 保存时经官方凭据接口（`ctx.remote.credentials.set(ref, value)`，位置参数）写入 **DSH 凭据库**，配置只存自动生成的**引用名**，密钥字面量绝不落设置文件。**留空 = 保持当前已存密钥。**
- **🛡️ 防泄露** —— 页面只知「是否非空白地配置了密钥」（已配置 / 未配置徽章，来自 `ctx.remote.credentials.describe([refs])`），已存值**绝不回显**；空白串不算已填写，写入前 trim。
- **🔑 引用名自动生成** —— 每个 provider 的第一把 key 用 `UM_WS_<ID>_API_KEY`，追加的 key 依次为 `_1`、`_2`…（添加时生成、此后稳定不变，与官方包共享的 `EXA_API_KEY` / `DEEPSEEK_API_KEY` 等显式隔离）。
- **🗂️ 也可手工存入凭据库**（设置 → Models 页的 API 密钥区）或作为启动环境变量注入 —— 引用名对上即可用。被环境变量遮蔽的引用为只读（`writable: false`），卡片会拒绝写入。
- **🌍 免密钥玩法** —— 开启某 provider 的免费档（`free.enabled`）即走公共 MCP，无需任何密钥。
- **🚀 DeepSeek 官方快速启用** —— 在设置卡输入 key（自动写入 `UM_WS_DEEPSEEK_API_KEY`）→ 开启 `deepseek` provider 的付费档 → 保存即生效。
- **🧹 旧凭据迁移** —— 旧默认引用 `EXA_API_KEY` / `PARALLEL_API_KEY` 的值会自动拷贝到 `UM_WS_EXA_API_KEY` / `UM_WS_PARALLEL_API_KEY`（**仅拷贝，绝不删除旧引用**）。

<a id="troubleshooting"></a>

## 🩺 故障排查

| 现象 | 原因与解法 |
| --- | --- |
| 搜索返回 `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` | 总开关关闭。`web` 行已指向本插件，`enabled` 为 `false` 时不回退其他后端；在设置卡开启 `enabled` |
| `web_fetch` 报 `WEB_PROVIDER_AMBIGUOUS` | profile 的 `web` 行 `fetchProvider` 被漏写删除（patch 整体替换语义）。重述该行全部键 |
| 两个 provider id 同时可用且未配置 `searchProvider` | 本插件注册 `um-web-search` 与兼容别名 `exa` 且共享可用性；seam 按「多可用且未配置 → 报错」而非先到先得。手工挂载必须显式写 `searchProvider` |
| 设置卡保存被拒并弹出双语警示 | 客户端写前校验拦下了非法候选（重复 / 空白的 provider id、重复 / 非法的 key 引用、越界并发、不在列表中的默认源）。按提示修正后重试 —— 被拒保存不会部分落盘 |
| 已存 `providers` 显示为内置默认并带双语警示 | 存的值是对象而非数组（旧格式或其他插件写入）。卡片以内置三源回退渲染，并拒绝保留该形状的保存 |
| 配好了数据源但仍报不可用 | 依次检查：总开关、provider `enabled`、档位开关、密钥是否存在且未被环境变量遮蔽为只读 |
| 想换回官方搜索后端 | 卸载本插件（bundle 层随包移除即回退 `deepseek-official`），或在 profile patch 显式写 `web` 行 |

<small>组合验证：`pnpm exec dsh --profile web --dump-config | Select-String um-web-search`。运行时语义：`searchProvider` 在 WebRuntime 构造期读取，`enabled` 开关热切换只控制可用性。</small>

<a id="tests"></a>

## 🧪 测试

### 🖥️ 主机测试（node:test，共 175 例）

```powershell
pnpm test
```

| 文件 | 用例数 | 覆盖范围 |
| --- | --- | --- |
| `tests/plugin.test.mjs` | 85 | 策略状态机、缓存、降级语义、并发扇出、DeepSeek 包装、`UM_WS_` 迁移、`apply` 挂载与瀑布作用域 |
| `tests/boundary.test.mjs` | 37 | 边界与契约：链式降级、clamp、缓存逐出、state machine 细节、manifest 窗口 |
| `tests/render.test.mjs` | 47 | 浏览器半边（`lib/client.js`）在 React stub + 官方 primitives stub 上的渲染、path op 与写前校验契约 |
| `tests/version.test.mjs` | 6 | dev 版本链路 |

### 🎬 视觉交互测试（Playwright，共 16 例）

```powershell
pnpm test:visual           # 生成 fixture + 跑断言
pnpm test:visual:update    # 刷新快照基线
```

- fixture 生成器 `tests/render-visual.mjs` 产出单页 `tests/visual/fixtures/card.html`：内联 `lib/client.js` 源码 + 最小 React + 官方 primitives 桩 + mock DSH 客户端 ctx（`configForms` / `remote.credentials` / `slots` / `locale`），所有调用记入 `window.__testLog`
- 覆盖插件自有的组合与交互（挂载时机、暂存与保存的 path op、provider 排序、密钥写入与徽章、校验阻断）；官方组件自身的像素不在断言范围内
- 更新快照基线前，改过 fixture 需先跑 `node tests/render-visual.mjs` 重新生成页面

<a id="devversions"></a>

## 🧩 开发版本

dev 构建使用「基版 + 版本码」方案：

```powershell
pnpm dev:version          # 生成形如 0.7.0.20260829102301（基版 + 14 位 yyyyMMddHHmmss）
pnpm dev:version:reset    # 还原为基版
```

- 版本码秒级唯一、严格单调；脚本同步 `package.json` 与 `lib/index.js` 的 `VERSION`，失步即硬报错
- 历史记录在本地 `.um.agents/memory/`（不入库）
- **dev 版本不提交、不打 tag、不进 CHANGELOG** —— 提交/发布仅针对基版

<a id="migration"></a>

## 🚚 迁移说明

### 0.6.x → 0.7.0

| 变更 | 影响 |
| --- | --- |
| 需要 DSH ≥ 0.1.7-alpha.2 | 本版按 0.1.7 的设置子系统重写，0.1.1-rc.2 系列不再支持 |
| 旧设置命名空间不再读取 | 0.6.x 存在 `web-search-exa` 命名空间；0.1.7 起设置存进 profile patch 的**行 `config`**，命名空间 = Loader 行 id = `um-web-search`。旧段**不会被导入**，升级后设置回落出厂默认，请在**设置 → 插件 → UM 网页搜索**卡片里重新填写一次 |
| 旧扁平配置键仍可兜底 | `preferred`、`exaEnabled`、`allowAnonymous`… 这组 0.6.0 之前的扁平键，在 `providers` 仍是出厂默认时会被读一次并合成 `providers[]`（零存储迁移）；新卡片保存过一次后，写回的正是合成结果，这些旧键即退化为**惰性残留**（设置服务无法清除非 volatile 键），不再影响行为 |
| 卡片 UI 重建 | 自研 CSS / Modal / 手风琴 / 自研类名与像素基线全部退役，改用官方 primitives；交互入口与视觉呈现随之改变 |

### 0.7.0 窗口修订

依赖窗口收窄为 `>=0.2.0-rc.1 <0.3.0`（0.1.7 系列不再支持）；测试/开发基线对齐 `0.2.0-rc.2` —— devDependencies 与 overrides 全族迁移，`SettingsFormModel` 镜像已对照 `dsh-client-ui-primitives@0.2.0-rc.2` 逐行复核（语义未变）。

<a id="adr"></a>

## 🏛️ 架构决策与调研

| 文档 | 内容 |
| --- | --- |
| [ADR-0001](./.um.agents/constraints/ADR-0001-web-search-exa.md) | Exa 作为 DSH 内置 web 搜索提供者 |
| [ADR-0002](./.um.agents/constraints/ADR-0002-dual-backend-strategy.md) | 双后端策略模式（伞 provider）与配置 UI 分层 |
| [ADR-0003](./.um.agents/constraints/ADR-0003-dev-version-chain.md) | dev 版本管理链路（基版 + 14 位版本码） |
| [ADR-0004](./.um.agents/constraints/ADR-0004-multi-source-strategy.md) | 多源搜索策略重构：`providers[]` 模型、paid/free 状态机、并发与缓存、DeepSeek 官方接入 |
| [ADR-0005](./.um.agents/constraints/ADR-0005-playwright-visual-testing.md) | Playwright 真实视觉交互测试选型 |
| [ADR-0006](./.um.agents/constraints/ADR-0006-dsh-017-adaptation.md) | DSH 0.1.7 适配：设置子系统重写 + 官方 primitives 卡片重建 |
| [ADR-0007](./.um.agents/constraints/ADR-0007-dsh-020-rc2-single-track.md) | DSH 0.2.0-rc.2 单线收窄：桌面版对齐 + semver 预发布解析缺陷修复 |
| [Parallel 接口调研档案](./.um.agents/constraints/parallel-search-research.md) | Parallel REST / MCP 的形态对照、与 Exa 的差异与风险点 |
| [硬编码语义索引](./.um.agents/constraints/hardcode-index.md) | 全部硬编码值的短路径登记表，升级时按短路径逐处同步 |

<a id="support"></a>

## 🙏 支持

如果这个项目对你有帮助，欢迎请我喝杯咖啡 ☕️

<div align="center">

<a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

</div>

<a id="license"></a>

## 📄 许可证

[MIT](./LICENSE) © 2026 [UnforgetMemory](https://github.com/UnforgetMemory)
