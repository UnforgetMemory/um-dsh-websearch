<div align="center">

<img src="./Hero.png" width="900" alt="um-dsh-websearch — Exa 网页搜索 · DeepSeek Harness 插件" />

[![License: MIT](https://img.shields.io/badge/License-MIT-4d9fff?style=flat-square)](./LICENSE) [![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-4d9fff?style=flat-square)](https://github.com/topics/dsh-plugin) [![Node >= 20](https://img.shields.io/badge/Node-%3E%3D20-2ea44f?style=flat-square)](package.json) <a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 Exa 搜索能力——免密钥匿名模式、动态开关、中英双语设置卡片。

[English](./README.en.md) · 简体中文

</div>

---

## 特性

- **双通道 + 双向降级** — 认证 REST `/search` 与免密钥匿名 MCP 互为主备；服务器拒绝时按开关自动降级
- **动态开关** — `enabled` 出厂关闭，设置页一键开启，热生效免重启
- **凭据灵活** — 字面密钥 → 凭据服务 → 环境变量，逐级回退
- **双语界面** — 设置卡片跟随 DSH 界面语言实时切换

## 快速开始

```powershell
pnpm exec dsh plugin --profile web add <本仓库路径>
```

补丁层追加 `web-search-exa` 行，重启后在 **设置 → 插件配置 → UM 网页搜索** 开启 `enabled`：

```yaml
- insert:
    - id: web-search-exa
      name: um-dsh-websearch
```

## 配置

| Key | Default | 说明 |
|---|---|---|
| `enabled` | `false` | 动态开关 |
| `allowAnonymous` | `false` | 免密钥匿名模式（公共 MCP），作为主路由 |
| `fallbackToPaid` | `false` | 匿名失败回退付费（REST `/search` 密钥重试） |
| `fallbackToAnonymous` | `false` | 付费失败回退匿名（公开 MCP 重试） |
| `apiKey` | — | 字面量密钥，仅 REST |
| `apiKeyEnv` | `EXA_API_KEY` | 凭据引用（环境变量名） |
| `baseURL` | `https://api.exa.ai` | REST 基址，自动拼 `/search` |
| `mcpBaseURL` | `https://mcp.exa.ai/mcp` | 匿名 MCP 端点 |
| `numResults` | `5` | 默认条数（1–10） |
| `searchType` | `auto` | `auto` / `neural` / `keyword`（仅 REST） |

改动任意字段在下一次搜索即生效。

## 使用与排障

- 默认后端切为 Exa：`web` 行加 `config.searchProvider: exa`
- 降级链：`allowAnonymous` 定主路由；`fallbackToPaid` / `fallbackToAnonymous`
  开启另一向兜底。仅服务端拒绝降级（REST 401/402/403/429/5xx、匿名 HTTP/JSON-RPC
  错误）；取消、密钥缺失、4xx 客户端错误与网络失败不降级
- 组合验证：`pnpm exec dsh --profile web --dump-config | Select-String exa`
- exports 门禁与架构决策：[ADR-0001](./.um.agents/constraints/ADR-0001-web-search-exa.md)

## 支持

如果这个项目对你有帮助，欢迎请我喝杯咖啡：

<div align="center">

<a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

</div>

## 许可证

[MIT](./LICENSE) © 2026 [UnforgetMemory](https://github.com/UnforgetMemory)
