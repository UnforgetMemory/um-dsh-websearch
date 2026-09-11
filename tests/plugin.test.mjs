import test from "node:test";
import assert from "node:assert/strict";
import * as pkg from "../lib/index.js";

// ---- test harness --------------------------------------------------------

/** One new-model Exa provider entry (paid primary, one UM_WS_ key). */
function exaEntry(overrides = {}) {
	return {
		id: "exa", name: "Exa", enabled: true, primaryTier: "paid",
		paid: { enabled: true, baseURL: "https://api.exa.ai" },
		free: { enabled: false, baseURL: "https://mcp.exa.ai/mcp" },
		keys: [{ ref: pkg.UM_WS_EXA_API_KEY, enabled: true, allowFreeToPaid: false, allowPaidToFree: false }],
		keysStrategy: "ordered", numResults: 5, params: { searchType: "auto" },
		...overrides
	};
}
/** One new-model Parallel provider entry. */
function parallelEntry(overrides = {}) {
	return {
		id: "parallel", name: "Parallel", enabled: true, primaryTier: "paid",
		paid: { enabled: true, baseURL: "https://api.parallel.ai" },
		free: { enabled: false, baseURL: "https://search.parallel.ai/mcp" },
		keys: [{ ref: pkg.UM_WS_PARALLEL_API_KEY, enabled: true, allowFreeToPaid: false, allowPaidToFree: false }],
		keysStrategy: "ordered", numResults: 10, params: { mode: "fast" },
		...overrides
	};
}
/** Mock context: credentials store, event capture, provider capture. */
function makeCtx(creds = {}) {
	const events = new Map();
	const ctx = {
		get: (name) => name === "credentials" ? {
			resolve: async (ref) => creds[ref] ?? void 0,
			set: async (ref, value) => { creds[ref] = { value }; },
			unset: async (ref) => { delete creds[ref]; }
		} : void 0,
		inject: () => {},
		on: (name, handler) => { events.set(name, handler); },
		web: { registerSearchProvider: () => {} }
	};
	const registered = [];
	ctx.web.registerSearchProvider = (provider) => registered.push(provider);
	return { ctx, registered, events, creds };
}
/** An umbrella over one fixed config, wired to a mock credential store. */
function makeUmbrella(config, creds = {}) {
	const harness = makeCtx(creds);
	const umbrella = new pkg.UmWebSearchProvider(() => pkg.resolveOptions(harness.ctx, config));
	return { ...harness, umbrella };
}
/** Apply the plugin for one fixed config; returns the registered providers. */
function applyWithConfig(config, creds = {}) {
	const harness = makeCtx(creds);
	pkg.apply(harness.ctx, config);
	return harness;
}
const withFetch = async (mock, run) => {
	const original = globalThis.fetch;
	globalThis.fetch = mock;
	try {
		return await run();
	} finally {
		globalThis.fetch = original;
	}
};
const jsonOk = (body) => ({ ok: true, status: 200, json: async () => body });
const jsonReject = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) });
/** Parallel REST success payload. */
const parallelResults = (urls) => jsonOk({ results: urls.map((url, i) => ({ url, title: `P${i}`, excerpts: [`snippet ${i}`] })) });
/** Exa REST success payload. */
const exaResults = (results) => jsonOk({ results });

// ---- config defaults + lenient enums ------------------------------------

test("config: new-model defaults are safe (master off, 3 builtin providers)", () => {
	const value = pkg.Config({});
	assert.equal(value.enabled, false);
	assert.equal(value.defaultProvider, "exa");
	assert.equal(value.concurrency, 1);
	assert.equal(value.cache.enabled, false);
	assert.equal(value.cache.ttlSeconds, 60);
	assert.equal(value.providers.length, 3);
	assert.deepEqual(value.providers.map((p) => p.id), ["exa", "parallel", "deepseek"]);
	assert.equal(value.providers[0].enabled, true);
	assert.equal(value.providers[1].enabled, false);
	assert.equal(value.providers[2].enabled, false);
});

test("config: provider/key defaults resolve for sparse entries", () => {
	const value = pkg.Config({ providers: [{ id: "exa" }] });
	assert.equal(value.providers[0].enabled, true);
	assert.equal(value.providers[0].primaryTier, "free");
	assert.equal(value.providers[0].paid.enabled, false);
	assert.equal(value.providers[0].free.enabled, false);
	assert.deepEqual(value.providers[0].keys, []);
});

test("config: lenient enum strings survive resolution; runtime normalizes them", () => {
	// A hand-edited invalid enum value must not fail the section resolve.
	const value = pkg.Config({ providers: [{ id: "exa", primaryTier: "turbo", keysStrategy: "weird" }] });
	assert.equal(value.providers[0].primaryTier, "turbo");
	assert.equal(value.providers[0].keysStrategy, "weird");
	// The runtime projection normalizes both back to defaults.
	const opts = pkg.resolveOptions(makeCtx().ctx, value);
	assert.equal(opts.providers[0].primaryTier, "free");
	assert.equal(opts.providers[0].keysStrategy, "ordered");
});

test("config: invalid numeric ranges are rejected by the schema", () => {
	assert.throws(() => pkg.Config({ concurrency: 0 }));
	assert.throws(() => pkg.Config({ concurrency: 9 }));
	assert.throws(() => pkg.Config({ cache: { ttlSeconds: 0 } }));
});

test("validateConfig: duplicate provider ids are rejected", () => {
	assert.throws(() => pkg.validateConfig(pkg.Config({ providers: [exaEntry(), { ...exaEntry(), id: "exa" }] })), /duplicate provider id "exa"/u);
});

