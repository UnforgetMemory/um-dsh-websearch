import test from "node:test";
import assert from "node:assert/strict";
import * as pkg from "../lib/index.js";

/** Fresh Exa provider over one fixed options snapshot, shaped as the flat options `resolveOptions` returns. */
function makeProvider(options) {
	return new pkg.ExaSearchProvider(() => ({ ...options }));
}

const BASE = { enabled: true, baseURL: "https://api.exa.ai", mcpBaseURL: "https://mcp.exa.ai/mcp", apiKey: "k", resolveApiKey: async () => "k" };

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

// ---- Fallback chain: helpers and cases ----

/** Stub fetch by transport; `rest` receives `(callIndex, body)`, `mcp` `(method, headers)`. */
function stubRoutes({ rest, mcp }) {
	const calls = { rest: 0, mcp: [] };
	globalThis.fetch = async (url, init) => {
		const parsed = JSON.parse(init.body);
		if (String(url).includes("/search")) {
			calls.rest += 1;
			return rest(calls.rest, parsed);
		}
		calls.mcp.push(parsed.method);
		return mcp(parsed.method, init.headers);
	};
	return calls;
}

/** One REST round-trip: ok/error JSON body for one status. */
function restRoundTrip(status, body) {
	return () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

/** One anonymous MCP server: initialize succeeds (or fails at `initStatus`); tools/call yields an error or text. */
function mcpRoundTrip({ error, toolText, initStatus }) {
	return (method) => {
		if (method === "initialize") {
			if (initStatus !== void 0) return { ok: initStatus >= 200 && initStatus < 300, status: initStatus, headers: { get: () => null }, text: async () => "" };
			return {
				ok: true,
				status: 200,
				headers: { get: (name) => (String(name).toLowerCase() === "mcp-session-id" ? "sess-1" : null) },
				text: async () => 'event: message\ndata: {"result":{"protocolVersion":"2025-06-18","serverInfo":{"name":"exa-search-server"}},"jsonrpc":"2.0","id":1}\n\n'
			};
		}
		const payload = error !== void 0 ? { error, jsonrpc: "2.0", id: 2 } : { result: { content: [{ type: "text", text: toolText }] }, jsonrpc: "2.0", id: 2 };
		return { ok: true, status: 200, headers: { get: () => null }, text: async () => `event: message\ndata: ${JSON.stringify(payload)}\n\n` };
	};
}

const ANON_TOOL_TEXT = ["Title: Anonymous A", "URL: https://anon.example/", "Highlights:", "anonymous fallback body"].join("\n");

test("fallback: paid 401 degrades to anonymous and returns the MCP result", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(401, { error: { message: "invalid key" } }),
			mcp: mcpRoundTrip({ toolText: ANON_TOOL_TEXT })
		});
		const p = makeProvider({ ...BASE, fallbackToAnonymous: true });
		const result = await p.search({ query: "q" });
		assert.equal(calls.rest, 1);
		assert.deepEqual(calls.mcp, ["initialize", "tools/call"]);
		assert.equal(result.sources.length, 1);
		assert.equal(result.sources[0].url, "https://anon.example/");
		assert.equal(result.sources[0].snippet, "anonymous fallback body");
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: paid rate limit (429) degrades to anonymous", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(429, { error: { message: "rate limited" } }),
			mcp: mcpRoundTrip({ toolText: ANON_TOOL_TEXT })
		});
		const p = makeProvider({ ...BASE, fallbackToAnonymous: true });
		const result = await p.search({ query: "q" });
		assert.equal(calls.rest, 1);
		assert.deepEqual(calls.mcp, ["initialize", "tools/call"]);
		assert.equal(result.sources[0].url, "https://anon.example/");
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: paid server error (500) degrades to anonymous", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(500, { error: { message: "internal error" } }),
			mcp: mcpRoundTrip({ toolText: ANON_TOOL_TEXT })
		});
		const p = makeProvider({ ...BASE, fallbackToAnonymous: true });
		const result = await p.search({ query: "q" });
		assert.deepEqual(calls.mcp, ["initialize", "tools/call"]);
		assert.equal(result.sources[0].url, "https://anon.example/");
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: paid 400 (client error) does not degrade", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(400, { error: { message: "bad query" } }),
			mcp: mcpRoundTrip({ toolText: ANON_TOOL_TEXT })
		});
		const p = makeProvider({ ...BASE, fallbackToAnonymous: true });
		await assert.rejects(p.search({ query: "q" }), /bad query/u);
		assert.equal(calls.mcp.length, 0);
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: paid rejection with the switch off keeps the hard error", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(401, { error: { message: "invalid key" } }),
			mcp: mcpRoundTrip({ toolText: ANON_TOOL_TEXT })
		});
		const p = makeProvider(BASE); // fallbackToAnonymous defaults to false
		await assert.rejects(p.search({ query: "q" }), /invalid key/u);
		assert.equal(calls.mcp.length, 0);
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: paid rejection with an unconfigured anonymous base surfaces the primary error", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(401, { error: { message: "invalid key" } }),
			mcp: mcpRoundTrip({ toolText: ANON_TOOL_TEXT })
		});
		const p = makeProvider({ ...BASE, fallbackToAnonymous: true, mcpBaseURL: "not a url" });
		await assert.rejects(p.search({ query: "q" }), /invalid key/u);
		assert.equal(calls.mcp.length, 0);
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: anonymous tool rejection degrades to paid REST", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(200, { results: [{ url: "https://paid.example/", title: "Paid" }] }),
			mcp: mcpRoundTrip({ error: { message: "quota exceeded" } })
		});
		const p = makeProvider({ ...BASE, allowAnonymous: true, fallbackToPaid: true });
		const result = await p.search({ query: "q" });
		assert.deepEqual(calls.mcp, ["initialize", "tools/call"]);
		assert.equal(calls.rest, 1);
		assert.equal(result.sources.length, 1);
		assert.equal(result.sources[0].url, "https://paid.example/");
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: anonymous initialize HTTP failure degrades to paid REST", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(200, { results: [{ url: "https://paid.example/", title: "Paid" }] }),
			mcp: mcpRoundTrip({ initStatus: 503 })
		});
		const p = makeProvider({ ...BASE, allowAnonymous: true, fallbackToPaid: true });
		const result = await p.search({ query: "q" });
		assert.deepEqual(calls.mcp, ["initialize"]);
		assert.equal(calls.rest, 1);
		assert.equal(result.sources[0].url, "https://paid.example/");
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: anonymous rejection with the switch off keeps the hard error", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(200, { results: [{ url: "https://paid.example/" }] }),
			mcp: mcpRoundTrip({ error: { message: "quota exceeded" } })
		});
		const p = makeProvider({ enabled: true, mcpBaseURL: "https://mcp.exa.ai/mcp", allowAnonymous: true });
		await assert.rejects(p.search({ query: "q" }), /quota exceeded|WEB_PROVIDER_ERROR/u);
		assert.equal(calls.rest, 0);
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: anonymous rejection with no paid key surfaces a combined error", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(200, { results: [] }),
			mcp: mcpRoundTrip({ error: { message: "quota exceeded" } })
		});
		const p = makeProvider({ enabled: true, baseURL: "https://api.exa.ai", mcpBaseURL: "https://mcp.exa.ai/mcp", allowAnonymous: true, fallbackToPaid: true, resolveApiKey: async () => undefined });
		const err = await p.search({ query: "q" }).then(() => null, (e) => e);
		assert.ok(err !== null, "search must reject");
		assert.match(err.message, /both transports/u);
		assert.match(err.message, /quota exceeded/u);
		assert.match(err.message, /no API key/u);
		assert.deepEqual(calls.mcp, ["initialize", "tools/call"]);
		assert.equal(calls.rest, 0, "the credential gap blocks the REST call before any fetch");
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: a probed-absent key short-circuits the paid fallback (primary error surfaces)", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(200, { results: [] }),
			mcp: mcpRoundTrip({ error: { message: "quota exceeded" } })
		});
		const p = makeProvider({ enabled: true, baseURL: "https://api.exa.ai", mcpBaseURL: "https://mcp.exa.ai/mcp", allowAnonymous: true, fallbackToPaid: true, resolveApiKey: async () => undefined });
		await p.prime(); // keyPresence converges to "no" before the search
		assert.equal(p.keyPresence, "no");
		await assert.rejects(p.search({ query: "q" }), /quota exceeded/u);
		assert.equal(calls.rest, 0);
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: a pre-aborted primary never degrades", async () => {
	const original = globalThis.fetch;
	try {
		let fetches = 0;
		globalThis.fetch = async () => {
			fetches += 1;
			throw new Error("fetch must not run");
		};
		const p = makeProvider({ ...BASE, fallbackToAnonymous: true });
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(p.search({ query: "x" }, controller.signal), /aborted/u);
		assert.equal(fetches, 0);
	} finally {
		globalThis.fetch = original;
	}
});

