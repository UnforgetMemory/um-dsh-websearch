# ADR-0002: 双后端策略模式（Exa + Parallel）与配置 UI 分层（首屏精简 + Modal 详细配置）

- 状态: Accepted
- 日期: 见 git/文件时间（KV-Cache 约束：不在指令中写死时间）
- 前置: [ADR-0001](./ADR-0001-web-search-exa.md)（产品结构对齐、enabled 开关、树外插件包）
- 调研: [parallel-search-research.md](./parallel-search-research.md)（Parallel API 全量 Fact：REST V1 OpenAPI、匿名 MCP 直连实测、计价/限流/模式）
- 决策来源: 用户拍板——Q1 定制（同包双后端 + 策略模式：可配优先级、各后端独立启停、插件总开关）、Q2（卡片内 Modal Dialog）、Q3（首屏仅 enabled + 状态行）、Q4（确认即动工）

## 背景

ADR-0001 落地单后端 Exa（双传输 + 双向降级链）。两个新事实驱动演进：

1. **需求**：引入 Parallel (parallel.ai) 作为第二后端，且不是简单并列——要求一层
   **策略模式**：可配置哪个后端优先、每个后端独立启停、一个插件级总开关。
2. **UI 债务**：现有设置卡把 9 个字段全部内联（lib/client.js FIELDS），双后端后字段将
   超过 20 个，首屏必须分层。架构调查（live slot 树 + 内置构件源码 + primitives
   类型定义）确认：`@deepseek-ai/dsh-client-ui-primitives` 提供 `Modal` 组件
   （open/onClose/title/description/children/footer/closeLabel/contentClassName/headless），
   而设置面板的页签/分区导航是内部 state，**不存在卡片→设置页的编程导航 API**。

## 决策 D1：双后端策略模式（伞 provider）

1. **伞 provider**：`UmWebSearchProvider`，规范注册 id `um-web-search`；
   同时以薄包装（共享同一实例的 available/search/prime）注册兼容 id `exa`——
   既有部署 `searchProvider: exa` 零迁移即获得策略能力。
2. **Config 演进**（namespace 保持 `web-search-exa`，存储用户层零迁移；全部新键带安全
   缺省，扁平键 + UI 分组）：
   - 策略组：`enabled`（总开关，默认 false——语义升级为插件级）、
     `preferred`（`"exa"`|`"parallel"`，默认 `"exa"`，向后兼容）、
     `exaEnabled`（默认 true）、`parallelEnabled`（默认 false）。
   - Exa 组（键名不变）：`allowAnonymous` `fallbackToPaid` `fallbackToAnonymous`
     `apiKey`(secret) `apiKeyEnv`(默认 EXA_API_KEY) `baseURL` `mcpBaseURL`
     `numResults`(1–10 默认 5) `searchType`。
   - Parallel 组（`parallel` 前缀）：`parallelAllowAnonymous` `parallelFallbackToPaid`
     `parallelFallbackToAnonymous` `parallelApiKey`(secret) `parallelApiKeyEnv`
     （默认 PARALLEL_API_KEY）`parallelBaseURL`（默认 https://api.parallel.ai）
     `parallelMcpBaseURL`（默认 https://search.parallel.ai/mcp）
     `parallelNumResults`（1–20 默认 10，对齐其计价单元与公开上限）、
     `parallelMode`（`turbo`|`fast`|`basic`|`advanced`，默认 `fast`——官方推荐的
     agent 档，~700ms、$1/千次）。
   - 兼容推演：既有部署（enabled:true，无新键）→ Exa 开、Parallel 关、preferred=exa，
     行为与 0.3.0 完全一致。
3. **结构重构**：lib/index.js 重构为「共享件 + 后端 spec」——共享件含 MCP
   streamable-HTTP 客户端、双向降级执行器、keyPresence 三态、凭据解析、abort 语义；
   Exa 与 Parallel 各一份后端 spec（端点、请求构建、响应映射、错误提取、MCP 工具
   名/入参、协议细节）。**Exa 行为不变式**：现有测试套件（42 用例）必须零修改全绿。
