# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-27

### Added

- Exa web search provider for DeepSeek Harness with two transports: authenticated
  REST `/search` and keyless anonymous MCP (`web_search_exa`) via Exa's hosted endpoint
- Settings-driven `enabled` switch, off by default, live-reload without restart
- Bilingual settings card (Simplified Chinese / English) following the DSH UI language
- Credentials-service key resolution with environment fallback
- Provider and settings-card rendering test suites