test("available(): paid plane unusable is still usable via an enabled anonymous fallback", async () => {
	const p = makeProvider({ enabled: true, baseURL: "https://api.exa.ai", mcpBaseURL: "https://mcp.exa.ai/mcp", apiKey: undefined, resolveApiKey: async () => undefined, fallbackToAnonymous: true });
	await p.prime();
	assert.equal(p.keyPresence, "no");
	assert.equal(p.available(), true);
});

test("available(): paid plane unusable without the fallback flag stays unusable", async () => {
	const p = makeProvider({ enabled: true, baseURL: "https://api.exa.ai", mcpBaseURL: "https://mcp.exa.ai/mcp", apiKey: undefined, resolveApiKey: async () => undefined });
	await p.prime();
	assert.equal(p.available(), false);
});

test("available(): anonymous plane unusable is usable via an enabled paid fallback", () => {
	const p = makeProvider({ enabled: true, mcpBaseURL: "not a url", baseURL: "https://api.exa.ai", apiKey: "k", allowAnonymous: true, fallbackToPaid: true });
	assert.equal(p.available(), true);
});

test("available(): anonymous plane unusable without the paid fallback stays unusable", () => {
	const p = makeProvider({ enabled: true, mcpBaseURL: "not a url", baseURL: "https://api.exa.ai", apiKey: "k", allowAnonymous: true });
	assert.equal(p.available(), false);
});

