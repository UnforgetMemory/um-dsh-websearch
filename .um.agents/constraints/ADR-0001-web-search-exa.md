# ADR-0001: Exa 作为 DSH 内置 web 搜索提供者（um-dsh-websearch）

- 状态: Accepted
- 日期: 见 git/文件时间（KV-Cache 约束：不在指令中写死时间）
- 关联: 会话级动态插件 `exa-1/pkg-2`（本包的前身，验证用原型）
- 存储: `<projectRoot>/.um.agents/constraints/`（随本仓库入库；memory/ 由
  自包含 .gitignore 留本地）。历史偏差：D2 曾误置于包根，D3 曾误判 projectRoot
  为会话工作目录——均为对规范 `<projectRoot>/.um.agents/` 的作用域幻觉，已纠正；
  包内 README 仅保留使用文档，架构决策以本文件为唯一权威源。

## 背景

部署组合（profile `web`）已内置 `@deepseek-ai/dsh-web-search-deepseek`
（provider id `deepseek-official`），且 `ctx.web` 的选择被固定为
`searchProvider: deepseek-official`。用户需要 Exa (exa.ai) 搜索能力，
形态上要求：**内置**（随 profile 组合加载）、带**配置模板**
（Settings UI 可见的配置节）、支持**动态开启**（不重启插件即可启停）。

## 决策

1. **完全对齐 `dsh-web-search-deepseek` 的产品结构**：
   - 同一注册面：`inject: ['web']` + `ctx.web.registerSearchProvider(new ExaSearchProvider(() => resolveOptions(ctx, current())))`；
   - 同一配置模板机制：`installSettingsSection(ctx, settingsNamespace('web-search-exa'), Config, config, { setSource, onChange })`，zod schema 即 Settings UI 模板；
   - 同一凭据链：`credentialRef(apiKeyEnv)` → credentials 服务 → 启动环境回退，字面量 `apiKey`(role secret) 仅用于覆盖；
   - 同一错误词汇表：`WEB_PROVIDER_ERROR` / `WEB_PROVIDER_CREDENTIAL_MISSING` / `WEB_ABORTED`；结果 `truncated:false` 由 seam 负责截断。
2. **新增 `enabled` 开关（默认 false）实现动态开启**：
   - `available()` 每次实时读取当前配置节（`enabled && key可解析 && baseURL合法`）；
   - 关闭时 provider 保持注册但不可选（selection 永不落入 unavailable），打开后下一次搜索即生效 —— 无需重启；
   - 出厂关闭是显式选择：避免与已固定的 `deepseek-official` 产生任何行为歧义。
3. **HTTP 用原生 `fetch`**：静态插件运行于完整 Node realm（与 deepseek 提供者一致），
   不复用动态沙箱时期的 curl/subprocess 方案；取消经 `AbortSignal` 贯穿。
4. **落位为树外插件包**（README.md §安装）：源码驻留会话工作区
   `C:\a\code\temp\um-dsh-websearch`，经 pnpm 以 link: 方式装入 profile 的
   node_modules（符号链接指向工作区源码），由 profile 用户补丁层
   `cordis.patch.yml` 的 `insert:` 行挂入组合。不修改 `@deepseek-ai/dsh` 安装目录。

## 备选方案

- *仅保留动态插件*：进程重启即失效、无法进 Settings 配置模板 → 否决（即本次"优化"的对象）。
- *改 dsh 安装目录内嵌*：升级会被覆盖、无构建链 → 否决。
- *enabled 默认 true*：与固定选择的 deepseek 并存虽不报歧义（pinned），但语义含糊 → 否决。

## 后果

- 挂载需要一次 DSH 进程重启（本部署 `hmr` 行为 disabled）；
  之后 enabled/key/baseURL/searchType/numResults 全部热生效。
- Exa 成为默认搜索仍需一行 patch：把 `web` 行的 `searchProvider` 改为 `exa`
  （见 README §切换默认）。未切换时开启 enabled 无副作用。