test("validateConfig: empty provider id is rejected", () => {
	assert.throws(() => pkg.validateConfig(pkg.Config({ providers: [{ id: "  " }] })), /non-empty id/u);
});

test("validateConfig: duplicate key references inside one provider are rejected", () => {
	const entry = exaEntry();
	entry.keys = [
		{ ref: "UM_WS_EXA_API_KEY", enabled: true, allowFreeToPaid: false, allowPaidToFree: false },
		{ ref: "UM_WS_EXA_API_KEY", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }
	];
	assert.throws(() => pkg.validateConfig(pkg.Config({ providers: [entry] })), /repeats the key reference/u);
});

test("validateConfig: defaultProvider must name a configured provider", () => {
	assert.throws(() => pkg.validateConfig(pkg.Config({ defaultProvider: "brave" })), /does not name a configured provider/u);
	assert.doesNotThrow(() => pkg.validateConfig(pkg.Config({ defaultProvider: "exa" })));
});

// ---- legacy zero-storage migration --------------------------------------

test("legacy: flat keys synthesize providers, preferred routes the order", () => {
	const legacy = {
		enabled: true, preferred: "parallel", exaEnabled: true, parallelEnabled: true,
		allowAnonymous: false, fallbackToAnonymous: true, fallbackToPaid: false,
		apiKeyEnv: "EXA_API_KEY", baseURL: "https://api.exa.ai", mcpBaseURL: "https://mcp.exa.ai/mcp",
		numResults: 7, searchType: "neural",
		parallelAllowAnonymous: true, parallelFallbackToPaid: true, parallelFallbackToAnonymous: false,
		parallelApiKeyEnv: "PARALLEL_API_KEY", parallelBaseURL: "https://api.parallel.ai",
		parallelMcpBaseURL: "https://search.parallel.ai/mcp", parallelNumResults: 12, parallelMode: "basic"
	};
	const { umbrella } = makeUmbrella(legacy);
	const opts = umbrella.resolveOptions();
	assert.equal(opts.defaultProvider, "parallel");
	assert.equal(opts.enabled, true);
	const exa = opts.providers.find((p) => p.id === "exa");
	assert.equal(exa.enabled, true);
	assert.equal(exa.primaryTier, "paid");
	assert.equal(exa.paid.enabled, true);
	assert.equal(exa.free.enabled, true); // fallbackToAnonymous
	assert.equal(exa.numResults, 7);
	assert.equal(exa.params.searchType, "neural");
	assert.equal(exa.keys[0].ref, pkg.UM_WS_EXA_API_KEY); // legacy default remapped
	assert.equal(exa.keys[0].allowPaidToFree, true);
	assert.equal(exa.keys[0].allowFreeToPaid, false);
	const parallel = opts.providers.find((p) => p.id === "parallel");
	assert.equal(parallel.enabled, true);
	assert.equal(parallel.primaryTier, "free");
	assert.equal(parallel.free.enabled, true);
	assert.equal(parallel.paid.enabled, true); // fallbackToPaid
	assert.equal(parallel.numResults, 12);
	assert.equal(parallel.params.mode, "basic");
	assert.equal(parallel.keys[0].ref, pkg.UM_WS_PARALLEL_API_KEY);
	assert.equal(parallel.keys[0].allowFreeToPaid, true);
	assert.ok(opts.providers.some((p) => p.id === "deepseek" && p.enabled === false));
});

test("legacy: custom credential references survive the remap untouched", () => {
	const opts = pkg.resolveOptions(makeCtx().ctx, { enabled: true, preferred: "exa", exaEnabled: true, allowAnonymous: false, apiKeyEnv: "MY_EXA_KEY" });
	assert.equal(opts.providers.find((p) => p.id === "exa").keys[0].ref, "MY_EXA_KEY");
});

test("legacy: new-model providers win when no legacy keys survive", () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry({ enabled: false })] };
	const opts = pkg.resolveOptions(makeCtx().ctx, config);
	assert.equal(opts.providers.length, 2);
	assert.equal(opts.defaultProvider, "exa");
});

test("legacy: no legacy keys and no providers falls back to the builtin trio", () => {
	const opts = pkg.resolveOptions(makeCtx().ctx, { enabled: true });
	assert.deepEqual(opts.providers.map((p) => p.id), ["exa", "parallel", "deepseek"]);
	assert.equal(opts.defaultProvider, "exa");
});

test("resolveOptions: invalid concurrency/ttl clamp defensively", () => {
	const opts = pkg.resolveOptions(makeCtx().ctx, { enabled: true, concurrency: "many", cache: { enabled: true, ttlSeconds: -5 } });
	assert.equal(opts.concurrency, 1);
	assert.equal(opts.ttlSeconds, 60);
});

test("resolveOptions: unknown provider ids are dropped", () => {
	const opts = pkg.resolveOptions(makeCtx().ctx, { enabled: true, providers: [exaEntry(), { id: "brave", name: "Brave", enabled: true, paid: { enabled: true, baseURL: "https://api.brave.com" }, free: { enabled: false, baseURL: "" }, keys: [], keysStrategy: "ordered", numResults: 5, params: {} }] });
	assert.deepEqual(opts.providers.map((p) => p.id), ["exa"]);
});

// ---- availability matrix -------------------------------------------------

test("available(): master switch off is unavailable regardless of providers", () => {
	const { umbrella } = makeUmbrella({ enabled: false, providers: [exaEntry()] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	assert.equal(umbrella.available(), false);
});

test("available(): enabled provider with a usable paid tier is available (unknown optimistic)", () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry()] });
	assert.equal(umbrella.available(), true);
});