test("prime(): anonymous primary probes the key plane only when a paid fallback is enabled", async () => {
	const withFallback = makeProvider({ enabled: true, mcpBaseURL: "https://mcp.exa.ai/mcp", allowAnonymous: true, fallbackToPaid: true, resolveApiKey: async () => undefined });
	await withFallback.prime();
	assert.equal(withFallback.keyPresence, "no");
	const without = makeProvider({ enabled: true, mcpBaseURL: "https://mcp.exa.ai/mcp", allowAnonymous: true, resolveApiKey: async () => undefined });
	await without.prime();
	assert.equal(without.keyPresence, "unknown");
});

test("fallback: paid primary succeeds with fallback on does not touch anonymous", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(200, { results: [{ url: "https://paid.example/", title: "Paid" }] }),
			mcp: () => { throw new Error("MCP must not be called"); }
		});
		const p = makeProvider({ ...BASE, fallbackToAnonymous: true });
		const result = await p.search({ query: "hello" });
		assert.equal(calls.rest, 1);
		assert.equal(calls.mcp.length, 0);
		assert.equal(result.sources[0].url, "https://paid.example/");
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: anonymous primary succeeds with fallback on does not touch paid", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: () => { throw new Error("REST must not be called"); },
			mcp: mcpRoundTrip({ toolText: ["Title: Anon", "URL: https://anon.example/", "Highlights:", "anon body"].join("\n") })
		});
		const p = makeProvider({ ...BASE, allowAnonymous: true, fallbackToPaid: true });
		const result = await p.search({ query: "hello" });
		assert.deepEqual(calls.mcp, ["initialize", "tools/call"]);
		assert.equal(calls.rest, 0);
		assert.equal(result.sources[0].url, "https://anon.example/");
	} finally {
		globalThis.fetch = original;
	}
});

test("fallback: both transports server-reject produce a combined error", async () => {
	const original = globalThis.fetch;
	try {
		const calls = stubRoutes({
			rest: restRoundTrip(401, { error: { message: "invalid key" } }),
			mcp: mcpRoundTrip({ error: { message: "anonymous quota exceeded" } })
		});
		const p = makeProvider({ ...BASE, fallbackToAnonymous: true });
		const err = await p.search({ query: "q" }).then(() => null, (e) => e);
		assert.ok(err !== null, "search must reject");
		assert.match(err.message, /both transports/u);
		assert.match(err.message, /invalid key/u);
		assert.match(err.message, /anonymous quota exceeded/u);
		assert.equal(calls.rest, 1);
		assert.deepEqual(calls.mcp, ["initialize", "tools/call"]);
	} finally {
		globalThis.fetch = original;
	}
});

// ---- Parallel + strategy suite (0.4.0) ----

const PARALLEL = {
	enabled: true, parallelBaseURL: "https://api.parallel.ai", parallelMcpBaseURL: "https://search.parallel.ai/mcp",
	apiKey: "k", parallelApiKey: "pk", parallelNumResults: 10, parallelMode: "fast"
};

/** Apply the umbrella provider for one fixed config, capturing the live stubs. */
function applyWithConfig(config, creds = {}) {
	const ctx = {
		get: (name) => name === "credentials" ? { resolve: async (ref) => creds[ref] ?? undefined } : void 0,
		inject: () => {},
		on: () => {},
		web: { registerSearchProvider: () => {} }
	};
	const registered = [];
	ctx.web.registerSearchProvider = (p) => registered.push(p);
	pkg.apply(ctx, config);
	return { providers: registered, creds };
}