- 本包依赖锁定本机 store 已存在的版本（0.1.1-rc.2 / 0.1.0-rc.8 / schemastery ^3.18.1），
  升级 DSH 时需复核 peer 版本。

## 修订 A1：available() 采用三态 keyPresence

- 背景：初版 `available()` 的 hasKey 判定恒真（resolveApiKey 引用恒存在），
  实际语义只是 `enabled && baseURL 合法`，与文档"反映密钥可解析"不符；
  固定选择下缺 key 表现为逐查询抛 CREDENTIAL_MISSING 而非诚实的不可用。
- 决策：provider 实例维护 `keyPresence ∈ unknown | yes | no` —— 激活、设置节
  变更、凭据引用更新、每次搜索后都会重探测；`unknown` 保持乐观（避免启动
  竞态阻塞 pinned 选择），一旦探测出确定值即如实反映。字面量 `apiKey` 恒为 yes。
- 影响：README 的可用性描述在探测收敛后成立；启动极早期的一次搜索可能以
  乐观态放行（随后由 CREDENTIAL_MISSING 给出明确配置指引）。

## 修订 D2：存储位置迁入 .um.agents/constraints

- 背景：初版将本 ADR 置于包根，违反 artifact-routing 三分类——约束/规范类
  agent 产物应迁移至 `<projectRoot>/.um.agents/`；同时造成治理文档双根源。
- 决策：迁入 `.um.agents/constraints/`；README 内链接指向本文件；
  包根不再保留任何治理类文档。

## 修订 D3：projectRoot 作用域纠正（单项目）

- 背景：D2 执行时把"会话工作目录"误当 projectRoot，将 `.um.agents/` 建到了
  项目之外，并虚构了"集中治理 vs 随仓版本化"的多仓取舍叙事（幻觉）。
- 决策：本项目为单一项目，projectRoot = 包根；`.um.agents/` 整体迁入
  `um-dsh-websearch/.um.agents/`。constraints/ 随仓库入库，memory/*.local
  由自包含 .gitignore 留本地——规范结构本身即已消解所谓取舍。
- 判例：判定 projectRoot 时只看用户显式命名的项目边界，不拿会话 cwd 或
  外层目录做外推。

## 修订 A2：匿名访问 = 公开托管 MCP（非 REST 无 key 直发）

- 背景：初版把 `allowAnonymous` 实现为「无 key 直发 REST /search」，误读为
  Exa 官方匿名通道；实测该路返回 HTTP 402（x402 按次付费，~$0.007/次），
  并非可用检索。查证官方文档与实探确认：Exa 的无 key 匿名访问 = 公开托管
  MCP `https://mcp.exa.ai/mcp`（工具 `web_search_exa`），免密钥直接返回结果。
- 决策：`allowAnonymous: true` 时 `search()` 默认走匿名 MCP 路径——provider
  内置最小 MCP streamable-HTTP 客户端（`initialize` 握手携带 session →
  `tools/call web_search_exa`），完全忽略凭据平面；`mcpBaseURL` 可指向自建
  代理。关闭时走 REST `/search` 认证路径（字面量 → credentials → 环境变量）。
  REST 侧 402 特判随之移除（匿名不再走 REST）。
- 可用性：匿名模式下 `available()` 只看 `mcpBaseURL` 可解析，与 keyPresence、
  引用名有效性解耦；`prime()` 跳过探测。
- 结果解析：MCP 文本载荷按 `Title:` 行分块（块内 markdown `---` 不误拆），
  提取 title/url/published/snippet（≤800 字符），按 url 去重。
- 证据：直连实测 200 返回真实结果（无 key 无 402）；部署端到端经
  `web_search` 工具复验成功；套件 25 用例含 MCP 路径与解析器用例。
- 后果：插件不内嵌链上支付；若 Exa 收紧匿名配额，匿名路径将以
  WEB_PROVIDER_ERROR 冒泡，用户可回退认证路径或自建代理。
