# Parallel Search API 适配调研（um-dsh-websearch）

> 调研日期：见 git 文件时间。本文件只记事实（Fact）与出处；适配决策见后续 ADR。
> 调研方式：官方文档（docs.parallel.ai，`.md` 原文抓取）+ 匿名 MCP 直连实测。

## 1. 产品定位（Fact）

- Parallel Web Systems（前 Twitter CEO Parag Agrawal 创立）的 Search API：
  面向 AI agent 的网页搜索，输入自然语言 objective + 关键词 queries，
  输出按相关性排序的 URL/title/长 excerpt（markdown），为 LLM 消费优化。
- 厂商宣称 BrowseComp 等基准 SOTA（**vendor claim**，未独立验证）。
- 文档站提供 llms-full.txt 与逐页 `.md`，对 agent 友好。

## 2. REST API（V1 GA）（Fact，OpenAPI /public-openapi.json）

- 端点：`POST https://api.parallel.ai/v1/search`
  （旧版 `/v1beta/search` 存在迁移指南；新适配只认 V1）
- 认证：`x-api-key: <PARALLEL_API_KEY>` 请求头（security: ApiKeyAuth）。
  与 Exa 相同的头名与凭据平面，凭据链可直接复用。
- 请求体 `V1SearchRequest`（`additionalProperties:false`）：
  | 字段 | 类型 | 约束 |
  |---|---|---|
  | `search_queries` | string[] | **必填**，≥1；≤5 条，每条 ≤200 字符，建议 3–6 词 |
  | `objective` | string\|null | 可选，≤5000 字符，自然语言目标 |
  | `mode` | enum\|null | `turbo`/`fast`/`basic`/`advanced`，缺省 `advanced` |
  | `max_chars_total` | int\|null | 全结果 excerpt 总字符上限，缺省动态 |
  | `session_id` | string\|null | ≤1000 字符，跨调用分组 |
  | `client_model` | string\|null | 消费模型标识，用于优化缺省 |
  | `advanced_settings` | object\|null | 见下 |
- `advanced_settings`：`source_policy`（include_domains/exclude_domains/after_date）、
  `fetch_policy`（max_age_seconds，live fetch 增延迟）、
  `excerpt_settings.max_chars_per_result`、`location`（ISO 3166-1 alpha-2）、
  `max_results`（默认 10，**公开模式上限 20**，超出降为 20 并给 warning）。
- 响应 `V1SearchResponse`（200）：`search_id`、`results[]`、`warnings`、
  `usage[{name:"sku_search",count}]`、`session_id`。
  单条结果 `V1WebSearchResult`：`url`（必）、`title`（可 null）、
  `publish_date`（YYYY-MM-DD，可 null）、`excerpts: string[]`（markdown，必）。
- 错误体 `ErrorResponse`：`{type:"error", error:{ref_id, message}}`；
  请求校验失败为 HTTP 422。
- 限流：Search 默认 600 次/分钟（仅 POST 计数）。
- 计价：默认每次返回 10 条结果：
  - `turbo`/`fast`：$1 / 1000 次（~250ms / ~700ms）
  - `basic`/`advanced`：$5 / 1000 次（~1s / ~3s）
  - 超出默认条数的结果与 excerpt：+$1 / 1000