test("config: new strategy + parallel keys default to safe values", () => {
	const defaults = pkg.Config({});
	assert.equal(defaults.enabled, false);
	assert.equal(defaults.preferred, "exa");
	assert.equal(defaults.exaEnabled, true);
	assert.equal(defaults.parallelEnabled, false);
	assert.equal(defaults.parallelAllowAnonymous, false);
	assert.equal(defaults.parallelFallbackToPaid, false);
	assert.equal(defaults.parallelFallbackToAnonymous, false);
	assert.equal(defaults.parallelApiKeyEnv, "PARALLEL_API_KEY");
	assert.equal(defaults.parallelBaseURL, "https://api.parallel.ai");
	assert.equal(defaults.parallelMcpBaseURL, "https://search.parallel.ai/mcp");
	assert.equal(defaults.parallelNumResults, 10);
	assert.equal(defaults.parallelMode, "fast");
	// Existing Exa keys keep their exact defaults.
	assert.equal(defaults.apiKeyEnv, "EXA_API_KEY");
	assert.equal(defaults.baseURL, "https://api.exa.ai");
	assert.equal(defaults.numResults, 5);
	assert.equal(defaults.searchType, "auto");
});

test("config: invalid preferred/mode fall back to defaults at resolve time", () => {
	const ctx = { get: () => undefined, inject: () => {}, on: () => {}, web: { registerSearchProvider: () => {} } };
	const captured = [];
	ctx.web.registerSearchProvider = (p) => captured.push(p);
	// Schema accepts any string; the resolver is what falls invalid values back to defaults.
	pkg.apply(ctx, { enabled: false, preferred: "turbo", parallelMode: "keyword" });
	assert.equal(captured.length, 2);
	const umbrella = captured.find((p) => p.id === "um-web-search");
	assert.ok(umbrella);
	assert.equal(umbrella.primaryName, "exa");
});

test("parallel REST: request body shape, max_results clamp 1..20, mode", async () => {
	const original = globalThis.fetch;
	let captured;
	const config = { enabled: true, preferred: "parallel", exaEnabled: true, parallelEnabled: true, ...PARALLEL };
	try {
		globalThis.fetch = async (url, init) => {
			captured = { url: String(url), body: JSON.parse(init.body), key: init.headers["x-api-key"] };
			return { ok: true, json: async () => ({ results: [] }) };
		};
		const { providers } = applyWithConfig(config);
		const p = providers.find((x) => x.id === "um-web-search");
		await p.search({ query: "hello", maxResults: 99 });
		assert.equal(captured.url, "https://api.parallel.ai/v1/search");
		assert.deepEqual(captured.body.search_queries, ["hello"]);
		assert.equal(captured.body.objective, "hello");
		assert.equal(captured.body.mode, "fast");
		assert.deepEqual(captured.body.advanced_settings.max_results, 20);
		assert.equal(captured.body.advanced_settings.excerpt_settings.max_chars_per_result, 700);
		assert.equal(captured.key, "pk");
		await p.search({ query: "q", maxResults: 0 });
		assert.equal(captured.body.advanced_settings.max_results, 10);
	} finally { globalThis.fetch = original; }
});

test("parallel REST: maps excerpts, publish_date, dedupes url, truncates snippet", async () => {
	const original = globalThis.fetch;
	try {
		globalThis.fetch = async () => ({
			ok: true,
			json: async () => ({
				search_id: "s1",
				results: [
					{ url: "https://p1.example/", title: "P1", publish_date: "2025-07-07", excerpts: ["first part", "second part"] },
					{ url: "https://p1.example/", title: "dup" },
					{ url: "https://p2.example/", title: null, excerpts: [Array(1600).join("x")] }
				]
			})
		});
		const { providers } = applyWithConfig({ enabled: true, preferred: "parallel", parallelEnabled: true, ...PARALLEL });
		const result = await providers.find((x) => x.id === "um-web-search").search({ query: "q" });
		assert.equal(result.truncated, false);
		assert.deepEqual(result.sources.map((s) => s.url), ["https://p1.example/", "https://p2.example/"]);
		assert.equal(result.sources[0].title, "P1");
		assert.equal(result.sources[0].snippet, "first part … second part");
		assert.equal(result.sources[0].publishedAt, "2025-07-07");
		assert.equal(result.sources[1].title, undefined);
		assert.equal(result.sources[1].snippet.length, 800);
	} finally { globalThis.fetch = original; }
});

test("parallel REST: error message extracted from error.message", async () => {
	const original = globalThis.fetch;
	try {
		globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ type: "error", error: { ref_id: "r", message: "bad key" } }) });
		const { providers } = applyWithConfig({ enabled: true, preferred: "parallel", parallelEnabled: true, ...PARALLEL });
		await assert.rejects(providers.find((x) => x.id === "um-web-search").search({ query: "q" }), /bad key/u);
	} finally { globalThis.fetch = original; }
});

