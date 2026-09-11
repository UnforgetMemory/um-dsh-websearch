import test from "node:test";
import assert from "node:assert/strict";
import * as pkg from "../lib/index.js";

// Boundary-simulation suite (umreview P5 supplement): every edge from the
// ADR-0004 boundary table exercised through the public runtime surface.
// Self-contained harness mirroring tests/plugin.test.mjs.

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
function deepseekEntry(overrides = {}) {
	return {
		id: "deepseek", name: "DeepSeek Official", enabled: true, primaryTier: "paid",
		paid: { enabled: true, baseURL: "https://api.deepseek.com/anthropic/v1" },
		free: { enabled: false, baseURL: "" },
		keys: [{ ref: pkg.UM_WS_DEEPSEEK_API_KEY, enabled: true, allowFreeToPaid: false, allowPaidToFree: false }],
		keysStrategy: "ordered", numResults: 5, params: { model: "deepseek-v4-flash", maxUses: 5 },
		...overrides
	};
}
function makeUmbrella(config, creds = {}) {
	const ctx = {
		get: (name) => name === "credentials" ? {
			resolve: async (ref) => creds[ref] ?? void 0,
			set: async (ref, value) => { creds[ref] = { value }; }
		} : void 0,
		inject: () => {},
		on: () => {},
		web: { registerSearchProvider: () => {} }
	};
	const umbrella = new pkg.UmWebSearchProvider(() => pkg.resolveOptions(ctx, config));
	return { umbrella, creds };
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
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const reject = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) });
const exaOk = (urls) => ok({ results: urls.map((url) => ({ url })) });
const parallelOk = (urls) => ok({ results: urls.map((url) => ({ url, excerpts: ["s"] })) });
const mcpOk = (payload) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => payload });
const initOk = () => mcpOk('{"jsonrpc":"2.0","id":1,"result":{}}');
const toolOk = (text) => mcpOk(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text }] } }));
const settle = (promise) => promise.then(() => null, (e) => e);

// ---- config-surface boundaries -------------------------------------------

test("boundary: providers=[] is unavailable and searches honestly", async () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [] });
	assert.equal(umbrella.available(), false);
	await assert.rejects(umbrella.search({ query: "q" }), /no usable source/u);
});

test("boundary: an enabled provider whose only tier has no keys contributes nothing", () => {
	// paid tier on, keys=[], free off → empty chain → unavailable.
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry({ keys: [] })] });
	assert.equal(umbrella.available(), false);
});

test("boundary: primary tier unusable yields to the other tier when enabled", async () => {
	// paid primary with NO keys, free enabled → the free tier serves.
	const entry = exaEntry({ keys: [], free: { enabled: true, baseURL: "https://mcp.exa.ai/mcp" } });
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] });
	const result = await withFetch(async (url, init) => {
		const body = JSON.parse(init.body);
		if (body.method === "initialize") return initOk();
		return toolOk("Title: F\nURL: https://f.example/\n");
	}, () => umbrella.search({ query: "q" }));
	assert.equal(result.sources[0].url, "https://f.example/");
});

test("boundary: free primary with free tier off yields to the paid tier", async () => {
	const entry = exaEntry({ primaryTier: "free", free: { enabled: false, baseURL: "https://mcp.exa.ai/mcp" } });
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	const result = await withFetch(async (url) => exaOk(["https://p.example/"]), () => umbrella.search({ query: "q" }));
	assert.equal(result.sources[0].url, "https://p.example/");
});

test("boundary: invalid primaryTier/keysStrategy normalize to free/ordered", () => {
	const opts = pkg.resolveOptions({ get: () => void 0 }, { enabled: true, providers: [{ id: "exa", name: "Exa", enabled: true, primaryTier: "turbo", paid: { enabled: true, baseURL: "https://api.exa.ai" }, free: { enabled: false, baseURL: "https://mcp.exa.ai/mcp" }, keys: [], keysStrategy: "shuffle", numResults: 5, params: {} }] });
	assert.equal(opts.providers[0].primaryTier, "free");
	assert.equal(opts.providers[0].keysStrategy, "ordered");
});

test("boundary: deepseek's free tier stays off even when configured on", () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [deepseekEntry({ free: { enabled: true, baseURL: "https://mcp.example" } })] });
	const provider = umbrella.resolveOptions().providers[0];
	assert.equal(provider.free.enabled, false);
});

