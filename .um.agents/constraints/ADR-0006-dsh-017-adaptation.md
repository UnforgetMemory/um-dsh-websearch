<!--
createdAt: 2026-09-24 09:47:56 +08:00 (本地时钟 Get-Date)
updatedAt: 2026-09-24 13:00:00 +08:00 (本地时钟 Get-Date)
-->
# ADR-0006: DSH 0.1.7 适配（设置子系统重写 + 官方 primitives 卡片重建）

- 状态: Accepted
- 前置: [ADR-0004](./ADR-0004-multi-source-strategy.md)（providers[] 策略模型）、[ADR-0005](./ADR-0005-playwright-visual-testing.md)（视觉测试）
- 决策来源: 用户拍板（umpp 决策面板 2026-09-23：q1 目标 0.1.7-alpha.2 / q2 单目标不兼容旧 API 族 /
  q3 改用官方 primitives 的 SettingsForm 重建卡片 / q4 允许新建临时 profile 实机验证，不动 web profile）
- 证据: `.um.agents/tmp/research/{A,B,C,D,E}-*.md`（五路调研，全部带 file:line / URL）

## 背景

插件当前按 DSH 家族 `0.1.1-rc.2` + cordis `4.0.1` + schemastery `3.18.1` 编写，本机实装为
`0.1.7-alpha.2` + cordis `4.0.4` + schemastery `3.18.4`。0.1.7-alpha.1 起设置子系统被**整体重写**
（官方 0.1.7-alpha.1 发布说明：*"Save settings in the current Profile's plugin configuration,
supporting fields declared for live updates … custom settings plugins must adapt."*），插件当前在
0.1.7 上处于「半死」状态：

- **Host 无法链接**：`installSettingsSection` / `settingsNamespace` 在 `dsh-settings@0.1.7-alpha.2`
  已不存在（导出仅 `{SettingsConflictError, SettingsForms, redactSecrets}`，lib/index.js:544），
  而 `lib/index.js:2` 仍在具名导入 → 模块加载期 ESM 链接失败，行无法激活。
- **Client 根本不会挂载**：`settingsScope` 服务与 `settings.plugin.item` slot 在 0.1.7 全安装内
  0 命中；`connection.api.credentials` 亦已消失；`Primitives.IconChevronDownOutline14` 被删除。
  cordis 对缺失注入的服务保持 fiber pending → `apply()` 永不执行，且 slot 缺失是**静默**的。
- **打包层静默丢键**：id 定向 patch 整段替换 `config`（`dsh-app-boot/lib/index.js:101-104`），
  0.1.7 的 base `web` 行已同时拥有 `searchProvider` 与 `fetchProvider`（`dsh-base/cordis.patch.yml:471-475`），
  现 patch 只 restate 前者 → `fetchProvider: http` 被删除，只因当前仅注册了一个 fetch provider 才侥幸可用
  （第二个 fetch provider 出现即 `WEB_PROVIDER_AMBIGUOUS`）。

## 决策

### D1: 单目标 0.1.7-alpha.2，运行时闭包全部作 dependencies

- 目标 = 本机实装 `0.1.7-alpha.2`；**不**做 0.1.1-rc.2 运行时兼容（旧 API 的 shim 会与宿主产生
  重复服务实例，比不兼容更危险）。
- **peer 必须用范围而非精确 pin（实现期发现，2026-09-24，阻塞级）**：DSH 有插件兼容性门禁
  （`dsh-app-boot/lib/types/plugin-compatibility.js:286-313` 的 `evaluatePluginCompatibility`），
  它把每个 `@deepseek-ai/dsh*` peer 与**运行时版本**做 `semver.satisfies(..., {includePrerelease:true})`，
  而运行时版本取的是 **app-boot 包自身的版本** —— 本机 `dsh` CLI 0.1.7-alpha.2 依赖的正是
  `@deepseek-ai/dsh-app-boot@0.1.7-rc.1`，因此精确 pin `0.1.7-alpha.2` 会被判
  "incompatible with dsh 0.1.7-rc.1" 并**拒绝安装**。实测（真实门禁函数）：

  故 peer 必须是**范围**（`cordis` 非 `dsh*`，不受门禁约束，用 `~4.0.4`）。