test("parallel anonymous MCP: parses JSON V1SearchResponse payload through the shared mapper", async () => {
	const original = globalThis.fetch;
	let initCall = 0, callBody;
	const payload = JSON.stringify({
		search_id: "m1",
		results: [
			{ url: "https://m1.example/", title: "McP1", publish_date: "2025-08-08", excerpts: ["mcp snippet"] },
			{ url: "https://m1.example/", title: "dup" },
			{ url: "https://m2.example/", excerpts: ["a", "b"] }
		]
	});
	try {
		globalThis.fetch = async (url, init) => {
			const body = JSON.parse(init.body);
			if (body.method === "initialize") {
				initCall += 1;
				return { ok: true, status: 200, headers: { get: () => "msess" }, text: async () => 'data: {"result":{"protocolVersion":"2025-06-18"},"id":1}' };
			}
			if (body.method === "notifications/initialized") return { ok: true, status: 200, headers: { get: () => null }, text: async () => "" };
			callBody = body.params.arguments;
			return { ok: true, status: 200, headers: { get: () => null }, text: async () => `data: ${JSON.stringify({ result: { content: [{ type: "text", text: payload }] }, id: 2 })}` };
		};
		const { providers } = applyWithConfig({ enabled: true, preferred: "parallel", parallelEnabled: true, parallelAllowAnonymous: true, ...PARALLEL });
		const p = providers.find((x) => x.id === "um-web-search");
		const result = await p.search({ query: "q", maxResults: 99 });
		assert.equal(initCall, 1);
		assert.deepEqual(callBody.search_queries, ["q"]);
		assert.equal(callBody.objective, "q");
		assert.equal(callBody.numResults, undefined, "MCP path ignores parallelNumResults");
		assert.equal(result.sources.length, 2);
		assert.equal(result.sources[0].url, "https://m1.example/");
		assert.equal(result.sources[0].publishedAt, "2025-08-08");
		assert.equal(result.sources[0].snippet, "mcp snippet");
		assert.equal(result.sources[1].snippet, "a … b");
	} finally { globalThis.fetch = original; }
});

test("parallel anonymous MCP: session_id is a stable <=100-char id per activation", async () => {
	const original = globalThis.fetch;
	let sessionArg;
	try {
		globalThis.fetch = async (url, init) => {
			const body = JSON.parse(init.body);
			if (body.method === "initialize") return { ok: true, status: 200, headers: { get: () => "msess" }, text: async () => 'data: {"result":{},"id":1}' };
			if (body.method === "notifications/initialized") return { ok: true, status: 200, headers: { get: () => null }, text: async () => "" };
			sessionArg = body.params.arguments.session_id;
			return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'data: {"result":{"content":[]},"id":2}' };
		};
		const { providers } = applyWithConfig({ enabled: true, preferred: "parallel", parallelEnabled: true, parallelAllowAnonymous: true, ...PARALLEL });
		const p = providers.find((x) => x.id === "um-web-search");
		await p.search({ query: "q" });
		assert.ok(typeof sessionArg === "string" && sessionArg.length > 0 && sessionArg.length <= 100);
	} finally { globalThis.fetch = original; }
});

test("parallel anonymous MCP: no key header is ever sent", async () => {
	const original = globalThis.fetch;
	let sawKey = false;
	try {
		globalThis.fetch = async (url, init) => {
			sawKey = init.headers["x-api-key"] !== undefined || init.headers.authorization !== undefined;
			const body = JSON.parse(init.body);
			if (body.method === "initialize") return { ok: true, status: 200, headers: { get: () => "msess" }, text: async () => 'data: {"result":{},"id":1}' };
			if (body.method === "notifications/initialized") return { ok: true, status: 200, headers: { get: () => null }, text: async () => "" };
			return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'data: {"result":{"content":[]},"id":2}' };
		};
		const { providers } = applyWithConfig({ enabled: true, preferred: "parallel", parallelEnabled: true, parallelAllowAnonymous: true, ...PARALLEL });
		await providers.find((x) => x.id === "um-web-search").search({ query: "q" });
		assert.equal(sawKey, false);
	} finally { globalThis.fetch = original; }
});

/** Parallel REST round-trip by status. */
function parallelRestStatus(status, body) {
	return () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}
function parallelOk() {
	return { ok: true, status: 200, json: async () => ({ results: [{ url: "https://exa.example/", title: "Exa" }] }) };
}