test("available(): probed-absent key turns availability off honestly", async () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry()] }, {});
	await umbrella.prime();
	assert.equal(umbrella.keyPresence.get(pkg.UM_WS_EXA_API_KEY), "no");
	assert.equal(umbrella.available(), false);
});

test("available(): unparseable base URL is unusable", () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry({ paid: { enabled: true, baseURL: "not a url" } })] });
	assert.equal(umbrella.available(), false);
});

test("available(): invalid key reference disqualifies the paid tier but free fallback may carry it", () => {
	const entry = exaEntry();
	entry.keys[0].ref = "not a name";
	entry.free.enabled = true;
	entry.keys[0].allowPaidToFree = true;
	entry.primaryTier = "paid";
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] });
	// paid disqual, free switched on and parseable -> chain usable
	assert.equal(umbrella.available(), true);
});

test("available(): disabled provider never contributes even when configured", () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry({ enabled: false })] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	assert.equal(umbrella.available(), false);
});

test("available(): deepseek's free tier is forced off even when enabled in config", () => {
	const config = { enabled: true, providers: [{
		id: "deepseek", name: "DeepSeek Official", enabled: true, primaryTier: "free",
		paid: { enabled: false, baseURL: "https://api.deepseek.com/anthropic/v1" },
		free: { enabled: true, baseURL: "https://mcp.example" },
		keys: [], keysStrategy: "ordered", numResults: 5, params: {}
	}] };
	const opts = pkg.resolveOptions(makeCtx().ctx, config);
	assert.equal(opts.providers[0].free.enabled, false);
});

// ---- sequential paid search (Exa invariants) -----------------------------

test("search(): maps sources, dedupes urls, clamps numResults, normalizes baseURL", async () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry()] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	const result = await withFetch(async (url, init) => {
		assert.equal(String(url), "https://api.exa.ai/search");
		assert.equal(JSON.parse(init.body).numResults, 10);
		return exaResults([
			{ url: "https://a.example/", title: "A", text: "  hello world  ", publishedDate: "2026-01-02" },
			{ url: "https://a.example/", title: "dup ignored" },
			{ url: "https://b.example/", highlights: ["h1", 3, "h2"] }
		]);
	}, () => umbrella.search({ query: "q", maxResults: 99 }));
	assert.equal(result.truncated, false);
	assert.deepEqual(result.sources.map((s) => s.url), ["https://a.example/", "https://b.example/"]);
	assert.equal(result.sources[0].title, "A");
	assert.equal(result.sources[0].snippet, "hello world");
	assert.equal(result.sources[0].publishedAt, "2026-01-02");
	assert.equal(result.sources[1].snippet, "h1 … h2");
});

test("search(): HTTP error surfaces the Exa body message and marks degradable statuses", async () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry()] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	const error = await withFetch(async () => jsonReject(429, "rate limited"), () => umbrella.search({ query: "x" }).then(() => null, (e) => e));
	assert.match(error.message, /rate limited/u);
	assert.equal(error.code, "WEB_PROVIDER_ERROR");
	assert.equal(error._degradable, true);
	assert.equal(error.degradedStatus, 429);
});

test("search(): pre-aborted caller surfaces WEB_ABORTED without a fetch", async () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry()] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	const ctrl = new AbortController();
	ctrl.abort();
	let fetched = 0;
	const error = await withFetch(async () => { fetched += 1; throw new Error("must not run"); }, () => umbrella.search({ query: "x" }, ctrl.signal).then(() => null, (e) => e));
	assert.equal(error.code, "WEB_ABORTED");
	assert.equal(fetched, 0);
});

test("search(): response without results[] throws the stable provider error", async () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry()] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	await withFetch(async () => jsonOk({}), async () => {
		await assert.rejects(umbrella.search({ query: "x" }), /no results\[\] array/u);
	});
});

test("search(): empty credential resolution throws CREDENTIAL_MISSING before any fetch", async () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry()] }, {});
	let fetched = 0;
	await withFetch(async () => { fetched += 1; throw new Error("must not run"); }, async () => {
		await assert.rejects(umbrella.search({ query: "x" }), /no API key for "UM_WS_EXA_API_KEY"|WEB_PROVIDER_CREDENTIAL_MISSING/u);
	});
	assert.equal(fetched, 0);
});

test("search(): an invalid stored key reference degrades to CREDENTIAL_MISSING, not a crash", async () => {
	const entry = exaEntry();
	entry.keys[0].ref = "not a name";
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] });
	await assert.rejects(umbrella.search({ query: "x" }), /not a valid environment-variable name|WEB_PROVIDER_CREDENTIAL_MISSING/u);
});

test("search(): failing credential resolution surfaces a provider error", async () => {
	const creds = { resolve: async () => { throw new Error("vault down"); }, set: async () => {} };
	const ctx = { get: (name) => name === "credentials" ? creds : void 0, inject: () => {}, on: () => {}, web: { registerSearchProvider: () => {} } };
	const umbrella = new pkg.UmWebSearchProvider(() => pkg.resolveOptions(ctx, { enabled: true, providers: [exaEntry()] }));
	await assert.rejects(umbrella.search({ query: "x" }), /credential resolution failed/u);
});

