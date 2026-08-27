import test from "node:test";
import assert from "node:assert/strict";
import * as pkg from "../lib/index.js";

/** Fresh provider over one fixed options snapshot. */
function makeProvider(options) {
	return new pkg.ExaSearchProvider(() => ({ ...options }));
}

const BASE = { enabled: true, baseURL: "https://api.exa.ai", apiKey: "k", resolveApiKey: async () => "k" };

test("available(): disabled wins over everything", () => {
	const p = makeProvider({ ...BASE, enabled: false });
	assert.equal(p.available(), false);
});

test("available(): literal key plus parseable URL is usable", () => {
	const p = makeProvider(BASE);
	assert.equal(p.available(), true);
});

test("available(): unparseable URL is unusable", () => {
	const p = makeProvider({ ...BASE, baseURL: "not a url" });
	assert.equal(p.available(), false);
});

test("available(): probed-absent key is honest even when enabled", async () => {
	const p = makeProvider({ ...BASE, apiKey: undefined, resolveApiKey: async () => undefined });
	assert.equal(p.keyPresence, "unknown");
	await p.prime();
	assert.equal(p.keyPresence, "no");
	assert.equal(p.available(), false);
});

test("available(): unknown stays optimistic until a probe lands", async () => {
	const p = makeProvider({ ...BASE, apiKey: undefined, resolveApiKey: async () => undefined });
	assert.equal(p.available(), true);
});

test("search(): disabled provider throws the settings-disabled error", async () => {
	const p = makeProvider({ ...BASE, enabled: false });
	await assert.rejects(p.search({ query: "x" }), /disabled by its settings/);
});

test("search(): empty resolution throws CREDENTIAL_MISSING", async () => {
	let sawFetch = false;
	const original = globalThis.fetch;
	globalThis.fetch = async () => {
		sawFetch = true;
		throw new Error("fetch must not run");
	};
	try {
		const p = makeProvider({ enabled: true, baseURL: "https://api.exa.ai", resolveApiKey: async () => undefined });
		await assert.rejects(p.search({ query: "x" }), /WEB_PROVIDER_CREDENTIAL_MISSING|no API key/u);
		assert.equal(sawFetch, false);
	} finally {
		globalThis.fetch = original;
	}
});

test("search(): maps sources, dedupes urls, clamps numResults, normalizes baseURL", async () => {
	let captured;
	const original = globalThis.fetch;
	globalThis.fetch = async (url, init) => {
		captured = { url: String(url), body: JSON.parse(init.body) };
		return {
			ok: true,
			json: async () => ({
				results: [
					{ url: "https://a.example/", title: "A", text: "  hello world  ", publishedDate: "2026-01-02" },
					{ url: "https://a.example/", title: "dup ignored" },
					{ url: "https://b.example/", highlights: ["h1", 3, "h2"] }
				]
			})
		};
	};
	try {
		const p = makeProvider(BASE);
		const result = await p.search({ query: "q", maxResults: 99 }, undefined);
		assert.equal(captured.url, "https://api.exa.ai/search");
		assert.equal(captured.body.numResults, 10);
		assert.equal(result.truncated, false);
		assert.deepEqual(result.sources.map((s) => s.url), ["https://a.example/", "https://b.example/"]);
		assert.equal(result.sources[0].title, "A");
		assert.equal(result.sources[0].snippet, "hello world");
		assert.equal(result.sources[0].publishedAt, "2026-01-02");
		assert.equal(result.sources[1].snippet, "h1 … h2");
	} finally {
		globalThis.fetch = original;
	}
});

test("search(): HTTP error surfaces the Exa body message", async () => {
	const original = globalThis.fetch;
	globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "rate limited" } }) });
	try {
		const p = makeProvider(BASE);
		await assert.rejects(p.search({ query: "x" }), /rate limited/u);
	} finally {
		globalThis.fetch = original;
	}
});

test("search(): pre-aborted caller surfaces WEB_ABORTED", async () => {
	const abortController = new AbortController();
	abortController.abort();
	const p = makeProvider(BASE);
	await assert.rejects(p.search({ query: "x" }, abortController.signal), /aborted/u);
});

