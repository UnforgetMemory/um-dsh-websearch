# 硬编码语义索引（um-dsh-websearch）
<!-- 发现无法变量化的值 → 登记；升级时按短路径逐处同步后回写 -->
<!-- 状态：本地草稿，团队化入库需人工确认 -->

| 语义 | 当前值 | 短路径（文件:行） | 同步说明 |
|------|--------|-------------------|----------|
| 依赖族版本钉 | dsh-web/dsh-credentials/dsh-settings/dsh-invariants/dsh-brand/dsh-llm @0.1.1-rc.2 · launch-environment @0.1.0-rc.8 · schemastery @3.18.1 · cordis @4.0.1 | package.json:25-35(deps) · package.json:36-44(overrides) | 升级 DSH 时全族同步，两处一致 |
| USER_AGENT 版本尾缀 | um-dsh-websearch/0.2.0 | lib/index.js:43 | 与 package.json version 联动升 |
| provider id | exa | lib/index.js:21 · lib/client.js:10(NS) · cordis.patch.yml(id/key) | 三处一致性 = 卡片认领与注册同键 |
| settings namespace | web-search-exa | lib/index.js:501 · lib/client.js:10(NS，同 slot key 与 locale 命名空间) · patch 行 id | 改名需四处同步（含语言包注册键） |
| 凭据引用名模式 | `^[A-Za-z_][A-Za-z0-9_]*$` | lib/index.js:97(API_KEY_ENV_PATTERN) · lib/client.js:15(KEY_REF_PATTERN) · dsh-credentials 内部 REF_PATTERN（未导出，两处本地镜像） | 源模式变更需三处同步 |
| snippet 本地截断上限 | 800 字符 | lib/index.js:133 | 与请求侧 SNIPPET_MAX_CHARACTERS(lib/index.js:41, 700) 并存；调整任一需复核另一 |
| 匿名 MCP 端点 | https://mcp.exa.ai/mcp | lib/index.js:29(EXA_MCP_DEFAULT_BASE_URL) · lib/client.js 卡片 mcpBaseURL 提示 · README 表 | Exa 托管地址；自建代理时在设置里覆盖 mcpBaseURL |
| MCP 协议版本 | 2025-06-18 | lib/index.js:31(MCP_PROTOCOL_VERSION) · lib/client.js(无) | 与 Exa 服务端协商；升级 Exa 时复核 |
| MCP 搜索工具名 | web_search_exa | lib/index.js:33(MCP_TOOL_WEB_SEARCH) | 与 Exa MCP 工具清单一致；改名需同步 |
| 卡片出厂默认镜像 | enabled:false · allowAnonymous:false · apiKeyEnv:"EXA_API_KEY" · baseURL:"https://api.exa.ai" · mcpBaseURL:"https://mcp.exa.ai/mcp" · numResults:5 · searchType:"auto" | lib/index.js:490-499(Config 默认) · lib/client.js:216-224(FIELD_DEFAULTS) · tests/render.test.mjs:86(makeSnapshot) | 覆盖徽章判定依赖三处一致；任一处改动需三处同步 |