test("search(): snippets beyond the local cap are truncated", async () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry()] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	const result = await withFetch(async () => exaResults([{ url: "https://a.example/", title: "A", text: "x".repeat(2000) }]), () => umbrella.search({ query: "q" }));
	assert.equal(result.sources[0].snippet.length, 800);
});

test("search(): zero maxResults falls back to the configured default", async () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry()] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	await withFetch(async (url, init) => {
		assert.equal(JSON.parse(init.body).numResults, 5);
		return exaResults([]);
	}, () => umbrella.search({ query: "q", maxResults: 0 }));
});

test("search(): disabled umbrella throws the settings-disabled error", async () => {
	const { umbrella } = makeUmbrella({ enabled: false, providers: [exaEntry()] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	await assert.rejects(umbrella.search({ query: "x" }), /disabled by its settings/u);
});

test("prime(): transient probe failure keeps the optimistic unknown", async () => {
	const creds = { resolve: async () => { throw new Error("boom"); }, set: async () => {} };
	const ctx = { get: (name) => name === "credentials" ? creds : void 0, inject: () => {}, on: () => {}, web: { registerSearchProvider: () => {} } };
	const umbrella = new pkg.UmWebSearchProvider(() => pkg.resolveOptions(ctx, { enabled: true, providers: [exaEntry()] }));
	await umbrella.prime();
	assert.equal(umbrella.keyPresence.get(pkg.UM_WS_EXA_API_KEY), undefined);
	assert.equal(umbrella.available(), true);
});

// ---- feature 8: paid/free fallback gating --------------------------------

test("paid→free: server rejection degrades to free only when the last key's switch AND the free tier are on", async () => {
	const entry = exaEntry();
	entry.free.enabled = true;
	entry.keys[0].allowPaidToFree = true;
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	const calls = [];
	const result = await withFetch(async (url, init) => {
		calls.push(String(url));
		if (String(url).includes("/search")) return jsonReject(401, "bad key");
		const body = JSON.parse(init.body);
		if (body.method === "initialize") return { ok: true, status: 200, headers: { get: () => null }, text: async () => '{"jsonrpc":"2.0","id":1,"result":{}}' };
		return { ok: true, status: 200, headers: { get: () => null }, text: async () => '{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"Title: F\\nURL: https://f.example/\\n"}]}}' };
	}, () => umbrella.search({ query: "q" }));
	assert.equal(result.sources[0].url, "https://f.example/");
	assert.ok(calls.some((c) => c.includes("mcp.exa.ai")));
});

test("paid→free: switch on but free tier off means NO fallback (feature 8)", async () => {
	const entry = exaEntry();
	entry.free.enabled = false;
	entry.keys[0].allowPaidToFree = true;
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let mcpCalls = 0;
	await withFetch(async (url) => {
		if (String(url).includes("mcp")) mcpCalls += 1;
		return jsonReject(401, "bad key");
	}, async () => {
		await assert.rejects(umbrella.search({ query: "x" }), /bad key/u);
	});
	assert.equal(mcpCalls, 0);
});

test("paid→free: switch off blocks the free attempt entirely", async () => {
	const entry = exaEntry();
	entry.free.enabled = true;
	entry.keys[0].allowPaidToFree = false;
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let mcpCalls = 0;
	await withFetch(async (url) => {
		if (String(url).includes("mcp")) mcpCalls += 1;
		return jsonReject(401, "bad key");
	}, async () => {
		await assert.rejects(umbrella.search({ query: "x" }), /bad key/u);
	});
	assert.equal(mcpCalls, 0);
});

test("free→paid: anonymous rejection degrades to paid only via a key with the switch on", async () => {
	const entry = exaEntry();
	entry.primaryTier = "free";
	entry.free.enabled = true;
	entry.paid.enabled = true;
	entry.keys[0].allowFreeToPaid = true;
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	const result = await withFetch(async (url) => {
		if (String(url).includes("mcp.exa.ai")) return { ok: false, status: 503, json: async () => ({}) };
		return exaResults([{ url: "https://p.example/", title: "P" }]);
	}, () => umbrella.search({ query: "q" }));
	assert.equal(result.sources[0].url, "https://p.example/");
});

test("free→paid: no key carries the switch, so the failure is terminal (feature 8)", async () => {
	const entry = exaEntry();
	entry.primaryTier = "free";
	entry.free.enabled = true;
	entry.paid.enabled = true;
	entry.keys[0].allowFreeToPaid = false;
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let restCalls = 0;
	await withFetch(async (url) => {
		if (String(url).includes("/search")) restCalls += 1;
		return { ok: false, status: 503, json: async () => ({ error: { message: "mcp down" } }) };
	}, async () => {
		await assert.rejects(umbrella.search({ query: "x" }), /HTTP 503/u);
	});
	assert.equal(restCalls, 0);
});

test("free→paid: switch on but paid tier off means NO fallback (feature 8)", async () => {
	const entry = exaEntry();
	entry.primaryTier = "free";
	entry.free.enabled = true;
	entry.paid.enabled = false;
	entry.keys[0].allowFreeToPaid = true;
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let restCalls = 0;
	await withFetch(async (url) => {
		if (String(url).includes("/search")) restCalls += 1;
		return { ok: false, status: 503, json: async () => ({ error: { message: "mcp down" } }) };
	}, async () => {
		await assert.rejects(umbrella.search({ query: "x" }), /HTTP 503/u);
	});
	assert.equal(restCalls, 0);
});

// ---- feature 9: multi-key iteration --------------------------------------

test("ordered keys: a server rejection on K1 advances to K2", async () => {
	const entry = exaEntry();
	entry.keys = [
		{ ref: "UM_WS_KEY_ONE", enabled: true, allowFreeToPaid: false, allowPaidToFree: false },
		{ ref: "UM_WS_KEY_TWO", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }
	];
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { UM_WS_KEY_ONE: { value: "key-1" }, UM_WS_KEY_TWO: { value: "key-2" } });
	const headers = [];
	const result = await withFetch(async (url, init) => {
		headers.push(init.headers["x-api-key"]);
		if (init.headers["x-api-key"] === "key-1") return jsonReject(401, "K1 rejected");
		return exaResults([{ url: "https://k2.example/", title: "K2" }]);
	}, () => umbrella.search({ query: "q" }));
	assert.deepEqual(headers, ["key-1", "key-2"]);
	assert.equal(result.sources[0].url, "https://k2.example/");
});

test("random keys: the shuffle picks a different first key (deterministic stub)", async () => {
	const entry = exaEntry();
	entry.keysStrategy = "random";
	entry.keys = [
		{ ref: "UM_WS_KEY_ONE", enabled: true, allowFreeToPaid: false, allowPaidToFree: false },
		{ ref: "UM_WS_KEY_TWO", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }
	];
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { UM_WS_KEY_ONE: { value: "key-1" }, UM_WS_KEY_TWO: { value: "key-2" } });
	const originalRandom = Math.random;
	Math.random = () => 0; // Fisher-Yates with j=0 reverses the order: K2 first
	let firstKey;
	try {
		await withFetch(async (url, init) => {
			if (firstKey === undefined) firstKey = init.headers["x-api-key"];
			return exaResults([{ url: "https://x.example/" }]);
		}, () => umbrella.search({ query: "q" }));
	} finally {
		Math.random = originalRandom;
	}
	assert.equal(firstKey, "key-2");
});

