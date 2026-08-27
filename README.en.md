<div align="center">

# um-dsh-websearch

**Exa web search · a DeepSeek Harness plugin**

[![License: MIT](https://img.shields.io/badge/License-MIT-4d9fff?style=flat-square)](./LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-4d9fff?style=flat-square)](https://github.com/topics/dsh-plugin)
[![Node >= 20](https://img.shields.io/badge/Node-%3E%3D20-2ea44f?style=flat-square)](package.json)

Exa search for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — keyless anonymous mode, a dynamic switch, and a bilingual settings card.

English · [简体中文](./README.md)

</div>

---

## Features

- **Two transports** — authenticated REST `/search`, or keyless anonymous MCP, switched by config
- **Dynamic switch** — `enabled` ships off; flip it in Settings, live, no restart
- **Flexible credentials** — literal key → credentials service → environment, with fallback
- **Bilingual UI** — the settings card follows the DSH UI language in real time

## Quick start

```powershell
pnpm exec dsh plugin --profile web add <path-to-this-repo>
```

Append the `web-search-exa` row to the patch layer, restart, then enable at **Settings → Plugin Config → Exa Web Search**:

```yaml
- insert:
    - id: web-search-exa
      name: um-dsh-websearch
```

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Dynamic switch |
| `allowAnonymous` | `false` | Keyless anonymous mode (public MCP) |
| `apiKey` | — | Literal key, REST only |
| `apiKeyEnv` | `EXA_API_KEY` | Credential reference (an env var name) |
| `baseURL` | `https://api.exa.ai` | REST base; `/search` appended |
| `mcpBaseURL` | `https://mcp.exa.ai/mcp` | Anonymous MCP endpoint |
| `numResults` | `5` | Default result count (1–10) |
| `searchType` | `auto` | `auto` / `neural` / `keyword` (REST only) |

Any field change takes effect on the next search.

## Usage & troubleshooting

- Switch the default backend to Exa: add `config.searchProvider: exa` to the `web` row
- Verify the composition: `pnpm exec dsh --profile web --dump-config | Select-String exa`
- Exports gate & architecture decisions: [ADR-0001](./.um.agents/constraints/ADR-0001-web-search-exa.md)

## License

[MIT](./LICENSE) © 2026 [UnforgetMemory](https://github.com/UnforgetMemory)
