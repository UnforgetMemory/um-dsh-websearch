# um-dsh-websearch

> Exa（exa.ai）网页搜索提供方 —— 一个为 DeepSeek Harness（DSH）打造的开源插件。
> 产品形态对齐官方内建搜索插件，另增**动态开关**、**凭据服务密钥解析**与**中英双语设置卡片**。

![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-4d9fff?style=flat-square)
![License: MIT](https://img.shields.io/badge/license-MIT-4d9fff?style=flat-square)
![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-2ea44f?style=flat-square)
![Version](https://img.shields.io/badge/version-0.2.0-8b5cf6?style=flat-square)

**简体中文（默认）** · [English](./README.en.md)

---

## ✨ 特性

- **开箱即用的 Exa 搜索**：单一 provider、双传输通道——REST `/search`（认证）与匿名 MCP `web_search_exa`（免密钥），按配置自动切换
- **动态开关 `enabled`**：出厂关闭，在 Settings 打开即热生效，**无需重启**
- **免密钥匿名模式**：`allowAnonymous: true` 走 Exa 公开托管 MCP，零密钥返回真实结果
- **凭据服务密钥解析**：字面密钥 → 凭据服务引用 → 启动环境变量，逐级回退
- **双语设置卡片**：跟随 DSH 界面语言（简体中文 / English）实时切换
- **实时可用性**：`available()` 按当前配置实时计算，开关即刻反映到选择器

## 📦 安装（以 profile `web` 为例）

1. 把本包装入 profile 的 `node_modules`（DSH 转发 pnpm，源码即改即生效）：

   ```powershell
   pnpm exec dsh plugin --profile web add <本仓库路径>
   ```

2. 将补丁行插入用户补丁层（`$DSH_HOME/profiles/web/cordis.patch.yml` 顶层列表）：

   ```yaml
   - insert:
       - id: web-search-exa
         name: um-dsh-websearch
   ```

3. 静态验证组合树（不启动进程），应能看到 `web-search-exa` 行：

   ```powershell
   pnpm exec dsh --profile web --dump-config | Select-String exa
   ```

4. 重启 DSH 挂载（补丁层变更需重启生效）。

> **exports 门禁坑**：client-modules 扫描器会 `require.resolve("<包名>/package.json")`，包的 `exports` 必须显式放行 `"./package.json"`，否则 `ERR_PACKAGE_PATH_NOT_EXPORTED` 会被扫描器静默吞掉、客户端半部不入图。

## ⚙️ 配置（Settings → 插件配置 → Exa 网页搜索）

| 字段 | 类型 / 角色 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `false` | 动态开关；关闭时 provider 注册但不可选 |
| `allowAnonymous` | boolean | `false` | 匿名开关；开启走 Exa 公开托管 MCP，无需密钥 |
| `apiKey` | string · secret | — | 字面量密钥，仅覆盖下述引用（REST 模式） |
| `apiKeyEnv` | string · credential-ref | `EXA_API_KEY` | 凭据服务引用名（环境变量名） |
| `baseURL` | string | `https://api.exa.ai` | REST 基址（自动拼接 `/search`）；`EXA_BASE_URL` 可覆盖 |
| `mcpBaseURL` | string | `https://mcp.exa.ai/mcp` | 匿名 MCP 端点；可指向自建代理 |
| `numResults` | integer 1–10 | `5` | 未指定 `maxResults` 时的默认条数 |
| `searchType` | string | `auto` | `auto` / `neural` / `keyword`（仅 REST） |

**密钥解析顺序**：`apiKey` 字面量 → 凭据服务（`apiKeyEnv`）→ 启动环境变量。
`allowAnonymous: true` 时密钥整体不参与——默认走 Exa 公开托管 MCP，免密钥返回真实结果。

## 🚀 使用

### 动态开启

1. **设置 → 插件 → 插件配置**，展开 **Exa 网页搜索** 卡片（与"网页搜索 / DeepSeek"卡并列）；
2. 打开 `enabled` 并保存 —— 即刻热生效，无需重启。

> 若部署把选择固定在 `deepseek-official`（未做下述覆盖），仅开 `enabled` 不会改变默认后端——这是刻意的零副作用设计。

### 切换默认搜索后端为 Exa

在 `cordis.patch.yml` 追加（对 bundle 行 id 定向覆盖）：

```yaml
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: exa
```

改完重启一次；回滚 = 删除该覆盖并把 snippet 的 insert 行移除。

## 🧱 工作原理

每次搜索按**当前配置实时解析**选项快照（一次搜索绝不混用两套配置）：

| 通道 | 触发 | 说明 |
|---|---|---|
| REST `/search` | `allowAnonymous: false` + 有效密钥 | Exa 认证 API；支持 `searchType`，请求带 `x-api-key` |
| 匿名 MCP（streamable-HTTP） | `allowAnonymous: true` | `initialize` 握手 + `tools/call web_search_exa`，免密钥 |

**可用性**实时计算：`enabled` 优先；匿名模式只看 `mcpBaseURL` 可解析性；认证模式再叠加密钥存在性（未被探测到/引用非法即不可用）。

**错误码**以 WebError 冒泡到工具层：`WEB_PROVIDER_CREDENTIAL_MISSING`（缺密钥）、`WEB_PROVIDER_ERROR`（HTTP/解析失败）、`WEB_ABORTED`（调用方取消）。

## 📚 文档

- [DeepSeek Harness — Your first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)
- [DeepSeek Harness — 打包与安装插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)
- 本项目架构决策：[ADR-0001 — Exa 网页搜索接入](.um.agents/constraints/ADR-0001-web-search-exa.md)
- 详细配置与排障见历史 README 内容（并入本文）

## 📄 许可证

[MIT](./LICENSE) — 自由使用、修改与分发。