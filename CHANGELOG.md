# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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