<!--
createdAt: 2026-10-18 17:00:00 +08:00 (本地时钟)
updatedAt: 2026-10-18 17:00:00 +08:00 (本地时钟)
-->
# ADR-0008: DSH 0.2.1-rc.2 适配（官方包 peer/dev-only，消除 profile 依赖闭包）

- 状态: Accepted
- 前置: [ADR-0007](./ADR-0007-dsh-020-rc2-single-track.md)（0.2.0-rc.2 单线收窄 + semver 预发布解析缺陷修复）
- 决策来源: 用户 2026-10-18 报告「桌面版升级后 `tool-web (@deepseek-ai/dsh-tool-web): waiting for web`」，umpp 执行；根因由 `.um.agents/tmp/research/dsh-021-drift.md`（静态）+ `%TEMP%\dsh-repro-021\artifacts\`（动态）双证
- 证据: 桌面安装 `resources/runtime/primary-runtime/runtime.json` `desktopVersion: 0.2.1-rc.2`（app.asar 文件时间 2026-10-17 17:20）；live profile `.plugin-manager/logs/operation-Gcx99R/pnpm.log`（`Packages: +16`）与 `operation-IzY0NM/pnpm.log`（16:06 安装、16:07 卸载）；0.2.1 宿主源码 `dsh-app-boot/lib/index.js:279-298,311-326,2305-2388,1322-1345,1613-1674,3544-3556`；官方插件指引 `@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/SKILL.md:18` 与 `references/host-plugin.md:7`

## 背景

DeepSeek Harness Desktop 于 2026-10-17 自动升级到 **0.2.1-rc.2**（npm dist-tag `next` = 0.2.1-rc.2，安装即为最新；宿主全部
`@deepseek-ai/*` = 0.2.1-rc.2，cordis 4.0.5 / cosmokit 1.8.6 / schemastery 3.18.5）。插件 0.7.0 的支持窗口是
`>=0.2.0-rc.1 <0.3.0`，在普通 semver 下**匹配不到 0.2.1-rc.2**（预发布版只被同 `[major,minor,patch]` 元组且带预发布标签的
比较器命中；窗口里只有 `[0,2,0]` 的比较器）——与 ADR-0007 的 0.1.7→0.2.0 是同一条 semver 规则，只是宿主又进了一个 patch 预发布。

后果分两步：

1. **profile 依赖闭包被钉在 0.2.0-rc.2**。插件的 `dependencies` 把 6 个官方包写进运行时依赖，pnpm 只能解析到 0.2.0-rc.2，
   于是 profile 的 hoisted `node_modules` 里出现 16 个官方包（安装日志 `Packages: +16`）。
2. **0.2.1 新增「精确版本」兼容性 preflight 把 `web` 行整行禁用**。0.2.1 的 `dsh-app-boot` 在 profile 组合期逐行解析：
   `preflight`（`lib/index.js:2305-2388`）→ `manifestOf`（`:2261-2293`，走 `pluginPackages.packageOf`）→ profile 本地候选优先
   （`:1613-1674`；ESM 直接取 `createRequire(...).resolve.paths()` 中位于 profile 目录下的候选）→ 生命周期判定
   `evaluatePluginCompatibility`（`:311-326`）。判定只看 **`engines.dsh`（存在则单独裁决、peer 被忽略）**，否则只看
   `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` 的 **`peerDependencies`**（`:279-298`）；**`dependencies` 完全不检查**。
   0.2.0-rc.2 官方包没有 `engines.dsh`，其 peer 是精确 pin（如 `@deepseek-ai/dsh-llm: 0.2.0-rc.2`），对运行时 0.2.1-rc.2
   不满足（`satisfies(..., {includePrerelease:true})`）→ 该行被 `row.disabled = true` 并在 stderr 打印
   `disabling profile plugin row "web": Plugin @deepseek-ai/dsh-web@0.2.0-rc.2 is incompatible with dsh 0.2.1-rc.2`。
   `web` 行的 `@deepseek-ai/dsh-web`（`WebRuntime extends Service`，服务名 `web`）不激活 → `ctx.web` 永不提供 →
   依赖它的行全部 PENDING，诊断文案正是 `tool-web (@deepseek-ai/dsh-tool-web): waiting for web`（另有
   `web-deepseek-api` / `web-fetch-http` / 本插件 `um-web-search`）。

注意 `waiting for web` **与插件 provider 注册无关**：`dsh-web` 构造函数不校验 provider，选型只在执行期 `resolveProvider` 抛
`WEB_PROVIDER_CONFIGURED_MISSING`；所以「web 服务缺席」只能来自 `web` 行本身没激活。这也解释了为什么整条 web 能力（含
`web_search` / `web_fetch`）一起坏掉，而不是只有本插件的 provider。

0.2.0 时代同一份 profile 副本无害（当时没有这层 preflight），因此 ADR-0007 的「闭包与宿主同版」只在 0.2.0 内自洽；
0.2.1 把「profile 副本先于安装副本」与「精确版本 preflight」组合成了新的失效面。

## 决策

### D1: 官方包离开运行时依赖闭包（`dependencies` 清空，peer + dev only）

- `package.json` 的 `dependencies` **整体删除**；全部官方包只放：
  - `peerDependencies`（契约声明，profile 的 `autoInstallPeers: false` 保证**不会被装进 profile**）：
    `@deepseek-ai/cordis >=4.0.4 <5`、`@deepseek-ai/schemastery >=3.18.4 <4`、
    `dsh-credentials` / `dsh-launch-environment` / `dsh-web` / `dsh-web-search-deepseek` 为 `>=0.2.0-rc.1 <0.3.0`；
  - `devDependencies`（本地测试/开发基线 = 桌面实装 0.2.1-rc.2 家族）。
- 运行时由 **DSH 安装目录**提供这些包（profile 无本地候选时，0.2.1 profile 解析回落到 installation 拦截层），
  因此每行的 manifest 恒等于宿主自身版本，preflight 天然通过；**跨 0.2.0 与 0.2.1 宿主同时成立**。
- 官方 house style 依据：`@deepseek-ai/dsh-agent-preset` 自带插件开发 skill——
  「Packages shipped with dsh resolve from the dsh installation, so the bundle declares no dependencies on them」
  （`skills/cordis-plugin-development/SKILL.md:18`）、「A Host-only bundle needs no dependencies」
  （`skills/cordis-plugin-development/references/host-plugin.md:7`）。
- **禁止**改用精确 pin `0.2.1-rc.2` 解决：那只是把失配反向推给 0.2.0 宿主，且违反官方指引。

### D2: `engines.dsh` 保持跨 0.2.x 宽窗口

- `engines.dsh` 维持 `>=0.2.0-rc.1 <0.3.0`：preflight 用 `includePrerelease: true`，0.2.0-rc.2 与 0.2.1-rc.2 都满足；
  bundle 发现期的同类检查（`loadProfileDirectory`，`:1015-1051`）也不会整包 skip。
- 不把窗口改成只 0.2.1：会让 0.2.0 宿主整包被 skip（fail-fast 可以，但当前结构已无必要）。

### D3: 测试/开发基线对齐 0.2.1-rc.2

- `devDependencies` 全族 0.2.1-rc.2（含 client 侧四件套）、cordis `~4.0.5`、schemastery `~3.18.5`；
  `pnpm-workspace.yaml` 的 overrides 与 `minimumReleaseAgeExclude` 同步为 0.2.1-rc.2 家族。
- `pnpm test` 175 用例在 0.2.1 真包上全绿；`tests/boundary.test.mjs` 新增「官方包不得进入运行时依赖闭包」回归门
  （ADR-0008 manifest contract），防止退回「改版本钉」式修复。

### D4: 无宿主侧/客户端侧代码改动

- `lib/index.js` 所用 API（`WebError`、`credentialRef`/`isCredentialRefName`、`launchEnvironmentOf`、
  `DeepSeekSearchProvider`、`registerSearchProvider`、`internal/config` waterfall、`loader/volatile-update`）在 0.2.1 全部不变；
  cordis 4.0.5 与 4.0.4 的 `lib/index.js` 字节相同、schemastery 3.18.4↔3.18.5 `lib/index.cjs` 字节相同。
- `cordis.patch.yml` 不变：行覆盖语义、`web` 行 id/name/两键（`dsh-base/cordis.patch.yml:467-471`）未变。
- `lib/client.js` 不变：`plugins.row.config` slot + `${bundle}#${rowId}` key、`configForms.get/durable/whileServed`、
  `SettingsForm/SettingsFormModel`、`remote.credentials.*`、`remote.$on` 在 0.2.1 均同构。

### D5: 用户侧刷新必须「卸载 → 重装」

- 已 hoist 进 profile 的 0.2.0 官方包不会因为升级插件版本而消失，必须 `dsh plugin --profile <p> remove um-dsh-websearch`
  再 `add`；桌面端也可在插件管理 UI 卸载后重装。
- 刷新后验收：profile `node_modules/@deepseek-ai` 下**不得出现任何 `dsh-*` 包**；boot stderr 无
  `disabling profile plugin row`；启动审计无 pending/failed 条目。
- 版本号：umcommit 决策面板（2026-10-18）拍板升 **0.7.1**（patch）——本次为兼容性修复 + 打包方式变更，不涉及 API 破坏；
  `package.json.version` 与 `lib/index.js` 的 `VERSION` 同步，CHANGELOG 定版 `## [0.7.1] - 2026-10-18`。

## 后果

- profile 闭包变空（只剩插件自身），插件不再向宿主交付任何官方包副本；同一份包在 0.2.0-rc.2 / 0.2.1-rc.2 宿主上都能加载。
- 未来宿主升级（0.2.x 稳定版、后续 rc）不再需要追版本窗口：官方包版本恒由安装目录决定；只有当插件使用的 **API 面**变化时才需要 ADR。
- `dependencies` 清空后，任何「真私有运行时依赖」若出现必须重新引入并接受闭包语义（当前没有）。
- 文档/索引需同步：README 环境要求与迁移说明、hardcode-index 依赖族行、CHANGELOG `[Unreleased]`、`cordis.patch.snippet.yml`
  的版本注记。
- 残留验证缺口：真实浏览器内设置卡渲染（ADR-0006 D5 起的人工项）仍应人工确认一次。