test("parallel REST: degradable server statuses (401/403/429/500) mark the error degradable", async () => {
	const original = globalThis.fetch;
	for (const status of [401, 403, 429, 500]) {
		let calledSecondary = false;
		globalThis.fetch = async (url) => {
			if (String(url).includes("parallel")) return parallelRestStatus(status, { type: "error", error: { message: `err-${status}` } })();
			calledSecondary = true;
			return parallelOk();
		};
		try {
			const { providers } = applyWithConfig({
				enabled: true, preferred: "parallel", exaEnabled: true, parallelEnabled: true,
				...PARALLEL
			});
			const p = providers.find((x) => x.id === "um-web-search");
			const result = await p.search({ query: "q" });
			assert.equal(calledSecondary, true, `status ${status} must degrade to secondary`);
			assert.equal(result.sources[0].url, "https://exa.example/");
		} finally { globalThis.fetch = original; }
	}
});

test("parallel REST: HTTP 422 (validation) is NOT degradable", async () => {
	const original = globalThis.fetch;
	let calledSecondary = false;
	try {
		globalThis.fetch = async (url) => {
			if (String(url).includes("parallel")) return parallelRestStatus(422, { type: "error", error: { message: "validation failed" } })();
			calledSecondary = true;
			return parallelOk();
		};
		const { providers } = applyWithConfig({
			enabled: true, preferred: "parallel", exaEnabled: true, parallelEnabled: true,
			...PARALLEL, apiKey: undefined, resolveApiKey: async () => "pk"
		});
		await assert.rejects(providers.find((x) => x.id === "um-web-search").search({ query: "q" }), /validation failed/u);
		assert.equal(calledSecondary, false);
	} finally { globalThis.fetch = original; }
});

test("strategy: cross-backend degrade boundary - abort never degrades", async () => {
	const original = globalThis.fetch;
	let fetches = 0;
	try {
		globalThis.fetch = async () => { fetches += 1; throw new Error("fetch must not run"); };
		const { providers } = applyWithConfig({ enabled: true, preferred: "parallel", exaEnabled: true, parallelEnabled: true, ...PARALLEL });
		const ctrl = new AbortController(); ctrl.abort();
		await assert.rejects(providers.find((x) => x.id === "um-web-search").search({ query: "q" }, ctrl.signal), /aborted/u);
		assert.equal(fetches, 0);
	} finally { globalThis.fetch = original; }
});

test("strategy: cross-backend degrade boundary - credential missing never degrades", async () => {
	const original = globalThis.fetch;
	let fetches = 0;
	try {
		globalThis.fetch = async () => { fetches += 1; throw new Error("fetch must not run"); };
		const { providers } = applyWithConfig({
			enabled: true, preferred: "parallel", exaEnabled: true, parallelEnabled: true,
			...PARALLEL, parallelApiKey: undefined
		});
		await assert.rejects(providers.find((x) => x.id === "um-web-search").search({ query: "q" }), /no API key|WEB_PROVIDER_CREDENTIAL_MISSING/u);
		assert.equal(fetches, 0);
	} finally { globalThis.fetch = original; }
});

test("strategy: cross-backend degrade boundary - contract error never degrades", async () => {
	const original = globalThis.fetch;
	let calledSecondary = false;
	try {
		globalThis.fetch = async (url) => {
			if (String(url).includes("parallel")) return { ok: true, status: 200, json: async () => ({}) }; // no results[]
			calledSecondary = true; return parallelOk();
		};
		const { providers } = applyWithConfig({ enabled: true, preferred: "parallel", exaEnabled: true, parallelEnabled: true, ...PARALLEL });
		await assert.rejects(providers.find((x) => x.id === "um-web-search").search({ query: "q" }), /no results\[\] array/u);
		assert.equal(calledSecondary, false);
	} finally { globalThis.fetch = original; }
});

test("strategy: both backends server-reject produce a combined error", async () => {
	const original = globalThis.fetch;
	try {
		globalThis.fetch = async (url) => {
			if (String(url).includes("parallel")) return parallelRestStatus(401, { type: "error", error: { message: "parallel bad key" } })();
			return { ok: false, status: 403, json: async () => ({ error: { message: "exa forbidden" } }) };
		};
		const { providers } = applyWithConfig({
			enabled: true, preferred: "parallel", exaEnabled: true, parallelEnabled: true,
			...PARALLEL
		});
		const err = await providers.find((x) => x.id === "um-web-search").search({ query: "q" }).then(() => null, (e) => e);
		assert.ok(err !== null);
		assert.equal(err.code, "WEB_PROVIDER_ERROR");
		assert.match(err.message, /preferred/);
		assert.match(err.message, /parallel bad key/u);
		assert.match(err.message, /exa forbidden/u);
		assert.equal(err.cause && err.cause.message, "exa forbidden");
	} finally { globalThis.fetch = original; }
});