- **范围必须覆盖 0.2.x（0.2.0-rc.2 实测，2026-09-29，阻塞级）**：宿主已升到 `0.2.0-rc.2`
  （桌面版内置；`dsh.cmd` 在 `resources/runtime/cli/bin/`），此时 `^0.1.7-alpha.2` 语义为
  `>=0.1.7-alpha.2 <0.2.0`，**不含 0.2.x** → 门禁报
  `incompatible with dsh 0.2.0-rc.2` 并拒装（实测）。故支持窗口统一为
  `>=0.1.7-alpha.2 <0.3.0`，`engines.dsh` 同步。实测矩阵：

  | peer 范围 | runtime 0.1.7-rc.1 | runtime 0.1.7-alpha.2 | runtime 0.2.0-rc.2 |
  |---|---|---|---|
  | `0.1.7-alpha.2`（精确） | DENIED | COMPATIBLE | DENIED |
  | `^0.1.7-alpha.2` | COMPATIBLE | COMPATIBLE | **DENIED** |
  | `>=0.1.7-alpha.2 <0.3.0` | COMPATIBLE | COMPATIBLE | **COMPATIBLE** |

  两条线均端到端复验：安装通过、`--dump-config` 组合出两键 `web` 行 + `um-web-search` 行、
  profile 内 `import('um-dsh-websearch')` 成功（39 导出 / ns `um-web-search` / 5 个 volatile）。
  API 面复核（0.2.0-rc.2 源码）全部不变：`dsh-settings` 导出与 `volatileForm`/`mutate` 内部一致、
  `dsh-web` 仍是 `{searchProvider, fetchProvider}` + `registerSearchProvider` + `WebError`、
  base `web` 行两键、客户端 slot 仍为 `plugins.row.config`（`rowConfigKey`）、`ctx.configForms`
  与 `ctx.remote.credentials` 未变、primitives 仍导出卡片用到的全部组件、两条凭据事件
  （`reference-updated` / `record-updated`）都在。
- **但 peer 在真实 profile 里解析不到（实现期实测，2026-09-25，阻塞级）**：profile 固定
  `nodeLinker: hoisted` + `autoInstallPeers: false`，`cordis` / `dsh-llm` / `dsh-credentials` /
  `dsh-launch-environment` / `dsh-web` / `dsh-web-search-deepseek` **都不会被提升到 profile 根**
  （实测：base-only profile 与 web 模板 profile 皆然）。插件顶层 ESM import 需要真实文件路径，
  于是逐级报 `Cannot find package ...`（先 `dsh-settings`、再 `dsh-credentials`、再 `cordis`、
  再 `dsh-llm`），行根本无法激活。
  **决策：把运行时闭包声明为 `dependencies`（精确 pin），peer 仅作契约声明保留。**
  闭包 = 我们顶层 import 的包 + 它们运行时 import 的 peer：
  `schemastery`、`cordis`、`dsh-llm`、`dsh-credentials`、`dsh-launch-environment`、`dsh-web`、
  `dsh-web-search-deepseek`（其余为这些包的常规 deps，pnpm 自动安装）。
- **重复实例风险评估（Fact）**：全安装内 `instanceof WebError` 只出现在
  `dsh-web-fetch-http` 与 `dsh-web-search-deepseek` 自身内部；seam（`dsh-web`）与
  `dsh-tool-web` 均不做身份判定（按 `code` 字符串消费）。且我们把 `dsh-web` 与被包装的
  `dsh-web-search-deepseek` 一起声明为依赖，二者解析到**同一份**副本，我们自身的
  `instanceof WebError` 分类链自洽。因此自带副本是安全的。
- 删除无用依赖：`dsh-brand` / `dsh-invariants` / `dsh-settings`（`lib/` 零导入）。
- `pnpm-workspace.yaml` overrides 同步到新族。

### D2: settings 模型 = entry id 即命名空间 + `Volatile` 字段

- 不再有插件自选 namespace：**ns = profile Loader entry id = `um-web-search`**（`cordis.patch.yml:10`
  的 insert 行 id）。旧 `web-search-exa` 命名空间作废（存储位置从 settings 文档迁到 profile patch 的
  行 `config`，旧段不会被导入 → 用户设置回落默认，属破坏性变更，须在 CHANGELOG/README 声明）。
- `Config` 必须声明 `.volatile()` 才能出现在表单里（`volatileForm` 返回 undefined 时 `describe()`
  丢弃该 entry，`write()` 抛 "has no volatile fields"）。
