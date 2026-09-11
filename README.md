<div align="center">

<img src="./Hero.png" width="900" alt="um-dsh-websearch — Exa + Parallel + DeepSeek Official 多源网页搜索 · DeepSeek Harness 插件" />

[![License: MIT](https://img.shields.io/badge/License-MIT-4d9fff?style=flat-square)](./LICENSE) [![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-4d9fff?style=flat-square)](https://github.com/topics/dsh-plugin) [![Node >= 20](https://img.shields.io/badge/Node-%3E%3D20-2ea44f?style=flat-square)](package.json) <a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 Exa + Parallel + DeepSeek Official 多源搜索能力——有序 provider 列表、paid/free 双档位门控回退、多密钥策略、并发扇出、乐观缓存与中英双语设置卡片。

[English](./README.en.md) · 简体中文

</div>

---

## 特性

- **多 provider 策略层** — `providers[]` 有序列表即优先级：每个 provider 独立启停，`defaultProvider` 决定顺序链起点，主源被服务器拒绝时逐级降级
- **paid / free 双档位 + 门控回退** — 每个 provider 有付费 REST 与免密钥匿名 MCP 两个档位、各自独立开关；跨档位回退必须**同时满足**「耗尽密钥上的方向开关」与「目标档位已开启」，绝不擅自回退（Exa `/search` ⇄ `mcp.exa.ai`；Parallel `/v1/search` ⇄ `search.parallel.ai/mcp`；DeepSeek Official 仅付费档）
- **多密钥策略** — 每个 provider 可挂多条凭据引用，`ordered` 按序 / `random` 每次搜索洗牌；每把 key 单独控制 `allowFreeToPaid` / `allowPaidToFree`
- **并发扇出** — `concurrency > 1` 时一次搜索并发分发到全部启用源（provider × 档位 × key），结果按 URL 去重合并；`concurrency = 1` 保持顺序回退链
- **乐观缓存** — 可开关的内存结果缓存 + 1–86400 秒 TTL，配置变更即时失效
- **deepseek-official 接入** — 伞内包装框架官方 `DeepSeekSearchProvider`（官方 API 对等、零协议漂移），以 `UM_WS_DEEPSEEK_API_KEY` 解析凭据
- **凭据安全（UM_WS_ 命名空间）** — 配置只存引用名，密钥本体留在凭据库/环境变量；引用默认带 `UM_WS_` 前缀与官方包隔离，旧引用值一次性拷贝迁移且**绝不删除**
- **分层设置卡** — 首屏：总开关 + 实时策略行 + 并发/缓存 + provider 列表（角色徽章、↑↓ 排序）；「详细配置…」Modal 编辑每个 provider 的档位、密钥、端点与参数；密钥为手风琴行（每行一个下拉项、同时只开一个）

## 快速开始

```powershell
pnpm exec dsh plugin --profile web add <本仓库路径>     # 本地 checkout
pnpm exec dsh plugin --profile web add github:UnforgetMemory/um-dsh-websearch
```

本包声明了 `dsh.bundle`，`dsh plugin add` 会把它追加进 `dsh.profile.bundles` 并自动挂载其自带的补丁层（`cordis.patch.yml`），无需再往 profile 手工插行。该层的内容是：

```yaml
- insert:
    - id: um-web-search
      name: um-dsh-websearch

# 自动接管 web 行的 searchProvider（安装即生效，卸载随层移除）
- id: web
  config:
    searchProvider: um-web-search
```

安装后重启，在 **设置 → 插件 → UM 网页搜索** 开启 `enabled`（出厂默认关闭）。

本 bundle 层会自动把 `web` 行的 `searchProvider` 设为 `um-web-search`——安装即接管默认搜索、卸载即自动回退到部署原默认后端（`deepseek-official`），无需再手工改 profile；部署如需固定其他后端，在 profile 的 `cordis.patch.yml` 显式写 `web` 行即可（后层覆盖前层）。

> ⚠️ **接管窗口**：出厂默认 `enabled: false`，接管后、开启 `enabled` 之前搜索不可用——`web` 行已指向本插件，关闭状态下搜索返回 `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`。安装后请立即在设置卡开启 `enabled`。

> **迁移提示**：若你按旧版 README 手工插过 `id: web-search-exa` 的注册行，请先从 profile 的 `cordis.patch.yml` 删除该行，否则 bundle 层挂载后会与新行同时存在、插件被重复加载。

> **0.5.x → 0.6 迁移**：旧扁平配置键（`preferred`、`exaEnabled`、`allowAnonymous`…）在升级后自动合成为 `providers[]`（零存储迁移）；在新设置卡保存任意改动后旧键即被清除。旧默认凭据 `EXA_API_KEY` / `PARALLEL_API_KEY` 的值会自动拷贝到 `UM_WS_EXA_API_KEY` / `UM_WS_PARALLEL_API_KEY`（旧引用保留不删）。

## 配置

### 全局组

| Key | Default | 说明 |
|---|---|---|
| `enabled` | `false` | 插件总开关 |
| `defaultProvider` | `exa` | 顺序链起点（须为某 provider 的 id） |
| `concurrency` | `1` | 1 = 顺序回退链；2–8 = 并发扇出所有启用源 |
| `cache.enabled` | `false` | 内存结果缓存开关 |
| `cache.ttlSeconds` | `60` | 缓存保鲜时长（1–86400 秒） |

### Provider 组（`providers[]`，数组索引 = 优先级）

| Key | 说明 |
|---|---|
| `id` | provider 标识（内置：`exa` / `parallel` / `deepseek`） |
| `enabled` | 本 provider 启停 |
| `primaryTier` | 首选档位：`free`（匿名 MCP）或 `paid`（REST + 密钥） |
| `paid.enabled` / `paid.baseURL` | 付费档开关与 REST 端点 |
| `free.enabled` / `free.baseURL` | 免费档开关与匿名 MCP 端点（deepseek 强制关闭） |
| `keys[]` | 密钥列表：`ref`（自动生成的凭据引用名，如 `UM_WS_EXA_API_KEY`/`_1`）、`enabled`、`allowFreeToPaid`、`allowPaidToFree`；设置卡中直接输入**密钥值**，经官方凭据接口写入凭据库 |
| `keysStrategy` | 多 key 顺序：`ordered`（数组序）/ `random`（每次搜索洗牌） |
| `numResults` | 默认结果数（1–20） |
| `params` | provider 特有参数（Exa `searchType`；Parallel `mode`；DeepSeek `model`/`maxUses`） |

改动任意字段在下一次搜索即生效。

## 回退语义（付费 ⇄ 免费）

- 顺序模式：首选档位 → 同档位逐 key（按 `keysStrategy`）→ 耗尽后检查**当前 key 的方向开关**且**目标档位已开启**才跨档 → 本 provider 终态失败 → 下一 provider。
- 服务器拒绝（401/402/403/429/5xx）才触发回退；取消、密钥缺失、客户端 4xx（含 422）、契约错误与网络失败**永不回退**。
- 并发模式：所有启用源并行执行，单源失败不影响其他源，成功结果合并；无「回退」概念——免费档是否参与由其自身开关决定。

## 凭据配置

- 设置卡里直接**输入密钥值**：保存时经 DSH 官方凭据接口
  （`connection.api.credentials.set`）写入 **DSH 凭据库**，配置只存自动生成的
  **引用名**，密钥字面量绝不落设置文件；留空保存 = 保持当前已存密钥。
- 防泄露：页面只知"是否非空白地配置了密钥"（已配置/未配置徽章），已存值
  **绝不回显**（掩码占位符仅为存在性提示），输入框禁用浏览器自动填充记忆。
- 引用名自动生成：每个 provider 的第一把 key 用 `UM_WS_<PROVIDER>_API_KEY`，追加
  的 key 依次为 `_1`、`_2`……（添加时生成、此后稳定不变，与官方包共享的
  `EXA_API_KEY` / `DEEPSEEK_API_KEY` 等显式隔离）。
- 也可手工把密钥存入凭据库（设置 → Models 页的 API 密钥区）或作为启动环境
  变量注入——引用名对上即可用。
- 免密钥玩法：开启某 provider 的免费档（`free.enabled`）即走公共 MCP，无需任何密钥。
- DeepSeek Official 快速启用：在设置卡输入 key（自动写入 `UM_WS_DEEPSEEK_API_KEY`）
  → 开启 `deepseek` provider 的付费档 → 保存即生效。

## 开发版本

dev 构建使用「基版 + 版本码」方案：`pnpm dev:version` 生成形如
`0.4.0.20260829102301` 的版本（基版 + 14 位 `yyyyMMddHHmmss` 版本码，秒级唯一、
严格单调），并同步 package.json、`VERSION` 与设置卡「关于」页的版本；历史记录
在本地 `.um.agents/memory/`（不入库）。`pnpm dev:version:reset` 还原为基版。
dev 版本不提交、不打 tag、不进 CHANGELOG（提交/发布仅针对基版）。

## 测试

- **单元测试**（node:test，128 用例）：`node --test tests/plugin.test.mjs tests/boundary.test.mjs tests/render.test.mjs tests/version.test.mjs`
- **视觉交互测试**（Playwright，30 用例，ADR-0005）：`pnpm test:visual`
  - fixture 生成器 `tests/render-visual.mjs` 产出三页（`index.html` 静态快照 / `interactive.html` 浏览器端交互 / `lab.html` 视口实验室）
  - 覆盖：首屏 zh/en 快照、Modal 双 tab、视口自适应 4 宽度、关键交互（开关/排序/保存）、无障碍 ARIA、CSS 设计令牌
  - 更新快照基线：`pnpm test:visual:update`

## 使用与排障

- 默认后端：bundle 层自动把 `web` 行 `searchProvider` 置为 `um-web-search`
  （0.4.0 起规范 id；兼容别名 `exa` 继续有效，同一伞实例）；部署显式固定后端时
  在 profile patch 里覆盖即可
- 自动选择边界：本插件注册 `um-web-search` 与兼容别名 `exa` 两个 provider id
  且共享可用性——若部署越过 bundle 层且 `web` 行未配置 `searchProvider`，两 id
  皆可用时会收到 seam 的 `WEB_PROVIDER_AMBIGUOUS`（手册选择语义：多可用且未配置
  id → 报错而非先到先得），故无 bundle 的手工挂载必须显式写 `searchProvider`
- 运行时语义：`searchProvider` 在 WebRuntime 构造期读取，`enabled` 开关热切换只
  控制可用性（关闭时搜索报 `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`，不回退其他后端）；
  恢复其他后端的唯一方式是卸载本插件（bundle 层随包移除）
- 策略语义：总开关关闭 → 整体不可用；顺序模式按 `providers[]` 序从
  `defaultProvider` 起逐 provider 服务，被服务器拒绝且次源可用时跨 provider 降级；
  取消、密钥缺失、4xx/422 客户端错误与网络失败不降级
- 设置卡首屏显示**有效策略**：策略行（源序 + 并发数）、角色徽章（优先/备用/停用）、
  ↑↓ 重排按钮；默认源停用时会警示
- 组合验证：`pnpm exec dsh --profile web --dump-config | Select-String um-web-search`
- exports 门禁与架构决策：[ADR-0001](./.um.agents/constraints/ADR-0001-web-search-exa.md)、
  [ADR-0002](./.um.agents/constraints/ADR-0002-dual-backend-strategy.md)、
  [ADR-0003](./.um.agents/constraints/ADR-0003-dev-version-chain.md)、
  [ADR-0004](./.um.agents/constraints/ADR-0004-multi-source-strategy.md)、
  [ADR-0005](./.um.agents/constraints/ADR-0005-playwright-visual-testing.md)；
  Parallel 接口事实：[调研档案](./.um.agents/constraints/parallel-search-research.md)

## 支持

如果这个项目对你有帮助，欢迎请我喝杯咖啡：

<div align="center">

<a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

</div>

## 许可证

[MIT](./LICENSE) © 2026 [UnforgetMemory](https://github.com/UnforgetMemory)