test("strategy: available() matrix over master/preferred/exaEnabled/parallelEnabled", async () => {
	// Master off -> always unavailable.
	assert.equal(applyWithConfig({ enabled: false, exaEnabled: true, parallelEnabled: true }).providers[0].available(), false);
	// Preferred=exa, exa usable -> available.
	assert.equal(applyWithConfig({ enabled: true, preferred: "exa", exaEnabled: true, parallelEnabled: false, apiKey: "k" }).providers[0].available(), true);
	// Preferred=exa but exaEnabled off, parallel usable -> available (secondary carries it).
	assert.equal(applyWithConfig({ enabled: true, preferred: "exa", exaEnabled: false, parallelEnabled: true, ...PARALLEL }).providers[0].available(), true);
	// Preferred=parallel, parallel usable -> available.
	assert.equal(applyWithConfig({ enabled: true, preferred: "parallel", exaEnabled: false, parallelEnabled: true, ...PARALLEL }).providers[0].available(), true);
	// Preferred=parallel, parallel unusable (bad baseURL), exa unusable (disabled) -> unavailable.
	assert.equal(applyWithConfig({ enabled: true, preferred: "parallel", exaEnabled: false, parallelEnabled: true, ...PARALLEL, parallelBaseURL: "not a url" }).providers[0].available(), false);
	// Preferred=parallel, parallel unusable, but exa enabled and usable -> available.
	assert.equal(applyWithConfig({ enabled: true, preferred: "parallel", exaEnabled: true, parallelEnabled: true, ...PARALLEL, parallelBaseURL: "not a url", apiKey: "k" }).providers[0].available(), true);
});

test("strategy: prime() probes each enabled backend's paid plane per its fallback", async () => {
	const { providers, creds } = applyWithConfig({
		enabled: true, preferred: "exa", exaEnabled: true, parallelEnabled: true,
		apiKey: undefined,
		parallelApiKey: undefined,
		parallelFallbackToPaid: true
	}, { EXA_API_KEY: { value: "ek" }, PARALLEL_API_KEY: { value: "pk" } });
	const p = providers.find((x) => x.id === "um-web-search");
	assert.equal(p.backends.exa.keyPresence, "unknown");
	assert.equal(p.backends.parallel.keyPresence, "unknown");
	await p.prime();
	assert.equal(p.backends.parallel.keyPresence, "yes");
});

test("strategy: credentials/reference-updated re-primes when either backend's ref changes", async () => {
	const { providers } = applyWithConfig({
		enabled: true, preferred: "parallel", parallelEnabled: true,
		apiKey: undefined,
		parallelApiKey: undefined,
		parallelApiKeyEnv: "PARALLEL_API_KEY"
	}, { PARALLEL_API_KEY: { value: "pk" } });
	const p = providers.find((x) => x.id === "um-web-search");
	await p.prime();
	assert.equal(p.backends.parallel.keyPresence, "yes");
});

test("strategy: legacy 'exa' alias is registered and shares the umbrella's behavior", () => {
	const { providers } = applyWithConfig({ enabled: true, preferred: "exa", exaEnabled: true, apiKey: "k" });
	const ids = providers.map((p) => p.id);
	assert.ok(ids.includes("um-web-search"));
	assert.ok(ids.includes("exa"));
	const alias = providers.find((p) => p.id === "exa");
	assert.equal(alias.available(), true);
});

test("strategy: preferred=parallel routes the search to the parallel backend first", async () => {
	const original = globalThis.fetch;
	let hitUrl;
	try {
		globalThis.fetch = async (url, init) => {
			hitUrl = String(url);
			return { ok: true, json: async () => ({ results: [{ url: "https://p.example/", title: "P" }] }) };
		};
		const { providers } = applyWithConfig({ enabled: true, preferred: "parallel", exaEnabled: true, parallelEnabled: true, ...PARALLEL });
		await providers.find((x) => x.id === "um-web-search").search({ query: "q" });
		assert.equal(hitUrl, "https://api.parallel.ai/v1/search");
	} finally { globalThis.fetch = original; }
});

// ---- P5 review regression cases (strategy hot-config + boundary honesty) ----

test("strategy: a preferred flip takes effect on the next search", async () => {
	const original = globalThis.fetch;
	const hits = [];
	try {
		globalThis.fetch = async (url) => {
			hits.push(String(url));
			return { ok: true, status: 200, json: async () => ({ results: [] }) };
		};
		// The settings-absent fallback keeps the entry object live, so an
		// in-place mutation is exactly what a Settings edit delivers.
		const config = { enabled: true, preferred: "exa", exaEnabled: true, parallelEnabled: true, ...PARALLEL };
		const { providers } = applyWithConfig(config);
		const p = providers.find((x) => x.id === "um-web-search");
		await p.search({ query: "q" });
		assert.equal(hits[0], "https://api.exa.ai/search");
		config.preferred = "parallel";
		await p.search({ query: "q" });
		assert.equal(hits[1], "https://api.parallel.ai/v1/search");
	} finally { globalThis.fetch = original; }
});

