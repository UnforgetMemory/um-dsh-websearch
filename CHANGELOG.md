# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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