test("boundary: defaultProvider missing from providers falls back to the first", async () => {
	const config = { enabled: true, defaultProvider: "brave", providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let hit;
	await withFetch(async (url) => { hit = String(url); return exaOk([]); }, () => umbrella.search({ query: "q" }));
	assert.equal(hit, "https://api.exa.ai/search");
});

test("boundary: concurrency values clamp to 1..8 at resolve time", () => {
	const optsOf = (concurrency) => pkg.resolveOptions({ get: () => void 0 }, { enabled: true, concurrency, providers: [exaEntry()] });
	assert.equal(optsOf(0).concurrency, 1);
	assert.equal(optsOf(99).concurrency, 8);
	assert.equal(optsOf("many").concurrency, 1);
});

test("boundary: cache ttl clamps defensively to the default", () => {
	const opts = pkg.resolveOptions({ get: () => void 0 }, { enabled: true, cache: { enabled: true, ttlSeconds: "soon" }, providers: [exaEntry()] });
	assert.equal(opts.ttlSeconds, 60);
});

test("boundary: unknown provider ids are dropped without crashing the section", () => {
	const opts = pkg.resolveOptions({ get: () => void 0 }, { enabled: true, providers: [{ id: "brave", name: "Brave", enabled: true, primaryTier: "paid", paid: { enabled: true, baseURL: "https://x" }, free: { enabled: false, baseURL: "" }, keys: [], keysStrategy: "ordered", numResults: 5, params: {} }] });
	assert.equal(opts.providers.length, 0);
});

// ---- sequential-chain boundaries -------------------------------------------

test("chain: three providers degrade in order until one serves", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry(), deepseekEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" }, [pkg.UM_WS_DEEPSEEK_API_KEY]: { value: "dk" } });
	const hits = [];
	const result = await withFetch(async (url) => {
		hits.push(String(url));
		if (String(url).includes("exa")) return reject(401, "exa rejected");
		if (String(url).includes("parallel")) return reject(429, "parallel limited");
		return ok({ content: [{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://d.example/" }] }] });
	}, () => umbrella.search({ query: "q" }));
	assert.equal(result.sources[0].url, "https://d.example/");
	assert.equal(hits.length, 3);
});

test("chain: a mid-chain non-degradable 400 stops the chain — the tail never runs", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry(), deepseekEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" }, [pkg.UM_WS_DEEPSEEK_API_KEY]: { value: "dk" } });
	let tailCalls = 0;
	await withFetch(async (url) => {
		if (String(url).includes("deepseek")) tailCalls += 1;
		if (String(url).includes("exa")) return reject(401, "exa rejected");
		return reject(400, "parallel validation");
	}, async () => {
		await assert.rejects(umbrella.search({ query: "q" }), /parallel validation/u);
	});
	assert.equal(tailCalls, 0);
});

test("chain: a mid-chain network failure stops the chain", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry(), deepseekEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" }, [pkg.UM_WS_DEEPSEEK_API_KEY]: { value: "dk" } });
	let deepseekCalls = 0;
	await withFetch(async (url) => {
		if (String(url).includes("deepseek")) deepseekCalls += 1;
		if (String(url).includes("exa")) return reject(401, "exa rejected");
		throw new Error("network down"); // parallel's transport dies
	}, async () => {
		await assert.rejects(umbrella.search({ query: "q" }), /search request failed/u);
	});
	assert.equal(deepseekCalls, 0, "a network failure never degrades to the next provider");
});

test("chain: all providers failing produce a combined error naming each", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry(), deepseekEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" }, [pkg.UM_WS_DEEPSEEK_API_KEY]: { value: "dk" } });
	const error = await withFetch(async (url) => {
		if (String(url).includes("exa")) return reject(401, "exa down");
		if (String(url).includes("parallel")) return reject(503, "parallel down");
		return reject(500, "deepseek down");
	}, () => settle(umbrella.search({ query: "q" })));
	assert.match(error.message, /exa down/u);
	assert.match(error.message, /parallel down/u);
	assert.match(error.message, /deepseek down/u);
});

test("chain: an abort fired mid-chain surfaces WEB_ABORTED and halts", async () => {
	const config = { enabled: true, defaultProvider: "exa", providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const ctrl = new AbortController();
	let calls = 0;
	let parallelCalls = 0;
	const error = await withFetch(async (url) => {
		if (String(url).includes("parallel")) parallelCalls += 1;
		calls += 1;
		// Faithful fetch behavior: an aborted signal rejects the in-flight call.
		ctrl.abort("user cancelled");
		throw new DOMException("aborted", "AbortError");
	}, () => settle(umbrella.search({ query: "q" }, ctrl.signal)));
	assert.equal(error.code, "WEB_ABORTED");
	assert.equal(calls, 1, "abort halts after the in-flight attempt");
	assert.equal(parallelCalls, 0, "the aborted head never degrades to the next provider");
});

test("chain: maxResults=0 sends the provider default count (not zero)", async () => {
	const { umbrella } = makeUmbrella({ enabled: true, providers: [exaEntry()] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	await withFetch(async (url, init) => {
		assert.equal(JSON.parse(init.body).numResults, 5);
		return exaOk([]);
	}, () => umbrella.search({ query: "q", maxResults: 0 }));
});

// ---- concurrent boundaries -------------------------------------------------

test("concurrent: concurrency beyond the source count runs every source once", async () => {
	const config = { enabled: true, concurrency: 8, providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	let calls = 0;
	const result = await withFetch(async (url) => {
		calls += 1;
		if (String(url).includes("parallel")) return parallelOk(["https://p.example/"]);
		return exaOk(["https://e.example/"]);
	}, () => umbrella.search({ query: "q" }));
	assert.equal(calls, 2);
	assert.equal(result.sources.length, 2);
});

test("concurrent: maxResults=0 leaves the merge uncapped", async () => {
	const config = { enabled: true, concurrency: 8, providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const result = await withFetch(async (url) => {
		if (String(url).includes("parallel")) return parallelOk(["https://p1.example/", "https://p2.example/"]);
		return exaOk(["https://e1.example/"]);
	}, () => umbrella.search({ query: "q", maxResults: 0 }));
	assert.equal(result.sources.length, 3);
	assert.equal(result.truncated, false);
});

test("concurrent: an abort during the pool propagates WEB_ABORTED", async () => {
	const config = { enabled: true, concurrency: 2, providers: [exaEntry(), parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" }, [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const ctrl = new AbortController();
	const error = await withFetch(async (url) => {
		if (String(url).includes("parallel")) { ctrl.abort("cancel"); throw new DOMException("aborted", "AbortError"); }
		await new Promise((resolve) => setTimeout(resolve, 20));
		return exaOk([]);
	}, () => settle(umbrella.search({ query: "q" }, ctrl.signal)));
	assert.equal(error.code, "WEB_ABORTED");
});

test("concurrent: every enabled source participates even with the primary switches off", async () => {
	// free tiers participate purely by their own enable flag — the per-key
	// switches govern sequential fallback, not concurrent fan-out.
	const entry = exaEntry({ keys: [] }); // paid has no keys
	entry.free.enabled = true;
	const config = { enabled: true, concurrency: 4, providers: [entry, parallelEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_PARALLEL_API_KEY]: { value: "pk" } });
	const result = await withFetch(async (url, init) => {
		if (String(url).includes("parallel")) return parallelOk(["https://p.example/"]);
		const body = JSON.parse(init.body);
		if (body.method === "initialize") return initOk();
		return toolOk("Title: F\nURL: https://f.example/\n");
	}, () => umbrella.search({ query: "q" }));
	assert.deepEqual(result.sources.map((s) => s.url).sort(), ["https://f.example/", "https://p.example/"]);
});

// ---- cache boundaries -------------------------------------------------------

test("cache: a FAILED search never enters the store", async () => {
	const config = { enabled: true, cache: { enabled: true, ttlSeconds: 60 }, providers: [exaEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	await withFetch(async () => reject(500, "down"), async () => {
		await assert.rejects(umbrella.search({ query: "q" }), /down/u);
	});
	assert.equal(umbrella.cache.size, 0, "failures are never cached");
});

test("cache: expiry at the exact boundary is a miss (strict freshness)", async () => {
	const config = { enabled: true, cache: { enabled: true, ttlSeconds: 60 }, providers: [exaEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let fetches = 0;
	await withFetch(async () => { fetches += 1; return exaOk([]); }, () => umbrella.search({ query: "q" }));
	const key = umbrella.cacheFingerprint(umbrella.resolveOptions(), { query: "q", maxResults: undefined });
	umbrella.cache.get(key).expiresAt = Date.now(); // == now → expired
	await withFetch(async () => { fetches += 1; return exaOk([]); }, () => umbrella.search({ query: "q" }));
	assert.equal(fetches, 2);
});

test("cache: eviction keeps the store at the 64-entry cap", async () => {
	const config = { enabled: true, cache: { enabled: true, ttlSeconds: 60 }, providers: [exaEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	await withFetch(async () => exaOk([]), async () => {
		for (let i = 0; i < 70; i++) await umbrella.search({ query: `q${i}` });
	});
	assert.equal(umbrella.cache.size, 64);
});

test("cache: a disabled umbrella throws before touching the store", async () => {
	const config = { enabled: false, cache: { enabled: true, ttlSeconds: 60 }, providers: [exaEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	await assert.rejects(umbrella.search({ query: "q" }), /disabled by its settings/u);
	assert.equal(umbrella.cache.size, 0);
});

// ---- migration boundaries ---------------------------------------------------

test("legacy: partial legacy sections default the rest safely", () => {
	const opts = pkg.resolveOptions({ get: () => void 0 }, { enabled: true, preferred: "exa", exaEnabled: true, allowAnonymous: true });
	const exa = opts.providers.find((p) => p.id === "exa");
	assert.equal(exa.primaryTier, "free");
	assert.equal(exa.free.enabled, true);
	assert.equal(exa.paid.enabled, false);
	assert.equal(exa.numResults, 5);
	assert.equal(exa.params.searchType, "auto");
	assert.equal(opts.providers.find((p) => p.id === "parallel").enabled, false);
});

test("legacy: an invalid legacy key reference is dropped from the synthesis", () => {
	const opts = pkg.resolveOptions({ get: () => void 0 }, { enabled: true, preferred: "exa", exaEnabled: true, allowAnonymous: false, apiKeyEnv: "not a name" });
	const exa = opts.providers.find((p) => p.id === "exa");
	assert.deepEqual(exa.keys, []);
	assert.equal(exa.paid.enabled, true); // paid primary still on
	assert.equal(exa.free.enabled, false);
});

test("legacy: literal apiKey values are ignored (not copied anywhere)", () => {
	const creds = {};
	const umbrella = makeUmbrella({ enabled: true, preferred: "exa", exaEnabled: true, allowAnonymous: false, apiKey: "sk-literal", apiKeyEnv: "EXA_API_KEY" }, creds).umbrella;
	const opts = umbrella.resolveOptions();
	assert.equal(opts.providers.find((p) => p.id === "exa").keys[0].ref, pkg.UM_WS_EXA_API_KEY);
	assert.equal(creds[pkg.UM_WS_EXA_API_KEY], undefined, "the literal never leaks into a reference");
});

test("legacy: the dropped-literal warning fires once per activation", () => {
	const warnings = [];
	const ctx = {
		logger: { warn: (message) => warnings.push(message) },
		get: () => void 0
	};
	const legacy = { enabled: true, preferred: "exa", exaEnabled: true, allowAnonymous: false, apiKey: "sk-old", apiKeyEnv: "EXA_API_KEY" };
	pkg.resolveOptions(ctx, legacy);
	pkg.resolveOptions(ctx, legacy);
	assert.equal(warnings.length, 1, "one warning per activation, not per resolve");
	assert.match(warnings[0], /no longer supported/u);
});

test("legacy: new-model providers coexist with cleared legacy keys (post-save state)", () => {
	// After the card saves, legacy keys are unset: only the new shape remains.
	const opts = pkg.resolveOptions({ get: () => void 0 }, { enabled: true, defaultProvider: "exa", providers: [exaEntry()] });
	assert.equal(opts.providers.length, 1);
	assert.equal(opts.defaultProvider, "exa");
});

// ---- deepseek boundary classification ----------------------------------------

test("deepseek: 500 with a detail body is degradable; 400 empty-body is not", async () => {
	const config = { enabled: true, defaultProvider: "deepseek", providers: [deepseekEntry(), exaEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_DEEPSEEK_API_KEY]: { value: "dk" }, [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	// 500 + detail → degradable → exa serves.
	const result = await withFetch(async (url) => {
		if (String(url).includes("deepseek")) return reject(500, "deepseek broke");
		return exaOk(["https://e.example/"]);
	}, () => umbrella.search({ query: "q" }));
	assert.equal(result.sources[0].url, "https://e.example/");
});

test("deepseek: no web_search_tool_result block never degrades", async () => {
	const config = { enabled: true, defaultProvider: "deepseek", providers: [deepseekEntry(), exaEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_DEEPSEEK_API_KEY]: { value: "dk" }, [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let exaCalls = 0;
	await withFetch(async (url) => {
		if (String(url).includes("exa")) exaCalls += 1;
		return ok({ content: [{ type: "text", text: "prose only" }] });
	}, async () => {
		await assert.rejects(umbrella.search({ query: "q" }), /no web_search_tool_result/u);
	});
	assert.equal(exaCalls, 0);
});

test("deepseek: a network failure never degrades", async () => {
	const config = { enabled: true, defaultProvider: "deepseek", providers: [deepseekEntry(), exaEntry()] };
	const { umbrella } = makeUmbrella(config, { [pkg.UM_WS_DEEPSEEK_API_KEY]: { value: "dk" }, [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	let exaCalls = 0;
	await withFetch(async (url) => {
		if (String(url).includes("exa")) exaCalls += 1;
		throw new Error("net down");
	}, async () => {
		await assert.rejects(umbrella.search({ query: "q" }), /search request failed/u);
	});
	assert.equal(exaCalls, 0);
});

// ---- state-machine corner cases ----------------------------------------------

test("state machine: intermediate key switches are ignored while same-tier keys remain", async () => {
	// K1 allows paid→free, but K2 still exists: K1's rejection advances to K2
	// first — the switch only matters once the tier's keys are exhausted.
	const entry = exaEntry();
	entry.keys = [
		{ ref: "UM_WS_KEY_ONE", enabled: true, allowFreeToPaid: false, allowPaidToFree: true },
		{ ref: "UM_WS_KEY_TWO", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }
	];
	entry.free.enabled = true;
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { UM_WS_KEY_ONE: { value: "k1" }, UM_WS_KEY_TWO: { value: "k2" } });
	const seen = [];
	const result = await withFetch(async (url, init) => {
		seen.push(init.headers["x-api-key"]);
		if (init.headers["x-api-key"] === "k1") return reject(401, "k1 rejected");
		return exaOk(["https://k2.example/"]);
	}, () => umbrella.search({ query: "q" }));
	assert.deepEqual(seen, ["k1", "k2"]);
	assert.equal(result.sources[0].url, "https://k2.example/");
});

test("state machine: the LAST exhausted key's switch gates the tier fallback", async () => {
	// K1 (switch on) → K2 (switch OFF) fails: K2's switch is the gate, so the
	// free tier never runs even though K1 would have allowed it.
	const entry = exaEntry();
	entry.keys = [
		{ ref: "UM_WS_KEY_ONE", enabled: true, allowFreeToPaid: false, allowPaidToFree: true },
		{ ref: "UM_WS_KEY_TWO", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }
	];
	entry.free.enabled = true;
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { UM_WS_KEY_ONE: { value: "k1" }, UM_WS_KEY_TWO: { value: "k2" } });
	let mcpCalls = 0;
	await withFetch(async (url) => {
		if (String(url).includes("mcp")) mcpCalls += 1;
		return reject(401, "rejected");
	}, async () => {
		await assert.rejects(umbrella.search({ query: "q" }), /rejected/u);
	});
	assert.equal(mcpCalls, 0);
});

test("state machine: free→paid fallback iterates ONLY the keys carrying the switch", async () => {
	const entry = exaEntry();
	entry.primaryTier = "free";
	entry.free.enabled = true;
	entry.keys = [
		{ ref: "UM_WS_KEY_ONE", enabled: true, allowFreeToPaid: false, allowPaidToFree: false },
		{ ref: "UM_WS_KEY_TWO", enabled: true, allowFreeToPaid: true, allowPaidToFree: false }
	];
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { UM_WS_KEY_ONE: { value: "k1" }, UM_WS_KEY_TWO: { value: "k2" } });
	const paidKeys = [];
	const result = await withFetch(async (url, init) => {
		if (String(url).includes("mcp")) return reject(503, "mcp down");
		paidKeys.push(init.headers["x-api-key"]);
		return exaOk(["https://paid.example/"]);
	}, () => umbrella.search({ query: "q" }));
	assert.deepEqual(paidKeys, ["k2"], "only the switched key participates");
	assert.equal(result.sources[0].url, "https://paid.example/");
});

test("state machine: random strategy with a single key is stable", async () => {
	const entry = exaEntry({ keysStrategy: "random" });
	const { umbrella } = makeUmbrella({ enabled: true, providers: [entry] }, { [pkg.UM_WS_EXA_API_KEY]: { value: "k" } });
	const headers = [];
	await withFetch(async (url, init) => {
		headers.push(init.headers["x-api-key"]);
		return exaOk([]);
	}, () => umbrella.search({ query: "q" }));
	assert.deepEqual(headers, ["k"]);
});