test("strategy: a disabled preferred backend is skipped on search", async () => {
	const original = globalThis.fetch;
	const hits = [];
	try {
		globalThis.fetch = async (url) => {
			hits.push(String(url));
			return { ok: true, status: 200, json: async () => ({ results: [] }) };
		};
		const { providers } = applyWithConfig({ enabled: true, preferred: "exa", exaEnabled: false, parallelEnabled: true, ...PARALLEL });
		const p = providers.find((x) => x.id === "um-web-search");
		const result = await p.search({ query: "q" });
		assert.deepEqual(hits, ["https://api.parallel.ai/v1/search"]);
		assert.equal(result.truncated, false);
	} finally { globalThis.fetch = original; }
});

test("strategy: available() ignores a disabled backend even when its transport looks configured", () => {
	// Preferred backend disabled, secondary's REST base unparseable ->
	// unavailable, even though the disabled backend carries a literal key
	// (canUse is configuration-only; availability must consult the enable flag).
	const { providers } = applyWithConfig({ enabled: true, preferred: "exa", exaEnabled: false, parallelEnabled: true, ...PARALLEL, parallelBaseURL: "not a url", apiKey: "k" });
	assert.equal(providers.find((x) => x.id === "um-web-search").available(), false);
});

test("strategy: available() honors the preferred backend's own fallback chain", () => {
	// Exa paid plane disqualified (invalid key reference) but the anonymous
	// fallback is switched on and parseable -> the chain is usable.
	const { providers } = applyWithConfig({ enabled: true, preferred: "exa", exaEnabled: true, apiKeyEnv: "not a name", fallbackToAnonymous: true, parallelEnabled: false });
	assert.equal(providers.find((x) => x.id === "um-web-search").available(), true);
});

test("config: a raw composition entry without the 0.4.0 keys keeps the exa backend enabled", () => {
	// Settings-absent fallback: the entry object is all resolveOptions ever
	// sees, and default-true keys must survive its absence of the new keys.
	const { providers } = applyWithConfig({ enabled: true, apiKey: "k" });
	const umbrella = providers.find((x) => x.id === "um-web-search");
	assert.equal(umbrella.resolveOptions().backends.exa.enabled, true);
	assert.equal(umbrella.resolveOptions().backends.parallel.enabled, false);
	assert.equal(umbrella.available(), true);
});

test("parallel anonymous MCP: an unparseable JSON payload surfaces WEB_PROVIDER_ERROR", async () => {
	const original = globalThis.fetch;
	try {
		globalThis.fetch = async (url, init) => {
			const body = JSON.parse(init.body);
			if (body.method === "initialize") return { ok: true, status: 200, headers: { get: () => "msess" }, text: async () => 'data: {"result":{},"id":1}' };
			if (body.method === "notifications/initialized") return { ok: true, status: 200, headers: { get: () => null }, text: async () => "" };
			return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'data: {"result":{"content":[{"type":"text","text":"not json at all"}]},"id":2}' };
		};
		const { providers } = applyWithConfig({ enabled: true, preferred: "parallel", parallelEnabled: true, parallelAllowAnonymous: true, ...PARALLEL });
		const err = await providers.find((x) => x.id === "um-web-search").search({ query: "q" }).then(() => null, (e) => e);
		assert.ok(err !== null);
		assert.equal(err.code, "WEB_PROVIDER_ERROR");
		assert.match(err.message, /unprocessable payload/u);
	} finally { globalThis.fetch = original; }
});

test("parallel anonymous MCP: plain-JSON bodies (the real Parallel framing) parse end-to-end", async () => {
	const original = globalThis.fetch;
	let callBody;
	try {
		globalThis.fetch = async (url, init) => {
			const body = JSON.parse(init.body);
			if (body.method === "initialize") return { ok: true, status: 200, headers: { get: () => "msess" }, text: async () => '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}' };
			if (body.method === "notifications/initialized") return { ok: true, status: 202, headers: { get: () => null }, text: async () => "" };
			callBody = body;
			return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: JSON.stringify({ search_id: "s1", results: [{ url: "https://m1.example/", title: "M1", publish_date: "2025-08-08", excerpts: ["mcp snippet"] }], session_id: "sess" }) }] } }) };
		};
		const { providers } = applyWithConfig({ enabled: true, preferred: "parallel", parallelEnabled: true, parallelAllowAnonymous: true, ...PARALLEL });
		const result = await providers.find((x) => x.id === "um-web-search").search({ query: "q" });
		assert.equal(callBody.method, "tools/call");
		assert.equal(callBody.params.name, "web_search");
		assert.equal(result.sources[0].url, "https://m1.example/");
		assert.equal(result.sources[0].snippet, "mcp snippet");
	} finally { globalThis.fetch = original; }
});

