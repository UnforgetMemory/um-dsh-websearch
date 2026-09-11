<!--
createdAt: 2026-09-04 23:43:36 +08:00 (本地时钟 Get-Date)
updatedAt: 2026-09-05 14:17:48 +08:00 (本地时钟 Get-Date)
-->
# ADR-0004: 多源搜索策略重构（providers[] 配置模型 + paid/free 状态机 + 并发/缓存 + deepseek-official 接入）

- 状态: Accepted
- 前置: [ADR-0002](./ADR-0002-dual-backend-strategy.md)（伞 provider、双后端策略链）
- 决策来源: 用户拍板（umpp 决策面板 2026-09-04：q2 配置模型 B / q3 包装官方 Provider /
  q4 仅 ref / q5 ↑↓ 按钮 / q6 fan-out 合并；q1 全量范围 + UM_WS_ 凭据前缀自定义要求）

## 背景

0.5.1 的 22 扁平键（ADR-0002 D1）只能表达「双后端 + 每后端一对回退开关」，
无法表达 per-key 语义；新增第三个 provider 需要复制整套前缀键族。用户提出 9 项
feature（多 provider 多 key 精细化策略、deepseek-official 接入、可扩展配置模型、
密钥安全、健全边界、乐观缓存 TTL、并发搜索、paid/free 正确回退、每 key 级回退
开关），并要求「完全重新构建的破坏性逻辑」。

## 决策 D1：配置模型 = providers[] 嵌套数组（方案 B）

- 全局键：`enabled`（总开关，默认 false）、`defaultProvider`（默认 "exa"）、
  `concurrency`（1–8，默认 1）、`cache`（`enabled: false` / `ttlSeconds: 60`）。
- `providers: z.array(ProviderSchema)`，**数组索引即优先级**（无独立 order 字段，
  避免双源漂移；schemastery 无跨字段校验，唯一性交给 `validate` 钩子）。
- ProviderSchema：`id`（kebab-case，required）、`name`、`enabled`（默认 true）、
  `endpoints{rest,free}`、`transports{paid{enabled},free{enabled}}`（默认 free 开 /
  paid 关）、`primaryTier`（`union(const "free"|"paid")`，默认 free）、
  `keys: z.array(KeySchema)`、`keysStrategy`（ordered/random，默认 ordered）、
  `numResults`、`params`（dict 扩展袋，承载 searchType/mode/model 等 provider 特有键）。
- KeySchema：`ref`（credential-ref，required）、`enabled`（默认 true）、
  `allowFreeToPaid`（默认 false）、`allowPaidToFree`（默认 false）。
- 理由：per-key 语义天然嵌套；加 provider = 数组加一项 + 一个 spec，schema 零改动
  （feature 3）。备选 A（扁平键）无法表达跨 provider 统一策略，C（dict+order[]）
  存在键集/顺序双源漂移。

## 决策 D2：paid/free 回退状态机（feature 8/9 的语义核心）

不变量：**回退目标档位未开启 → 绝不回退**；回退开关是 key 级内部属性，**不存在
全局回退开关**；取消/密钥缺失/客户端错误（400/422）/契约错误/网络失败一律不回退
（沿用 ADR-0001 A3 与 ADR-0002 D1.4 边界）。

执行序（provider 内）：primaryTier 档位 → 同档位按 `keysStrategy` 遍历 enabled
key（ordered = 数组序；random = 每次搜索 shuffle 一次）→ 无更多 key 时按**当前
key 的** `allowXxxToYyy` 检查目标档位开关 → 目标档位已开才切换；否则本 provider
终态失败（合并错误）→ 下一 provider（数组序，从 defaultProvider 起始索引开始）。
全部耗尽抛合并 `WEB_PROVIDER_ERROR`。

## 决策 D3：零存储迁移（namespace 保持 web-search-exa）

dsh-settings `resolve()` 不传 options → schemastery object resolver 非严格模式
**保留未知键**（dsh-settings lib/index.js:504-507 + schemastery src/index.ts:752-763
双确认）。`resolveOptions` 检测 `hasLegacy`（旧 22 键任一存在）→ 由扁平键合成
`providers[]`（映射表见 ADR-0002 键族 + preferred→defaultProvider、allowAnonymous→
transports.free.enabled、fallbackToXxx→合成 keys[0] 的回退开关、apiKeyEnv→keys[0].ref
等）；UI 保存后经 `scope.replace`/逐键 unset 清除旧键，后续加载不再触发合成。
字面 `apiKey`/`parallelApiKey` 不再支持（决策 D4），迁移期仅告警忽略。

## 决策 D4：凭据安全 = 仅 ref + UM_WS_ 前缀命名空间（feature 4）

- 配置只存引用名（CredentialRef），字面密钥从模型移除。
- 引用默认值带 `UM_WS_` 前缀：`UM_WS_EXA_API_KEY` / `UM_WS_PARALLEL_API_KEY` /
  `UM_WS_DEEPSEEK_API_KEY`——与 dsh 其他包（`DEEPSEEK_API_KEY`、`EXA_API_KEY` 等）
  显式区分，避免误读共享环境变量造成的数据泄露面。