test("disabled keys never participate in any strategy", async () => {
	const entry = exaEntry();
	entry.keys = [
		{ ref: "UM_WS_KEY_ONE", enabled: false, allowFreeToPaid: false, allowPaidToFree: false },
		{ ref: "UM_WS_KEY_TWO", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }
	];
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { UM_WS_KEY_ONE: { value: "key-1" }, UM_WS_KEY_TWO: { value: "key-2" } });
	const headers = [];
	await withFetch(async (url, init) => {
		headers.push(init.headers["x-api-key"]);
		return exaResults([]);
	}, () => umbrella.search({ query: "q" }));
	assert.deepEqual(headers, ["key-2"]);
});

// ---- cross-provider degrade boundaries ------------------------------------

test("cross-provider: a 403 on the head degrades to the next enabled provider", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const hits = [];
	const result = await withFetch(async (url) => {
		hits.push(String(url));
		if (String(url).includes("exa")) return jsonReject(403, "exa forbidden");
		return parallelResults(["https://p.example/"]);
	}, () => umbrella.search({ query: "q" }));
	assert.equal(result.sources[0].url, "https://p.example/");
	assert.deepEqual(hits, ["https://api.exa.ai/search", "https://api.parallel.ai/v1/search"]);
});

test("cross-provider: 400 (client error) never degrades", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	let parallelCalls = 0;
	await withFetch(async (url) => {
		if (String(url).includes("parallel")) parallelCalls += 1;
		return jsonReject(400, "exa validation");
	}, async () => {
		await assert.rejects(umbrella.search({ query: "q" }), /exa validation/u);
	});
	assert.equal(parallelCalls, 0);
});

test("cross-provider: abort never degrades", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const ctrl = new AbortController();
	ctrl.abort();
	let fetches = 0;
	await withFetch(async () => { fetches += 1; throw new Error("must not run"); }, async () => {
		await assert.rejects(umbrella.search({ query: "q" }, ctrl.signal), /aborted/u);
	});
	assert.equal(fetches, 0);
});

test("cross-provider: credential missing on the head never degrades", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	let fetches = 0;
	await withFetch(async () => { fetches += 1; throw new Error("must not run"); }, async () => {
		await assert.rejects(umbrella.search({ query: "q" }), /no API key/u);
	});
	assert.equal(fetches, 0);
});

test("cross-provider: a contract error on the head never degrades", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	let parallelCalls = 0;
	await withFetch(async (url) => {
		if (String(url).includes("parallel")) parallelCalls += 1;
		return jsonOk({});
	}, async () => {
		await assert.rejects(umbrella.search({ query: "q" }), /no results\[\] array/u);
	});
	assert.equal(parallelCalls, 0);
});

test("cross-provider: both providers server-reject produce a combined error", async () => {
	const config = { enabled: true, defaultProvider: "parallel", providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const error = await withFetch(async (url) => {
		if (String(url).includes("parallel")) return jsonReject(401, "parallel bad key");
		return jsonReject(403, "exa forbidden");
	}, () => umbrella.search({ query: "q" }).then(() => null, (e) => e));
	assert.equal(error.code, "WEB_PROVIDER_ERROR");
	assert.match(error.message, /parallel bad key/u);
	assert.match(error.message, /exa forbidden/u);
});

test("cross-provider: a disabled head provider is skipped on search", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry({ enabled: false }), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const hits = [];
	const result = await withFetch(async (url) => {
		hits.push(String(url));
		return parallelResults(["https://p.example/"]);
	}, () => umbrella.search({ query: "q" }));
	assert.deepEqual(hits, ["https://api.parallel.ai/v1/search"]);
	assert.equal(result.sources[0].url, "https://p.example/");
});

