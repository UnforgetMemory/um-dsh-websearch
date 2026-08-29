<div align="center">

<img src="./Hero.png" width="900" alt="um-dsh-websearch — Exa + Parallel 双后端网页搜索 · DeepSeek Harness 插件" />

[![License: MIT](https://img.shields.io/badge/License-MIT-4d9fff?style=flat-square)](./LICENSE) [![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-4d9fff?style=flat-square)](https://github.com/topics/dsh-plugin) [![Node >= 20](https://img.shields.io/badge/Node-%3E%3D20-2ea44f?style=flat-square)](package.json) <a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 Exa + Parallel 双后端搜索能力——策略路由、免密钥匿名模式、动态开关、中英双语设置卡片。

[English](./README.en.md) · 简体中文

</div>

---

## 特性

- **双后端策略** — Exa 与 Parallel 同挂一个伞 provider：`preferred` 定优先级，每后端独立启停，插件级 `enabled` 总开关；主后端被服务器拒绝时跨后端降级
- **每后端双通道 + 双向降级** — 认证 REST 与免密钥匿名 MCP 互为主备（Exa `/search` ⇄ `mcp.exa.ai`；Parallel `/v1/search` ⇄ `search.parallel.ai/mcp`）
- **动态开关** — `enabled` 出厂关闭，设置页一键开启，热生效免重启
- **凭据灵活** — 字面密钥 → 凭据服务 → 环境变量，逐级回退；两后端各自独立
- **分层设置卡** — 首屏只留总开关与策略状态行；「详细配置…」打开 Modal 承载全量字段，中英双语实时切换

## 快速开始

```powershell
pnpm exec dsh plugin --profile web add <本仓库路径>
```

补丁层追加 `web-search-exa` 行，重启后在 **设置 → 插件 → UM 网页搜索** 开启 `enabled`：

```yaml
- insert:
    - id: web-search-exa
      name: um-dsh-websearch
```

## 配置

### 策略组

| Key | Default | 说明 |
|---|---|---|
| `enabled` | `false` | 插件总开关 |
| `preferred` | `exa` | 优先后端：`exa` / `parallel` |
| `exaEnabled` | `true` | 启用 Exa 后端 |
| `parallelEnabled` | `false` | 启用 Parallel 后端（开启后可作跨后端降级目标） |

### Exa 组

| Key | Default | 说明 |
|---|---|---|
| `allowAnonymous` | `false` | 免密钥匿名模式（公共 MCP），作为主路由 |
| `fallbackToPaid` | `false` | 匿名失败回退付费（REST `/search` 密钥重试） |
| `fallbackToAnonymous` | `false` | 付费失败回退匿名（公开 MCP 重试） |
| `apiKey` | — | 字面量密钥，仅 REST |
| `apiKeyEnv` | `EXA_API_KEY` | 凭据引用（环境变量名） |
| `baseURL` | `https://api.exa.ai` | REST 基址，自动拼 `/search` |
| `mcpBaseURL` | `https://mcp.exa.ai/mcp` | 匿名 MCP 端点 |
| `numResults` | `5` | 默认条数（1–10） |
| `searchType` | `auto` | `auto` / `neural` / `keyword`（仅 REST） |

### Parallel 组

| Key | Default | 说明 |
|---|---|---|
| `parallelAllowAnonymous` | `false` | 免密钥匿名模式（`search.parallel.ai/mcp`），作为主路由 |
| `parallelFallbackToPaid` | `false` | 匿名失败回退付费（REST `/v1/search` 密钥重试） |
| `parallelFallbackToAnonymous` | `false` | 付费失败回退匿名（公开 MCP 重试） |
| `parallelApiKey` | — | 字面量密钥，仅 REST |
| `parallelApiKeyEnv` | `PARALLEL_API_KEY` | 凭据引用（环境变量名） |
| `parallelBaseURL` | `https://api.parallel.ai` | REST 基址，自动拼 `/v1/search` |
| `parallelMcpBaseURL` | `https://search.parallel.ai/mcp` | 匿名 MCP 端点（免费层按 session 限流） |
| `parallelNumResults` | `10` | 默认条数（1–20，仅 REST；MCP 工具无条数参数） |
| `parallelMode` | `fast` | `turbo` / `fast` / `basic` / `advanced`（仅 REST） |

改动任意字段在下一次搜索即生效。

## 凭据配置

- 密钥本体**不进设置文档**：设置卡只填「引用名」（默认 `EXA_API_KEY` /
  `PARALLEL_API_KEY`）。密钥写入 **DSH 凭据库**（设置 → Models 页的 API 密钥区，
  按同名引用保存），或作为启动环境变量注入；解析顺序：字面量 `apiKey` →
  凭据库 → 环境变量
- 免密钥玩法：任一后端开启匿名模式即走公共 MCP，无需任何密钥
- Parallel 快速启用：把 key 存入凭据库（引用名 `PARALLEL_API_KEY`）→ 综合页
  `preferred: parallel` → 保存即生效

## 开发版本

dev 构建使用「基版 + 版本码」方案：`pnpm dev:version` 生成形如
`0.4.0.20260829102301` 的版本（基版 + 14 位 `yyyyMMddHHmmss` 版本码，秒级唯一、
严格单调），并同步 package.json、`VERSION` 与设置卡「关于」页的版本；历史记录
在本地 `.um.agents/memory/`（不入库）。`pnpm dev:version:reset` 还原为基版。
dev 版本不提交、不打 tag、不进 CHANGELOG（提交/发布仅针对基版）。

## 使用与排障

- 默认后端切为本插件：`web` 行加 `config.searchProvider: um-web-search`
  （0.4.0 起规范 id；兼容别名 `exa` 继续有效，同一伞实例）
- 策略语义：总开关关闭 → 整体不可用；主后端按其传输链服务，被服务器拒绝
  （401/402/403/429/5xx）且次后端启用可用时跨后端降级；取消、密钥缺失、
  4xx/422 客户端错误与网络失败不降级
- 设置卡综合页显示**有效策略**：角色徽章（优先/备用/停用）、「设为优先」radio；
  首选后端停用时会警示并可一键「交换优先」
- 组合验证：`pnpm exec dsh --profile web --dump-config | Select-String um-web-search`
- exports 门禁与架构决策：[ADR-0001](./.um.agents/constraints/ADR-0001-web-search-exa.md)、
  [ADR-0002](./.um.agents/constraints/ADR-0002-dual-backend-strategy.md)、
  [ADR-0003](./.um.agents/constraints/ADR-0003-dev-version-chain.md)；
  Parallel 接口事实：[调研档案](./.um.agents/constraints/parallel-search-research.md)

## 支持

如果这个项目对你有帮助，欢迎请我喝杯咖啡：

<div align="center">

<a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

</div>

## 许可证

[MIT](./LICENSE) © 2026 [UnforgetMemory](https://github.com/UnforgetMemory)
