import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { WebError } from "@deepseek-ai/dsh-web";
import { DeepSeekSearchProvider } from "@deepseek-ai/dsh-web-search-deepseek";
//#region lib/types/strategy-provider.js
/**
 * Multi-provider web search (Exa + Parallel + DeepSeek Official) under one
 * umbrella provider (`um-web-search`, legacy alias `exa`). The shared
 * components live here and each backend contributes one self-contained spec:
 * endpoints, request builder, response mapper, error-message extractor, and
 * MCP handshake semantics. DeepSeek Official wraps the framework's own
 * `DeepSeekSearchProvider` class (ADR-0004 D7) — it never registers under the
 * official id, so `WEB_DUPLICATE_PROVIDER` cannot fire.
 *
 * Strategy (ADR-0004): `providers[]` is an ordered list whose index IS the
 * priority. Each provider carries two tiers (paid REST / free anonymous MCP)
 * with independent enable flags, a `primaryTier`, an ordered/random key list,
 * and per-key two-way fallback switches (`allowFreeToPaid` / `allowPaidToFree`).
 * A sequential search walks one provider's tier chain (tier → same-tier keys →
 * switch-gated other tier), then degrades to the next provider on a server-side
 * rejection. With `concurrency > 1` the umbrella fans out to every enabled
 * source (provider × tier × key) concurrently and merges the successes. An
 * in-memory TTL cache (ADR-0004 D6) serves repeat queries.
 *
 * The wire formats and native `fetch` client are provider-private and do not
 * use `ctx.llm`. One options thunk per operation, credentials resolved per
 * search, availability computed live so a Settings toggle takes effect on the
 * next operation.
 * @module um-dsh-websearch/provider
 */
/** Umbrella provider id this plugin registers under in `ctx.web`. */
const UM_PROVIDER_ID = "um-web-search";
/** Legacy provider id kept as a thin alias for `searchProvider: exa` deployments. */
const EXA_PROVIDER_ID = "exa";
/** Version string carried by the user-agent and the MCP client info. */
const VERSION = "0.6.0";
/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = `um-dsh-websearch/${VERSION}`;
/** MCP protocol version this client speaks. */
const MCP_PROTOCOL_VERSION = "2025-06-18";
/** Cap on per-result text fetched back as the snippet source (request side). */
const REQUEST_SNIPPET_CHARACTERS = 700;
/** Cap on the locally retained snippet (both backends, both transports). */
const SNIPPET_MAX_CHARACTERS = 800;
//#endregion
//#region lib/types/constants.js
/**
 * Credential references under the UM_WS_ namespace (ADR-0004 D4): every key
 * this plugin resolves lives under a namespaced reference so it can never be
 * mistaken for (or polluted by) the dsh base packages' `EXA_API_KEY` /
 * `PARALLEL_API_KEY` / `DEEPSEEK_API_KEY`.
 */
const UM_WS_EXA_API_KEY = "UM_WS_EXA_API_KEY";
const UM_WS_PARALLEL_API_KEY = "UM_WS_PARALLEL_API_KEY";
const UM_WS_DEEPSEEK_API_KEY = "UM_WS_DEEPSEEK_API_KEY";
/** Legacy default references this plugin accepted before 0.6.0 (migration sources). */
const LEGACY_EXA_API_KEY_ENV = "EXA_API_KEY";
const LEGACY_PARALLEL_API_KEY_ENV = "PARALLEL_API_KEY";
/** Pairs the one-time credential copy migration walks (legacy source → UM_WS_ target). */
const UM_WS_MIGRATION_PAIRS = [
	[LEGACY_EXA_API_KEY_ENV, UM_WS_EXA_API_KEY],
	[LEGACY_PARALLEL_API_KEY_ENV, UM_WS_PARALLEL_API_KEY]
];
/** Default reference a legacy `apiKeyEnv` value maps to when it equals the legacy default. */
const DEFAULT_EXA_API_KEY_ENV = UM_WS_EXA_API_KEY;
const DEFAULT_PARALLEL_API_KEY_ENV = UM_WS_PARALLEL_API_KEY;
const DEFAULT_EXA_BASE_URL = "https://api.exa.ai";
const DEFAULT_PARALLEL_BASE_URL = "https://api.parallel.ai";
const DEFAULT_EXA_MCP_BASE_URL = "https://mcp.exa.ai/mcp";
const DEFAULT_PARALLEL_MCP_BASE_URL = "https://search.parallel.ai/mcp";
const DEFAULT_NUM_RESULTS = 5;
const DEFAULT_PARALLEL_NUM_RESULTS = 10;
const DEFAULT_SEARCH_TYPE = "auto";
const DEFAULT_PARALLEL_MODE = "fast";
const DEFAULT_PREFERRED = "exa";
const SEARCH_BASE_URL_ENV = "EXA_BASE_URL";
/** DeepSeek Official defaults, mirroring @deepseek-ai/dsh-web-search-deepseek. */
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/anthropic/v1";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_DEEPSEEK_MAX_USES = 5;
/** In-memory cache: entry cap and the cap past which the oldest entry evicts. */
const CACHE_MAX_ENTRIES = 64;
//#endregion
//#region lib/types/shared.js
/**
 * Shared helpers consumed by the strategy provider and all backend runners.
 * They keep the chain semantics (abort, degradable-status marking, credential
 * resolution, credential-ref validation, the JSON-RPC streamable-HTTP parser)
 * in one place so the backend specs stay small.
 */
/** Strip trailing slashes so `${baseURL}/search` never doubles them. */
function normalizeBaseUrl(value) {
	return value.replace(/\/+$/u, "");
}
/** Local mirror of the credentials seam's reference grammar. */
const API_KEY_ENV_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
/** True when a raw settings string names a usable credential reference. */
function isValidApiKeyEnv(value) {
	return typeof value === "string" && API_KEY_ENV_PATTERN.test(value);
}
/** True for result limits that can be sent to the APIs. */
function isPositiveInteger(value) {
	return Number.isInteger(value) && value > 0;
}
/** True when the value names a supported Exa `type` parameter. */
function isSearchType(value) {
	return value === "auto" || value === "neural" || value === "keyword";
}
/** True when the value names a supported Parallel mode. */
function isParallelMode(value) {
	return value === "turbo" || value === "fast" || value === "basic" || value === "advanced";
}
/** Clamp one search's result count into [min, max]. */
function clampRange(value, fallback, min, max) {
	if (!isPositiveInteger(value)) return fallback;
	return Math.min(Math.max(value, min), max);
}
/** Flag a provider error as a server-side rejection eligible for chain degradation. */
function markDegradable(error, status) {
	if (status !== void 0 && Number.isInteger(status)) error.degradedStatus = status;
	error._degradable = true;
	return error;
}
/** HTTP statuses that signal a server-side rejection the chain may degrade from. */
function isDegradableStatus(status) {
	return status === 401 || status === 402 || status === 403 || status === 429 || status >= 500;
}
/**
 * Collect the JSON-RPC response object from an MCP streamable-HTTP body.
 * Exa frames its answers as SSE `data:` lines; Parallel answers a plain JSON
 * body. Both shapes are accepted: a body whose first non-blank character is
 * `{` parses as one JSON-RPC message, anything else scans for `data:` frames.
 * @param response - the fetch Response of one MCP exchange.
 * @param signal - abort signal for the surrounding search.
 * @returns the parsed JSON-RPC message, or undefined when none carried a result.
 */