test("cross-provider: defaultProvider flip takes effect on the next search", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const hits = [];
	await withFetch(async (url) => {
		hits.push(String(url));
		return exaResults([]);
	}, async () => {
		await umbrella.search({ query: "q" });
		config.defaultProvider = "parallel";
		await umbrella.search({ query: "q" });
	});
	assert.equal(hits[0], "https://api.exa.ai/search");
	assert.equal(hits[1], "https://api.parallel.ai/v1/search");
});

// ---- alias + apply wiring --------------------------------------------------

test("apply: registers um-web-search plus the legacy exa alias, never deepseek-official", () => {
	const { registered } = applyWithConfig({ enabled: true, providers: [exaEntry()] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	assert.deepEqual(registered.map((p) => p.id).sort(), ["exa", "um-web-search"]);
});

test("apply: the legacy alias shares the umbrella's availability", () => {
	const { registered } = applyWithConfig({ enabled: true, providers: [exaEntry()] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	const alias = registered.find((p) => p.id === "exa");
	assert.equal(alias.available(), true);
});

test("apply: credentials/reference-updated re-primes participating refs", async () => {
	const creds = {};
	const { registered, events } = applyWithConfig({ enabled: true, providers: [exaEntry()] }, creds);
	const umbrella = registered.find((p) => p.id === "um-web-search");
	await umbrella.prime();
	assert.equal(umbrella.keyPresence.get(pkg.UM_WS_EXA_API_KEY), "no");
	creds[pkg.UM_WS_EXA_API_KEY] = { value: "k" };
	const handler = events.get("credentials/reference-updated");
	assert.equal(typeof handler, "function");
	handler(pkg.UM_WS_EXA_API_KEY);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(umbrella.keyPresence.get(pkg.UM_WS_EXA_API_KEY), "yes");
});

// ---- feature 7: concurrency fan-out ----------------------------------------

test("concurrent: fans out across providers and keys, merges with URL dedup", async () => {
	const entry = exaEntry();
	entry.keys = [
		{ ref: "UM_WS_KEY_ONE", enabled: true, allowFreeToPaid: false, allowPaidToFree: false },
		{ ref: "UM_WS_KEY_TWO", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }
	];
	const config = { enabled: true, defaultProvider: "exa", concurrency: 4, providers: [entry, parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { UM_WS_KEY_ONE: { value: "1" }, UM_WS_KEY_TWO: { value: "2" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const result = await withFetch(async (url, init) => {
		if (String(url).includes("parallel")) return parallelResults(["https://p.example/", "https://shared.example/"]);
		if (init.headers["x-api-key"] === "1") return exaResults([{ url: "https://k1.example/" }, { url: "https://shared.example/" }]);
		return exaResults([{ url: "https://k2.example/" }]);
	}, () => umbrella.search({ query: "q", maxResults: 8 }));
	assert.deepEqual(result.sources.map((s) => s.url), ["https://k1.example/", "https://shared.example/", "https://k2.example/", "https://p.example/"]);
	assert.equal(result.truncated, false);
});

test("concurrent: maxResults caps the merged result and marks truncation", async () => {
	const config = { enabled: true, defaultProvider: "exa", concurrency: 4, providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const result = await withFetch(async (url) => {
		if (String(url).includes("parallel")) return parallelResults(["https://p.example/"]);
		return exaResults([{ url: "https://a.example/" }, { url: "https://b.example/" }]);
	}, () => umbrella.search({ query: "q", maxResults: 2 }));
	assert.deepEqual(result.sources.map((s) => s.url), ["https://a.example/", "https://b.example/"]);
	assert.equal(result.truncated, true);
});

test("concurrent: one source's failure does not kill the others", async () => {
	const config = { enabled: true, defaultProvider: "exa", concurrency: 4, providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const result = await withFetch(async (url) => {
		if (String(url).includes("exa")) return jsonReject(401, "exa bad");
		return parallelResults(["https://p.example/"]);
	}, () => umbrella.search({ query: "q" }));
	assert.equal(result.sources[0].url, "https://p.example/");
});

test("concurrent: all sources failing produce a combined error", async () => {
	const config = { enabled: true, defaultProvider: "exa", concurrency: 4, providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const error = await withFetch(async (url) => {
		if (String(url).includes("parallel")) return jsonReject(503, "parallel down");
		return jsonReject(403, "exa forbidden");
	}, () => umbrella.search({ query: "q" }).then(() => null, (e) => e));
	assert.equal(error.code, "WEB_PROVIDER_ERROR");
	assert.match(error.message, /parallel down/u);
	assert.match(error.message, /exa forbidden/u);
});

test("concurrent: pre-aborted signal surfaces WEB_ABORTED with zero fetches", async () => {
	const config = { enabled: true, defaultProvider: "exa", concurrency: 4, providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const ctrl = new AbortController();
	ctrl.abort();
	let fetches = 0;
	await withFetch(async () => { fetches += 1; throw new Error("must not run"); }, async () => {
		await assert.rejects(umbrella.search({ query: "q" }, ctrl.signal), /aborted/u);
	});
	assert.equal(fetches, 0);
});

test("concurrent: the pool bounds in-flight requests to the concurrency limit", async () => {
	const entry = exaEntry();
	entry.keys = Array.from({ length: 6 }, (_, i) => ({ ref: `UM_WS_KEY_${i}`, enabled: true, allowFreeToPaid: false, allowPaidToFree: false }));
	const config = { enabled: true, defaultProvider: "exa", concurrency: 2, providers: [entry] };
	const creds = Object.fromEntries(entry.keys.map((k) => [k.ref, { value: `v-${k.ref}` }]));
	const { umbrella } = makeUmbrella(config, creds);
	let inFlight = 0;
	let peak = 0;
	await withFetch(async () => {
		inFlight += 1;
		peak = Math.max(peak, inFlight);
		await new Promise((resolve) => setTimeout(resolve, 5));
		inFlight -= 1;
		return exaResults([]);
	}, () => umbrella.search({ query: "q" }));
	assert.equal(peak, 2);
});

// ---- feature 6: TTL cache ----------------------------------------------------

test("cache: a second identical search is served from the cache without a fetch", async () => {
	const config = { enabled: true, providers: [exaEntry()], cache: { enabled: true, ttlSeconds: 60 } };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let fetches = 0;
	const first = await withFetch(async () => { fetches += 1; return exaResults([{ url: "https://a.example/" }]); }, () => umbrella.search({ query: "q" }));
	const second = await withFetch(async () => { fetches += 1; throw new Error("must not run"); }, () => umbrella.search({ query: "q" }));
	assert.equal(fetches, 1);
	assert.deepEqual(second, first);
});

test("cache: hits are detached — mutating a hit cannot poison the store", async () => {
	const config = { enabled: true, providers: [exaEntry()], cache: { enabled: true, ttlSeconds: 60 } };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	await withFetch(async () => exaResults([{ url: "https://a.example/", title: "original" }]), () => umbrella.search({ query: "q" }));
	const hit = await umbrella.search({ query: "q" });
	hit.sources[0].title = "mutated";
	const again = await umbrella.search({ query: "q" });
	assert.equal(again.sources[0].title, "original");
});

test("cache: an expired entry refetches", async () => {
	const config = { enabled: true, providers: [exaEntry()], cache: { enabled: true, ttlSeconds: 60 } };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let fetches = 0;
	await withFetch(async () => { fetches += 1; return exaResults([{ url: "https://a.example/" }]); }, () => umbrella.search({ query: "q" }));
	const opts = umbrella.resolveOptions();
	const key = umbrella.cacheFingerprint(opts, { query: "q", maxResults: undefined });
	umbrella.cache.get(key).expiresAt = Date.now() - 1;
	await withFetch(async () => { fetches += 1; return exaResults([{ url: "https://b.example/" }]); }, () => umbrella.search({ query: "q" }));
	assert.equal(fetches, 2);
});

test("cache: disabled means every search fetches", async () => {
	const config = { enabled: true, providers: [exaEntry()], cache: { enabled: false, ttlSeconds: 60 } };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let fetches = 0;
	await withFetch(async () => { fetches += 1; return exaResults([]); }, async () => {
		await umbrella.search({ query: "q" });
		await umbrella.search({ query: "q" });
	});
	assert.equal(fetches, 2);
});

test("cache: a config fingerprint change bypasses the cache", async () => {
	const config = { enabled: true, providers: [exaEntry()], cache: { enabled: true, ttlSeconds: 60 } };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let fetches = 0;
	await withFetch(async () => { fetches += 1; return exaResults([]); }, () => umbrella.search({ query: "q" }));
	config.providers[0].numResults = 10;
	await withFetch(async () => { fetches += 1; return exaResults([]); }, () => umbrella.search({ query: "q" }));
	assert.equal(fetches, 2);
});

test("cache: invalidateCache drops every entry", async () => {
	const config = { enabled: true, providers: [exaEntry()], cache: { enabled: true, ttlSeconds: 60 } };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let fetches = 0;
	await withFetch(async () => { fetches += 1; return exaResults([]); }, () => umbrella.search({ query: "q" }));
	umbrella.invalidateCache();
	await withFetch(async () => { fetches += 1; return exaResults([]); }, () => umbrella.search({ query: "q" }));
	assert.equal(fetches, 2);
});

test("cache: the store never exceeds the entry cap", async () => {
	const config = { enabled: true, providers: [exaEntry()], cache: { enabled: true, ttlSeconds: 60 } };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	await withFetch(async () => exaResults([]), async () => {
		for (let i = 0; i < 70; i++) await umbrella.search({ query: `q${i}` });
	});
	assert.ok(umbrella.cache.size <= 64);
});

// ---- feature 2: deepseek official wrapper ------------------------------------

const DEEPSEEK_ENTRY = () => ({
	id: "deepseek", name: "DeepSeek Official", enabled: true, primaryTier: "paid",
	paid: { enabled: true, baseURL: "https://api.deepseek.com/anthropic/v1" },
	free: { enabled: false, baseURL: "" },
	keys: [{ ref: pkg.UM_WS_DEEPSEEK_API_KEY, enabled: true, allowFreeToPaid: false, allowPaidToFree: false }],
	keysStrategy: "ordered", numResults: 5, params: { model: "deepseek-v4-flash", maxUses: 5 }
});

test("deepseek: the official wrapper maps web_search_tool_result blocks with citation snippets", async () => {
	const config = { enabled: true, providers: [DEEPSEEK_ENTRY()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_DEEPSEEK_API_KEY]: { value: "dk" } });
	const result = await withFetch(async (url, init) => {
		assert.equal(String(url), "https://api.deepseek.com/anthropic/v1/messages");
		assert.equal(init.headers["x-api-key"], "dk");
		return jsonOk({
			content: [
				{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://d.example/", title: "D", page_age: "2025-01-01" }] },
				{ type: "text", text: "prose", citations: [{ url: "https://d.example/", cited_text: "deep snippet" }] }
			]
		});
	}, () => umbrella.search({ query: "q" }));
	assert.equal(result.sources[0].url, "https://d.example/");
	assert.equal(result.sources[0].title, "D");
	assert.equal(result.sources[0].snippet, "deep snippet");
	assert.equal(result.sources[0].publishedAt, "2025-01-01");
});

test("deepseek: HTTP statuses recovered from the message keep degradable marking honest", async () => {
	const config = { enabled: true, defaultProvider: "deepseek", providers: [DEEPSEEK_ENTRY(), exaEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_DEEPSEEK_API_KEY]: { value: "dk" }, [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	// 429 → degradable → the exa provider serves.
	const result429 = await withFetch(async (url) => {
		if (String(url).includes("deepseek")) return { ok: false, status: 429, json: async () => ({ error: { message: "deepseek limited" } }) };
		return exaResults([{ url: "https://e.example/" }]);
	}, () => umbrella.search({ query: "q" }));
	assert.equal(result429.sources[0].url, "https://e.example/");
});

test("deepseek: 400 (client error) never degrades to the next provider", async () => {
	const config = { enabled: true, defaultProvider: "deepseek", providers: [DEEPSEEK_ENTRY(), exaEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_DEEPSEEK_API_KEY]: { value: "dk" }, [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let exaCalls = 0;
	// An empty error body keeps the official message shape "(HTTP 400)", which
	// the wrapper classifies with the standard status set → not degradable.
	await withFetch(async (url) => {
		if (String(url).includes("exa")) exaCalls += 1;
		return { ok: false, status: 400, json: async () => ({}) };
	}, async () => {
		await assert.rejects(umbrella.search({ query: "q" }), /HTTP 400/u);
	});
	assert.equal(exaCalls, 0);
});

test("deepseek: a missing credential surfaces OUR message and code before any fetch", async () => {
	const config = { enabled: true, providers: [DEEPSEEK_ENTRY()] };
	const { umbrella } = makeUmbrella(config, {});
	let fetches = 0;
	await withFetch(async () => { fetches += 1; throw new Error("must not run"); }, async () => {
		await assert.rejects(umbrella.search({ query: "q" }), /no API key for "UM_WS_DEEPSEEK_API_KEY"|WEB_PROVIDER_CREDENTIAL_MISSING/u);
	});
	assert.equal(fetches, 0);
});

// ---- feature 4: UM_WS_ credential migration ---------------------------------

test("umws: the one-time migration copies a legacy value into the empty UM_WS_ ref", async () => {
	const creds = {
		EXA_API_KEY: { value: "legacy-key" },
		PARALLEL_API_KEY: { value: "legacy-parallel" }
	};
	const ctx = {
		get: (name) => name === "credentials" ? {
			resolve: async (ref) => creds[ref] ?? void 0,
			set: async (ref, value) => { creds[ref] = { value }; },
			unset: async (ref) => { delete creds[ref]; }
		} : void 0
	};
	await pkg.migrateUmwsCredentials(ctx);
	assert.equal(creds[pkg.UM_WS_EXA_API_KEY].value, "legacy-key");
	assert.equal(creds[pkg.UM_WS_PARALLEL_API_KEY].value, "legacy-parallel");
	// The legacy references are NEVER deleted (collateral damage is forbidden).
	assert.equal(creds.EXA_API_KEY.value, "legacy-key");
	assert.equal(creds.PARALLEL_API_KEY.value, "legacy-parallel");
});

test("umws: a filled UM_WS_ ref is never overwritten", async () => {
	const creds = {
		EXA_API_KEY: { value: "legacy-key" },
		[pkg.UM_WS_EXA_API_KEY]: { value: "modern-key" }
	};
	const ctx = { get: (name) => name === "credentials" ? { resolve: async (ref) => creds[ref] ?? void 0, set: async (ref, value) => { creds[ref] = { value }; } } : void 0 };
	await pkg.migrateUmwsCredentials(ctx);
	assert.equal(creds[pkg.UM_WS_EXA_API_KEY].value, "modern-key");
});

test("umws: an absent legacy value migrates nothing", async () => {
	const creds = {};
	const ctx = { get: (name) => name === "credentials" ? { resolve: async () => void 0, set: async () => { throw new Error("must not run"); } } : void 0 };
	await pkg.migrateUmwsCredentials(ctx);
	assert.deepEqual(creds, {});
});

test("umws: a throwing store never breaks migration (best-effort)", async () => {
	const ctx = { get: (name) => name === "credentials" ? { resolve: async () => { throw new Error("store down"); }, set: async () => {} } : void 0 };
	await pkg.migrateUmwsCredentials(ctx); // must not throw
});

test("umws: legacy resolution during a search lazily copies and serves the value", async () => {
	// The user's store still only has EXA_API_KEY: a paid search resolves the
	// legacy alias, serves the key, and copies it into UM_WS_EXA_API_KEY.
	const creds = { EXA_API_KEY: { value: "legacy-key" } };
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry()] }, creds);
	await withFetch(async (url, init) => {
		assert.equal(init.headers["x-api-key"], "legacy-key");
		return exaResults([]);
	}, () => umbrella.search({ query: "q" }));
	assert.equal(creds[pkg.UM_WS_EXA_API_KEY].value, "legacy-key");
	assert.equal(creds.EXA_API_KEY.value, "legacy-key"); // never deleted
});

// ---- no-usable-source boundary ----------------------------------------------

test("boundary: no provider can serve → an honest no-source error", async () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry({ enabled: false })] });
	await assert.rejects(umbrella.search({ query: "q" }), /no usable source/u);
});