- **嵌套规则（schemastery 3.18.4 src/index.ts:488-509）**：对象 `dict` 子节点保持 `blocked=false`
  （`cache.enabled.volatile()` 合法）；数组 `inner` 强制 `blocked=true` → `providers[].x.volatile()`
  **抛错**。因此 `providers` 必须**整数组**标 volatile：`z.array(ProviderSchema).default(BUILTIN_PROVIDERS).volatile()`，
  写入走单条 path op `{op:'set', path:['providers'], value:[...]}`（`applyPathOp` 支持数组路径；
  `isVolatilePath` 在 volatile 节点处短路）。
- 读取：`apply(ctx, config)` 的 `config` 现在是**已解析 schema 输出 + Volatile 引用**；每次操作经
  `config.<field>.get()` 取快照。`setSource` / `current()` 机制删除。
- 校验：settings 的 `validate` 钩子不存在，`.check()` 在 schemastery 3.18.4 **不存在** →
  跨字段不变量改挂 `ctx.on('internal/config', (cfg, next) => { validateConfig(cfg); return next(); })`。
- 失效通知：`onChange` 钩子不存在 → `ctx.on('loader/volatile-update', ...)`（payload `paths`）驱动
  缓存失效 + `prime()`。
- 非 volatile 的 legacy 扁平键（LEGACY_KEYS）仍被 schemastery 非严格解析保留，可在 `apply` 期读一次
  做零存储合成；volatile 更新不会刷新它们。
- **迁移优先级修订（实现期发现，2026-09-24）**：新模型下 `defaultProvider` 恒带 schema 默认值
  `"exa"`，会压掉 legacy 的 `preferred`；且 legacy 键**不是 volatile、设置服务无法清除**
  （`write()` 的 `validatePaths` 对非 volatile 路径抛错）。因此判定收紧为
  **`hasLegacyKeys(section) && hasPristineProviders(section.providers)`**：只要 `providers`
  不再是 pristine 的 BUILTIN 默认（用户从新卡片保存过一次，写回的正是合成结果），legacy 键即
  退化为惰性残留、新模型优先；`preferred` 仅在 legacy 判定成立时压过 `defaultProvider`。

### D3: 卡片 = 官方 primitives 的 `SettingsForm` 重建

- 旧自研卡片（1088 行：自研 CSS + Modal + tab + 手风琴）**整体退役**，改用官方
  `SettingsForm` / `SettingsFormModel` / `SettingsValueField` / `SettingsSecretField` /
  `settingsTextField` / `settingsNumberField`（`@deepseek-ai/dsh-client-ui-primitives@0.1.7-alpha.2`）。
- 挂载：服务注入 `["slots", "locale", "configForms", "remote", "remote.credentials"]`；
  `ctx.configForms.get("um-web-search")` 取 scope；`ctx.configForms.whileServed([NS], () =>
  ctx.slots.inject(<slot>, () => ctx.slots.register({...inject: () => card.inject()}, Card)))`。
- slot：本包是 **bundle**（自带 cordis.patch.yml 行），按 0.1.7 slot 目录用
  `plugins.row.config`，key = `<pkg>#<rowId>` = `um-dsh-websearch#um-web-search`（备选
  `plugins.bundle.config` key `um-dsh-websearch`；实现期以 ui-plugin-manager 源码的
  `rowConfigKey` 为准，若不可用则退回 `plugins.item`）。
- 凭据：`ctx.remote.credentials.describe([refs])` → `{ok, value: {ref: {configured, writable}}}`；
  `.set(ref, value)`（**位置参数**）；失效监听 `ctx.remote.$on("credentials/reference-updated", cb)`。
- **providers[] 的表达**：`SettingsFormModel` 的 section spec 只支持**顶层标量字段**
  （`path:[field]`）。因此 `providers` 数组通过第三参数（write-only 自定义控件，`{field, write}`）
  承载：卡片内用官方 `Switch`/`Input`/`Button`/`Tag` 渲染 provider 列表与明细，序列化后经
  `scope.mutate([{op:'set', path:['providers'], value}], revision)` 落盘。
  `cache` 同理（整对象 volatile）。
- 保留的 UI 能力：总开关、默认 provider、并发、缓存开关/TTL、provider 列表（启用/排序/档位/密钥引用/
  回退开关）。退役的能力：自研 Modal/tab/手风琴/自研 CSS 命名空间（视觉基线随之重做）。