test("search(): response without results[] throws the stable provider error", async () => {
	const original = globalThis.fetch;
	globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
	try {
		const p = makeProvider(BASE);
		await assert.rejects(p.search({ query: "x" }), /no results\[\] array/u);
	} finally {
		globalThis.fetch = original;
	}
});

test("prime(): transient probe failure keeps the optimistic unknown", async () => {
	const p = makeProvider({ ...BASE, apiKey: undefined, resolveApiKey: async () => { throw new Error("boom"); } });
	await p.prime();
	assert.equal(p.keyPresence, "unknown");
	assert.equal(p.available(), true);
});

test("search(): snippets beyond the local cap are truncated", async () => {
	const original = globalThis.fetch;
	globalThis.fetch = async () => ({
		ok: true,
		json: async () => ({ results: [{ url: "https://a.example/", title: "A", text: "x".repeat(2000) }] })
	});
	try {
		const p = makeProvider(BASE);
		const result = await p.search({ query: "q" });
		assert.equal(result.sources[0].snippet.length, 800);
	} finally {
		globalThis.fetch = original;
	}
});

test("search(): zero maxResults falls back to the configured default", async () => {
	let captured;
	const original = globalThis.fetch;
	globalThis.fetch = async (url, init) => {
		captured = JSON.parse(init.body);
		return { ok: true, json: async () => ({ results: [] }) };
	};
	try {
		const p = makeProvider({ ...BASE, numResults: 5 });
		await p.search({ query: "q", maxResults: 0 });
		assert.equal(captured.numResults, 5);
	} finally {
		globalThis.fetch = original;
	}
});

test("available(): an invalid key reference blocks availability without a literal key", () => {
	const p = makeProvider({ enabled: true, baseURL: "https://api.exa.ai", resolveApiKey: async () => "k", apiKeyEnvInvalid: true });
	assert.equal(p.available(), false);
});

test("available(): a literal key answers for an invalid stored reference", () => {
	const p = makeProvider({ ...BASE, apiKeyEnvInvalid: true });
	assert.equal(p.available(), true);
});

test("search(): an invalid key reference degrades to CREDENTIAL_MISSING, not a crash", async () => {
	const p = makeProvider({ enabled: true, baseURL: "https://api.exa.ai", apiKeyEnvInvalid: true });
	await assert.rejects(p.search({ query: "x" }), /not a valid environment-variable name|WEB_PROVIDER_CREDENTIAL_MISSING/u);
});

test("search(): failing credential resolution surfaces a provider error", async () => {
	const original = globalThis.fetch;
	globalThis.fetch = async () => { throw new Error("fetch must not run"); };
	try {
		const p = makeProvider({ enabled: true, baseURL: "https://api.exa.ai", resolveApiKey: async () => { throw new Error("vault down"); } });
		await assert.rejects(p.search({ query: "x" }), /credential resolution failed/u);
	} finally {
		globalThis.fetch = original;
	}
});

test("available(): anonymous mode is usable with a reachable MCP base and no key", () => {
	const p = makeProvider({ enabled: true, mcpBaseURL: "https://mcp.exa.ai/mcp", resolveApiKey: async () => undefined, allowAnonymous: true });
	assert.equal(p.available(), true);
});

test("available(): anonymous mode is unusable when the MCP base is unparseable", () => {
	const p = makeProvider({ enabled: true, mcpBaseURL: "not a url", allowAnonymous: true });
	assert.equal(p.available(), false);
});

test("available(): anonymous mode ignores an invalid key reference", () => {
	const p = makeProvider({ enabled: true, mcpBaseURL: "https://mcp.exa.ai/mcp", apiKeyEnvInvalid: true, allowAnonymous: true });
	assert.equal(p.available(), true);
});

/** Stub an anonymous MCP server: initialize returns a session, tools/call returns text. */
function stubMcpServer(toolText) {
	const calls = [];
	globalThis.fetch = async (url, init) => {
		const body = JSON.parse(init.body);
		calls.push(body.method);
		if (body.method === "initialize") {
			return {
				ok: true,
				status: 200,
				headers: { get: (name) => (name.toLowerCase() === "mcp-session-id" ? "sess-1" : null) },
				text: async () => 'event: message\ndata: {"result":{"protocolVersion":"2025-06-18","serverInfo":{"name":"exa-search-server"}},"jsonrpc":"2.0","id":1}\n\n'
			};
		}
		return {
			ok: true,
			status: 200,
			headers: { get: () => null },
			text: async () => `event: message\ndata: ${JSON.stringify({ result: { content: [{ type: "text", text: toolText }] }, jsonrpc: "2.0", id: 2 })}\n\n`
		};
	};
	return calls;
}

