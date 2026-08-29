<div align="center">

<img src="./Hero.png" width="900" alt="um-dsh-websearch — dual-backend (Exa + Parallel) web search for DeepSeek Harness" />

[![License: MIT](https://img.shields.io/badge/License-MIT-4d9fff?style=flat-square)](./LICENSE) [![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-4d9fff?style=flat-square)](https://github.com/topics/dsh-plugin) [![Node >= 20](https://img.shields.io/badge/Node-%3E%3D20-2ea44f?style=flat-square)](package.json) <a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

Dual-backend (Exa + Parallel) search for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — strategy routing, keyless anonymous mode, a dynamic master switch, and a bilingual settings card.

English · [简体中文](./README.md)

</div>

---

## Features

- **Dual-backend strategy** — Exa and Parallel behind one umbrella provider: `preferred` picks the primary, each backend enables independently, one plugin-level `enabled` master switch; a server-side rejection degrades across backends
- **Two transports per backend, two-way fallback** — authenticated REST and keyless anonymous MCP as primary/backup (Exa `/search` ⇄ `mcp.exa.ai`; Parallel `/v1/search` ⇄ `search.parallel.ai/mcp`)
- **Dynamic switch** — `enabled` ships off; flip it in Settings, live, no restart
- **Flexible credentials** — literal key → credentials service → environment, per backend
- **Layered settings card** — the first screen keeps only the master switch and a strategy status line; "Advanced settings…" opens a Modal with every field, bilingual in real time

## Quick start

```powershell
pnpm exec dsh plugin --profile web add <path-to-this-repo>
```

Append the `web-search-exa` row to the patch layer, restart, then enable at **Settings → Plugins → UM Web Search**:

```yaml
- insert:
    - id: web-search-exa
      name: um-dsh-websearch
```

## Configuration

### Strategy

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Plugin master switch |
| `preferred` | `exa` | Primary backend: `exa` / `parallel` |
| `exaEnabled` | `true` | Enable the Exa backend |
| `parallelEnabled` | `false` | Enable the Parallel backend (also the cross-backend fallback target) |

### Exa

| Key | Default | Meaning |
|---|---|---|
| `allowAnonymous` | `false` | Keyless anonymous mode (public MCP), as the primary route |
| `fallbackToPaid` | `false` | Degrade anonymous → paid (REST `/search` with key) |
| `fallbackToAnonymous` | `false` | Degrade paid → anonymous (public MCP) |
| `apiKey` | — | Literal key, REST only |
| `apiKeyEnv` | `EXA_API_KEY` | Credential reference (an env var name) |
| `baseURL` | `https://api.exa.ai` | REST base; `/search` appended |
| `mcpBaseURL` | `https://mcp.exa.ai/mcp` | Anonymous MCP endpoint |
| `numResults` | `5` | Default result count (1–10) |
| `searchType` | `auto` | `auto` / `neural` / `keyword` (REST only) |

### Parallel

| Key | Default | Meaning |
|---|---|---|
| `parallelAllowAnonymous` | `false` | Keyless anonymous mode (`search.parallel.ai/mcp`), as the primary route |
| `parallelFallbackToPaid` | `false` | Degrade anonymous → paid (REST `/v1/search` with key) |
| `parallelFallbackToAnonymous` | `false` | Degrade paid → anonymous (public MCP) |
| `parallelApiKey` | — | Literal key, REST only |
| `parallelApiKeyEnv` | `PARALLEL_API_KEY` | Credential reference (an env var name) |
| `parallelBaseURL` | `https://api.parallel.ai` | REST base; `/v1/search` appended |
| `parallelMcpBaseURL` | `https://search.parallel.ai/mcp` | Anonymous MCP endpoint (free tier rate-limited per session) |
| `parallelNumResults` | `10` | Default result count (1–20, REST only; the MCP tool takes no count) |
| `parallelMode` | `fast` | `turbo` / `fast` / `basic` / `advanced` (REST only) |

Any field change takes effect on the next search.

## Credentials

- Keys never land in the settings document: the card only stores a reference
  name (default `EXA_API_KEY` / `PARALLEL_API_KEY`). Store the key itself in the
  **DSH credential store** (Settings → Models API-key area, under the matching
  reference) or inject it as a launch-environment variable; resolution order:
  literal `apiKey` → credential store → environment
- Keyless play: enable anonymous mode on either backend to search through its
  public MCP with no key at all
- Parallel quick start: store the key under `PARALLEL_API_KEY` → set
  `preferred: parallel` on the Overview tab → save, takes effect immediately

## Development versions

Dev builds use a base-version + version-code scheme: `pnpm dev:version` produces
versions like `0.4.0.20260829102301` (base + a 14-digit `yyyyMMddHHmmss` code —
second-level unique and strictly monotonic), syncing package.json, `VERSION`, and
the About tab; history stays in the local `.um.agents/memory/` (untracked).
`pnpm dev:version:reset` returns to the base version. Dev versions are never
committed, tagged, or added to the CHANGELOG — commits/releases target the base
version only.

## Usage & troubleshooting

- Switch the default backend to this plugin: add `config.searchProvider: um-web-search`
  to the `web` row (canonical id since 0.4.0; the legacy alias `exa` still resolves to
  the same umbrella instance)
- Strategy semantics: master switch off → unavailable; the primary backend serves
  through its transport chain, and a server-side rejection (401/402/403/429/5xx)
  degrades to the other backend when enabled and usable; aborts, missing credentials,
  4xx/422 client errors, and network failures never degrade
- The Overview tab shows the EFFECTIVE strategy: role badges (primary/fallback/off),
  a "Set as primary" radio, and a warning with a one-click swap when the preferred
  backend is disabled
- Verify the composition: `pnpm exec dsh --profile web --dump-config | Select-String um-web-search`
- Exports gate & architecture decisions: [ADR-0001](./.um.agents/constraints/ADR-0001-web-search-exa.md),
  [ADR-0002](./.um.agents/constraints/ADR-0002-dual-backend-strategy.md),
  [ADR-0003](./.um.agents/constraints/ADR-0003-dev-version-chain.md);
  Parallel API facts: [research dossier](./.um.agents/constraints/parallel-search-research.md)

## Support

If this plugin helps you, consider buying me a coffee:

<div align="center">

<a href="https://ko-fi.com/unforgetmemory" target="_blank" rel="nofollow"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi&style=flat-square" alt="Ko-fi" style="max-width:100%"></a>

</div>

## License

[MIT](./LICENSE) © 2026 [UnforgetMemory](https://github.com/UnforgetMemory)
