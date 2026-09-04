import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { WebError } from "@deepseek-ai/dsh-web";
//#region lib/types/strategy-provider.js
/**
 * Dual-backend (Exa + Parallel) web search. The shared components live here and
 * each backend contributes one self-contained spec: endpoints, request builder,
 * response mapper, error-message extractor, and MCP handshake semantics. A
 * single-backend `ExaSearchProvider` runs one spec's two-way transport chain
 * (authentic REST / anonymous hosted MCP with a fallback between them), while
 * the umbrella `UmWebSearchProvider` layers a strategy on top: a master
 * `enabled`, a `preferred` ("exa"|"parallel"), and per-backend enable flags.
 * The strategy searches the preferred backend's transport chain first and
 * degrades to the other backend only when the primary's terminal error carries
 * the degradable flag and the other backend is enabled and usable.
 *
 * The wire formats and native `fetch` client are provider-private and do not
 * use `ctx.llm`. Structure mirrors @deepseek-ai/dsh-web-search-deepseek: one
 * options thunk per operation, credentials resolved per search, availability
 * computed live so a Settings toggle takes effect on the next operation.
 * @module um-dsh-websearch/provider
 */
/** Umbrella provider id this plugin registers under in `ctx.web`. */
const UM_PROVIDER_ID = "um-web-search";
/** Legacy provider id kept as a thin alias for `searchProvider: exa` deployments. */
const EXA_PROVIDER_ID = "exa";
/** Version string carried by the user-agent and the MCP client info. */
const VERSION = "0.5.0";
/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = `um-dsh-websearch/${VERSION}`;
/** MCP protocol version this client speaks. */
const MCP_PROTOCOL_VERSION = "2025-06-18";
/** Cap on per-result text fetched back as the snippet source (request side). */
const REQUEST_SNIPPET_CHARACTERS = 700;
/** Cap on the locally retained snippet (both backends, both transports). */
const SNIPPET_MAX_CHARACTERS = 800;
//#endregion
//#region lib/types/shared.js
/**
 * Shared helpers consumed by the single-backend provider, the umbrella
 * strategy provider, and both backend specs. They keep the chain semantics
 * (abort, degradable-status marking, credential resolution, credential-ref
 * validation, the JSON-RPC streamable-HTTP parser) in one place so the Exa
 * and Parallel specs stay small.
 */