- 一次性凭据迁移（Host 侧 apply 期）：旧默认引用（`EXA_API_KEY` /
  `PARALLEL_API_KEY`）解析到值且新引用为空时，`credentials.set` 拷贝到新引用；
  **绝不 unset/delete 旧引用**（可能是用户共享给其他工具的环境变量，误删=误伤）。
  补充：付费解析链对 UM_WS_ 引用做**惰性旧名回退**——新引用为空而旧名有值时
  当场拷贝并直接使用，消除 apply 期迁移与首次搜索之间的竞态窗口。
- 动态生效不变：`resolve` 每次操作重解析，轮换后下一次请求即生效。
- 客户端密钥写入：卡片经 `ctx.connection.api.credentials`（官方 Models 页同路径，
  `set/unset/describe`；settings.plugin.item 槽 owner props 为空，API face 只能经
  connection 服务取得——Assumption 待 W3 首任务验证）写入凭据库；不可达时降级为
  只填引用名 + 引导去 Models 页。

## 决策 D5：并发 = 伞内 fan-out 合并（feature 7）

seam 每请求只选一个 provider（六分支，dsh-web 源码确认），多源并发只能发生在伞
provider 内部：`search()` 按「providers 数组序 × 每 provider 有效源（档位×key）」
展开源清单，`concurrency` 个并发执行（`Promise.allSettled`），成功结果按 URL 去重
合并、按 `maxResults` 截断；单源失败不影响兄弟源；全部失败抛合并错误；
`WEB_ABORTED` 终止全部并发。`concurrency=1` 即现状顺序链语义（兼容不变式）。

## 决策 D6：乐观缓存 = 插件内内存 TTL（feature 6）

框架无任何搜索缓存设施（Fact，全局源码搜索零命中）。伞内实现：查询归一化键
（query + 有效源指纹 + maxResults）→ 命中且未过期直接返回（乐观）；TTL 由
`cache.ttlSeconds` 控制；`cache.enabled=false` 关闭；配置变更（onChange）即失效。
不做磁盘持久化、不做跨进程共享（Non-goal）。

## 决策 D7：deepseek-official = 包装官方 Provider 类（feature 2）

新增依赖 `@deepseek-ai/dsh-web-search-deepseek`（与 dsh 家族同 pin 0.1.1-rc.2）。
官方类 `DeepSeekSearchProvider` 从主入口导出、构造器接受 `resolveOptions` thunk
（apiKey/resolveApiKey/apiKeyEnv/baseURL/model/maxUses…），在伞内实例化并喂
`UM_WS_DEEPSEEK_API_KEY` 解析链；**不以 id "deepseek-official" 注册**（重复 id
同步抛 `WEB_DUPLICATE_PROVIDER`，dsh-web lib/index.js:80-87）。deepseek 无匿名
MCP 传输——providers 模型天然支持单档位 provider（free 不开即无 free 回退）。

官方类把 HTTP 状态藏在错误消息里（有可解析错误体时消息 = 服务端 detail，不再含
`(HTTP NNN)`），降级标记采用三档分类：消息含 `(HTTP NNN)` → 按标准状态集判定；
命中已知不可降级形态（无 web_search_tool_result 块 / unprocessable body /
网络失败 / 凭据解析失败）→ 不降级；其余 `WEB_PROVIDER_ERROR`（detail-bearing
服务端拒绝）→ 降级（Assumption：官方类设计上不暴露状态）。

## 决策 D8：设置卡 UI = N provider 列表 + ↑↓ 排序（feature 1 UI）

原语库无拖拽组件（Fact）。首屏：总开关 + 并发数 + 缓存 TTL + provider 折叠列表
（名称、enabled 徽章+开关、↑↓ 排序按钮）；「详细配置…」Modal：展开单个 provider
的全部字段（transports 开关、key 列表、keysStrategy、endpoints、params）。i18n
保持扁平 key map + provider 元数据内嵌 labelKey。staged-save 沿用现有引擎，数组
字段整体写入（`scope.set("providers", providersArray)`——客户端 scope.set 的 value
为 JSON-shaped，dsh-client-runtime settings-scope.d.ts:67 确认）。

## 后果

- 破坏性变更：配置模型重排 → 版本 0.6.0；旧部署零存储迁移（D3）保持行为连续。
- `lib/index.js` 进一步膨胀 → 拆包决策留给下一 ADR（本 ADR 不改文件结构，仅加
  状态机/并发/缓存/迁移四块职责）。
- 测试策略：既有 86 用例按「Exa 行为不变式」保持全绿；新增状态机 11 行组合矩阵、
  并发合并/abort、缓存 TTL/失效、迁移合成、UM_WS_ 凭据迁移套件。
- hardcode-index 需登记：UM_WS_ 引用前缀族、deepseek 新依赖 pin、providers 默认
  镜像三处（Host Config / client FIELD_DEFAULTS / render 测试快照）。
- bundle patch（cordis.patch.yml）与运行时语义（enabled=false → 配置不可用、
  searchProvider 构造期只读）不变。
