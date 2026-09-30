# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **The agent preset mount no longer fails with `expected object but got
  [object Object],…`** (`planning` / `compaction` / `delegation` /
  `cordis:group`). The pre-persist `internal/config` waterfall is GLOBAL —
  `cordis.filter` is never installed, so every row in every subtree resolves
  through every listener — and this plugin's listener ran its own schemastery
  schema over the candidate unguarded. The agent presets mount `cordis:group`
  entries whose config is an entry LIST (an array), so the schema rejected
  those three rows, the preset mount audit failed, and the whole preset
  stopped mounting. Non-object candidates now ride through untouched; a
  regression test pins the listener's pass-through contract

### Changed

- **BREAKING: single-track DSH 0.2.0 support (ADR-0007)** — the dependency
  window narrows to `>=0.2.0-rc.1 <0.3.0` on every `@deepseek-ai/dsh*` peer and
  dependency (`engines.dsh` likewise); DSH 0.1.7 and earlier are no longer
  supported. Root cause of the dual-runtime state on DeepSeek Harness Desktop
  0.2.0-rc.2: the previous window `>=0.1.7-alpha.2 <0.3.0` never matches the
  `0.2.0-rc.*` prereleases under plain semver (a prerelease satisfies a range
  only through a comparator of the same `[major,minor,patch]` tuple), so pnpm
  resolved the plugin's whole runtime closure to `0.1.7-rc.2` while the Desktop
  host runs `0.2.0-rc.2` — the compatibility gate passed anyway because it
  compares with `includePrerelease: true`. `>=0.2.0-rc.1` carries the
  `[0,2,0]` prerelease comparator, so the family resolves to the newest 0.2.0
  prerelease (currently `0.2.0-rc.2`) and future `0.2.x` stables
- Test/dev baseline aligned to `0.2.0-rc.2`: all `@deepseek-ai/*`
  devDependencies and the `pnpm-workspace.yaml` overrides family moved from
  `0.1.7-alpha.2`, plus a `dsh-llm: 0.2.0-rc.2` override (pnpm resolved it to
  `0.2.0-rc.1` while `dsh-web`'s peer spec is exact `0.2.0-rc.2`); the
  `SettingsFormModel` mirror in `tests/render.test.mjs` was re-verified
  line-for-line against `dsh-client-ui-primitives@0.2.0-rc.2`
  (`lib/index.js:7104-7377` — semantics unchanged, only references updated)
- `pnpm-workspace.yaml` carries a `minimumReleaseAgeExclude` whitelist for the
  `@deepseek-ai/*` `0.2.0-rc.2` family so fresh installs can resolve versions
  published within pnpm's default 24-hour release-age gate

### Fixed

- Desktop profile installs now resolve the same package versions the Desktop
  runtime carries (single `WebError` / seam family per process) instead of a
  parallel `0.1.7-rc.2` closure

## [0.7.0] - 2026-09-29

### Added

- DSH 0.1.7 settings model (ADR-0006 D2): the settings namespace is now the
  Loader entry id `um-web-search` (was the plugin-chosen `web-search-exa`), the
  Plugins page form is derived from the exported `Config` schema, and the fields
  that apply live are declared `.volatile()` (`enabled`, `defaultProvider`,
  `concurrency`, the whole `cache` object, and the whole `providers` array)
- Settings card rebuilt on the official primitives (ADR-0006 D3):
  `SettingsForm` / `SettingsFormModel` / `SettingsValueField` /
  `SettingsSecretField`, with the provider list and the cache carried as
  write-only controls that persist one `providers` / `cache` path op each
- Cross-field validation (unique provider ids, unique key references, a
  `defaultProvider` that names a configured provider) now rides the pre-persist
  `internal/config` waterfall, replacing the removed settings `validate` hook
- `loader/volatile-update` listener replaces the removed settings `onChange`
  hook: a volatile-only save invalidates the result cache and re-primes
  credential presence without remounting the plugin
- Credentials in the card go through `ctx.remote.credentials.describe(refs)` and
  `ctx.remote.credentials.set(ref, value)` (positional), the 0.1.7 browser wire
  face, replacing the removed `connection.api.credentials` envelope; the card
  also follows `credentials/reference-updated` through `ctx.remote.$on`
- Optional `cordis.patch.snippet.yml` template for a deployment that wants to
  pin another backend or override this plugin's row by hand

### Changed

- Dependency family declares a SUPPORT WINDOW rather than one patch line:
  `>=0.1.7-alpha.2 <0.3.0` on every `@deepseek-ai/dsh*` peer and dependency
  (`@deepseek-ai/cordis` stays `~4.0.4`, `@deepseek-ai/schemastery` `~3.18.4`).
  Peers pinning a single patch (`0.1.7-alpha.2`) or a caret (`^0.1.7-alpha.2`,
  which means `<0.2.0`) are refused by the plugin compatibility gate against a
  0.2.x runtime, see Verification; and the whole RUNTIME closure is declared as
  dependencies because the profile's `nodeLinker: hoisted` +
  `autoInstallPeers: false` never hoists those packages to the profile root, so
  a peers-only declaration cannot resolve at load time. The closure is
  `cordis`, `dsh-llm`, `dsh-credentials`, `dsh-launch-environment`, `dsh-web`,
  `dsh-web-search-deepseek`, `schemastery`; `dsh-brand`, `dsh-invariants`, and
  `dsh-settings` were dropped (zero imports in `lib/`)
- Settings now persist into the profile patch's `um-web-search` row `config`
  (DSH 0.1.7 storage) instead of the separate settings document; changing the
  patch row id moves where the card reads and writes
- The card registers into the Plugins page slot `plugins.row.config` with key
  `um-dsh-websearch#um-web-search` (the retired `settings.plugin.item` slot and
  the `settingsScope` service do not exist on 0.1.7), reads and writes through
  `ctx.configForms.get("um-web-search")`, and gates on
  `ctx.configForms.whileServed([...])` so an uncomposed plugin leaves no trace
- The card renders as the Plugins page row: a one-line effective-strategy
  summary (enabled sources in order → concurrency) plus the official
  `SettingsForm`; the bespoke CSS namespace, modal, tabs, accordion, header
  button, and About section are gone, and the retired `ABOUT_VERSION` constant is
  no longer part of the dev-version chain
- Legacy flat config keys (`preferred`, `exaEnabled`, `allowAnonymous`, …) stay
  readable but non-volatile: while `providers` is still the pristine builtin
  default they synthesize `providers[]`, and after the first save from the new
  card they become inert leftovers the settings service cannot clear
- Key handling in the card: references are still auto-generated and never
  hand-edited, a blank key draft keeps the stored credential, written values are
  trimmed, and a reference the credentials grammar would refuse is reported as an
  unaccepted save instead of being silently skipped
- README/README.en.md rewritten for the 0.1.7 requirements, the new settings
  location and card, the two-key bundle patch, and the migration notes

### Fixed

- Bundle patch no longer drops `fetchProvider`: an id-targeted patch replaces the
  targeted row's whole `config`, so the `web` row override now restates BOTH keys
  (`searchProvider: um-web-search` and `fetchProvider: http`). Previously
  `fetchProvider` was silently deleted and `web_fetch` survived only because the
  base composition registers a single fetch provider; a second one would have
  turned every fetch into `WEB_PROVIDER_AMBIGUOUS`
- Host half links again on DSH 0.1.7: the named import of the removed
  `installSettingsSection` / `settingsNamespace` exports (a module-load failure)
  is gone, along with the `setSource` / `current()` read path that 0.1.7 replaced
  with per-operation `config.<field>.get()`
- Client half mounts again on DSH 0.1.7: the removed `settingsScope` service,
  `settings.plugin.item` slot, `connection.api.credentials` envelope, and
  `Primitives.IconChevronDownOutline14` icon are all out of the code path
- The card's credential drafts round-trip again: the component built its draft map
  from `state.keys.text` while `state.keys` is the already-parsed map, so the map
  was always empty — a staged key literal was not pruned when its row was removed
  (an orphaned literal could still be written), two keys' drafts could not
  coexist, and a typed draft never echoed back into the value control. The
  controller now exposes the write-only control's raw text as `keysText` and the
  card parses that; three regression tests cover the echo, the coexistence, and
  the prune

### Breaking Changes

- **DSH `>=0.1.7-alpha.2 <0.3.0` is required.** The plugin targets the settings
  subsystem introduced in 0.1.7 and verified on both the 0.1.7 line and
  0.2.0-rc.2; the `0.1.1-rc.2` family is no longer supported, and no shim is
  provided (a shim would create duplicate service instances alongside the host,
  which is more dangerous than an outright incompatibility)
- **The `web-search-exa` settings namespace is no longer read.** DSH 0.1.7 stores
  settings in the profile patch's row `config` and the namespace IS the Loader
  row id, so settings previously stored under `web-search-exa` are not imported:
  they fall back to the factory defaults and must be re-entered once in the new
  card. Legacy flat config keys keep bridging the gap until the first save (see
  Changed), but they are no longer the storage model
- **The card UI was rebuilt on the official primitives.** The bespoke stylesheet
  and its `um-dsh-websearch-*` class namespace, the modal/tab/accordion layout,
  the card header button, and the About section are retired; the 5 pixel
  baselines of the Playwright visual suite (ADR-0005) are invalidated and the
  suite must be redone against the official primitives

### Verification

- `dsh plugin --profile dsh017test add <repo>` followed by
  `dsh --profile dsh017test --dump-config` composes `web: {searchProvider:
  um-web-search, fetchProvider: http}` plus the `um-web-search` row, proving the
  bundle layer and the Loader really mount on the 0.1.7 family
- Host suite green: 124 tests, 0 failures (`tests/plugin.test.mjs` 82,
  `tests/boundary.test.mjs` 36, `tests/version.test.mjs` 6)
- Browser-half suite green: 39 tests, 0 failures (`tests/render.test.mjs`,
  re-harnessed against the official primitives and the `configForms` /
  `remote.credentials` contracts) — `pnpm test` totals 163 passing tests and 0
  failures, with no `todo` cases left
- Playwright suite green: 14 cases over the generated `card.html` fixture
  (`pnpm test:visual`), covering the mount gate, the staged save ops, provider
  ordering, the key write path and badges, and the refusal of a corrupt draft
- Published-shape install verified, not just a local link: `pnpm pack` →
  `dsh plugin --profile <p> add <tarball>` passes the plugin compatibility gate,
  unpacks only the published files (no `tests/`, no `scripts/`), records
  `file:…/um-dsh-websearch-0.7.0.tgz`, appends the package to
  `dsh.profile.bundles`, keeps the two-key `web` row in `--dump-config`, and
  `import("um-dsh-websearch")` resolves from inside the profile with 5 volatile
  config fields — verified in BOTH a base-only profile and a profile built from
  the shipped `web` template (the same bundle set as a real deployment)
- The peer RANGE is load-bearing: the gate compares every `@deepseek-ai/dsh*`
  peer against the *app-boot* package's version (which trails the CLI: the
  0.1.7-alpha.2 CLI shipped app-boot `0.1.7-rc.1`). Exact `0.1.7-alpha.2` pins are
  refused outright, and `^0.1.7-alpha.2` — semantically `<0.2.0` — is refused by
  a 0.2.x runtime; `>=0.1.7-alpha.2 <0.3.0` is accepted by both
- Compatible against the CURRENT 0.2.0-rc.2 runtime, verified end to end: with
  the 0.2.0-rc.2 CLI the gate accepts the plugin, `--dump-config` still composes
  `web: {searchProvider: um-web-search, fetchProvider: http}` plus the
  `um-web-search` row, and `import("um-dsh-websearch")` resolves from inside the
  profile. Every API this plugin uses was re-checked against 0.2.0-rc.2 sources:
  `dsh-settings` still exports only `SettingsForms`/`SettingsConflictError`/
  `redactSecrets` with the same `volatileForm`/`mutate` internals, `dsh-web`
  still owns `{searchProvider, fetchProvider}` + `registerSearchProvider` +
  `WebError`, the base `web` row still carries both keys, the client slots are
  still `plugins.row.config` (with `rowConfigKey`), `ctx.configForms` and
  `ctx.remote.credentials` are unchanged, the primitives export every component
  the card uses (and still do not ship `IconChevronDownOutline14`), and both
  credential events (`reference-updated`, `record-updated`) are still fanned out
- Peers alone are not enough to RUN: with `nodeLinker: hoisted` +
  `autoInstallPeers: false` the host packages stay out of the profile root, so
  the load-time imports failed in both profiles until the runtime closure was
  declared as dependencies (the failures and the fix are recorded in ADR-0006 D1)
- Residual gap, stated rather than implied: no real-browser render was verified
  for this release (the card's behaviour is covered by the stub harness and the
  Playwright suite instead)

## [0.6.0] - 2026-09-11

### Added

- Multi-provider strategy rebuild (ADR-0004): an ordered `providers[]` config
  model where every provider carries an independent paid-REST tier, a free
  anonymous-MCP tier, a `primaryTier`, an ordered/random key list, and per-key
  two-way fallback switches (`allowFreeToPaid` / `allowPaidToFree`)
- Paid/free fallback correctness: a tier fallback only fires when BOTH the
  switch on the exhausted key and the target tier's enable flag are on
- DeepSeek Official backend wrapping the framework's own
  `DeepSeekSearchProvider` (new dependency `@deepseek-ai/dsh-web-search-deepseek`
  pinned to the dsh family), never registered under the official id
- Concurrent fan-out: `concurrency > 1` runs every enabled source
  (provider × tier × key) under a bounded pool and merges the successes with
  URL dedup; `concurrency = 1` keeps the sequential fallback chain
- In-memory result cache with a `cache.enabled` switch and a 1–86400s TTL,
  invalidated on every settings change
- `UM_WS_` credential namespace (`UM_WS_EXA_API_KEY` /
  `UM_WS_PARALLEL_API_KEY` / `UM_WS_DEEPSEEK_API_KEY`) with a one-time
  copy migration from the legacy `EXA_API_KEY` / `PARALLEL_API_KEY` defaults
  (the legacy references are never deleted)
- Rebuilt settings card: first screen carries the master switch, live strategy
  line, concurrency and cache controls, and a provider list with role badges
  and ↑↓ ordering; the dialog edits every provider's tiers, keys, endpoints
  and params
- Playwright visual interaction test suite (ADR-0005): 30 cases covering
  static visual snapshots (5 pixel-diff baselines), interactive state toggling,
  modal/tab/save/discard flows, form validation (invalid numResults blocks save),
  modal lifecycle (dirty badge, legacy key unset), radio control, status line
  updates, layout overflow/scroll, viewport-responsive dialog widths, ARIA
  accessibility roles, and CSS design token assertions; fixture generator
  produces browser-executable pages with a minimal React re-render loop
- Settings dialog UX improvements: primary-tier radio auto-enables the target
  tier to prevent "primary = X but X is disabled" contradictions, fallback
  switches show a conditional warning while they are armed and the target
  tier is disabled, the "Add
  key" button moves above the key list for faster access, and the per-provider
  editor renders fully expanded (the provider tab is the navigation, no nested
  collapse controls); Playwright suite expanded to 35 cases
- Card header adopts the official DSH plugin-card interaction: the whole card
  is a header button (`aria-expanded`, "Show/Hide settings" label, rotating
  chevron, unsaved badge) that collapses and expands the card body in place,
  matching the built-in cards in the Plugins settings page; the details dialog
  splits into one tab per provider (Exa / Parallel / DeepSeek Official) plus
  About, mounting only the active provider's editor
- Key credentials flow: references are auto-generated (`UM_WS_EXA_API_KEY`,
  `UM_WS_EXA_API_KEY_1`, …; stable per row, never user-edited), the user
  enters the key VALUE, and saving writes it through the official DSH
  credentials wire face (`connection.api.credentials.set`) with a blank value
  keeping the current stored credential — key literals never land in the
  settings config; each row shows its live configured/unconfigured state via
  `credentials.describe`
- Key value leak hardening: the page only ever learns whether a value is
  non-blank — stored literals are never echoed back (masked placeholder only),
  browser autofill is suppressed (`autoComplete="new-password"`), whitespace
  alone never counts as a value, written values are trimmed, and staged input
  leaves the page on save
- Key rows become accordion items: each key collapses to its reference +
  configured-state badge and expands in place to the value input and its
  switches, with exactly one row open at a time; a newly added key
  auto-expands for immediate input

### Fixed

- KeyEditor received its data through the reserved React `key` prop; real
  React strips `key` from component props, so clicking "Add key" crashed the
  settings card in the live deployment. The row now receives the entry as
  `entry`, and the test React emulates key stripping to keep the regression
  caught

### Changed

- Strategy configuration lives in one `providers[]` array whose index is the
  priority; the legacy flat keys are synthesized at resolve time and cleared
  once the new shape is saved (zero-storage migration, namespace unchanged)

### Breaking Changes

- The pre-0.6.0 flat configuration keys (`preferred`, `exaEnabled`,
  `allowAnonymous`, `fallbackToPaid`, `apiKeyEnv`, …) are no longer stored;
  they are read for migration and removed on the next save

## [0.5.1] - 2026-09-04

### Fixed

- Declared the `@deepseek-ai/dsh-client-ui-settings-plugins` client inject edge
  so the settings card bundle materializes after its slot host
- Removed the unused `credentialRef` import

## [0.5.0] - 2026-09-04

### Added

- `dsh.bundle` manifest (`dsh.bundle.patch: ./cordis.patch.yml`): `dsh plugin
  --profile web add` now registers the package as a profile layer and mounts
  its patch row automatically — no manual profile patch entry

### Changed

- Canonical patch row id `um-web-search` (was `web-search-exa`); the settings
  namespace stays `web-search-exa`, so stored settings need no migration
- Dependency family aligned at 0.1.1-rc.2 (`dsh-launch-environment`
  0.1.0-rc.8 → 0.1.1-rc.2) with pnpm overrides moved to `pnpm-workspace.yaml`
  (pnpm ≥10 ignores the package.json `pnpm` key)

### Breaking Changes

- Profiles that hand-inserted a patch row with the legacy id
  `web-search-exa` must remove it before upgrading, or the plugin mounts twice

### Fixed

- `dsh plugin --profile web add` installing the package as a plain dependency
  with the "declares no dsh.bundle" warning

## [0.4.0] - 2026-08-29

### Added

- Dual-backend strategy behind one umbrella provider (canonical id `um-web-search`,
  legacy `exa` alias): a plugin-level master switch, per-backend enable flags, a
  `preferred` routing choice, and a cross-backend degrade on server-side rejection
- Parallel (parallel.ai) backend: authenticated REST `/v1/search` and keyless
  anonymous MCP (`web_search`), `turbo`/`fast`/`basic`/`advanced` mode presets, and
  a 1–20 result cap
- Layered settings card: a simplified first screen (master switch + live strategy
  status) and an advanced-settings dialog with Overview / Exa / Parallel / About tabs
- Effective-strategy panel: role badges, a primary-backend radio, and mismatch
  warnings with a one-click swap when the preferred backend is disabled
- About tab (version, source, author, Ko-fi support)
- Dev version chain: base + 14-digit version code via `pnpm dev:version`, reset via
  `pnpm dev:version:reset`

### Changed

- Rebuilt the card stylesheet under a `um-dsh-websearch-` class/token namespace with
  theme-adaptive tinted badges and an adaptive dialog width (720px cap, viewport-aware)
- Shortened the bilingual field copy; the master switch now reads "启用搜索 / Enable search"

## [0.3.0] - 2026-08-28

### Added

- Two-way fallback chain between authenticated REST `/search` and keyless anonymous
  MCP, enabled by `fallbackToPaid` / `fallbackToAnonymous`: a server-side rejection
  on the primary transport retries through the other, while aborts, missing
  credentials, client 4xx, contract, and network failures never degrade
- Two fallback switches to the bilingual settings card

### Changed

- Rebranded the settings card title and description to UM (UM 网页搜索 / 非官方网路搜索插件)
- Reworked bilingual READMEs with a modern minimal layout
- Swap the README hero to the PNG banner and inline the badge row

## [0.2.0] - 2026-08-27

### Added

- Exa web search provider for DeepSeek Harness with two transports: authenticated
  REST `/search` and keyless anonymous MCP (`web_search_exa`) via Exa's hosted endpoint
- Settings-driven `enabled` switch, off by default, live-reload without restart
- Bilingual settings card (Simplified Chinese / English) following the DSH UI language
- Credentials-service key resolution with environment fallback
- Provider and settings-card rendering test suites