async function mcpSseData(response, signal, providerName) {
	let text;
	try {
		text = await response.text();
	} catch (error) {
		if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
		throw new WebError(`${providerName} anonymous MCP read failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
	}
	const trimmed = text.trim();
	if (trimmed.startsWith("{")) {
		let parsed;
		try {
			parsed = JSON.parse(trimmed);
		} catch (error) {
			throw new WebError(`${providerName} anonymous MCP returned an unparseable payload`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (parsed != null && typeof parsed === "object" && (parsed.result !== void 0 || parsed.error !== void 0)) return parsed;
		return void 0;
	}
	for (const line of text.split(/\r?\n/u)) {
		if (!line.startsWith("data:")) continue;
		const payload = line.slice(5).trim();
		if (payload.length === 0) continue;
		let parsed;
		try {
			parsed = JSON.parse(payload);
		} catch (error) {
			throw new WebError(`${providerName} anonymous MCP returned an unparseable payload`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (parsed != null && typeof parsed === "object" && (parsed.result !== void 0 || parsed.error !== void 0)) return parsed;
	}
	return void 0;
}
/** Extract the human-readable message from an MCP error object, if any. */
function mcpErrorMessage(parsed) {
	if (parsed == null) return void 0;
	const error = parsed.error;
	if (error == null) return void 0;
	if (typeof error === "string" && error.length > 0) return error;
	if (typeof error.message === "string" && error.message.length > 0) return error.message;
	return void 0;
}
/** Throw the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal, fallback) {
	return new WebError("web search aborted", "WEB_ABORTED", { cause: signal?.aborted === true ? signal.reason : fallback });
}
/** Race a same-process asynchronous preflight against caller cancellation. */
function abortable(operation, signal) {
	if (signal === void 0) return operation;
	if (signal.aborted) return Promise.reject(searchAborted(signal));
	return new Promise((resolve, reject) => {
		const onAbort = () => { reject(searchAborted(signal)); };
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then((value) => { signal.removeEventListener("abort", onAbort); resolve(value); }, (error) => { signal.removeEventListener("abort", onAbort); reject(new Error(String(error).replace(/^Error: /u, ""), { cause: error })); });
	});
}
/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal) {
	if (signal?.aborted === true) throw searchAborted(signal);
}
/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error) {
	return typeof DOMException === "function" && error instanceof DOMException && error.name === "AbortError";
}
/** Combine every provider's terminal failure into one surfaced error. */
function combinedFailure(errors, prefix) {
	const joined = errors.map((error) => error?.message ?? String(error)).join("; ");
	return new WebError(`${prefix} (${joined})`, "WEB_PROVIDER_ERROR", { cause: errors.at(-1) });
}
/** The MCP tool name Exa exposes for web search. */
const MCP_TOOL_WEB_SEARCH = "web_search_exa";
//#endregion
//#region lib/types/backends.js
/**
 * One backend's self-contained spec: REST request builder, response mapper,
 * error extractor, and the anonymous MCP handshake (initialize id + tool
 * arguments). The shared provider and the shared helpers consume it; the spec
 * owns nothing runtime.
 */
const EXA_SPEC = {
	name: "exa",
	providerName: "Exa",
	mcpTool: MCP_TOOL_WEB_SEARCH,
	mcpArguments: (request, opts) => ({ query: request.query, numResults: clampRange(request.maxResults, opts.numResults, 1, 10) }),
	mcpPayload: (text) => ({ sources: parseMcpResults(text), truncated: false }),
	mcpPostInitialize: false,
	buildRequest: (request, opts) => {
		const numResults = clampRange(request.maxResults, opts.numResults, 1, 10);
		const body = { query: request.query, numResults, contents: { text: { maxCharacters: REQUEST_SNIPPET_CHARACTERS } } };
		if (opts.searchType !== DEFAULT_SEARCH_TYPE) body.type = opts.searchType;
		return { method: "POST", url: `${opts.baseURL}/search`, keyHeader: "x-api-key", body, headers: { "content-type": "application/json", accept: "application/json" } };
	},
	mapResponse: (response) => mapExaRestResponse(response),
	errorMessage: exaErrorMessage
};
const PARALLEL_SPEC = {
	name: "parallel",
	providerName: "Parallel",
	mcpTool: "web_search",
	mcpArguments: (request, _opts, sessionId) => ({ search_queries: [request.query], objective: request.query, session_id: sessionId }),
	mcpPayload: (text) => {
		if (!text) return { sources: [], truncated: false };
		// A payload that is not the V1SearchResponse JSON is a contract error:
		// it surfaces as WEB_PROVIDER_ERROR and never degrades the chain.
		try {
			return mapParallelRestResponse(JSON.parse(text));
		} catch (error) {
			if (error instanceof WebError) throw error;
			throw new WebError(`Parallel anonymous MCP returned an unprocessable payload: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
	},
	mcpPostInitialize: true,
	buildRequest: (request, opts) => {
		const maxResults = clampRange(request.maxResults, opts.numResults, 1, 20);
		const body = {
			search_queries: [request.query],
			objective: request.query,
			mode: opts.mode,
			advanced_settings: { max_results: maxResults, excerpt_settings: { max_chars_per_result: REQUEST_SNIPPET_CHARACTERS } }
		};
		return { method: "POST", url: `${opts.baseURL}/v1/search`, keyHeader: "x-api-key", body, headers: { "content-type": "application/json", accept: "application/json" } };
	},
	mapResponse: (response) => mapParallelRestResponse(response),
	errorMessage: parallelErrorMessage
};
function exaErrorMessage(parsed) {
	if (parsed == null) return void 0;
	const error = parsed.error;
	if (typeof error === "string" && error.length > 0) return error;
	if (error != null && typeof error === "object") {
		if (typeof error.message === "string" && error.message.length > 0) return error.message;
		if (typeof error.type === "string" && error.type.length > 0) return error.type;
	}
	if (typeof parsed.message === "string" && parsed.message.length > 0) return parsed.message;
	return void 0;
}
function parallelErrorMessage(parsed) {
	if (parsed == null) return void 0;
	const error = parsed.error;
	if (typeof error === "string" && error.length > 0) return error;
	if (error != null && typeof error === "object") {
		if (typeof error.message === "string" && error.message.length > 0) return error.message;
	}
	return void 0;
}
/** Map one Exa `/search` response to a normalized search result. */
function mapExaRestResponse(response) {
	if (!Array.isArray(response.results)) throw new WebError("Exa returned no results[] array", "WEB_PROVIDER_ERROR");
	const seen = new Set();
	const sources = [];
	for (const item of response.results) {
		if (item == null || typeof item !== "object" || typeof item.url !== "string" || item.url.length === 0 || seen.has(item.url)) continue;
		seen.add(item.url);
		sources.push({
			url: item.url,
			...(typeof item.title === "string" && item.title.length > 0 ? { title: item.title } : {}),
			...exaSnippetOf(item),
			...(typeof item.publishedDate === "string" && item.publishedDate.length > 0 ? { publishedAt: item.publishedDate } : {})
		});
	}
	return { sources, truncated: false };
}
function exaSnippetOf(item) {
	let snippet = "";
	if (typeof item.text === "string") snippet = item.text;
	else if (typeof item.summary === "string") snippet = item.summary;
	else if (Array.isArray(item.highlights)) snippet = item.highlights.filter((part) => typeof part === "string").join(" … ");
	snippet = snippet.trim().slice(0, SNIPPET_MAX_CHARACTERS);
	return snippet.length > 0 ? { snippet } : {};
}
/**
 * Parse the `web_search_exa` text payload into normalized sources. The tool
 * emits one block per result starting on a `Title:` line — split on `Title:`
 * alone so markdown `---` separators inside a block must not break it.
 */
function parseMcpResults(text) {
	const seen = new Set();
	const sources = [];
	const blocks = [];
	let block = null;
	for (const raw of text.split(/\r?\n/u)) {
		if (/^Title:\s*/u.test(raw)) {
			if (block !== null) blocks.push(block);
			block = { title: raw.replace(/^Title:\s*/u, "").trim() };
			continue;
		}
		if (block === null) continue;
		const urlMatch = /^URL:\s*(\S+)/u.exec(raw);
		if (urlMatch !== null) { block.url = urlMatch[1]; continue; }
		const pubMatch = /^Published:\s*(.+)$/u.exec(raw);
		if (pubMatch !== null) {
			const value = pubMatch[1].trim();
			if (value.length > 0 && value !== "N/A") block.publishedAt = value;
			continue;
		}
		if (/^Author:\s*/u.test(raw)) continue;
		if (/^Highlights:\s*$/u.test(raw)) { block.highlights = []; continue; }
		if (Array.isArray(block.highlights)) block.highlights.push(raw);
	}
	if (block !== null) blocks.push(block);
	for (const entry of blocks) {
		if (entry.url == null || seen.has(entry.url)) continue;
		seen.add(entry.url);
		const snippet = (Array.isArray(entry.highlights) ? entry.highlights.join("\n").trim().slice(0, SNIPPET_MAX_CHARACTERS) : "");
		sources.push({
			url: entry.url,
			...(entry.title != null && entry.title.length > 0 ? { title: entry.title } : {}),
			...(snippet.length > 0 ? { snippet } : {}),
			...(entry.publishedAt != null ? { publishedAt: entry.publishedAt } : {})
		});
	}
	return sources;
}
/** Map a Parallel V1SearchResponse (REST or parsed MCP JSON) to a normalized result. */
function mapParallelRestResponse(response) {
	if (!Array.isArray(response.results)) throw new WebError("Parallel returned no results[] array", "WEB_PROVIDER_ERROR");
	const seen = new Set();
	const sources = [];
	for (const item of response.results) {
		if (item == null || typeof item !== "object" || typeof item.url !== "string" || item.url.length === 0 || seen.has(item.url)) continue;
		seen.add(item.url);
		const snippets = Array.isArray(item.excerpts) ? item.excerpts.filter((part) => typeof part === "string") : [];
		const snippet = snippets.join(" … ").trim().slice(0, SNIPPET_MAX_CHARACTERS);
		sources.push({
			url: item.url,
			...(typeof item.title === "string" && item.title.length > 0 ? { title: item.title } : {}),
			...(snippet.length > 0 ? { snippet } : {}),
			...(typeof item.publish_date === "string" && item.publish_date.length > 0 ? { publishedAt: item.publish_date } : {})
		});
	}
	return { sources, truncated: false };
}
//#endregion
//#region lib/types/config.js
/**
 * The 0.6.0 config model (ADR-0004 D1): a flat strategy envelope over an
 * ordered `providers[]` list whose index IS the priority. Enumerations ride a
 * lenient string schema with runtime fallback (a hand-edited invalid value
 * must never fail the whole section's resolve); numeric ranges ride the
 * schema. Cross-field invariants (id/ref uniqueness, defaultProvider
 * membership) live in `validateConfig`, called by the settings seam on write.
 */
const KeySchema = z.object({
	ref: z.string().role("credential-ref").default(""),
	enabled: z.boolean().default(true),
	allowFreeToPaid: z.boolean().default(false),
	allowPaidToFree: z.boolean().default(false)
});
const TransportSchema = z.object({
	enabled: z.boolean().default(false),
	baseURL: z.string().default("")
});
const ProviderSchema = z.object({
	id: z.string().default(""),
	name: z.string().default(""),
	enabled: z.boolean().default(true),
	primaryTier: z.string().default("free"),
	paid: TransportSchema,
	free: TransportSchema,
	keys: z.array(KeySchema).default([]),
	keysStrategy: z.string().default("ordered"),
	numResults: z.number().step(1).min(1).max(20).default(DEFAULT_NUM_RESULTS),
	params: z.dict(z.any()).default({})
});
const BUILTIN_PROVIDERS = [
	{
		id: "exa", name: "Exa", enabled: true, primaryTier: "paid",
		paid: { enabled: true, baseURL: DEFAULT_EXA_BASE_URL },
		free: { enabled: false, baseURL: DEFAULT_EXA_MCP_BASE_URL },
		keys: [], keysStrategy: "ordered", numResults: DEFAULT_NUM_RESULTS,
		params: { searchType: DEFAULT_SEARCH_TYPE }
	},
	{
		id: "parallel", name: "Parallel", enabled: false, primaryTier: "paid",
		paid: { enabled: false, baseURL: DEFAULT_PARALLEL_BASE_URL },
		free: { enabled: false, baseURL: DEFAULT_PARALLEL_MCP_BASE_URL },
		keys: [], keysStrategy: "ordered", numResults: DEFAULT_PARALLEL_NUM_RESULTS,
		params: { mode: DEFAULT_PARALLEL_MODE }
	},
	{
		id: "deepseek", name: "DeepSeek Official", enabled: false, primaryTier: "paid",
		paid: { enabled: false, baseURL: DEFAULT_DEEPSEEK_BASE_URL },
		free: { enabled: false, baseURL: "" },
		keys: [], keysStrategy: "ordered", numResults: DEFAULT_NUM_RESULTS,
		params: { model: DEFAULT_DEEPSEEK_MODEL, maxUses: DEFAULT_DEEPSEEK_MAX_USES }
	}
];
const Config = z.object({
	enabled: z.boolean().default(false),
	defaultProvider: z.string().default(DEFAULT_PREFERRED),
	concurrency: z.number().step(1).min(1).max(8).default(1),
	cache: z.object({
		enabled: z.boolean().default(false),
		ttlSeconds: z.number().step(1).min(1).max(86400).default(60)
	}),
	providers: z.array(ProviderSchema).default(BUILTIN_PROVIDERS)
});
/** The flat keys the pre-0.6.0 model owned (used for zero-storage migration detection). */
const LEGACY_KEYS = [
	"preferred", "exaEnabled", "parallelEnabled",
	"allowAnonymous", "fallbackToPaid", "fallbackToAnonymous",
	"apiKey", "apiKeyEnv", "baseURL", "mcpBaseURL", "numResults", "searchType",
	"parallelAllowAnonymous", "parallelFallbackToPaid", "parallelFallbackToAnonymous",
	"parallelApiKey", "parallelApiKeyEnv", "parallelBaseURL", "parallelMcpBaseURL",
	"parallelNumResults", "parallelMode"
];
/**
 * Cross-field invariants the schema cannot express (ADR-0004 D1): unique
 * provider ids, unique key refs per provider, and a defaultProvider that names
 * a configured provider. Throwing rejects the settings write; the resolved
 * value passed in already carries schema defaults.
 */
function validateConfig(value) {
	const providers = Array.isArray(value?.providers) ? value.providers : [];
	const ids = new Set();
	for (const provider of providers) {
		if (provider == null || typeof provider !== "object") continue;
		const id = typeof provider.id === "string" ? provider.id.trim() : "";
		if (id.length === 0) throw new Error("web-search-exa: every provider needs a non-empty id");
		if (ids.has(id)) throw new Error(`web-search-exa: duplicate provider id "${id}"`);
		ids.add(id);
		const refs = new Set();
		for (const key of Array.isArray(provider.keys) ? provider.keys : []) {
			if (key == null || typeof key !== "object") continue;
			const ref = typeof key.ref === "string" ? key.ref.trim() : "";
			if (ref.length > 0 && refs.has(ref)) throw new Error(`web-search-exa: provider "${id}" repeats the key reference "${ref}"`);
			if (ref.length > 0) refs.add(ref);
		}
	}
	const defaultProvider = typeof value?.defaultProvider === "string" ? value.defaultProvider : "";
	if (defaultProvider.length > 0 && !ids.has(defaultProvider)) {
		throw new Error(`web-search-exa: defaultProvider "${defaultProvider}" does not name a configured provider`);
	}
}
//#endregion
//#region lib/types/legacy-migration.js
/** True when the resolved section still carries any pre-0.6.0 flat strategy key. */
function hasLegacyKeys(section) {
	return LEGACY_KEYS.some((key) => section[key] !== void 0);
}
/**
 * Remap one legacy credential reference onto the UM_WS_ namespace: the legacy
 * DEFAULT name maps to the namespaced default, custom references stay as the
 * user wrote them (their choice, not ours to rename).
 */
function remapLegacyRef(value, legacyDefault, umwsDefault) {
	const ref = typeof value === "string" && value.length > 0 ? value : legacyDefault;
	return ref === legacyDefault ? umwsDefault : ref;
}
/** One-shot warning (per activation) for the legacy literal keys 0.6.0 drops. */
const legacyLiteralWarned = new WeakSet();
function warnLegacyLiteral(ctx) {
	if (legacyLiteralWarned.has(ctx)) return;
	legacyLiteralWarned.add(ctx);
	try {
		ctx.logger?.warn("um-dsh-websearch: literal apiKey/parallelApiKey are no longer supported (0.6.0) — store the key under its UM_WS_ credential reference instead");
	} catch { /* best effort */ }
}
/** Synthesize the legacy flat-key sections of Exa/Parallel into one provider entry each. */
function synthesizeLegacyProviders(ctx, section) {
	if (section.apiKey !== void 0 || section.parallelApiKey !== void 0) warnLegacyLiteral(ctx);
	const exaKeys = [];
	{
		const ref = remapLegacyRef(section.apiKeyEnv, LEGACY_EXA_API_KEY_ENV, UM_WS_EXA_API_KEY);
		if (isValidApiKeyEnv(ref)) exaKeys.push({
			ref,
			enabled: true,
			allowFreeToPaid: section.fallbackToPaid === true,
			allowPaidToFree: section.fallbackToAnonymous === true
		});
	}
	const parallelKeys = [];
	{
		const ref = remapLegacyRef(section.parallelApiKeyEnv, LEGACY_PARALLEL_API_KEY_ENV, UM_WS_PARALLEL_API_KEY);
		if (isValidApiKeyEnv(ref)) parallelKeys.push({
			ref,
			enabled: true,
			allowFreeToPaid: section.parallelFallbackToPaid === true,
			allowPaidToFree: section.parallelFallbackToAnonymous === true
		});
	}
	const exaAllowAnonymous = section.allowAnonymous === true;
	const exaPrimaryPaid = !exaAllowAnonymous;
	const parallelAllowAnonymous = section.parallelAllowAnonymous === true;
	const parallelPrimaryPaid = !parallelAllowAnonymous;
	return [
		{
			id: "exa", name: "Exa", enabled: section.exaEnabled !== false,
			primaryTier: exaPrimaryPaid ? "paid" : "free",
			paid: { enabled: exaPrimaryPaid || section.fallbackToPaid === true, baseURL: normalizeBaseUrl(section.baseURL ?? launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value ?? DEFAULT_EXA_BASE_URL) },
			free: { enabled: exaAllowAnonymous || section.fallbackToAnonymous === true, baseURL: normalizeBaseUrl(section.mcpBaseURL ?? DEFAULT_EXA_MCP_BASE_URL) },
			keys: exaKeys, keysStrategy: "ordered",
			numResults: isPositiveInteger(section.numResults) ? section.numResults : DEFAULT_NUM_RESULTS,
			params: { searchType: isSearchType(section.searchType) ? section.searchType : DEFAULT_SEARCH_TYPE }
		},
		{
			id: "parallel", name: "Parallel", enabled: section.parallelEnabled === true,
			primaryTier: parallelPrimaryPaid ? "paid" : "free",
			paid: { enabled: parallelPrimaryPaid || section.parallelFallbackToPaid === true, baseURL: normalizeBaseUrl(section.parallelBaseURL ?? DEFAULT_PARALLEL_BASE_URL) },
			free: { enabled: parallelAllowAnonymous || section.parallelFallbackToAnonymous === true, baseURL: normalizeBaseUrl(section.parallelMcpBaseURL ?? DEFAULT_PARALLEL_MCP_BASE_URL) },
			keys: parallelKeys, keysStrategy: "ordered",
			numResults: isPositiveInteger(section.parallelNumResults) ? section.parallelNumResults : DEFAULT_PARALLEL_NUM_RESULTS,
			params: { mode: isParallelMode(section.parallelMode) ? section.parallelMode : DEFAULT_PARALLEL_MODE }
		},
		{ ...BUILTIN_PROVIDERS[2], name: "DeepSeek Official", enabled: false }
	];
}
//#endregion
//#region lib/types/provider-registry.js
/**
 * One runtime provider: the projected, live view of one `providers[]` entry.
 * The spec (exa/parallel) or the official wrapper (deepseek) is resolved here,
 * tier flags are effective (a free tier whose spec cannot serve anonymous MCP
 * is forced off), and every key keeps its two fallback switches.
 */
const BACKEND_SPECS = { exa: EXA_SPEC, parallel: PARALLEL_SPEC };
/** Project one raw providers[] entry into the runtime shape the engine consumes. */
function projectProvider(ctx, entry, index) {
	const spec = BACKEND_SPECS[entry.id];
	const isDeepSeek = entry.id === "deepseek";
	if (spec === void 0 && !isDeepSeek) return void 0;
	const paidBaseURL = normalizeBaseUrl(typeof entry.paid?.baseURL === "string" && entry.paid.baseURL.length > 0 ? entry.paid.baseURL : (spec === EXA_SPEC ? launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value ?? DEFAULT_EXA_BASE_URL : entry.id === "parallel" ? DEFAULT_PARALLEL_BASE_URL : DEFAULT_DEEPSEEK_BASE_URL));
	const freeBaseURL = normalizeBaseUrl(typeof entry.free?.baseURL === "string" ? entry.free.baseURL : (entry.id === "exa" ? DEFAULT_EXA_MCP_BASE_URL : entry.id === "parallel" ? DEFAULT_PARALLEL_MCP_BASE_URL : ""));
	const keys = (Array.isArray(entry.keys) ? entry.keys : [])
		// Keys whose ref is absent are dropped outright; an invalid-pattern ref
		// is KEPT so availability reports honestly and a search attempt
		// surfaces the explicit CREDENTIAL_MISSING (0.5.1 behavior).
		.filter((key) => key != null && typeof key === "object" && typeof key.ref === "string" && key.ref.length > 0)
		.map((key) => ({
			ref: key.ref,
			enabled: key.enabled !== false,
			allowFreeToPaid: key.allowFreeToPaid === true,
			allowPaidToFree: key.allowPaidToFree === true
		}));
	return {
		id: entry.id,
		name: typeof entry.name === "string" && entry.name.length > 0 ? entry.name : entry.id,
		enabled: entry.enabled !== false,
		spec,
		isDeepSeek,
		primaryTier: entry.primaryTier === "paid" ? "paid" : "free",
		paid: { enabled: entry.paid?.enabled === true, baseURL: paidBaseURL },
		free: { enabled: entry.free?.enabled === true && !isDeepSeek, baseURL: freeBaseURL },
		keys,
		keysStrategy: entry.keysStrategy === "random" ? "random" : "ordered",
		numResults: isPositiveInteger(entry.numResults) ? entry.numResults : (entry.id === "parallel" ? DEFAULT_PARALLEL_NUM_RESULTS : DEFAULT_NUM_RESULTS),
		params: entry.params != null && typeof entry.params === "object" ? entry.params : {}
	};
}
/** Project the whole section into the runtime options the engine consumes. */
function resolveOptions(ctx, config) {
	const section = config != null && typeof config === "object" ? config : {};
	// ADR-0004 D3: any surviving legacy key means the user layer still speaks
	// the flat model — synthesize over it. The settings resolver fills
	// `providers` with the non-empty BUILTIN default even for legacy sections,
	// so presence of `providers` can never disambiguate; only key shape can.
	const rawProviders = hasLegacyKeys(section)
		? synthesizeLegacyProviders(ctx, section)
		: (Array.isArray(section.providers) && section.providers.length > 0 ? section.providers : BUILTIN_PROVIDERS);
	const providers = [];
	for (let index = 0; index < rawProviders.length; index++) {
		const entry = rawProviders[index];
		if (entry == null || typeof entry !== "object") continue;
		const projected = projectProvider(ctx, entry, index);
		if (projected !== void 0) providers.push(projected);
	}
	const concurrency = isPositiveInteger(section.concurrency) ? Math.min(Math.max(section.concurrency, 1), 8) : 1;
	const cache = section.cache != null && typeof section.cache === "object" ? section.cache : {};
	const cacheEnabled = cache.enabled === true;
	const ttlSeconds = isPositiveInteger(cache.ttlSeconds) ? cache.ttlSeconds : 60;
	// Legacy sections name their head with `preferred`; new sections with
	// `defaultProvider`. Either one must route the provider order.
	const declared = typeof section.defaultProvider === "string" && section.defaultProvider.length > 0 ? section.defaultProvider : (typeof section.preferred === "string" ? section.preferred : DEFAULT_PREFERRED);
	return {
		ctx,
		enabled: section.enabled === true,
		defaultProvider: providers.some((provider) => provider.id === declared) ? declared : (providers[0]?.id ?? DEFAULT_PREFERRED),
		concurrency,
		cacheEnabled,
		ttlSeconds,
		providers
	};
}
//#endregion
//#region lib/types/strategy-provider.js
/**
 * The umbrella provider. Sequential search = one provider's tier chain (keys
 * in strategy order, then the switch-gated other tier), degrading to the next
 * enabled provider on server-side rejection. Concurrent search = fan out to
 * every enabled source and merge the successes. Availability, the key probe,
 * and the TTL cache all derive from the CURRENT section on every operation.
 */
var UmWebSearchProvider = class {
	resolveOptions;
	id = UM_PROVIDER_ID;
	/** Tri-state credential knowledge per reference: unknown / yes / no. */
	keyPresence = new Map();
	/** In-memory result cache: fingerprint key → { expiresAt, result }. */
	cache = new Map();
	constructor(resolveOptions) {
		this.resolveOptions = resolveOptions;
	}
	/** The enabled providers in execution order (defaultProvider first, array order after). */
	orderedProviders(opts) {
		const enabled = opts.providers.filter((provider) => provider.enabled === true);
		const pivot = enabled.findIndex((provider) => provider.id === opts.defaultProvider);
		if (pivot > 0) return [...enabled.slice(pivot), ...enabled.slice(0, pivot)];
		return enabled;
	}
	/** Resolve one credential reference live; per-operation, never cached. */
	async resolveCredential(ctx, ref) {
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) return (await credentials.resolve(ref))?.value;
		const ambient = launchEnvironmentOf(ctx).get(ref);
		return ambient !== void 0 && ambient.value.length > 0 ? ambient.value : void 0;
	}
	/** Resolve `ref`, falling back to its legacy alias once (and copy-migrating it). */
	async resolveCredentialWithLegacy(ctx, ref, legacyRef) {
		const value = await this.resolveCredential(ctx, ref);
		if (value !== void 0 && value.length > 0) return value;
		if (legacyRef === void 0) return void 0;
		const legacy = await this.resolveCredential(ctx, legacyRef);
		if (legacy === void 0 || legacy.length === 0) return void 0;
		// Lazy migration: copy the legacy value into the UM_WS_ ref so the next
		// resolution needs no alias. Never delete the legacy reference.
		try { await ctx.get("credentials")?.set(ref, legacy); } catch { /* best effort */ }
		return legacy;
	}
	/** Whether one paid tier attempt can serve right now (cheap, local). */
	canUsePaid(provider, keyRef) {
		if (!URL.canParse(provider.paid.baseURL)) return false;
		const presence = this.keyPresence.get(keyRef);
		return presence !== "no" && isValidApiKeyEnv(keyRef);
	}
	/** Whether one free tier attempt can serve right now (cheap, local). */
	canUseFree(provider) {
		return URL.canParse(provider.free.baseURL);
	}
	/** The keys participating in this search, in strategy order. */
	strategyKeys(provider) {
		const enabled = provider.keys.filter((key) => key.enabled === true);
		if (provider.keysStrategy === "random" && enabled.length > 1) {
			const shuffled = [...enabled];
			for (let i = shuffled.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
			}
			return shuffled;
		}
		return enabled;
	}
	/**
	 * Build one provider's sequential attempt chain (ADR-0004 D2): the primary
	 * tier first (paid = each enabled key in strategy order; free = one
	 * anonymous attempt), then the switch-gated other tier. An unusable primary
	 * tier yields to the other tier when that one is enabled.
	 */
	buildChain(provider) {
		const attempts = [];
		const keys = this.strategyKeys(provider);
		const paidUsable = provider.paid.enabled === true && keys.length > 0 && URL.canParse(provider.paid.baseURL);
		const freeUsable = provider.free.enabled === true && URL.canParse(provider.free.baseURL);
		let primary = provider.primaryTier;
		if (primary === "paid" && !paidUsable && freeUsable) primary = "free";
		if (primary === "free" && !freeUsable && paidUsable) primary = "paid";
		if (primary === "paid" && !paidUsable) primary = "free";
		if (primary === "paid") {
			for (const key of keys) attempts.push({ tier: "paid", key });
			const lastKey = keys.at(-1);
			if (freeUsable && lastKey !== void 0 && lastKey.allowPaidToFree === true) attempts.push({ tier: "free" });
		} else {
			if (freeUsable) attempts.push({ tier: "free" });
			if (paidUsable) {
				for (const key of keys) if (key.allowFreeToPaid === true) attempts.push({ tier: "paid", key });
			}
		}
		return attempts;
	}
	/** Every source participating in a concurrent search (provider × tier × key). */
	concurrentSources(opts) {
		const sources = [];
		for (const provider of this.orderedProviders(opts)) {
			if (provider.paid.enabled === true && URL.canParse(provider.paid.baseURL)) {
				for (const key of this.strategyKeys(provider)) sources.push({ provider, attempt: { tier: "paid", key } });
			}
			if (provider.free.enabled === true && URL.canParse(provider.free.baseURL)) {
				sources.push({ provider, attempt: { tier: "free" } });
			}
		}
		return sources;
	}
	/** Whether any enabled provider's chain can serve (live, cheap, no network). */
	available() {
		const opts = this.resolveOptions();
		if (opts.enabled !== true) return false;
		return this.orderedProviders(opts).some((provider) => {
			const chain = this.buildChain(provider);
			return chain.some((attempt) => attempt.tier === "free" ? this.canUseFree(provider) : this.canUsePaid(provider, attempt.key.ref));
		});
	}
	/**
	 * Probe the credential plane for every participating key reference without
	 * a search, so availability reflects reality before the first query and
	 * re-probes after a credential update. Resolution failures keep the ref
	 * unknown — they are transient by nature.
	 */
	async prime() {
		const opts = this.resolveOptions();
		for (const provider of opts.providers) {
			if (provider.enabled !== true) continue;
			for (const key of provider.keys) {
				if (key.enabled !== true) continue;
				try {
					const resolved = await this.resolveCredentialWithLegacy(opts.ctx, key.ref, legacyRefOf(key.ref));
					this.keyPresence.set(key.ref, resolved !== void 0 && resolved.length > 0 ? "yes" : "no");
				} catch {
					// keep unknown: an errored probe says nothing about presence
				}
			}
		}
	}
	async search(request, signal) {
		const opts = this.resolveOptions();
		if (opts.enabled !== true) throw new WebError("web search provider is disabled by its settings section", "WEB_PROVIDER_ERROR");
		throwIfSearchAborted(signal);
		const cacheKey = opts.cacheEnabled ? this.cacheFingerprint(opts, request) : void 0;
		if (cacheKey !== void 0) {
			const hit = this.cache.get(cacheKey);
			if (hit !== void 0 && hit.expiresAt > Date.now()) return cloneResult(hit.result);
		}
		const result = opts.concurrency > 1
			? await this.searchConcurrent(opts, request, signal)
			: await this.searchSequential(opts, request, signal);
		if (cacheKey !== void 0) this.cachePut(cacheKey, result, opts.ttlSeconds);
		return result;
	}
	/** Sequential chain: each provider's attempts in order, then the next provider. */
	async searchSequential(opts, request, signal) {
		const providers = this.orderedProviders(opts);
		const failures = [];
		for (const provider of providers) {
			const chain = this.buildChain(provider);
			if (chain.length === 0) continue;
			let terminal;
			for (const attempt of chain) {
				try {
					return await this.runAttempt(opts, provider, attempt, request, signal);
				} catch (error) {
					if (error === null || typeof error !== "object" || !(error instanceof WebError) || error._degradable !== true) throw error;
					terminal = error;
				}
			}
			if (terminal !== void 0) failures.push(terminal);
		}
		if (failures.length === 0) throw new WebError("web search has no usable source: every provider is disabled or misconfigured", "WEB_PROVIDER_ERROR");
		// A single failing provider surfaces its own terminal error unchanged
		// (message fidelity); two or more combine.
		if (failures.length === 1) throw failures[0];
		throw combinedFailure(failures, "web search failed on every provider");
	}
	/** Concurrent fan-out: run every source under a bounded pool, merge the successes. */
	async searchConcurrent(opts, request, signal) {
		const sources = this.concurrentSources(opts);
		if (sources.length === 0) throw new WebError("web search has no usable source: every provider is disabled or misconfigured", "WEB_PROVIDER_ERROR");
		const settled = await runPool(sources, opts.concurrency, (source) => this.runAttempt(opts, source.provider, source.attempt, request, signal));
		if (signal?.aborted === true) throw searchAborted(signal);
		for (const entry of settled) {
			if (!entry.ok && entry.error !== null && typeof entry.error === "object" && entry.error instanceof WebError && entry.error.code === "WEB_ABORTED") throw entry.error;
		}
		const successes = settled.filter((entry) => entry.ok).map((entry) => entry.value);
		if (successes.length === 0) {
			const failures = settled.filter((entry) => !entry.ok).map((entry) => entry.error);
			throw combinedFailure(failures, "web search failed on every concurrent source");
		}
		return mergeSources(successes, request.maxResults);
	}
	/** Execute one (provider, tier, key) attempt. */
	async runAttempt(opts, provider, attempt, request, signal) {
		if (attempt.tier === "free") return this.searchAnonymous(opts, provider, request, signal);
		if (provider.isDeepSeek === true) return this.searchDeepseek(opts, provider, attempt.key, request, signal);
		return this.searchPaidRest(opts, provider, attempt.key, request, signal);
	}
	/** Resolve the key for one paid attempt, updating the presence tri-state. */
	async apiKey(opts, provider, key, signal) {
		throwIfSearchAborted(signal);
		if (!isValidApiKeyEnv(key.ref)) throw new WebError(`web search has no API key: the configured key reference is not a valid environment-variable name (use letters, digits, and underscores, starting with a letter or underscore); fix it in the web-search-exa settings section`, "WEB_PROVIDER_CREDENTIAL_MISSING");
		let resolved;
		try {
			resolved = await abortable(this.resolveCredentialWithLegacy(opts.ctx, key.ref, legacyRefOf(key.ref)), signal);
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`web search credential resolution failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		this.keyPresence.set(key.ref, resolved !== void 0 && resolved.length > 0 ? "yes" : "no");
		if (resolved !== void 0 && resolved.length > 0) return resolved;
		throw new WebError(`web search has no API key for "${key.ref}"; store it through the credentials service (the web Models page writes it), export it in the launching environment, or add it in the web-search-exa settings section`, "WEB_PROVIDER_CREDENTIAL_MISSING");
	}
	/** Paid REST attempt through the provider's spec. */
	async searchPaidRest(opts, provider, key, request, signal) {
		const spec = provider.spec;
		const apiKey = await this.apiKey(opts, provider, key, signal);
		throwIfSearchAborted(signal);
		const req = spec.buildRequest(request, { ...provider.params, baseURL: provider.paid.baseURL, numResults: provider.numResults });
		let response;
		try {
			response = await fetch(req.url, {
				method: req.method,
				redirect: "error",
				headers: { ...req.headers, "user-agent": USER_AGENT, [req.keyHeader]: apiKey },
				body: JSON.stringify(req.body),
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`${spec.providerName} search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) {
			let message = `${spec.providerName} API error (HTTP ${response.status})`;
			try {
				const detail = spec.errorMessage(await response.json());
				if (detail !== void 0 && detail.length > 0) message = detail;
			} catch (error) {
				if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			}
			const error = new WebError(message, "WEB_PROVIDER_ERROR");
			if (isDegradableStatus(response.status)) markDegradable(error, response.status);
			throw error;
		}
		try { return spec.mapResponse(await response.json()); } catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			if (error instanceof WebError) throw error;
			throw new WebError(`${spec.providerName} returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
	/**
	 * Anonymous search through the backend's public hosted MCP server. Performs
	 * the `initialize` handshake (carrying the session id forward), then calls
	 * the backend's search tool. No key is sent.
	 */
	async searchAnonymous(opts, provider, request, signal) {
		const spec = provider.spec;
		throwIfSearchAborted(signal);
		const endpoint = provider.free.baseURL;
		const headers = { "content-type": "application/json", "accept": "application/json, text/event-stream", "user-agent": USER_AGENT };
		let response;
		try {
			response = await fetch(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "um-dsh-websearch", version: VERSION } } }),
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`${spec.providerName} anonymous MCP initialize failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) throw markDegradable(new WebError(`${spec.providerName} anonymous MCP initialize failed (HTTP ${response.status})`, "WEB_PROVIDER_ERROR"), response.status);
		const initResult = await mcpSseData(response, signal, spec.providerName);
		if (initResult == null || initResult.error !== void 0) throw markDegradable(new WebError(`${spec.providerName} anonymous MCP initialize failed: ${mcpErrorMessage(initResult) ?? "no result"}`, "WEB_PROVIDER_ERROR"));
		const session = response.headers.get("mcp-session-id");
		// Some MCP servers require an explicit "ready" notification after
		// initialize. The notification is best-effort — its failure does not
		// abort the search, but an abort signal is still honored.
		if (spec.mcpPostInitialize === true) {
			try {
				await fetch(endpoint, {
					method: "POST",
					headers: { ...headers, ...(session !== null ? { "mcp-session-id": session } : {}) },
					body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
					...signal !== void 0 ? { signal } : {}
				});
			} catch (error) {
				if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			}
		}
		const sessionId = `um-dsh-${provider.id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 100);
		const args = spec.mcpArguments(request, { ...provider.params, numResults: provider.numResults }, sessionId);
		let toolResponse;
		try {
			toolResponse = await fetch(endpoint, {
				method: "POST",
				headers: { ...headers, ...(session !== null ? { "mcp-session-id": session } : {}) },
				body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: spec.mcpTool, arguments: args } }),
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`${spec.providerName} anonymous MCP search failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!toolResponse.ok) throw markDegradable(new WebError(`${spec.providerName} anonymous MCP search failed (HTTP ${toolResponse.status})`, "WEB_PROVIDER_ERROR"), toolResponse.status);
		const toolResult = await mcpSseData(toolResponse, signal, spec.providerName);
		if (toolResult == null || toolResult.error !== void 0) throw markDegradable(new WebError(`${spec.providerName} anonymous MCP search failed: ${mcpErrorMessage(toolResult) ?? "no result"}`, "WEB_PROVIDER_ERROR"));
		const content = toolResult.result?.content;
		const text = Array.isArray(content) ? content.filter((entry) => entry?.type === "text").map((entry) => entry.text).join("\n") : "";
		return spec.mcpPayload(text);
	}
	/**
	 * Paid DeepSeek Official search through the framework's own provider class
	 * (ADR-0004 D7). The key is pre-resolved here so a missing credential
	 * surfaces with OUR message and non-degradable code. The official class
	 * hides the HTTP status once a parseable error body exists (the message
	 * becomes the server's detail), so degradability is classified as:
	 * 1. an explicit `(HTTP NNN)` in the message → the standard status set;
	 * 2. a known non-degradable shape (no search-result block, unprocessable
	 *    body, network failure, credential resolution) → not degradable;
	 * 3. any other `WEB_PROVIDER_ERROR` → a detail-bearing server rejection,
	 *    marked degradable (Assumption: status unreachable by design).
	 */
	async searchDeepseek(opts, provider, key, request, signal) {
		const apiKey = await this.apiKey(opts, provider, key, signal);
		throwIfSearchAborted(signal);
		const params = provider.params;
		const runner = new DeepSeekSearchProvider(() => ({
			apiKey,
			apiKeyEnv: key.ref,
			baseURL: provider.paid.baseURL,
			model: typeof params.model === "string" && params.model.length > 0 ? params.model : DEFAULT_DEEPSEEK_MODEL,
			maxUses: isPositiveInteger(params.maxUses) ? params.maxUses : DEFAULT_DEEPSEEK_MAX_USES
		}));
		try {
			return await runner.search(request, signal);
		} catch (error) {
			if (error === null || typeof error !== "object" || !(error instanceof WebError) || error.code !== "WEB_PROVIDER_ERROR") throw error;
			const message = error.message ?? "";
			const match = /HTTP (\d{3})/u.exec(message);
			if (match !== null) {
				if (isDegradableStatus(Number(match[1]))) markDegradable(error, Number(match[1]));
				throw error;
			}
			if (/no web_search_tool_result|unprocessable response body|search request failed|credential resolution failed/u.test(message)) throw error;
			markDegradable(error);
			throw error;
		}
	}
	/** The cache fingerprint for one request under the current strategy. */
	cacheFingerprint(opts, request) {
		const shape = opts.providers.map((provider) => [
			provider.id, provider.enabled, provider.primaryTier,
			provider.paid.enabled, provider.paid.baseURL,
			provider.free.enabled, provider.free.baseURL,
			provider.keys.map((key) => [key.ref, key.enabled, key.allowFreeToPaid, key.allowPaidToFree]),
			provider.keysStrategy, provider.numResults, provider.params
		]);
		return JSON.stringify([request.query, request.maxResults ?? null, opts.defaultProvider, opts.concurrency, shape]);
	}
	cachePut(key, result, ttlSeconds) {
		if (this.cache.size >= CACHE_MAX_ENTRIES) {
			const oldest = this.cache.keys().next().value;
			if (oldest !== void 0) this.cache.delete(oldest);
		}
		// Store a detached copy: the caller receives the live result object, so
		// the store must never alias it.
		this.cache.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, result: cloneResult(result) });
	}
	/** Settings changed: cached results are stale by definition — drop them. */
	invalidateCache() {
		this.cache.clear();
	}
};
/** The legacy reference a UM_WS_ reference migrates from (only the two defaults). */
function legacyRefOf(ref) {
	for (const [legacy, umws] of UM_WS_MIGRATION_PAIRS) if (ref === umws) return legacy;
	return void 0;
}
/** Run one search result through the JSON boundary so cached hits are detached. */
function cloneResult(result) {
	return JSON.parse(JSON.stringify(result));
}
/** Deduplicate by URL across every success, in source order, capped at maxResults. */
function mergeSources(groups, maxResults) {
	const seen = new Set();
	const sources = [];
	for (const group of groups) {
		for (const source of group.sources ?? []) {
			if (source == null || typeof source.url !== "string" || source.url.length === 0 || seen.has(source.url)) continue;
			seen.add(source.url);
			sources.push(source);
		}
	}
	const cap = isPositiveInteger(maxResults) ? maxResults : void 0;
	if (cap !== void 0 && sources.length > cap) return { sources: sources.slice(0, cap), truncated: true };
	return { sources, truncated: false };
}
/** Run every source through a pool of at most `limit` workers; never rejects. */
async function runPool(items, limit, runner) {
	const results = new Array(items.length);
	let cursor = 0;
	const count = Math.min(Math.max(limit, 1), items.length);
	const workers = [];
	for (let worker = 0; worker < count; worker++) {
		workers.push((async () => {
			while (cursor < items.length) {
				const index = cursor++;
				try {
					results[index] = { ok: true, value: await runner(items[index]) };
				} catch (error) {
					results[index] = { ok: false, error };
				}
			}
		})());
	}
	await Promise.all(workers);
	return results;
}
//#endregion
//#region lib/types/credentials-migration.js
/**
 * One-time copy migration (ADR-0004 D4): when the legacy default reference
 * resolves and its UM_WS_ counterpart is empty, copy the value over. The
 * legacy reference is NEVER deleted — it may be a shared environment variable
 * owned by other tooling, and deleting it would be collateral damage.
 */
