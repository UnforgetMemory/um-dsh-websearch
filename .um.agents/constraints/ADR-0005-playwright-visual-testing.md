<!--
createdAt: 2026-09-05 16:41:08 +08:00 (本地时钟 Get-Date)
updatedAt: 2026-09-25 17:30:00 +08:00 (本地时钟 Get-Date)
-->
# ADR-0005: Playwright 真实视觉交互测试选型

- 状态: Accepted（**范围由 [ADR-0006](./ADR-0006-dsh-017-adaptation.md) D3 修订**：0.7.0 起卡片改用官方
  primitives 构建，插件不再拥有自研 CSS/像素级 DOM；本 ADR 的「真实 CSS 布局 / 设计令牌」断言随自研
  样式表退役，Playwright 套件保留为「插件自有组合与交互行为」的浏览器级验证，官方组件自身的渲染由框架负责。）
- 前置: ADR-0004（多源策略重构，UI 变更面）；硬编码索引「设置 UI 分层机制」行
- 决策来源: umpp P1 范围确认（完整版）+ P2 架构评审

## 背景

0.6.0（ADR-0004）大幅重构设置卡 UI：首屏（总开关 + 策略行 + 并发/缓存 + provider 列表 + ↑↓ 排序）→ Modal 双 tab（数据源编辑器 / 关于）→ 视口自适应 `min(720px, 100vw-48px)`。既有 UI 测试全部基于手写 React stub（`tests/render.test.mjs`）或生成 HTML 但不启动浏览器（`tests/render-visual.mjs`），无法验证：

1. 真实 CSS 布局（flex/grid/overflow/viewport 适配）
2. 字体渲染与文本溢出
3. 响应式视口（`vw` 单位、dialog 宽度规则）
4. 无障碍语义（`role`/`aria-selected`/键盘焦点）
5. 跨浏览器一致性

`render-visual.mjs` 生成的 HTML 从未被浏览器打开过——是"死"产物，其"视觉"仅是 HTML 字符串拼接。

## 决策

### D1: 工具选型 — `@playwright/test`

- **选**：`@playwright/test`（非裸 `playwright` 库）
- **理由**：自带 CLI（`npx playwright test`）+ reporter（list/dot/line/HTML）+ watch 模式 + `toHaveScreenshot()` 内建视觉对比 + `trace` 调试。裸 `playwright` 库需自建 test runner 与 reporter，与项目现有 `node --test` 无协同价值。
- **否决**：Puppeteer（无内建 test runner，无 `toHaveScreenshot`）；Cypress（E2E 框架，需启动 web server，本项目无服务端）；Capybara/Selenium（重量级，Node 生态不主流）。

### D2: 浏览器 — Chromium only

- **选**：仅安装 Chromium（`npx playwright install chromium`，~150MB）
- **理由**：DSH Web 运行时目标为 Chromium 系浏览器；Firefox/WebKit 需额外 ~300MB，CI 成本翻倍，收益低（设置卡无浏览器特定 API）。
- **否决**：全三浏览器（成本/收益比不合理）；Electron（无桌面壳）。

### D3: 测试架构 — Fixture 生成器 + Playwright spec 分离

```
tests/
  visual.spec.mjs          # Playwright spec（@playwright/test）
  visual/
    fixtures/
      index.html           # 首屏 + Modal 全状态（render-visual.mjs 生成）
      lab.html             # 视口实验室（4 个 iframe 宽度）
      snapshots/           # pixel-diff baseline（入 git）
  render-visual.mjs        # fixture 生成器（改造：写文件而非打印路径）
```

- **选**：保留 `render-visual.mjs` 为 fixture 生成器，改造其输出从 `tmpdir()` 到 `tests/visual/fixtures/`；Playwright spec 通过 `file://` URL 加载 fixture。
- **理由**：复用现有 React stub 渲染逻辑（零重写），fixture 可人工打开预览，spec 专注浏览器交互与断言。
- **否决**：Playwright 直接 `setContent(html)` 内联渲染（fixture 不可人工预览，spec 臃肿）；删除 `render-visual.mjs` 全部重写（违反"不替换现有测试"决策）。

### D4: 视觉回归策略 — 截图 baseline + pixel-diff

- **选**：`page.locator(...).toHaveScreenshot(...)` 生成 baseline 入 git，`--update-snapshots` 手动更新；阈值 `maxDiffPixelRatio: 0.01`。
- **理由**：DSH 设置卡无字体嵌入，Chromium 默认字体在 CI 与本地一致（Fact: Playwright 使用系统字体栈）；pixel-diff 1% 阈值容忍亚像素渲染差异。
- **否决**：不启用 pixel-diff 仅用交互断言（缺少视觉回归安全网）；全量 page.screenshot 不裁剪（Modal 背景干扰 diff）。

### D5: 测试覆盖矩阵（完整版）

| 维度 | 用例数 | 说明 |
|------|--------|------|
| 首屏视觉快照 | 4 | zh/en × 有编辑/无编辑 |
| Modal 数据源页快照 | 3 | zh/en + 全停用 |
| Modal 关于页快照 | 2 | zh/en |
| 视口 lab | 4 | 1280/720/480/380 宽度 × dialog 宽度断言 |
| 交互：toggle | 2 | enabled 切换 → 状态变化 |
| 交互：save | 2 | scope.set 被调用 + 值类型正确 |
| 交互：reorder | 1 | ↑↓ 按钮 → 数组顺序变化 |
| 交互：validation | 3 | numResults 越界 / key ref 非法 / concurrency 越界 → save 禁用 |
| 无障碍 | 2 | role=tab + aria-selected |
| CSS 断言 | 3 | token 命名空间 / 无硬编码 on-color / dialog 宽度规则 |
| **合计** | **~26** | |

### D6: 与现有测试的关系

- `tests/render.test.mjs`（stub）**保留**：覆盖 React 逻辑层（组件渲染、状态管理、scope 调用）。
- `tests/render-visual.mjs` **改造**为 fixture 生成器：不再打印路径，写文件到 `tests/visual/fixtures/`。
- `tests/visual.spec.mjs` **新增**：覆盖浏览器渲染层（CSS/布局/交互/无障碍）。
- 二者互补：stub 测试验证"逻辑正确"，Playwright 验证"视觉正确"。

## 后果

- `package.json` 新增 `@playwright/test` devDependency（`private: true`，不进 npm 发布）。
- 首次 `pnpm install` + `npx playwright install chromium` 需网络，下载 ~150MB。
- pixel-diff baseline 入 git（`tests/visual/fixtures/snapshots/`），团队需统一 Chromium 版本。
- `render-visual.mjs` 从"打印路径"改为"写文件"，CLI 调用方式不变。
- 全量测试需显式传参（`node --test` 不自动发现 Playwright spec；`pnpm test:visual` 单独运行）。
- 未来接入 CI 时，`pnpm test:visual` 可直接作为独立 job（需预装 Chromium 或走 Docker image）。
