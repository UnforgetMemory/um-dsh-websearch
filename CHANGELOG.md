# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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