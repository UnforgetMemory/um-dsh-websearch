<div align="center">

<img src="./Hero.png" width="900" alt="um-dsh-websearch — Exa + Parallel + DeepSeek Official multi-source web search · DeepSeek Harness plugin" />

# 🌊 um-dsh-websearch

[![License: MIT](https://img.shields.io/badge/License-MIT-4d9fff?style=flat-square)](./LICENSE) [![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.0--rc.1%20%3C0.3.0-4d9fff?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness) [![Node](https://img.shields.io/badge/Node-%3E%3D20-2ea44f?style=flat-square)](https://nodejs.org) [![Tests](https://img.shields.io/badge/tests-175%20host%20%2B%2016%20visual-blueviolet?style=flat-square)](./tests) [![Lang](https://img.shields.io/badge/lang-CN%20%7C%20EN-8a6d3b?style=flat-square)](./README.en.md) <a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

**A multi-provider web search plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** —— Exa, Parallel, and DeepSeek Official behind a single provider 🌊

🧭 ordered provider chain　·　🔀 tier-gated fallback　·　🗝️ multi-key strategies　·　⚡ concurrent fan-out　·　💾 optimistic cache　·　🎨 bilingual settings card on the official primitives

English　·　[🇨🇳 简体中文](./README.md)

</div>

---

## 📖 Table of contents

- [✨ Features](#features)
- [🌍 Supported sources](#sources)
- [📦 Requirements](#requirements)
- [🚀 Quick start](#quickstart)
- [⚙️ Configuration](#config)
- [🔄 Fallback semantics](#fallback)
- [🔐 Credentials](#credentials)
- [🩺 Troubleshooting](#troubleshooting)
- [🧪 Tests](#tests)
- [🧩 Development versions](#devversions)
- [🚚 Migration](#migration)
- [🏛️ Architecture decisions & research](#adr)
- [🙏 Support](#support)
- [📄 License](#license)

<a id="features"></a>

## ✨ Features

- **🧭 Multi-provider strategy layer** — the ordered `providers[]` list IS the priority: each source enables independently, `defaultProvider` picks where the sequential chain starts, and a server-side rejection degrades to the next provider
- **🔀 Paid / free tiers with gated fallback** — every source carries a paid REST tier and a keyless anonymous MCP tier, each with its own switch; a tier fallback requires BOTH the exhausted key's direction switch AND the target tier being on, so it never degrades on its own
- **🗝️ Multi-key strategies** — each source can hold several credential references, used `ordered` (array order) or `random` (shuffled per search), with per-key `allowFreeToPaid` / `allowPaidToFree` switches
- **⚡ Concurrent fan-out** — with `concurrency > 1` one search is dispatched across every enabled source (provider × tier × key) and the successes are merged with URL dedup; `= 1` keeps the sequential fallback chain
- **💾 Optimistic cache** — an in-memory result cache with a 1–86400s TTL and a 64-entry cap, invalidated the moment the configuration fingerprint changes
- **🤖 DeepSeek Official integration** — the umbrella wraps the framework's own `DeepSeekSearchProvider` (API parity, zero protocol drift) and never registers under the official id, so `WEB_DUPLICATE_PROVIDER` cannot fire
- **🔒 Credential safety (`UM_WS_` namespace)** — the configuration stores reference names only; key literals stay in the credential store or the environment. References default to the `UM_WS_` prefix, isolated from the official packages, and legacy values are copied once and **never deleted**
- **🎨 Official-primitives settings card** — the card is rebuilt on DSH's own `SettingsForm` / `SettingsFormModel` / `SettingsValueField` / `SettingsSecretField`: the Plugins page row renders the master switch, default provider, concurrency, cache, and provider list in place, key values are written through the official credentials interface, and key literals never land in the settings document
- **🛡️ Pre-write validation, twice** — a pre-persist waterfall scoped to this plugin's rows on the Host (matched by `this?.runtime`'s `Config` identity plus the plugin name) plus a client-side mirror before save: a rejected write never reaches disk, and a doomed candidate is stopped before it leaves the browser with a bilingual warning — never a partial save

<a id="sources"></a>

## 🌍 Supported sources

| Source | Paid tier (REST + key) | Free tier (anonymous MCP) | Default credential ref | Shipped |
| --- | --- | --- | --- | --- |
| **Exa** 🥇 | `POST /search`<br />`https://api.exa.ai` | JSON-RPC direct, tool `web_search_exa`<br />`https://mcp.exa.ai/mcp` | `UM_WS_EXA_API_KEY` | ✅ enabled · default |
| **Parallel** | `POST /v1/search`<br />`https://api.parallel.ai` | JSON-RPC direct, tool `web_search`<br />`https://search.parallel.ai/mcp` | `UM_WS_PARALLEL_API_KEY` | ⏸️ disabled |
| **DeepSeek Official** 🤖 | wraps the official `DeepSeekSearchProvider`<br />`https://api.deepseek.com/anthropic/v1` | — (forced off) | `UM_WS_DEEPSEEK_API_KEY` | ⏸️ disabled |

<small>
MCP transport speaks protocol version `2025-06-18` (JSON-RPC over streamable HTTP); the Parallel side additionally sends `notifications/initialized` after `initialize`.
Snippet caps are twofold: 700 characters on the request side, 800 characters retained locally. REST `numResults` is clamped server-side (Exa 1–10, Parallel 1–20).
</small>

<a id="requirements"></a>

## 📦 Requirements

| Dependency | Requirement |
| --- | --- |
| DeepSeek Harness | **≥ 0.2.0-rc.1 and < 0.3.0** (verified on Desktop 0.2.0-rc.2; the 0.1.7 family is no longer supported, see [ADR-0007](./.um.agents/constraints/ADR-0007-dsh-020-rc2-single-track.md)) |
| Node.js | ≥ 20 |

> ⚠️ **Why 0.1.7 is no longer supported**
> The original 0.7.0 window `>=0.1.7-alpha.2 <0.3.0` never matches the `0.2.0-rc.*` prereleases under plain semver (a prerelease is only satisfied by a comparator of the same `[major,minor,patch]` tuple), so on the 0.2.0 Desktop host pnpm resolved the plugin's whole runtime closure to `0.1.7-rc.2` — a second, parallel copy of the DSH web runtime next to the host's own. This revision narrows the window to `>=0.2.0-rc.1 <0.3.0`, so reinstalls and refreshes resolve to the host's versions; on a 0.1.7 host the compatibility gate refuses the revised package outright (fail-fast).

<a id="quickstart"></a>

## 🚀 Quick start

```powershell
pnpm exec dsh plugin --profile web add <path-to-this-repo>        # local checkout
pnpm exec dsh plugin --profile web add github:UnforgetMemory/um-dsh-websearch
```

Restart, then turn on `enabled` under **Settings → Plugins → UM Web Search** (it ships off).

### 🧰 Installing takes over the default search

The package declares `dsh.bundle`, so `dsh plugin add` appends it to `dsh.profile.bundles` and mounts its own patch layer (`cordis.patch.yml`) automatically — no manual profile row:

```yaml
- insert:
    - id: um-web-search
      name: um-dsh-websearch

# Automatically takes over the web row's search backend (live on install, gone on uninstall)
- id: web
  config:
    searchProvider: um-web-search
    fetchProvider: http
```

Installing takes over the default search backend and uninstalling restores the deployment's own default (`deepseek-official`). To pin a different backend, write the `web` row explicitly in the profile's `cordis.patch.yml` (later layers win, and you must **restate both keys**) — template: [`cordis.patch.snippet.yml`](./cordis.patch.snippet.yml).

> ⚠️ An id-targeted patch **replaces** the targeted row's whole `config` (it is not a deep merge), so this entry must restate **every** key the `web` row owns. The base `web` row owns both `searchProvider` and `fetchProvider`; omitting the latter deletes it silently, and `web_fetch` then fails with `WEB_PROVIDER_AMBIGUOUS` as soon as a second fetch provider appears in the profile.

> ⚠️ **Takeover window** — `enabled` ships `false`, so between the takeover and flipping the switch search is unavailable: the `web` row already points at this plugin, and a disabled plugin answers searches with `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`. Enable `enabled` in the settings card right after installing.

> 📌 **Migration note** — if you previously followed the old README and hand-inserted a row with `id: web-search-exa` into your profile's `cordis.patch.yml`, remove that row first; otherwise the bundle layer mounts alongside it and the plugin loads twice.

### 🖥️ Desktop app

The `desktop` profile is managed exclusively by the Electron application. The desktop-bundled dsh command (menu-bar "Manage dsh command", or `resources\runtime\cli\bin\dsh.cmd`) allows only the `plugin` subcommands against the desktop profile — every other command (e.g. `--dump-config`) is refused. Install or update with the same `dsh plugin --profile desktop add …` or through the app's plugin management UI, then restart the app.

<small>Note that pnpm 11's default 24-hour release-age gate blocks freshly published `0.2.0-rc.*` versions: the desktop profile's `pnpm-workspace.yaml` needs a `minimumReleaseAgeExclude` whitelist (same list as this repo) to resolve the newest prerelease ([ADR-0007](./.um.agents/constraints/ADR-0007-dsh-020-rc2-single-track.md)).</small>

<a id="config"></a>

## ⚙️ Configuration

Settings are edited in the **Settings → Plugins → UM Web Search** card and persisted into the `config` of the profile patch's `um-web-search` row. The form is derived from the `Config` schema the plugin exports, and the fields that can take effect live are declared volatile (`enabled`, `defaultProvider`, `concurrency`, `cache`, `providers`) — saving needs no plugin remount and applies to the next search.

### 🌐 Global

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Plugin master switch |
| `defaultProvider` | `exa` | Where the sequential chain starts (must be a provider `id`) |
| `concurrency` | `1` | `1` = sequential fallback chain; `2–8` = fan out across every enabled source |
| `cache.enabled` | `false` | In-memory result cache switch |
| `cache.ttlSeconds` | `60` | How long one cached result stays fresh (1–86400 seconds) |

### 🧱 Providers (`providers[]`, array index = priority)

| Key | Meaning |
| --- | --- |
| `id` | Provider identity (built-in: `exa` / `parallel` / `deepseek`) |
| `name` | Display name (used by the settings card list and role badges) |
| `enabled` | Enable this provider |
| `primaryTier` | Tier tried first: `free` (anonymous MCP) or `paid` (REST + key) |
| `paid.enabled` / `paid.baseURL` | Paid-tier switch and REST endpoint |
| `free.enabled` / `free.baseURL` | Free-tier switch and anonymous MCP endpoint (forced off for deepseek) |
| `keys[].ref` | Credential reference, auto-generated as `UM_WS_<ID>_API_KEY`; appended keys take `_1`, `_2`… |
| `keys[].enabled` | Enable this key |
| `keys[].allowFreeToPaid` / `.allowPaidToFree` | This key's two-way cross-tier gate switches |
| `keysStrategy` | `ordered` (array order) / `random` (shuffled per search) |
| `numResults` | Default result count 1–20 (Exa / DeepSeek default 5, Parallel default 10) |
| `params` | Exa `searchType` (`auto` / `neural` / `keyword`); Parallel `mode` (`turbo` / `fast` / `basic` / `advanced`); DeepSeek `model` (default `deepseek-v4-flash`) and `maxUses` (default 5) |

> 📌 **Writing the array by hand** — array elements cannot be declared volatile (a schemastery constraint), so `providers` is volatile as a **whole array** and `cache` as a **whole object**; the settings service only writes them wholesale. Write the entire array when editing the provider list in a profile patch.

### 🎨 The settings card

The Plugins page row first shows a one-line **effective strategy summary** (enabled sources in order → concurrency, or an "unavailable" note when everything is off). Expanding it renders the official `SettingsForm`:

- **Master switch, default provider, concurrency, cache** — edited right in the row
- **Provider list** — each row carries a role badge (`Default` / `Fallback` / `Off`), ↑↓ ordering, an enable switch, and "Configure…"
- **Provider details** — a modal that edits one provider's tiers, endpoints, keys, and parameters, with each key showing a **configured / not configured** badge

<a id="fallback"></a>

## 🔄 Fallback semantics

### Sequential mode (`concurrency = 1`)

```text
 primary tier ──▶ same-tier keys (per keysStrategy)
    │
    ├─ gated cross-tier ──▶ the other tier's keys
    │        ▲
    │        └─ requires BOTH "this key's direction switch ∧ target tier on"
    │
    └─ this provider fails terminally ──▶ the next provider
```

### Concurrent mode (`concurrency > 1`)

Every enabled source (provider × tier × key) runs in parallel, one source's failure does not affect the others, and the successes are merged with URL dedup. There is no "fallback" here — whether the free tier participates is its own switch's business.

### What triggers a fallback

| ✅ Triggers a fallback | ❌ Never falls back |
| --- | --- |
| 401 / 402 / 403 / 429 / 5xx (server-side rejection) | Aborts (`WEB_ABORTED`) |
| | Missing credentials (`CREDENTIAL_MISSING`) |
| | Client 4xx (including 422) |
| | Contract errors (the response breaks the API shape) |
| | Network failures |

<small>The DeepSeek Official tier exposes no HTTP status, so it uses a three-way classification over the official class's message shape: a message containing `(HTTP NNN)` is judged by the table above; known non-degradable shapes (no `web_search_tool_result`, unprocessable body, `search request failed`, `credential resolution failed`) never degrade.</small>

<a id="credentials"></a>

## 🔐 Credentials

- **📝 Type the key value straight into the card** — saving writes it to the **DSH credential store** through the official credentials interface (`ctx.remote.credentials.set(ref, value)`, positional), and the configuration stores only the auto-generated **reference name** — key literals never land in the settings document. **A blank value keeps the currently stored key.**
- **🛡️ Leak hardening** — the page only ever learns whether a value is non-blank (configured / not-configured badges, fed by `ctx.remote.credentials.describe([refs])`); stored literals are never echoed back, whitespace alone never counts as a value, and written values are trimmed.
- **🔑 References are generated for you** — a source's first key uses `UM_WS_<ID>_API_KEY`, further keys take `_1`, `_2`… (created once when the row is added, stable thereafter, explicitly isolated from the official packages' `EXA_API_KEY` / `DEEPSEEK_API_KEY`).
- **🗂️ You can also store the key yourself** — in the **DSH credential store** (Settings → Models API-key area) or as a launch-environment variable; the reference name is all that has to match. A reference shadowed by an environment variable is read-only (`writable: false`) and the card refuses to write it.
- **🌍 Keyless play** — enable a source's free tier (`free.enabled`) to search through its public MCP with no key at all.
- **🚀 DeepSeek Official quick start** — type the key in the card (it lands under `UM_WS_DEEPSEEK_API_KEY`) → enable the `deepseek` provider's paid tier → save, takes effect immediately.
- **🧹 Legacy credential migration** — the legacy default references `EXA_API_KEY` / `PARALLEL_API_KEY` are copied to `UM_WS_EXA_API_KEY` / `UM_WS_PARALLEL_API_KEY` (**copy only, the legacy references are never deleted**).

<a id="troubleshooting"></a>

## 🩺 Troubleshooting

| Symptom | Cause & fix |
| --- | --- |
| Searches answer `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` | The master switch is off. The `web` row already points at this plugin, and `enabled: false` does not fall back to another backend — turn `enabled` on in the settings card |
| `web_fetch` fails with `WEB_PROVIDER_AMBIGUOUS` | The profile's `web` row lost its `fetchProvider` (the patch-replaces-whole-config semantics). Restate every key of that row |
| Two provider ids are usable and no `searchProvider` is set | This plugin registers `um-web-search` and the legacy alias `exa`, sharing one availability; the seam follows "several usable and none configured → error" rather than first-come-first-served. A hand-mounted deployment must write `searchProvider` explicitly |
| A settings-card save is refused with a bilingual warning | The client-side pre-write validation stopped a doomed candidate (duplicate or blank provider ids, duplicate or invalid key references, an out-of-range concurrency, a default provider that names nothing). Fix it as shown and retry — a refused save never lands partially |
| The stored `providers` shows the built-in defaults plus a bilingual warning | The stored value is an object rather than an array (an older format or a foreign writer). The card renders the built-in fallback and refuses a save that would leave that shape standing |
| Sources are configured but search is still unavailable | Check in order: the master switch, each provider's `enabled`, the tier switches, and whether the key exists and is not shadowed read-only by an environment variable |
| You want the official search backend back | Uninstall this plugin (removing the bundle layer restores `deepseek-official`), or write the `web` row explicitly in the profile patch |

<small>Verify the composition: `pnpm exec dsh --profile web --dump-config | Select-String um-web-search`. Runtime semantics: `searchProvider` is read while the WebRuntime is constructed, so the `enabled` switch toggles availability live only.</small>

<a id="tests"></a>

## 🧪 Tests

### 🖥️ Host suite (node:test, 175 cases)

```powershell
pnpm test
```

| File | Cases | Covers |
| --- | --- | --- |
| `tests/plugin.test.mjs` | 85 | The strategy state machine, caching, degradation semantics, concurrent fan-out, the DeepSeek wrapper, `UM_WS_` migration, `apply` mounting and waterfall scoping |
| `tests/boundary.test.mjs` | 37 | Boundaries and contracts: chain degradation, clamping, cache eviction, state-machine details, the manifest window |
| `tests/render.test.mjs` | 47 | The browser half (`lib/client.js`) against a React stub plus an official-primitives stub: rendering, path ops, and the pre-write validation contract |
| `tests/version.test.mjs` | 6 | The dev version chain |

### 🎬 Visual interaction suite (Playwright, 16 cases)

```powershell
pnpm test:visual           # generate the fixture + run the assertions
pnpm test:visual:update    # refresh the snapshot baselines
```

- the fixture generator `tests/render-visual.mjs` produces one page, `tests/visual/fixtures/card.html`: the inlined `lib/client.js` source plus a minimal React, an official-primitives stub, and a mock DSH client ctx (`configForms` / `remote.credentials` / `slots` / `locale`), with every call recorded on `window.__testLog`
- it covers this plugin's own composition and behaviour (mount gating, staged drafts and the save's path ops, provider ordering, key writes and badges, validation blocking); the framework components' own pixels are out of scope
- after changing the fixture, regenerate the page with `node tests/render-visual.mjs` before refreshing the baselines

<a id="devversions"></a>

## 🧩 Development versions

Dev builds use a base-version + version-code scheme:

```powershell
pnpm dev:version          # produces something like 0.7.0.20260829102301 (base + a 14-digit yyyyMMddHHmmss code)
pnpm dev:version:reset    # return to the base version
```

- the version code is second-level unique and strictly monotonic; the script syncs `package.json` with `VERSION` in `lib/index.js` and hard-fails on drift
- history stays in the local `.um.agents/memory/` (untracked)
- **dev versions are never committed, tagged, or added to the CHANGELOG** — commits and releases target the base version only

<a id="migration"></a>

## 🚚 Migration

### 0.6.x → 0.7.0

| Change | Effect |
| --- | --- |
| DSH ≥ 0.1.7-alpha.2 required | This release is rewritten against the 0.1.7 settings subsystem; the 0.1.1-rc.2 family is no longer supported |
| The old settings namespace is no longer read | 0.6.x stored settings under the `web-search-exa` namespace; from 0.1.7 on, settings live in the profile patch's **row `config`**, and the namespace IS the Loader row id (`um-web-search`). The old section is **not imported**, so settings fall back to the factory defaults — re-enter them once in the **Settings → Plugins → UM Web Search** card |
| Legacy flat keys still bridge the gap | While `providers` is still the factory default, the pre-0.6.0 flat keys (`preferred`, `exaEnabled`, `allowAnonymous`, …) are read once and synthesized into `providers[]` (a zero-storage migration). After the first save from the new card the written array IS that synthesis, so those keys become **inert leftovers** the settings service cannot even clear (they are not volatile) and stop affecting behaviour |
| The card UI was rebuilt | The bespoke CSS, modal, accordion, class namespace, and pixel baselines are retired in favour of the official primitives, so both the interaction path and the visual presentation changed |

### Revised 0.7.0 window

The dependency window narrows to `>=0.2.0-rc.1 <0.3.0` (the 0.1.7 family is no longer supported); the test/dev baseline moves to `0.2.0-rc.2` — devDependencies and overrides migrated as a family, and the `SettingsFormModel` mirror was re-verified line-for-line against `dsh-client-ui-primitives@0.2.0-rc.2` (semantics unchanged).

<a id="adr"></a>

## 🏛️ Architecture decisions & research

| Document | Subject |
| --- | --- |
| [ADR-0001](./.um.agents/constraints/ADR-0001-web-search-exa.md) | Exa as a built-in DSH web search provider |
| [ADR-0002](./.um.agents/constraints/ADR-0002-dual-backend-strategy.md) | The dual-backend strategy pattern (umbrella provider) and the layered settings UI |
| [ADR-0003](./.um.agents/constraints/ADR-0003-dev-version-chain.md) | The dev version chain (base version + 14-digit version code) |
| [ADR-0004](./.um.agents/constraints/ADR-0004-multi-source-strategy.md) | The multi-source strategy rebuild: the `providers[]` model, the paid/free state machine, concurrency and caching, the DeepSeek Official integration |
| [ADR-0005](./.um.agents/constraints/ADR-0005-playwright-visual-testing.md) | Choosing Playwright for real visual interaction tests |
| [ADR-0006](./.um.agents/constraints/ADR-0006-dsh-017-adaptation.md) | Adapting to DSH 0.1.7: the settings subsystem rewrite and the card rebuild on the official primitives |
| [ADR-0007](./.um.agents/constraints/ADR-0007-dsh-020-rc2-single-track.md) | Narrowing to the single DSH 0.2.0-rc.2 track: Desktop alignment and the semver prerelease resolution defect |
| [Parallel API research dossier](./.um.agents/constraints/parallel-search-research.md) | The Parallel REST / MCP shape, its differences from Exa, and the open risks |
| [Hardcoded-semantics index](./.um.agents/constraints/hardcode-index.md) | Every hardcoded value with a short path, to be synced one by one on upgrade |

<a id="support"></a>

## 🙏 Support

If this plugin helps you, consider buying me a coffee ☕️

<div align="center">

<a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

</div>

<a id="license"></a>

## 📄 License

[MIT](./LICENSE) © 2026 [UnforgetMemory](https://github.com/UnforgetMemory)