async function migrateUmwsCredentials(ctx) {
	const credentials = ctx.get("credentials");
	if (credentials === void 0) return;
	for (const [legacyRef, umwsRef] of UM_WS_MIGRATION_PAIRS) {
		try {
			const legacy = await credentials.resolve(legacyRef);
			if (legacy === void 0 || legacy.value.length === 0) continue;
			const modern = await credentials.resolve(umwsRef);
			if (modern !== void 0 && modern.value.length > 0) continue;
			await credentials.set(umwsRef, legacy.value);
		} catch {
			// migration is best-effort: a read-only store or a transient failure
			// must never block plugin activation
		}
	}
}
//#endregion
//#region lib/types/index.js
/**
 * Register the multi-provider strategy in `ctx.web` under `um-web-search`
 * (legacy alias `exa`). Providers are configured as an ordered `providers[]`
 * list with per-tier and per-key controls; `concurrency > 1` fans searches
 * out across sources; an optional in-memory TTL cache serves repeat queries.
 * @module um-dsh-websearch
 */
const name = "web-search-exa";
const inject = ["web"];
const WEB_SEARCH_EXA_SETTINGS_NAMESPACE = settingsNamespace("web-search-exa");
function apply(ctx, config) {
	const entry = config != null && typeof config === "object" ? config : {};
	let current = () => entry;
	const umbrella = new UmWebSearchProvider(() => resolveOptions(ctx, current() != null && typeof current() === "object" ? current() : entry));
	const legacyAlias = {
		id: EXA_PROVIDER_ID,
		get keyPresence() { return umbrella.keyPresence.get(UM_WS_EXA_API_KEY) ?? umbrella.keyPresence.get(LEGACY_EXA_API_KEY_ENV); },
		available() { return umbrella.available(); },
		async prime() { await umbrella.prime(); },
		search(request, signal) { return umbrella.search(request, signal); }
	};
	installSettingsSection(ctx, WEB_SEARCH_EXA_SETTINGS_NAMESPACE, Config, entry, {
		setSource: (source) => { current = source; },
		validate: validateConfig,
		onChange: () => { umbrella.invalidateCache(); void umbrella.prime(); }
	});
	ctx.on("credentials/reference-updated", (ref) => {
		const opts = umbrella.resolveOptions();
		const participates = opts.providers.some((provider) => provider.keys.some((key) => key.ref === ref));
		if (participates) void umbrella.prime();
	});
	ctx.web.registerSearchProvider(umbrella);
	ctx.web.registerSearchProvider(legacyAlias);
	void umbrella.prime();
	void migrateUmwsCredentials(ctx);
}
//#endregion
export { BACKEND_SPECS, BUILTIN_PROVIDERS, Config, DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MAX_USES, DEFAULT_DEEPSEEK_MODEL, DEFAULT_EXA_API_KEY_ENV, DEFAULT_EXA_BASE_URL, DEFAULT_EXA_MCP_BASE_URL, DEFAULT_NUM_RESULTS, DEFAULT_PARALLEL_API_KEY_ENV, DEFAULT_PARALLEL_BASE_URL, DEFAULT_PARALLEL_MCP_BASE_URL, DEFAULT_PARALLEL_MODE, DEFAULT_PARALLEL_NUM_RESULTS, DEFAULT_PREFERRED, DEFAULT_SEARCH_TYPE, EXA_PROVIDER_ID, EXA_SPEC, LEGACY_EXA_API_KEY_ENV, LEGACY_PARALLEL_API_KEY_ENV, MCP_PROTOCOL_VERSION, MCP_TOOL_WEB_SEARCH, PARALLEL_SPEC, SEARCH_BASE_URL_ENV, UM_PROVIDER_ID, UM_WS_DEEPSEEK_API_KEY, UM_WS_EXA_API_KEY, UM_WS_PARALLEL_API_KEY, UmWebSearchProvider, WEB_SEARCH_EXA_SETTINGS_NAMESPACE, apply, inject, migrateUmwsCredentials, name, resolveOptions, synthesizeLegacyProviders, validateConfig };
