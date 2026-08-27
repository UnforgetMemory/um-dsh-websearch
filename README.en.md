# um-dsh-websearch

> An Exa (exa.ai) web search provider plugin for DeepSeek Harness (DSH).
> Shaped after the official built-in search plugin — plus a **dynamic `enabled` switch**,
> **credentials-service key resolution**, and a **bilingual settings card**.

![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-4d9fff?style=flat-square)
![License: MIT](https://img.shields.io/badge/license-MIT-4d9fff?style=flat-square)
![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-2ea44f?style=flat-square)
![Version](https://img.shields.io/badge/version-0.2.0-8b5cf6?style=flat-square)

**English** · [简体中文](./README.md)

---

## ✨ Features

- **Exa search out of the box**: one provider, two transports — authenticated REST `/search`
  and anonymous MCP `web_search_exa` (no key), switching automatically by configuration
- **Dynamic `enabled` switch**: ships off; flip it in Settings and it takes effect
  live with **no restart**
- **Keyless anonymous mode**: with `allowAnonymous: true`, searches go through Exa's public
  hosted MCP and return real results without any credential
- **Credentials-service key resolution**: literal key → credentials-service reference →
  launch environment, with graceful fallback
- **Bilingual settings card**: follows the DSH UI language (English / 简体中文) in real time
- **Live availability**: `available()` is computed from the current configuration, so the
  toggle is reflected in the selector immediately

## 📦 Installation (profile `web` example)

1. Add this package to the profile's `node_modules` (DSH forwards pnpm; the package is
   linked to this workspace, so source edits take effect after a restart):

   ```powershell
   pnpm exec dsh plugin --profile web add <path-to-this-repo>
   ```

2. Append the patch row to your user patch layer (`$DSH_HOME/profiles/web/cordis.patch.yml`,
   top-level list):

   ```yaml
   - insert:
       - id: web-search-exa
         name: um-dsh-websearch
   ```

3. Verify the composition tree statically (no process start) — you should see the
   `web-search-exa` row:

   ```powershell
   pnpm exec dsh --profile web --dump-config | Select-String exa
   ```

4. Restart DSH to mount the patch layer.

> **exports gate pitfall**: the client-modules scanner calls
> `require.resolve("<package>/package.json")`. Your `exports` map must explicitly allow
> `"./package.json"`, otherwise `ERR_PACKAGE_PATH_NOT_EXPORTED` is silently swallowed and the
> client half never enters the graph.

## ⚙️ Configuration (Settings → Plugin Config → Exa Web Search)

| Field | Type / Role | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `false` | Dynamic switch; when off the provider stays registered but unusable |
| `allowAnonymous` | boolean | `false` | Keyless mode; when on, uses Exa's public hosted MCP with no key |
| `apiKey` | string · secret | — | Literal key, overrides the reference below (REST mode) |
| `apiKeyEnv` | string · credential-ref | `EXA_API_KEY` | Credentials-service reference (an environment variable name) |
| `baseURL` | string | `https://api.exa.ai` | REST base; `/search` is appended; `EXA_BASE_URL` overrides |
| `mcpBaseURL` | string | `https://mcp.exa.ai/mcp` | Anonymous MCP endpoint; point it at a self-hosted proxy if needed |
| `numResults` | integer 1–10 | `5` | Result count used when a search carries no explicit `maxResults` |
| `searchType` | string | `auto` | `auto` / `neural` / `keyword` (REST only) |

**Key resolution order**: literal `apiKey` → credentials service (`apiKeyEnv`) → launch
environment. With `allowAnonymous: true`, keys are bypassed entirely — searches go through
Exa's public hosted MCP and return real results.

## 🚀 Usage

### Enable dynamically

1. **Settings → Plugins → Plugin Config**, expand the **Exa Web Search** card (next to the
   built-in "Web Search / DeepSeek" card);
2. Toggle `enabled` and save — it takes effect immediately, no restart.

> When the deployment pins the selection to `deepseek-official` (no override below), enabling
> the switch alone does **not** change the default backend — a deliberate zero side-effect design.

### Switch the default search backend to Exa

Append to `cordis.patch.yml` (id-targeted override of the bundle row):

```yaml
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: exa
```

Restart once. Rollback = remove the override and the snippet's insert row.

## 🧱 How it works

Each search resolves an options snapshot from the **current** configuration (one search never
mixes two sections):

| Transport | Trigger | Notes |
|---|---|---|
| REST `/search` | `allowAnonymous: false` + valid key | Exa authenticated API; honors `searchType`; sends `x-api-key` |
| Anonymous MCP (streamable-HTTP) | `allowAnonymous: true` | `initialize` handshake + `tools/call web_search_exa`, no key |

**Availability** is computed live: `enabled` wins first; anonymous mode only needs a parseable
`mcpBaseURL`; authenticated mode additionally requires a present key (a probed-absent key or
an invalid reference disqualifies it).

**Error codes** surface to the tool layer as `WebError` codes:
`WEB_PROVIDER_CREDENTIAL_MISSING` (no key), `WEB_PROVIDER_ERROR` (HTTP / parse failure),
`WEB_ABORTED` (caller cancellation).

## 📚 Documentation

- [DeepSeek Harness — Your first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)
- [DeepSeek Harness — Bundling & installing plugins](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)
- Architecture decision records: [ADR-0001 — Exa web search integration](.um.agents/constraints/ADR-0001-web-search-exa.md)

## 📄 License

[MIT](./LICENSE) — free to use, modify, and redistribute.