- 出处：[quickstart](https://docs.parallel.ai/search/search-quickstart)、
  [modes](https://docs.parallel.ai/search/modes)、
  [pricing](https://docs.parallel.ai/getting-started/pricing)、
  [rate-limits](https://docs.parallel.ai/getting-started/rate-limits)、
  [advanced-settings](https://docs.parallel.ai/search/advanced-search-settings)、
  [api-reference](https://docs.parallel.ai/api-reference/search/search)

## 3. 匿名 MCP（Fact，直连实测 + 官方文档）

- 端点：`https://search.parallel.ai/mcp`（streamable-HTTP）。
  **免密钥免费**（低配额）；`Authorization: Bearer <key>` 提额；
  另有强制认证的 `/mcp-oauth`（匿名 401）。
- 实测握手：协议 `2025-06-18` 可用；server `Parallel Web Search MCP Server`
  v1.27.0；initialize 返回 `mcp-session-id`；本会话实测在 initialize 后发送了
  `notifications/initialized` 再 tools/call 成功（是否必需未单独验证，发送无副作用）。
- 工具（实测 tools/list）：
  - `web_search`：入参 `objective`+`search_queries` **均必填**；
    可选 `session_id`（≤100 字符，**免费层按它限流**，建议稳定复用）、
    `model_name`（≤100，仅分析用途）。outputSchema = `V1SearchResponse`。
  - `web_fetch`：URL 抓取（本适配范围外）。
- 实测 `tools/call web_search` 返回（匿名、无 key、HTTP 200）：
  `result._meta["parallel/usage"]` 带成本；`result.content[]` 为
  `{type:"text", text:"<pretty JSON string>"}`——**文本载荷即 V1SearchResponse
  JSON**（search_id/results[{url,title,publish_date,excerpts[]}]/session_id）。
  与 Exa MCP 的 `Title:`/`URL:` 纯文本块格式完全不同，但解析后可复用同一
  结果映射器。
- MCP 服务端缺省 `basic` 模式，单次 excerpt 总量上限 ~25k 字符；
  匿名请求的覆盖配置被忽略，**认证后**可用 URL 查询参数或
  `x-parallel-search-config` 头钉住 `mode`/`advanced_settings.*`
  （例如 `?mode=fast&advanced_settings.max_results=8`）。
- 出处：[search-mcp](https://docs.parallel.ai/integrations/mcp/search-mcp)、
  [programmatic-use](https://docs.parallel.ai/integrations/mcp/programmatic-use)

## 4. 与 Exa 通道的形态对照（Fact）

| 维度 | Exa（现状） | Parallel（目标） |
|---|---|---|
| 付费 REST | `POST {base}/search`，`x-api-key` | `POST {base}/v1/search`，`x-api-key`（同头名） |
| REST 默认基址 | `https://api.exa.ai` | `https://api.parallel.ai` |
| REST 请求 | `{query,numResults,contents.text.maxCharacters,type?}` | `{search_queries:[q,...]（必填）,objective?,mode?,advanced_settings.max_results/excerpt_settings}` |
| REST 响应 | `results[{url,title,text/summary/highlights,publishedDate}]` | `results[{url,title,publish_date,excerpts[]}]` |
| 条数上限 | 10（numResults 1–10） | 20（advanced_settings.max_results） |
| 匿名 MCP | `https://mcp.exa.ai/mcp`，工具 `web_search_exa`，入参 `{query,numResults}` | `https://search.parallel.ai/mcp`，工具 `web_search`，入参 `{objective,search_queries,session_id?}` |
| MCP 载荷 | 纯文本块（Title:/URL:/Published:/Highlights:） | text 内容 = V1SearchResponse JSON |
| 模式概念 | `searchType` auto/neural/keyword（仅 REST） | `mode` turbo/fast/basic/advanced |
| 匿名配额 | 公共端点，实测会 429（本次调研亲历） | 免费层按 session_id 限流，Bearer 提额 |

## 5. 对 DSH seam 的映射要点（Fact/分析）

- seam 请求为 `{query, maxResults}`：
  - `search_queries: [query]`（单查询映射，满足必填）；
  - `objective`：可置为 `query` 原文或省略（最佳实践建议两者都给，待决策）；
  - `maxResults` → `advanced_settings.max_results`（1–20，schema 需放宽现 1–10）；
  - snippet：REST 取 `excerpts[]` 拼接截断 ≤800；MCP 解析 text JSON 后走同一映射；
  - `publish_date` → seam `publishedAt`。
- 降级词汇表可沿用：401/402/403/429/5xx 可降级；422（校验错误）属客户端错误不降级。
- 错误消息提取：`error.message`（ErrorResponse 结构）。
- 差异注意：匿名 MCP 不支持 numResults（服务端托管 basic 模式）；
  认证 MCP 可通过 mcpBaseURL 查询参数钉配置（无需代码即可用）。

## 6. 风险与开放点

- 匿名免费层配额未公开具体数值（按 session_id 限流）→ 与 Exa 匿名一样存在收紧风险。
- REST 需 key 才能实测端到端（本次仅验证到 OpenAPI 与文档级）。
- `notifications/initialized` 是否被 Parallel 强制：未单独验证（实现带上即可）。
- turbo 仅支持英语/日语查询（多语言用 basic/advanced）。