### D4: bundle patch 必须 restate `web` 行全部键

- `cordis.patch.yml` 的 `- id: web` 覆盖改为
  `config: { searchProvider: um-web-search, fetchProvider: http }`；
  注释补全真实层序（`… → 本 bundle → profile cordis.patch.yml → $DSH_HOME/cordis.patch.yml → --patch`）。

### D5: 验证以真实挂载为准

- 用户已授权在 DSH home 下**新建临时 profile**（不触碰 `web` profile）：
  `dsh plugin --profile dsh017test add <本仓库路径>` → `dsh --profile dsh017test --dump-config`
  断言 `um-web-search` 行存在且 `web` 行 `config` 同时含 `searchProvider: um-web-search` 与
  `fetchProvider: http`。这是唯一能证明 bundle 层与 loader 真的能挂载的证据。
- 单测（node:test）+ Playwright 视觉/交互套件同步重做；不允许为过测降低标准。
- **已执行的证据（2026-09-24）**：临时 profile `C:\Users\um\.dsh\profiles\dsh017test`
  （`@deepseek-ai/dsh-base@0.1.7-alpha.2` + 本包 `link:`）执行 `dsh --profile dsh017test --dump-config` 输出：

  ```
  # == @deepseek-ai/dsh-base, patched by um-dsh-websearch
  - id: web
    name: '@deepseek-ai/dsh-web'
    config:
      searchProvider: um-web-search
      fetchProvider: http
  # == um-dsh-websearch
  - id: um-web-search
    name: um-dsh-websearch
  ```

  即：`dsh plugin add` 已把本包追加进 `dsh.profile.bundles`、bundle patch 层真实挂载、`web` 行
  两键齐全（D4 的缺陷已修复）。改造前的对照证据：`node --input-type=module -e
  "import('./lib/index.js')"` 在 0.1.7 依赖族下报
  `Cannot find package '@deepseek-ai/dsh-settings'`（host 半无法链接）。
- **发布形态安装验证（2026-09-24/25，强于 link: 安装）**：`link:` 安装会走本仓库自己的
  `devDependencies`，不能证明发布安装的 peer 解析。因此追加 tarball 实测：`pnpm pack`
  （tarball 必须放在项目外，否则 pnpm 会把 `file:` 解析回 `link:` 到源目录）→
  `dsh plugin --profile dsh017test remove um-dsh-websearch` → `add <tgz>`：门禁通过、
  依赖记为 `file:…um-dsh-websearch-0.7.0.tgz` 且 peer 被解析进 lock
  （`dsh-web@0.1.7-alpha.2` / `dsh-web-search-deepseek@0.1.7-alpha.2` 等）、
  `node_modules/um-dsh-websearch` 是**真实目录**且按 `files` 解包（无 `tests/`、无 `scripts/`）、
  `dsh.profile.bundles` 追加本包、`--dump-config` 仍输出两键 `web` 行 + `um-web-search` 行，
  且在 profile 目录内 `import('um-dsh-websearch')` 成功（39 导出、ns `um-web-search`、
  5 个 volatile 字段）。注：pnpm 对本地 `file:` 依赖会连带安装该包的 devDependencies，
  故本验证证明的是「解包内容 + 门禁 + peer 解析 + 组合」，**不是**「devDeps 被排除」。
- 残余验证缺口（已知、需在报告中声明）：真实浏览器内的卡片渲染需要启动 web 应用，本次不做；
  以「客户端模块 factory 冒烟 + slot/configForms/remote 契约断言 + Playwright 桩渲染」替代。

## 后果

- **破坏性**：插件版本 → 0.7.0；要求 DSH ≥ 0.1.7-alpha.2；旧 `web-search-exa` 设置不再读取；
  卡片 UI 与自研 CSS 退役（`um-dsh-websearch-*` 类名与 5 张像素基线作废）。
- `lib/client.js` 规模大幅下降（自研 CSS/Modal/tab/手风琴移除），`lib/index.js` 增加 volatile 读取层。
- hardcode-index 需同步：依赖族 pin、settings ns（`web-search-exa` → entry id `um-web-search`）、
  client slot/服务注入、VERSION/ABOUT_VERSION、测试套件构成。
- 测试策略：宿主用例改为「Volatile 引用 + 0.1.7 ctx」harness；客户端用例改为「configForms scope +
  remote.credentials」mock；视觉基线重拍。