4. **链语义**（策略核心）：
   - 单次搜索 = 主后端传输链（沿用 ADR-0001 A3：主传输 → 服务器拒绝且方向开关开 →
     另一传输）→ 主后端终态失败**且错误带可降级标记**（服务器拒绝：401/402/403/429/
     5xx；合并错误的可降级性取末次传输）→ 次后端 `enabled && canUse` → 次后端传输链。
     最多 4 次尝试。两后端皆败抛合并 WebError（code 仍 WEB_PROVIDER_ERROR，message
     含两后端原文，cause=次后端错误）。
   - 不降级边界不变：取消（WEB_ABORTED）、密钥缺失（CREDENTIAL_MISSING）、客户端错误
     （400/**422**）、契约错误、网络层失败。
   - `available()` = 总开关 ∧（主链可用 ∨（次后端启用 ∧ 次链可用））；`prime()` 按
     启用与回退组合探测两后端付费平面；keyPresence 每后端独立。
5. **Parallel 传输规格**（Fact 源：调研文档 §2/§3）：
   - REST：`POST {parallelBaseURL}/v1/search`，头 `x-api-key`；体
     `{search_queries:[query], objective:query, mode:parallelMode,
     advanced_settings:{max_results:clamp(1..20), excerpt_settings:{max_chars_per_result:700}}}`；
     映射 `results[].excerpts[]` 拼接截断 ≤800 → snippet，`publish_date` → publishedAt；
     错误消息取 `error.message`（ErrorResponse）。
   - 匿名 MCP：`{parallelMcpBaseURL}`，`initialize`（协议 2025-06-18）→
     `notifications/initialized` → `tools/call web_search`，入参
     `{objective:query, search_queries:[query], session_id:<实例级稳定随机，≤100 字符>}`
     （免费层按 session_id 限流）。载荷 text 即 V1SearchResponse JSON，解析后与 REST
     **共用同一结果映射器**。工具 schema 无条数参数——MCP 路径忽略
     `parallelNumResults`（卡片 hint 写明）。匿名路径不发送密钥（与 Exa 匿名对称）；
     认证 MCP（Bearer 提额/钉配置）留作后续。
   - 凭据链沿用：字面量 → credentials 服务 → 启动环境。
6. **版本**：0.4.0；USER_AGENT 与 MCP clientInfo 联动升（hardcode-index 登记）。

## 决策 D2：配置 UI 分层（首屏精简 + Modal 详细配置）

1. **机制**：卡片内 `Primitives.Modal`——自闭合（React state 控 open）、零新依赖
   （同包已 require Button/IconChevronDownOutline14）、不依赖任何导航 API。
   备选 `settings.section` 独立设置页**否决**：设置面板导航为内部 state，卡片无法
   编程跳转，按钮只能沦为文字提示；`shell.overlay` 不必要（Modal 自足）。
2. **首屏（精简）**：`enabled` 总开关 + 状态行（当前策略摘要：优先后端、次后端
   启用态）+「详细配置…」次级按钮（outline）+ 保存/放弃。staged-save 纪律不变。
3. **详细配置 Modal**：三组——策略组（preferred/exaEnabled/parallelEnabled）、
   Exa 组（8 字段）、Parallel 组（9 字段，apiKey 不入卡与现状一致）；同一
   staged-save 引擎与校验（dirty/invalid/override 徽章）；footer = 放弃/保存；
   打开期间暂存与首屏共用一个 staged 状态对象，脏字段在首屏头部徽章可见。
4. **卡片参数化**：字段元数据按后端分组声明，为后续第三后端留口，但不预设抽象
   （Evolution First：抽象来自本次真实变化，即止于此）。

## 备选方案

- *两 provider id 并列、无策略层*：seam 选择由 composition 固定，插件无法表达
  「哪个优先」→ 否决（不满足 Q1 决策）。
- *namespace 改名 um-web-search*：存储用户层随旧名孤儿化 → 否决（保持
  `web-search-exa`，卡片标题已 rebranded，无碍）。
- *首屏保留 allowAnonymous*：双后端后「路由」含义分裂（属于各后端组）→ 否决，
  首屏只留总开关（Q3 决策）。
- *Parallel 匿名 MCP 发送 Bearer 提额*：与「匿名忽略凭据平面」对称性冲突，
  留作后续（可经 mcpBaseURL 查询参数由用户自行钉配置——该机制要求认证）。

## 后果

- Config 22 键扁平共存；UI 分组仅为展示层关切，Host 不分组。
- 单次搜索最坏 4 次传输尝试（双后端 × 双传输），延迟上界上升；每跳仍受
  AbortSignal 贯穿。
- `parallel` 成为硬编码语义新族（端点/工具名/模式枚举/默认引用名），
  hardcode-index 全量登记。
- 既有部署零迁移（id 别名 + 键缺省）；README 与 patch snippet 增补 Parallel 说明。
- 验证门禁：既有套件全绿（Exa 不变式）+ Parallel 套件（镜像）+ render 新用例
  （首屏/Modal 开合/分组渲染）。