test("search(): anonymous mode calls the MCP initialize + web_search_exa tool", async () => {
	const toolText = [
		"Title: Example A",
		"URL: https://a.example/",
		"Published: 2026-01-02T00:00:00.000Z",
		"Author: N/A",
		"Highlights:",
		"Some snippet text here."
	].join("\n");
	const original = globalThis.fetch;
	let calls;
	try {
		calls = stubMcpServer(toolText);
		const p = makeProvider({ enabled: true, mcpBaseURL: "https://mcp.exa.ai/mcp", allowAnonymous: true });
		const result = await p.search({ query: "q" });
		assert.deepEqual(calls, ["initialize", "tools/call"]);
		assert.equal(result.sources.length, 1);
		assert.equal(result.sources[0].url, "https://a.example/");
		assert.equal(result.sources[0].title, "Example A");
		assert.equal(result.sources[0].publishedAt, "2026-01-02T00:00:00.000Z");
		assert.equal(result.sources[0].snippet, "Some snippet text here.");
	} finally {
		globalThis.fetch = original;
	}
});

test("search(): anonymous mode passes query and clamped numResults to the tool", async () => {
	const original = globalThis.fetch;
	let sent;
	try {
		globalThis.fetch = async (url, init) => {
			const body = JSON.parse(init.body);
			if (body.method === "initialize") return { ok: true, status: 200, headers: { get: () => "s" }, text: async () => 'data: {"result":{},"id":1}' };
			sent = body.params.arguments;
			return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'data: {"result":{"content":[]},"id":2}' };
		};
		const p = makeProvider({ enabled: true, mcpBaseURL: "https://mcp.exa.ai/mcp", numResults: 5, allowAnonymous: true });
		await p.search({ query: "hello world", maxResults: 99 });
		assert.deepEqual(sent, { query: "hello world", numResults: 10 });
	} finally {
		globalThis.fetch = original;
	}
});

test("search(): anonymous mode maps multiple results and dedupes by url", async () => {
	const toolText = [
		"Title: First",
		"URL: https://a.example/",
		"Published: N/A",
		"Author: N/A",
		"Highlights:",
		"first body",
		"---",
		"still first block (table separator must not split)",
		"",
		"Title: Duplicate url",
		"URL: https://a.example/",
		"Highlights:",
		"dup ignored",
		"Title: Second",
		"URL: https://b.example/",
		"Published: 2025-05-05",
		"Highlights:",
		"second body"
	].join("\n");
	const original = globalThis.fetch;
	try {
		stubMcpServer(toolText);
		const p = makeProvider({ enabled: true, mcpBaseURL: "https://mcp.exa.ai/mcp", allowAnonymous: true });
		const result = await p.search({ query: "q" });
		assert.deepEqual(result.sources.map((s) => s.url), ["https://a.example/", "https://b.example/"]);
		assert.equal(result.sources[0].title, "First");
		assert.match(result.sources[0].snippet, /still first block/);
		assert.equal(result.sources[0].publishedAt, undefined);
		assert.equal(result.sources[1].publishedAt, "2025-05-05");
	} finally {
		globalThis.fetch = original;
	}
});

test("search(): anonymous MCP tool error surfaces a provider error", async () => {
	const original = globalThis.fetch;
	try {
		globalThis.fetch = async (url, init) => {
			const body = JSON.parse(init.body);
			if (body.method === "initialize") return { ok: true, status: 200, headers: { get: () => "s" }, text: async () => 'data: {"result":{},"id":1}' };
			return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'data: {"error":{"message":"tool exploded"},"id":2}' };
		};
		const p = makeProvider({ enabled: true, mcpBaseURL: "https://mcp.exa.ai/mcp", allowAnonymous: true });
		await assert.rejects(p.search({ query: "q" }), /tool exploded|WEB_PROVIDER_ERROR/u);
	} finally {
		globalThis.fetch = original;
	}
});
