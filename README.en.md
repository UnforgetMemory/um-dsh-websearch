<div align="center">

<img src="./Hero.png" width="900" alt="um-dsh-websearch — Exa + Parallel + DeepSeek Official multi-source web search for DeepSeek Harness" />

[![License: MIT](https://img.shields.io/badge/License-MIT-4d9fff?style=flat-square)](./LICENSE) [![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-4d9fff?style=flat-square)](https://github.com/topics/dsh-plugin) [![DSH >= 0.2.0-rc.1](https://img.shields.io/badge/DSH-%3E%3D0.2.0--rc.1-4d9fff?style=flat-square)](package.json) [![Node >= 20](https://img.shields.io/badge/Node-%3E%3D20-2ea44f?style=flat-square)](package.json) <a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

Exa + Parallel + DeepSeek Official multi-source search for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — an ordered provider list, paid/free tier-gated fallback, multi-key strategies, concurrent fan-out, an optimistic cache, and a bilingual settings card.

English · [简体中文](./README.md)

</div>

---

## Features

- **Multi-provider strategy layer** — the ordered `providers[]` list IS the priority: each provider enables independently, `defaultProvider` picks where the sequential chain starts, and a server-side rejection degrades to the next provider
- **Paid / free tiers with gated fallback** — every provider carries a paid REST tier and a keyless anonymous MCP tier, each with its own switch; a tier fallback requires BOTH the exhausted key's direction switch AND the target tier being on, so it never degrades on its own (Exa `/search` ⇄ `mcp.exa.ai`; Parallel `/v1/search` ⇄ `search.parallel.ai/mcp`; DeepSeek Official is paid-only)
- **Multi-key strategies** — each provider can hold several credential references, used `ordered` (array order) or `random` (shuffled per search), with per-key `allowFreeToPaid` / `allowPaidToFree` switches
- **Concurrent fan-out** — with `concurrency > 1` one search is dispatched across every enabled source (provider × tier × key) and the successes are merged with URL dedup; `concurrency = 1` keeps the sequential fallback chain
- **Optimistic cache** — an in-memory result cache with a switch and a 1–86400s TTL, invalidated the moment the configuration changes
- **deepseek-official integration** — the umbrella wraps the framework's own `DeepSeekSearchProvider` (API parity, zero protocol drift) and resolves credentials through `UM_WS_DEEPSEEK_API_KEY`
- **Credential safety (`UM_WS_` namespace)** — the configuration stores reference names only; key literals stay in the credential store or the environment. References default to the `UM_WS_` prefix, isolated from the official packages, and legacy values are copied once and **never deleted**
- **Official-primitives settings card** — the card is rebuilt (since 0.7.0) on DSH's own `SettingsForm` / `SettingsFormModel` / `SettingsValueField` / `SettingsSecretField`: the Plugins page row renders the master switch, default provider, concurrency, cache, and provider list in place, key values are written through the official credentials interface, and key literals never land in the settings document

## Requirements

| Dependency | Requirement |
|---|---|
| DeepSeek Harness | **≥ 0.2.0-rc.1 and < 0.3.0** (verified on Desktop 0.2.0-rc.2; the 0.1.7 and earlier families are no longer supported, see ADR-0007) |
| Node.js | ≥ 20 |

## Quick start

```powershell
pnpm exec dsh plugin --profile web add <path-to-this-repo>   # local checkout
pnpm exec dsh plugin --profile web add github:UnforgetMemory/um-dsh-websearch
```

> **Desktop app**: the `desktop` profile is managed exclusively by the Electron application. The
> desktop-bundled dsh command (menu-bar "Manage dsh command", or
> `resources\runtime\cli\bin\dsh.cmd`) allows only the `plugin` subcommands against the desktop
> profile — every other command (e.g. `--dump-config`) is refused. Install/update with the same
> `dsh plugin --profile desktop add …` or through the app's plugin management UI, then restart the
> app. Note pnpm 11's default 24-hour release-age gate blocks freshly published `0.2.0-rc.*`
> versions: the desktop profile's `pnpm-workspace.yaml` needs a `minimumReleaseAgeExclude`
> whitelist (same list as this repo) to resolve the newest prerelease (ADR-0007).

The package declares `dsh.bundle`, so `dsh plugin add` appends it to `dsh.profile.bundles` and mounts its own patch layer (`cordis.patch.yml`) automatically — no manual profile row. The layer is:

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

> ⚠️ An id-targeted patch **replaces** the targeted row's whole `config` (it is not a deep merge), so this entry must restate **every** key the `web` row owns. On DSH 0.1.7 the base `web` row owns both `searchProvider` and `fetchProvider`; omitting the latter deletes it silently, and `web_fetch` then fails with `WEB_PROVIDER_AMBIGUOUS` as soon as a second fetch provider appears in the profile.

Restart, then enable at **Settings → Plugins → UM Web Search** (`enabled` ships off).

The bundle layer re-points the `web` row's `searchProvider` at `um-web-search` — installing takes over the default search backend and uninstalling restores the deployment's own default (`deepseek-official`), with no manual profile edit. To pin a different backend, write the `web` row explicitly in the profile's `cordis.patch.yml` (later layers win, and you must **restate both keys**; template: [`cordis.patch.snippet.yml`](./cordis.patch.snippet.yml)).

> ⚠️ **Takeover window**: `enabled` ships `false`, so between the takeover and flipping the switch search is unavailable — the `web` row already points at this plugin, and a disabled plugin answers searches with `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`. Enable `enabled` in the settings card right after installing.

> **Migration note**: if you previously followed the old README and hand-inserted a row with `id: web-search-exa` into your profile's `cordis.patch.yml`, remove that row first — otherwise the bundle layer mounts alongside it and the plugin loads twice.

## Migration (revised 0.7.0 window)

- **DSH ≥ 0.2.0-rc.1 is required** (ADR-0007): the 0.1.7 family is no longer supported. The
  original 0.7.0 window `>=0.1.7-alpha.2 <0.3.0` never matches the `0.2.0-rc.*` prereleases under
  plain semver (a prerelease is only satisfied by a comparator of the same `[major,minor,patch]`
  tuple), so on the 0.2.0 Desktop host pnpm resolved the plugin's runtime closure to
  `0.1.7-rc.2` — a second, parallel copy of the DSH web runtime next to the host's
  `0.2.0-rc.2`. This revision narrows the window to `>=0.2.0-rc.1 <0.3.0`, so reinstalls and
  refreshes resolve to the host's own versions. On a 0.1.7 host the compatibility gate refuses
  the revised package outright (fail-fast).
- The test/dev baseline moved to `0.2.0-rc.2`: devDependencies and overrides migrated as a family;
  the `SettingsFormModel` mirror in `tests/render.test.mjs` was re-verified line-for-line against
  `dsh-client-ui-primitives@0.2.0-rc.2` (semantics unchanged).
- The breaking changes from 0.6.x → 0.7.0 (settings namespace moved into the profile patch row
  `config`, card rebuilt on the official primitives) remain in effect; see the 0.7.0 migration
  notes below.

## Migration (0.6.x → 0.7.0)

- **DSH ≥ 0.1.7-alpha.2 is required**: this release is rewritten against the 0.1.7 settings subsystem, and the 0.1.1-rc.2 family is no longer supported.
- **The old settings namespace is no longer read**: 0.6.x stored settings under the `web-search-exa` namespace; DSH 0.1.7 keeps settings in the profile patch's row `config`, and the namespace IS the Loader row id (`um-web-search`). The old section is **not imported**, so settings fall back to the factory defaults — re-enter them once in the **Settings → Plugins → UM Web Search** card.
- **Legacy flat keys still bridge the gap**: while `providers` is still the factory default, the pre-0.6.0 flat keys (`preferred`, `exaEnabled`, `allowAnonymous`, …) are read once and synthesized into `providers[]` (zero-storage migration). After the first save from the new card the written array IS that synthesis, so those keys become **inert leftovers** the settings service cannot even clear (they are not volatile) and stop affecting behaviour. The legacy `EXA_API_KEY` / `PARALLEL_API_KEY` values are still copied to `UM_WS_EXA_API_KEY` / `UM_WS_PARALLEL_API_KEY` (the legacy references are never deleted).
- **The card UI was rebuilt**: the bespoke CSS, modal, accordion, class namespace, and pixel baselines are retired in favour of the official primitives, so both the interaction path and the visual presentation changed.

## Configuration

Settings are edited in the **Settings → Plugins → UM Web Search** card and persisted into the `config` of the profile patch's `um-web-search` row. The form is derived from the `Config` schema the plugin exports, and the fields that can take effect live are declared volatile (`enabled`, `defaultProvider`, `concurrency`, `cache`, `providers`) — saving needs no plugin remount and applies to the next search. Cross-field invariants (unique provider ids, unique key references, a `defaultProvider` that names a configured provider) are validated on the pre-persist `internal/config` waterfall, so a rejected write never reaches disk; the waterfall scopes itself to rows composed from this plugin via `this.runtime` and never touches other plugins' sections (fixed after 0.7.0: the Models page's `llm-pi-ai` dict-shaped `providers` used to be rejected by this plugin's array schema). The card additionally mirrors the same invariants client-side and refuses a doomed candidate before anything is sent, with a bilingual warning naming the exact problem — a refused save can never land partially.

### Global group

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Plugin master switch |
| `defaultProvider` | `exa` | Where the sequential chain starts (must be a provider id) |
| `concurrency` | `1` | 1 = sequential fallback chain; 2–8 = fan out across every enabled source |
| `cache.enabled` | `false` | In-memory result cache switch |
| `cache.ttlSeconds` | `60` | How long one cached result stays fresh (1–86400) |

### Provider group (`providers[]`, array index = priority)

| Key | Meaning |
|---|---|
| `id` | Provider identity (built-in: `exa` / `parallel` / `deepseek`) |
| `enabled` | Enable this provider |
| `primaryTier` | Tier tried first: `free` (anonymous MCP) or `paid` (REST + key) |
| `paid.enabled` / `paid.baseURL` | Paid-tier switch and REST endpoint |
| `free.enabled` / `free.baseURL` | Free-tier switch and anonymous MCP endpoint (forced off for deepseek) |
| `keys[]` | Key list: `ref` (auto-generated credential reference such as `UM_WS_EXA_API_KEY`/`_1`), `enabled`, `allowFreeToPaid`, `allowPaidToFree`; the card takes the key **value** and writes it to the credential store through the official interface (the array itself holds no key value) |
| `keysStrategy` | Multi-key order: `ordered` (array order) / `random` (shuffled per search) |
| `numResults` | Default result count (1–20) |
| `params` | Provider-specific options (Exa `searchType`; Parallel `mode`; DeepSeek `model`/`maxUses`) |

> **Writing the array by hand**: array elements cannot be declared volatile (a schemastery constraint), so `providers` is volatile as a **whole array** and the settings service only writes it wholesale — write the entire array when editing the provider list in a profile patch.

Any field change takes effect on the next search.

## Fallback semantics (paid ⇄ free)

- Sequential mode: primary tier → every key of that tier (per `keysStrategy`) → once exhausted, a cross-tier step requires the **current key's direction switch** AND the **target tier being on** → a terminal failure of this provider moves to the next provider.
- Only a server-side rejection (401/402/403/429/5xx) triggers a fallback; aborts, missing credentials, client 4xx (including 422), contract errors, and network failures **never** fall back.
- Concurrent mode: every enabled source runs in parallel, one source's failure does not affect the others, and the successes are merged; there is no "fallback" — whether the free tier participates is its own switch's business.

## Credentials

- Enter the key **value** in the card: saving writes it to the **DSH credential store** through
  the official credentials interface (`ctx.remote.credentials.set(ref, value)`, positional), and
  the configuration stores only the auto-generated **reference name** — key literals never land in
  the settings document. **A blank value keeps the currently stored key.**
- Leak hardening: the page only ever learns whether a value is non-blank (configured / not-configured
  badges, fed by `ctx.remote.credentials.describe([refs])`); stored literals are never echoed back,
  whitespace alone never counts as a value, and written values are trimmed.
- References are generated for you: a provider's first key uses `UM_WS_<PROVIDER>_API_KEY`, further
  keys take `_1`, `_2`, … (created once when the row is added, stable thereafter, explicitly isolated
  from the official packages' `EXA_API_KEY` / `DEEPSEEK_API_KEY`).
- You can also store the key yourself — in the **DSH credential store** (Settings → Models API-key
  area, under the matching reference) or as a launch-environment variable; the reference name is all
  that has to match. A reference shadowed by an environment variable is read-only
  (`writable: false`) and the card refuses to write it.
- Keyless play: enable a provider's free tier (`free.enabled`) to search through its public MCP with
  no key at all.
- DeepSeek Official quick start: type the key in the card (it lands under `UM_WS_DEEPSEEK_API_KEY`)
  → enable the `deepseek` provider's paid tier → save, takes effect immediately.

## Development versions

Dev builds use a base-version + version-code scheme: `pnpm dev:version` produces
versions like `0.7.0.20260829102301` (base + a 14-digit `yyyyMMddHHmmss` code —
second-level unique and strictly monotonic), syncing package.json and `VERSION` in
`lib/index.js`; history stays in the local `.um.agents/memory/` (untracked).
`pnpm dev:version:reset` returns to the base version. Dev versions are never
committed, tagged, or added to the CHANGELOG — commits/releases target the base
version only.

## Tests

- **Host suite** (node:test): `pnpm test` (equivalent to `node --test tests/plugin.test.mjs tests/boundary.test.mjs tests/render.test.mjs tests/version.test.mjs`)
  - `plugin.test.mjs` covers strategy/cache/degradation semantics, `boundary.test.mjs` boundaries and contracts, `version.test.mjs` the version chain, and `render.test.mjs` the browser half (`lib/client.js`) against a React stub plus an official-primitives stub, asserting the rendering and form contract
- **Visual interaction suite** (Playwright, ADR-0005; scope per ADR-0006 D3): `pnpm test:visual`
  - the fixture generator `tests/render-visual.mjs` produces one page, `tests/visual/fixtures/card.html`: the inlined `lib/client.js` source plus a minimal React, an official-primitives stub, and a mock DSH client ctx (`configForms` / `remote.credentials` / `slots` / `locale`), with every call recorded on `window.__testLog`
  - it covers this plugin's own composition and behaviour (mount gating, staged drafts and the save's path ops, provider ordering, key writes and badges, validation blocking); the framework components' own pixels are out of scope
  - refresh the baselines with `pnpm test:visual:update` (regenerate the page with `node tests/render-visual.mjs` after changing the fixture)

## Usage & troubleshooting

- Default backend: the bundle layer sets the `web` row's `searchProvider` to `um-web-search` and keeps
  `fetchProvider: http` (canonical id since 0.4.0; the legacy alias `exa` still resolves to the same
  umbrella instance). To pin another backend explicitly, override the row in a profile patch — and
  restate both keys.
- Auto-selection boundary: this plugin registers two provider ids, `um-web-search` and the legacy alias
  `exa`, sharing one availability — if a deployment bypasses the bundle layer and the `web` row has no
  `searchProvider`, both being usable yields the seam's `WEB_PROVIDER_AMBIGUOUS` (the manual's
  selection semantics: several usable and none configured → an error rather than first-come-first-served).
  A hand-mounted deployment therefore must write `searchProvider` explicitly.
- Runtime semantics: `searchProvider` is read while the WebRuntime is constructed; the `enabled` switch
  toggles availability live (off answers searches with `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` and does not
  fall back to another backend). Uninstalling the plugin (which removes the bundle layer) is the only way
  to restore another backend.
- Strategy semantics: master switch off → unavailable as a whole; sequential mode serves provider by
  provider from `defaultProvider` down the `providers[]` order and degrades across providers when a
  server rejects one and the next source is usable; aborts, missing credentials, 4xx/422 client errors,
  and network failures never degrade.
- Settings card: the row first shows a one-line **effective strategy summary** (enabled sources in order →
  concurrency, or an "unavailable" note when everything is off); expanding it renders the official
  `SettingsForm` (master switch, default provider, concurrency, cache, and a provider list whose rows carry
  a Default / Fallback / Off role badge, ↑↓ ordering, an enable switch, and "Configure…"). "Configure…" opens
  a modal that edits one provider's tiers, endpoints, keys, and parameters, with each key row showing a
  configured / not-configured badge.
- Verify the composition: `pnpm exec dsh --profile web --dump-config | Select-String um-web-search`
- Exports gate & architecture decisions: [ADR-0001](./.um.agents/constraints/ADR-0001-web-search-exa.md),
  [ADR-0002](./.um.agents/constraints/ADR-0002-dual-backend-strategy.md),
  [ADR-0003](./.um.agents/constraints/ADR-0003-dev-version-chain.md),
  [ADR-0004](./.um.agents/constraints/ADR-0004-multi-source-strategy.md),
  [ADR-0005](./.um.agents/constraints/ADR-0005-playwright-visual-testing.md),
  [ADR-0006](./.um.agents/constraints/ADR-0006-dsh-017-adaptation.md),
  [ADR-0007](./.um.agents/constraints/ADR-0007-dsh-020-rc2-single-track.md);
  Parallel API facts: [research dossier](./.um.agents/constraints/parallel-search-research.md)

## Support

If this plugin helps you, consider buying me a coffee:

<div align="center">

<a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

</div>

## License

[MIT](./LICENSE) © 2026 [UnforgetMemory](https://github.com/UnforgetMemory)
