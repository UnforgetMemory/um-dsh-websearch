<!--
createdAt: 2026-09-29 23:59:00 +08:00 (本地时钟)
updatedAt: 2026-09-29 23:59:00 +08:00 (本地时钟)
-->
# ADR-0007: DSH 0.2.0-rc.2 单线收窄（桌面版对齐 + semver 预发布解析缺陷修复）

- 状态: Accepted
- 前置: [ADR-0006](./ADR-0006-dsh-017-adaptation.md)（0.1.7 适配 + 支持窗口 `>=0.1.7-alpha.2 <0.3.0`）
- 决策来源: 用户拍板（umpp 决策面板 2026-09-29：q1 依赖 range 收窄单线 0.2.x / q2 测试基线升级 0.2.0-rc.2 / q3 授权桌面 CLI 刷新 desktop profile；umcommit 决策面板 2026-09-30：q1 版本沿用 0.7.0 基版不升号）
- 证据: `.um.agents/tmp/dsh-desktop-probe/`（桌面 app.asar 提取源码 + npm/GitHub release 查询 + semver CLI 实测）

## 背景

DeepSeek Harness Desktop（`C:\Users\um\AppData\Local\Programs\DeepSeek Harness`，Electron 44）内置全套
`@deepseek-ai/*@0.2.0-rc.2`（`resources/runtime/primary-runtime/runtime.json` 的
`desktopVersion: "0.2.0-rc.2"`；app.asar 内 `dsh/node_modules/@deepseek-ai/*` 逐一核实），与 GitHub
最新 release `dsh-v0.2.0-rc.2`（2026-09-29）一致——桌面端即最新版。插件 0.7.0 已装进 desktop profile
（`~/.dsh/profiles/desktop`，commit 29adecf，lib 与本地逐字节一致），0.2.0-rc.2 的宿主/客户端 API 面
（17 primitives、`plugins.row.config` slot + `rowConfigKey`、`configForms`、`credentials.describe/set`
与两事件、`dsh.client` 声明、base `web` 行两键）经源码核对**全部未变**。

但桌面 profile 实测发现依赖闭包停在 **0.1.7-rc.2**（`node_modules/@deepseek-ai/dsh-web` 等五个包），
与 0.2.0-rc.2 宿主形成双份 dsh 运行时副本。根因是 **semver 预发布匹配规则**：range
`>=0.1.7-alpha.2 <0.3.0` 中没有元组为 `[0,2,0]` 且带预发布标签的比较器，故 `0.2.0-rc.1/rc.2`
在普通 semver（pnpm/npm 依赖解析语义）下**不满足**；semver CLI 实测
（`npx semver -r ">=0.1.7-alpha.2 <0.3.0" 0.2.0-rc.2` → 不输出）。而 DSH 插件兼容性门禁
（ADR-0006 D1 记载：`plugin-compatibility.js` 用 `semver.satisfies(..., {includePrerelease:true})`
比对 app-boot 自身版本）**放行** 0.2.0-rc.2——门禁与依赖解析器语义不一致，插件得以「带 0.1.7 副本」
装进 0.2.0 宿主。

双副本功能上安全（`WebError` 仅插件自身调用链 `instanceof`，lib/index.js:247/818/837；seam 按
`code` 字符串消费；被包装的 `DeepSeekSearchProvider` 与 `dsh-web` 解析到同一副本），但违背官方
house style（monorepo 内 `@deepseek-ai/dsh-*` 互依赖一律精确同版 pin，见 app.asar 内
`dsh-base@0.2.0-rc.2` 的 package.json），版本漂移会随宿主升级积累。

另有两处基线过时：devDependencies 与 pnpm-workspace overrides 全部 pin `0.1.7-alpha.2`（从未对
0.2.0-rc.2 跑过测试）；`tests/render.test.mjs` 内嵌的 `SettingsFormModel` 镜像声明按
`0.1.7-alpha.2 lib/index.js:6417-6684` 抄写。

桌面 profile 由 Electron 应用独占管理（`dsh/lib/bin.js:119` 的 `rejectElectronProfile` 仅对
`plugin` 命令在 `manageDesktopProfile: true` 时豁免）——普通命令（如 `--dump-config`）拒绝，
插件 add/remove/update 放行，这为桌面端刷新提供了官方通道。

## 决策

### D1: 支持窗口收窄为 `>=0.2.0-rc.1 <0.3.0`

- `engines.dsh`、`dependencies`/`peerDependencies` 中全部 `@deepseek-ai/dsh-*` range 统一收窄。
  `>=0.2.0-rc.1` 的比较器自带 `[0,2,0]` 预发布标签 → `0.2.0-rc.1/rc.2` 与未来的 `0.2.x`
  （含 0.2.0 正式版）在普通 semver 下满足，pnpm 解析到范围内最新（当前 0.2.0-rc.2）。
- **0.1.7 线不再支持**（破坏性）：0.1.7 宿主的门禁按 includePrerelease 比对 app-boot 版本
  `0.1.7-rc.1`，`0.1.7-rc.1` 不满足新 range → 拒装（fail-fast，优于半适配）。
- cordis `~4.0.4`、schemastery `~3.18.4` 维持（与官方 `dsh@0.2.0-rc.2` 一致）。
- devDependencies 与 pnpm-workspace overrides 同步升级到 `0.2.0-rc.2`（测试基线 = 桌面实装版本）。
- 门禁语义复核：新版 range 在 includePrerelease 下对 0.2.0 系全部放行，未来 0.3.0 前的
  预发布同样满足；`<0.3.0` 上限维持。

### D2: 测试基线对齐 0.2.0-rc.2

- `pnpm test` 四套件即对 0.2.0-rc.2 真实包回归（plugin/boundary/version 套件 import 真包，
  render 套件的 primitives 为 stub 不受影响）。
- `render.test.mjs` 的 `SettingsFormModel` 镜像与 0.2.0-rc.2 真源
  （`dsh-client-ui-primitives@0.2.0-rc.2 lib/index.js`）逐行 diff 复核；语义有变则同步镜像，
  注释中的版本与行号引用一并更新。

### D3: 桌面 profile 经官方插件通道刷新

- `pnpm pack` 出 tarball（放项目外）→ 桌面内置 CLI
  （`resources/runtime/cli/bin/dsh.cmd`）对 `desktop` profile 执行
  `dsh plugin --profile desktop remove um-dsh-websearch` → `add <tgz>`。
- 刷新后验证 profile 依赖闭包升至 0.2.0-rc.2；最终 UI 验证由用户重启桌面应用完成
  （ADR-0006 D5 声明的残余缺口：真实浏览器内卡片渲染，仍需人工在桌面端确认）。

## 后果

- **破坏性**：DSH `0.1.7` 线不再支持（0.7.x 用户须先升宿主 ≥ 0.2.0-rc.1 再刷新插件）。**版本沿用
  0.7.0 基版**（umcommit 面板用户拍板不升号），CHANGELOG 条目记于 `[Unreleased]`，定版留给
  umrelease。
- 新装/刷新环境的插件依赖闭包与宿主同版（0.2.0-rc.2），消除双副本。
- hardcode-index 需同步：依赖族 pin（0.1.7-alpha.2 → 0.2.0-rc.2）、支持窗口。
- README/CHANGELOG 声明收窄与桌面端安装语义（desktop profile 独占管理、桌面内置 dsh 命令）。
