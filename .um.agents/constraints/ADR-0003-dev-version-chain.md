# ADR-0003: dev 版本管理链路（基版 + 14 位版本码）

- 状态: Accepted
- 日期: 见 git/文件时间（KV-Cache 约束：不在指令中写死时间）
- 前置: ADR-0001/0002；硬编码索引「版本化字符串」与「关于 tab 常量」两行

## 背景

dev 构建需要可辨识、可排序、可回溯的版本号，同时不能污染发布语义：发布版本
（semver 基版，如 0.4.0）归 umcommit/umrelease 管理。此前 dev 构建无任何版本
标识手段，三处版本化常量（package.json、lib/index.js `VERSION`、lib/client.js
`ABOUT_VERSION`）只能手改，存在失步风险。

## 决策

1. **版本方案**：dev 版本 = `基版 + "." + 14 位版本码`（`yyyyMMddHHmmss`，本地
   时间，秒级唯一），形如 `0.4.0.20260829102301`。
   - 严格单调：当前版本已带版本码且不严格早于当前时刻（同秒重复/时钟回拨）时，
     版本码 +1s；跨分钟自然进位（…2359 → …2400）。
   - 备选 13 位（示例 `yyyyMMddHHmm`+1 位秒）否决：同分钟不唯一、长度不齐。
2. **链路**（纯逻辑与副作用分离）：
   - `scripts/dev-version-core.mjs`：纯函数（codeOf/baseVersion/isDevVersion/nextVersion），可单测；
   - `scripts/dev-version.mjs`：CLI。默认 bump；`--reset` 回基版。同步三处版本
     常量；任一常量与 package.json 失步 → 硬报错拒绝执行（防手工漂移）；
   - `package.json` scripts：`dev:version` / `dev:version:reset`。
3. **留痕与边界**：历史追加 `.um.agents/memory/dev-versions.local.md`（本地，
   不 sync）；dev 版本**不提交、不打 tag、不进 CHANGELOG**（umcommit/umrelease
   仅作用于基版）；脚本永不执行 git 操作。
4. **验证**：`tests/version.test.mjs` 6 用例（格式/剥离/判定/戳记/同秒与回拨
   单调/分钟进位）。

## 后果

- 三处版本常量只能经脚本修改（失步即报错）；`VERSION` 单源派生 USER_AGENT 与
  MCP clientInfo（既有机制），bump 后自动跟随。
- 演示时先 bump 验证三处同步与历史写入，再 `--reset` 回基版，仓库不留 dev 版本。
- 未来接入 CI 时，dev 构件命名/上传逻辑可直接消费 core 模块。