/** Project the plugin config into per-backend options, with environment fallbacks. */
function resolveOptions(ctx, config) {
	const declaredExaApiKeyEnv = config.apiKeyEnv ?? DEFAULT_EXA_API_KEY_ENV;
	const declaredParallelApiKeyEnv = config.parallelApiKeyEnv ?? DEFAULT_PARALLEL_API_KEY_ENV;
	const exaKeyEnv = isValidApiKeyEnv(declaredExaApiKeyEnv) ? declaredExaApiKeyEnv : DEFAULT_EXA_API_KEY_ENV;
	const parallelKeyEnv = isValidApiKeyEnv(declaredParallelApiKeyEnv) ? declaredParallelApiKeyEnv : DEFAULT_PARALLEL_API_KEY_ENV;
	const literalExaKey = config.apiKey !== void 0 && config.apiKey.length > 0 ? config.apiKey : void 0;
	const literalParallelKey = config.parallelApiKey !== void 0 && config.parallelApiKey.length > 0 ? config.parallelApiKey : void 0;
	const makeResolver = (keyEnv) => async () => {
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) return (await credentials.resolve(keyEnv))?.value;
		const ambient = launchEnvironmentOf(ctx).get(keyEnv);
		return ambient !== void 0 && ambient.value.length > 0 ? ambient.value : void 0;
	};
	// `exaEnabled` defaults to true, so only an explicit false disables the
	// backend — a raw composition entry that never names the key (the
	// settings-absent fallback feeds it here) must keep the 0.3.0 behavior.
	const exaEnabled = config.enabled === true && config.exaEnabled !== false;
	const parallelEnabled = config.enabled === true && config.parallelEnabled === true;
	const preferred = isPreferred(config.preferred) ? config.preferred : DEFAULT_PREFERRED;
	const common = { ctx, enabled: config.enabled === true, preferred };
	return {
		...common,
		backends: {
			exa: {
				...common,
				enabled: exaEnabled,
				...literalExaKey === void 0 ? {} : { apiKey: literalExaKey },
				resolveApiKey: makeResolver(exaKeyEnv),
				apiKeyEnv: exaKeyEnv,
				apiKeyEnvInvalid: declaredExaApiKeyEnv !== exaKeyEnv,
				allowAnonymous: config.allowAnonymous === true,
				fallbackToAnonymous: config.fallbackToAnonymous === true,
				fallbackToPaid: config.fallbackToPaid === true,
				baseURL: normalizeBaseUrl(config.baseURL ?? launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value ?? DEFAULT_EXA_BASE_URL),
				mcpBaseURL: normalizeBaseUrl(config.mcpBaseURL ?? DEFAULT_EXA_MCP_BASE_URL),
				numResults: isPositiveInteger(config.numResults) ? config.numResults : DEFAULT_NUM_RESULTS,
				searchType: isSearchType(config.searchType) ? config.searchType : DEFAULT_SEARCH_TYPE
			},
			parallel: {
				...common,
				enabled: parallelEnabled,
				...literalParallelKey === void 0 ? {} : { apiKey: literalParallelKey },
				resolveApiKey: makeResolver(parallelKeyEnv),
				apiKeyEnv: parallelKeyEnv,
				apiKeyEnvInvalid: declaredParallelApiKeyEnv !== parallelKeyEnv,
				allowAnonymous: config.parallelAllowAnonymous === true,
				fallbackToAnonymous: config.parallelFallbackToAnonymous === true,
				fallbackToPaid: config.parallelFallbackToPaid === true,
				baseURL: normalizeBaseUrl(config.parallelBaseURL ?? DEFAULT_PARALLEL_BASE_URL),
				mcpBaseURL: normalizeBaseUrl(config.parallelMcpBaseURL ?? DEFAULT_PARALLEL_MCP_BASE_URL),
				numResults: isPositiveInteger(config.parallelNumResults) ? config.parallelNumResults : DEFAULT_PARALLEL_NUM_RESULTS,
				mode: isParallelMode(config.parallelMode) ? config.parallelMode : DEFAULT_PARALLEL_MODE
			}
		},
		preferred
	};
}
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
/** True when the value names a registered backend. */
function isPreferred(value) {
	return value === "exa" || value === "parallel";
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
//#region lib/types/single-backend-provider.js
/**
 * Single-backend search provider: runs one backend spec's two-way transport
 * chain (authenticated REST / anonymous hosted MCP) with a fallback between
 * them. The Exa and Parallel specs plug into the same class.
 */
var ExaSearchProvider = class {
	spec;
	resolveOptions;
	id = EXA_PROVIDER_ID;
	/**
	 * Tri-state credential knowledge: `unknown` (nothing resolved yet — stay
	 * optimistic so a pinned selection is not blocked by startup timing), `yes`
	 * (a key was resolved or configured literally), `no` (resolution came back
	 * empty). Re-probed on activation, credential updates, section changes, and
	 * every search. Anonymous mode never consults it.
	 */
	keyPresence = "unknown";
	/**
	 * @param spec - the backend spec this instance runs (e.g. EXA_SPEC).
	 * Defaults to EXA_SPEC for the legacy single-argument constructor.
	 * @param resolveOptions - the options for the NEXT operation, snapshotted
	 * once at each operation's entry so one search never mixes two sections.
	 */
	constructor(spec = EXA_SPEC, resolveOptions = spec) {
		if (typeof spec === "function") {
			// Legacy single-argument constructor: the argument is the options thunk.
			this.spec = EXA_SPEC;
			this.resolveOptions = spec;
		} else {
			this.spec = spec;
			this.resolveOptions = resolveOptions;
		}
		// One stable session id per provider activation, used by the Parallel
		// anonymous MCP path (free tier rate-limits by session_id).
		this.mcpSessionId = `um-dsh-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
	}
	available() {
		const options = this.resolveOptions();
		if (!options.enabled) return false;
		if (this.canUse(options, options.allowAnonymous ? "anonymous" : "paid")) return true;
		return (options.allowAnonymous ? options.fallbackToPaid === true : options.fallbackToAnonymous === true) && this.canUse(options, options.allowAnonymous ? "paid" : "anonymous");
	}
	/** Whether one transport is configured to serve right now. */
	canUse(options, transport) {
		if (transport === "anonymous") return URL.canParse(options.mcpBaseURL);
		const pinnedKey = (options.apiKey?.length ?? 0) > 0;
		if (!pinnedKey && (options.apiKeyEnvInvalid || this.keyPresence === "no")) return false;
		return URL.canParse(options.baseURL);
	}
	/**
	 * Probe the credential plane once without a search, so availability
	 * reflects reality before the first query. Resolution failures keep
	 * `unknown` — they are transient by nature, unlike an empty resolution.
	 */
	async prime() {
		const options = this.resolveOptions();
		if (!options.enabled || (options.apiKey?.length ?? 0) > 0) return;
		if (options.allowAnonymous && !options.fallbackToPaid) return;
		try {
			const resolved = await options.resolveApiKey();
			this.keyPresence = resolved !== void 0 && resolved.length > 0 ? "yes" : "no";
		} catch {
			// keep "unknown": an errored probe says nothing about presence
		}
	}
	/**
	 * Search through the primary transport, degrading to the other when the
	 * primary is rejected server-side and a fallback switch is on. Aborts
	 * (`WEB_ABORTED`), credential gaps, contract, and network-layer failures
	 * never degrade the chain.
	 */
	async search(request, signal) {
		const options = this.resolveOptions();
		if (!options.enabled) throw new WebError(`${this.spec.providerName} provider is disabled by its settings section`, "WEB_PROVIDER_ERROR");
		const primary = options.allowAnonymous ? "anonymous" : "paid";
		const fallback = options.allowAnonymous ? "paid" : "anonymous";
		const fallbackEnabled = options.allowAnonymous ? options.fallbackToPaid === true : options.fallbackToAnonymous === true;
		const attempt = (transport) => transport === "anonymous" ? this.searchAnonymous(request, options, signal) : this.searchPaid(request, options, signal);
		if (!fallbackEnabled) return attempt(primary);
		let primaryError;
		try { return await attempt(primary); } catch (error) {
			if (error === null || typeof error !== "object" || !(error instanceof WebError) || error._degradable !== true) throw error;
			primaryError = error;
		}
		if (!this.canUse(options, fallback)) throw primaryError;
		try {
			return await attempt(fallback);
		} catch (fallbackError) {
			if (fallbackError !== null && typeof fallbackError === "object" && fallbackError instanceof WebError && fallbackError.code === "WEB_ABORTED") throw fallbackError;
			throw combinedFailure(primaryError, fallbackError, this.spec.providerName);
		}
	}
	async searchPaid(request, options, signal) {
		const apiKey = await this.apiKey(options, signal);
		throwIfSearchAborted(signal);
		const req = this.spec.buildRequest(request, options);
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
			throw new WebError(`${this.spec.providerName} search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) {
			let message = `${this.spec.providerName} API error (HTTP ${response.status})`;
			try {
				const detail = this.spec.errorMessage(await response.json());
				if (detail !== void 0 && detail.length > 0) message = detail;
			} catch (error) {
				if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			}
			const error = new WebError(message, "WEB_PROVIDER_ERROR");
			if (isDegradableStatus(response.status)) markDegradable(error, response.status);
			throw error;
		}
		try { return this.spec.mapResponse(await response.json()); } catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			if (error instanceof WebError) throw error;
			throw new WebError(`${this.spec.providerName} returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
	/**
	 * Anonymous search through the backend's public hosted MCP server. Performs
	 * the `initialize` handshake (carrying the session id forward), then calls
	 * the backend's search tool. No key is sent.
	 */
	async searchAnonymous(request, options, signal) {
		throwIfSearchAborted(signal);
		const endpoint = options.mcpBaseURL;
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
			throw new WebError(`${this.spec.providerName} anonymous MCP initialize failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) throw markDegradable(new WebError(`${this.spec.providerName} anonymous MCP initialize failed (HTTP ${response.status})`, "WEB_PROVIDER_ERROR"), response.status);
		const initResult = await mcpSseData(response, signal, this.spec.providerName);
		if (initResult == null || initResult.error !== void 0) throw markDegradable(new WebError(`${this.spec.providerName} anonymous MCP initialize failed: ${mcpErrorMessage(initResult) ?? "no result"}`, "WEB_PROVIDER_ERROR"));
		const session = response.headers.get("mcp-session-id");
		// Some MCP servers require an explicit "ready" notification after
		// initialize. The notification is best-effort — its failure does not
		// abort the search, but an abort signal is still honored.
		if (this.spec.mcpPostInitialize === true) {
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
		const args = this.spec.mcpArguments(request, options, this.mcpSessionId);
		let toolResponse;
		try {
			toolResponse = await fetch(endpoint, {
				method: "POST",
				headers: { ...headers, ...(session !== null ? { "mcp-session-id": session } : {}) },
				body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: this.spec.mcpTool, arguments: args } }),
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`${this.spec.providerName} anonymous MCP search failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!toolResponse.ok) throw markDegradable(new WebError(`${this.spec.providerName} anonymous MCP search failed (HTTP ${toolResponse.status})`, "WEB_PROVIDER_ERROR"), toolResponse.status);
		const toolResult = await mcpSseData(toolResponse, signal, this.spec.providerName);
		if (toolResult == null || toolResult.error !== void 0) throw markDegradable(new WebError(`${this.spec.providerName} anonymous MCP search failed: ${mcpErrorMessage(toolResult) ?? "no result"}`, "WEB_PROVIDER_ERROR"));
		const content = toolResult.result?.content;
		const text = Array.isArray(content) ? content.filter((entry) => entry?.type === "text").map((entry) => entry.text).join("\n") : "";
		return this.spec.mcpPayload(text);
	}
	async apiKey(options, signal) {
		throwIfSearchAborted(signal);
		if (options.apiKey !== void 0 && options.apiKey.length > 0) { this.keyPresence = "yes"; return options.apiKey; }
		if (options.apiKeyEnvInvalid) throw new WebError(`${this.spec.providerName} search has no API key: the configured key reference is not a valid environment-variable name (use letters, digits, and underscores, starting with a letter or underscore); fix it in the web-search-exa settings section`, "WEB_PROVIDER_CREDENTIAL_MISSING");
		let resolved;
		try { resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(void 0), signal); } catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`${this.spec.providerName} search credential resolution failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		this.keyPresence = resolved !== void 0 && resolved.length > 0 ? "yes" : "no";
		if (this.keyPresence === "yes") return resolved;
		throw new WebError(`${this.spec.providerName} search has no API key for "${options.apiKeyEnv ?? DEFAULT_EXA_API_KEY_ENV}"; store it through the credentials service, export it in the launching environment, or set a literal "apiKey" in the web-search-exa settings section`, "WEB_PROVIDER_CREDENTIAL_MISSING");
	}
};
//#endregion
//#region lib/types/constants.js
const DEFAULT_EXA_API_KEY_ENV = "EXA_API_KEY";
const DEFAULT_PARALLEL_API_KEY_ENV = "PARALLEL_API_KEY";
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
//#endregion
//#region lib/types/legacy-combined.js
/** Combine a primary and a fallback transport failure into one surfaced error. */
function combinedFailure(primaryError, fallbackError, providerName) {
	return new WebError(
		`${providerName} search failed on both transports (primary: ${primaryError.message ?? String(primaryError)}; fallback: ${fallbackError.message ?? String(fallbackError)})`,
		"WEB_PROVIDER_ERROR",
		{ cause: fallbackError }
	);
}
//#endregion
//#region lib/types/umbrella-provider.js
/**
 * Umbrella provider layering a strategy over the two backends. It registers
 * under id `um-web-search` and, for backward compatibility, keeps a thin alias
 * under id `exa` that shares the same instance's `available`/`search`/`prime`.
 * Search = preferred backend's transport chain, degrading to the other backend
 * only when the primary's terminal error carries the degradable flag and the
 * other backend is enabled and usable.
 */
var UmWebSearchProvider = class {
	resolveOptions;
	id = UM_PROVIDER_ID;
	backends = {};
	constructor(resolveOptions) {
		this.resolveOptions = resolveOptions;
		this.backends = {
			exa: new ExaSearchProvider(EXA_SPEC, () => resolveOptions().backends.exa),
			parallel: new ExaSearchProvider(PARALLEL_SPEC, () => resolveOptions().backends.parallel)
		};
	}
	// The strategy derives from the CURRENT section on every operation: a
	// `preferred` flip (like any other field) takes effect on the next search,
	// never at construction.
	get primaryName() {
		return this.resolveOptions().preferred;
	}
	get secondaryName() {
		return this.primaryName === "exa" ? "parallel" : "exa";
	}
	available() {
		// Each single-backend availability already carries its enable flag and
		// the full chain semantics (primary transport, or the switched fallback
		// transport when the primary cannot serve) — the strategy availability
		// is simply "some backend in the chain can serve".
		return this.backends[this.primaryName].available() || this.backends[this.secondaryName].available();
	}
	async prime() {
		for (const [name, backend] of Object.entries(this.backends)) {
			const opts = this.resolveOptions().backends[name];
			if (!opts.enabled) continue;
			const transport = opts.allowAnonymous ? "anonymous" : "paid";
			const probeKey = transport === "paid" || (transport === "anonymous" && opts.fallbackToPaid === true);
			if (probeKey) await backend.prime();
		}
	}
	async search(request, signal) {
		const opts = this.resolveOptions();
		// A disabled preferred backend is skipped outright: when the other
		// backend is enabled it heads the chain; when nothing is enabled the
		// preferred backend answers with its settings-disabled error, keeping
		// the single-backend semantics.
		const headName = opts.backends[this.primaryName].enabled || !opts.backends[this.secondaryName].enabled ? this.primaryName : this.secondaryName;
		const tailName = headName === "exa" ? "parallel" : "exa";
		const head = this.backends[headName];
		const tail = this.backends[tailName];
		const tailOpts = opts.backends[tailName];
		let primaryError;
		try { return await head.search(request, signal); } catch (error) {
			if (error === null || typeof error !== "object" || !(error instanceof WebError) || error._degradable !== true) throw error;
			primaryError = error;
		}
		// Cross-backend degrade only when the other backend is enabled and
		// actually configured to serve; otherwise the primary rejection is the
		// honest answer.
		const tailTransport = tailOpts.allowAnonymous ? "anonymous" : "paid";
		if (!tailOpts.enabled || !tail.canUse(tailOpts, tailTransport)) throw primaryError;
		try { return await tail.search(request, signal); } catch (fallbackError) {
			if (fallbackError !== null && typeof fallbackError === "object" && fallbackError instanceof WebError && fallbackError.code === "WEB_ABORTED") throw fallbackError;
			throw combinedFailureAcrossBackends(primaryError, fallbackError);
		}
	}
};
function combinedFailureAcrossBackends(primaryError, fallbackError) {
	return new WebError(
		`web search failed on both backends (preferred: ${primaryError.message ?? String(primaryError)}; fallback: ${fallbackError.message ?? String(fallbackError)})`,
		"WEB_PROVIDER_ERROR",
		{ cause: fallbackError }
	);
}
//#endregion
//#region lib/types/index.js
/**
 * Register the dual-backend provider in `ctx.web`. Authenticated searches call
 * each backend's REST endpoint with a literal or referenced credential;
 * anonymous mode searches through each backend's public hosted MCP endpoint
 * with no key. Two switches per backend (`fallbackToPaid` / `fallbackToAnonymous`)
 * degrade to the other transport on server-side rejection; the umbrella strategy
 * (`preferred`, `exaEnabled`, `parallelEnabled`) picks which backend's chain
 * runs first. The provider ships disabled (`enabled: false`); flip it in its
 * Settings section to make it usable, then point `web.searchProvider` at
 * `"um-web-search"` (or the legacy `"exa"` alias).
 * @module um-dsh-websearch
 */
const name = "web-search-exa";
const inject = ["web"];
const Config = z.object({
	enabled: z.boolean().default(false),
	preferred: z.string().default(DEFAULT_PREFERRED),
	exaEnabled: z.boolean().default(true),
	parallelEnabled: z.boolean().default(false),
	allowAnonymous: z.boolean().default(false),
	fallbackToPaid: z.boolean().default(false),
	fallbackToAnonymous: z.boolean().default(false),
	apiKey: z.string().role("secret"),
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_EXA_API_KEY_ENV),
	baseURL: z.string().default(DEFAULT_EXA_BASE_URL),
	mcpBaseURL: z.string().default(DEFAULT_EXA_MCP_BASE_URL),
	numResults: z.number().step(1).min(1).max(10).default(DEFAULT_NUM_RESULTS),
	searchType: z.string().default(DEFAULT_SEARCH_TYPE),
	parallelAllowAnonymous: z.boolean().default(false),
	parallelFallbackToPaid: z.boolean().default(false),
	parallelFallbackToAnonymous: z.boolean().default(false),
	parallelApiKey: z.string().role("secret"),
	parallelApiKeyEnv: z.string().role("credential-ref").default(DEFAULT_PARALLEL_API_KEY_ENV),
	parallelBaseURL: z.string().default(DEFAULT_PARALLEL_BASE_URL),
	parallelMcpBaseURL: z.string().default(DEFAULT_PARALLEL_MCP_BASE_URL),
	parallelNumResults: z.number().step(1).min(1).max(20).default(DEFAULT_PARALLEL_NUM_RESULTS),
	parallelMode: z.string().default(DEFAULT_PARALLEL_MODE)
});
const WEB_SEARCH_EXA_SETTINGS_NAMESPACE = settingsNamespace("web-search-exa");
function apply(ctx, config) {
	const entry = config != null && typeof config === "object" ? config : {};
	let current = () => entry;
	const umbrella = new UmWebSearchProvider(() => resolveOptions(ctx, current() != null && typeof current() === "object" ? current() : entry));
	const legacyAlias = {
		id: EXA_PROVIDER_ID,
		get keyPresence() { return umbrella.backends.exa.keyPresence; },
		available() { return umbrella.available(); },
		async prime() { await umbrella.prime(); },
		search(request, signal) { return umbrella.search(request, signal); }
	};
	installSettingsSection(ctx, WEB_SEARCH_EXA_SETTINGS_NAMESPACE, Config, entry, {
		setSource: (source) => { current = source; },
		onChange: () => { void umbrella.prime(); }
	});
	ctx.on("credentials/reference-updated", (ref) => {
		const opts = umbrella.resolveOptions();
		if (ref === opts.backends.exa.apiKeyEnv || ref === opts.backends.parallel.apiKeyEnv) void umbrella.prime();
	});
	ctx.web.registerSearchProvider(umbrella);
	ctx.web.registerSearchProvider(legacyAlias);
	void umbrella.prime();
}
//#endregion
export { Config, DEFAULT_EXA_API_KEY_ENV, DEFAULT_NUM_RESULTS, DEFAULT_SEARCH_TYPE, DEFAULT_PREFERRED, DEFAULT_PARALLEL_MODE, DEFAULT_PARALLEL_NUM_RESULTS, DEFAULT_EXA_BASE_URL, DEFAULT_PARALLEL_BASE_URL, DEFAULT_EXA_MCP_BASE_URL, DEFAULT_PARALLEL_MCP_BASE_URL, EXA_PROVIDER_ID, UM_PROVIDER_ID, ExaSearchProvider, UmWebSearchProvider, MCP_PROTOCOL_VERSION, MCP_TOOL_WEB_SEARCH, SEARCH_BASE_URL_ENV, WEB_SEARCH_EXA_SETTINGS_NAMESPACE, apply, inject, name };
