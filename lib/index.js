import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { WebError } from "@deepseek-ai/dsh-web";
//#region lib/types/provider.js
/**
 * Exa (exa.ai) web search. Two transports share one provider:
 *  - Authenticated: the `/search` REST endpoint with a literal or referenced key.
 *  - Anonymous (`allowAnonymous`): Exa's public hosted MCP server
 *    (`https://mcp.exa.ai/mcp`), which needs no key — the provider speaks enough
 *    of the MCP streamable-HTTP protocol (`initialize` + `tools/call
 *    web_search_exa`) to search without credentials.
 * The wire formats and native `fetch` client are provider-private and do not
 * use `ctx.llm`. Structure mirrors @deepseek-ai/dsh-web-search-deepseek: one
 * options thunk per operation, credentials resolved per search, availability
 * computed live so a Settings toggle takes effect on the next operation.
 * @module um-dsh-websearch/provider
 */
/** Stable id this provider registers under in `ctx.web`. */
const EXA_PROVIDER_ID = "exa";
/**
 * Default REST endpoint base. `/search` is appended; an ambient `$EXA_BASE_URL`
 * override keeps parity with the deepseek provider's separate search-endpoint
 * variable without reusing any chat-completions base.
 */
const EXA_DEFAULT_BASE_URL = "https://api.exa.ai";
/** Default anonymous MCP endpoint. Bump `MCP_PROTOCOL_VERSION` with Exa. */
const EXA_MCP_DEFAULT_BASE_URL = "https://mcp.exa.ai/mcp";
/** MCP protocol version this client speaks. */
const MCP_PROTOCOL_VERSION = "2025-06-18";
/** The MCP tool that returns clean web-search results. */
const MCP_TOOL_WEB_SEARCH = "web_search_exa";
/** Default credential reference: the environment variable name holding the key. */
const DEFAULT_API_KEY_ENV = "EXA_API_KEY";
/** Default result count for searches that carry no explicit `maxResults`. */
const DEFAULT_NUM_RESULTS = 5;
/** Default Exa `type` parameter (REST only). */
const DEFAULT_SEARCH_TYPE = "auto";
/** Cap on per-result text fetched back as the snippet source. */
const SNIPPET_MAX_CHARACTERS = 700;
/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = "um-dsh-websearch/0.2.0";
/** Ambient override for the search endpoint base, distinct from any LLM base URL. */
const SEARCH_BASE_URL_ENV = "EXA_BASE_URL";
/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider:
 * every value it reads is already fully defaulted.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(ctx, config) {
	const declaredApiKeyEnv = config.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
	// An invalid stored name falls back to the default reference instead of
	// throwing: availability, priming, and every search read this on entry,
	// and a raw TypeError here would take the whole provider down with it.
	const apiKeyEnv = credentialRef(isValidApiKeyEnv(declaredApiKeyEnv) ? declaredApiKeyEnv : DEFAULT_API_KEY_ENV);
	const literalApiKey = config.apiKey !== void 0 && config.apiKey.length > 0 ? config.apiKey : void 0;
	return {
		enabled: config.enabled === true,
		...literalApiKey === void 0 ? {} : { apiKey: literalApiKey },
		resolveApiKey: async () => {
			const credentials = ctx.get("credentials");
			if (credentials !== void 0) return (await credentials.resolve(apiKeyEnv))?.value;
			const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv);
			return ambient !== void 0 && ambient.value.length > 0 ? ambient.value : void 0;
		},
		apiKeyEnv,
		apiKeyEnvInvalid: declaredApiKeyEnv !== apiKeyEnv,
		allowAnonymous: config.allowAnonymous === true,
		baseURL: normalizeBaseUrl(config.baseURL ?? launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value ?? EXA_DEFAULT_BASE_URL),
		mcpBaseURL: normalizeBaseUrl(config.mcpBaseURL ?? EXA_MCP_DEFAULT_BASE_URL),
		numResults: isPositiveInteger(config.numResults) ? config.numResults : DEFAULT_NUM_RESULTS,
		searchType: isSearchType(config.searchType) ? config.searchType : DEFAULT_SEARCH_TYPE
	};
}
/** Strip trailing slashes so `${baseURL}/search` never doubles them. */
function normalizeBaseUrl(value) {
	return value.replace(/\/+$/u, "");
}
/** True when the value names a supported Exa `type` parameter. */
function isSearchType(value) {
	return value === "auto" || value === "neural" || value === "keyword";
}
/** True for result limits that can be sent to the Exa API. */
function isPositiveInteger(value) {
	return Number.isInteger(value) && value > 0;
}
/**
 * Local mirror of the credentials seam's reference grammar (`dsh-credentials`
 * does not export its pattern). Guards the settings boundary so a bad stored
 * name degrades to "credential missing" instead of throwing out of
 * `resolveOptions`, which every operation calls before anything else.
 */
const API_KEY_ENV_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
/** True when a raw settings string names a usable credential reference. */
function isValidApiKeyEnv(value) {
	return typeof value === "string" && API_KEY_ENV_PATTERN.test(value);
}
/**
 * Map one Exa `/search` response to a normalized search result. Snippet source
 * prefers `text` (requested via `contents.text.maxCharacters`), then `summary`,
 * then joined `highlights`. Dedupes by `url`. The web service owns the final
 * `maxResults` truncation, so `truncated` is always `false` here.
 * @param response - the parsed response body.
 * @returns the normalized result with deduped sources.
 * @throws {@link WebError} when the body carries no `results[]` array.
 */
function mapExaResponse(response) {
	if (!Array.isArray(response.results)) throw new WebError("Exa returned no results[] array", "WEB_PROVIDER_ERROR");
	const seen = /* @__PURE__ */ new Set();
	const sources = [];
	for (const item of response.results) {
		if (item == null || typeof item !== "object" || typeof item.url !== "string" || item.url.length === 0 || seen.has(item.url)) continue;
		seen.add(item.url);
		sources.push({
			url: item.url,
			...(typeof item.title === "string" && item.title.length > 0 ? { title: item.title } : {}),
			...snippetOf(item),
			...(typeof item.publishedDate === "string" && item.publishedDate.length > 0 ? { publishedAt: item.publishedDate } : {})
		});
	}
	return { sources, truncated: false };
}
/** First non-empty snippet candidate of one raw result, as the seam's optional `snippet`. */
function snippetOf(item) {
	let snippet = "";
	if (typeof item.text === "string") snippet = item.text;
	else if (typeof item.summary === "string") snippet = item.summary;
	else if (Array.isArray(item.highlights)) snippet = item.highlights.filter((part) => typeof part === "string").join(" … ");
	snippet = snippet.trim().slice(0, 800);
	return snippet.length > 0 ? { snippet } : {};
}
/**
 * Parse the `web_search_exa` text payload into normalized sources. The tool
 * emits one block per result starting on a `Title:` line, followed by
 * `URL:`/`Published:`/`Author:`/`Highlights:` — so blocks are split on `Title:`
 * alone (markdown `---` separators inside a block must not break it). Dedupes
 * by `url`.
 * @param text - the tool's plain-text result payload.
 * @returns the normalized result with deduped sources.
 */
function parseMcpResults(text) {
	const seen = /* @__PURE__ */ new Set();
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
		if (urlMatch !== null) {
			block.url = urlMatch[1];
			continue;
		}
		const pubMatch = /^Published:\s*(.+)$/u.exec(raw);
		if (pubMatch !== null) {
			const value = pubMatch[1].trim();
			if (value.length > 0 && value !== "N/A") block.publishedAt = value;
			continue;
		}
		if (/^Author:\s*/u.test(raw)) continue;
		if (/^Highlights:\s*$/u.test(raw)) {
			block.highlights = [];
			continue;
		}
		if (Array.isArray(block.highlights)) block.highlights.push(raw);
	}
	if (block !== null) blocks.push(block);
	for (const entry of blocks) {
		if (entry.url == null || seen.has(entry.url)) continue;
		seen.add(entry.url);
		const snippet = (Array.isArray(entry.highlights) ? entry.highlights.join("\n").trim().slice(0, 800) : "");
		sources.push({
			url: entry.url,
			...(entry.title != null && entry.title.length > 0 ? { title: entry.title } : {}),
			...(snippet.length > 0 ? { snippet } : {}),
			...(entry.publishedAt != null ? { publishedAt: entry.publishedAt } : {})
		});
	}
	return sources;
}
/**
 * Collect the JSON-RPC response object from an MCP streamable-HTTP (SSE) body.
 * `data:` frames may carry several objects; the request answer is the first
 * with a `result` or `error` member.
 * @param response - the fetch Response of one MCP exchange.
 * @param signal - abort signal for the surrounding search.
 * @returns the parsed JSON-RPC message, or undefined when none carried a result.
 */
async function mcpSseData(response, signal) {
	let text;
	try {
		text = await response.text();
	} catch (error) {
		if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
		throw new WebError(`Exa anonymous MCP read failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
	}
	for (const line of text.split(/\r?\n/u)) {
		if (!line.startsWith("data:")) continue;
		const payload = line.slice(5).trim();
		if (payload.length === 0) continue;
		let parsed;
		try {
			parsed = JSON.parse(payload);
		} catch (error) {
			throw new WebError("Exa anonymous MCP returned an unparseable payload", "WEB_PROVIDER_ERROR", { cause: error });
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
/** Extract the human-readable message from an Exa error body, if any. */
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
/** Throw the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal, fallback) {
	return new WebError("Exa search aborted", "WEB_ABORTED", { cause: signal?.aborted === true ? signal.reason : fallback });
}
/** The Exa-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
var ExaSearchProvider = class {
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
	 * @param resolveOptions - the options for the NEXT operation, snapshotted once
	 * at each operation's entry so one search never mixes two sections. A thunk
	 * rather than a value because the Settings section can change between
	 * searches; `enabled`, the stored key, and the endpoint all take effect live.
	 */
	constructor(resolveOptions) {
		this.resolveOptions = resolveOptions;
	}
	available() {
		const options = this.resolveOptions();
		if (!options.enabled) return false;
		// Anonymous mode is independent of the credential plane: the public MCP
		// endpoint needs no key, so availability only needs a reachable base.
		if (options.allowAnonymous) return URL.canParse(options.mcpBaseURL);
		// Authenticated mode: a literal key answers by itself; a probed-absent
		// key or an invalid stored reference disqualifies the credential plane.
		const pinnedKey = (options.apiKey?.length ?? 0) > 0;
		if (!pinnedKey && (options.apiKeyEnvInvalid || this.keyPresence === "no")) return false;
		return URL.canParse(options.baseURL);
	}
	/**
	 * Probe the credential plane once without a search, so availability reflects
	 * reality before the first query. Resolution failures keep `unknown` — they
	 * are transient by nature, unlike an empty resolution.
	 */
	async prime() {
		const options = this.resolveOptions();
		if (!options.enabled || options.allowAnonymous || (options.apiKey?.length ?? 0) > 0) return;
		try {
			const resolved = await options.resolveApiKey();
			this.keyPresence = resolved !== void 0 && resolved.length > 0 ? "yes" : "no";
		} catch {
			// keep "unknown": an errored probe says nothing about presence
		}
	}
	async search(request, signal) {
		const options = this.resolveOptions();
		if (!options.enabled) throw new WebError("the exa provider is disabled by its settings section", "WEB_PROVIDER_ERROR");
		if (options.allowAnonymous) return this.searchAnonymous(request, options, signal);
		const apiKey = await this.apiKey(options, signal);
		throwIfSearchAborted(signal);
		const numResults = clampResults(request.maxResults, options.numResults);
		const body = {
			query: request.query,
			numResults,
			contents: { text: { maxCharacters: SNIPPET_MAX_CHARACTERS } }
		};
		if (options.searchType !== DEFAULT_SEARCH_TYPE) body.type = options.searchType;
		const endpoint = `${options.baseURL}/search`;
		let response;
		try {
			response = await fetch(endpoint, {
				method: "POST",
				redirect: "error",
				headers: {
					"x-api-key": apiKey,
					"content-type": "application/json",
					"accept": "application/json",
					"user-agent": USER_AGENT
				},
				body: JSON.stringify(body),
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`Exa search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) {
			let message = `Exa API error (HTTP ${response.status})`;
			try {
				const detail = exaErrorMessage(await response.json());
				if (detail !== void 0 && detail.length > 0) message = detail;
			} catch (error) {
				if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			}
			throw new WebError(message, "WEB_PROVIDER_ERROR");
		}
		try {
			return mapExaResponse(await response.json());
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			if (error instanceof WebError) throw error;
			throw new WebError(`Exa returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
	/**
	 * Anonymous search through Exa's public hosted MCP server. Performs the
	 * `initialize` handshake (carrying the session id forward), then calls the
	 * `web_search_exa` tool. No key is sent; the endpoint is an operator-set
	 * `mcpBaseURL` so a self-hosted proxy can stand in for the public server.
	 * @param request - the normalized search request.
	 * @param options - the current options snapshot (anonymous mode).
	 * @param signal - abort signal for the surrounding search.
	 * @returns the normalized result with deduped sources.
	 */
	async searchAnonymous(request, options, signal) {
		const numResults = clampResults(request.maxResults, options.numResults);
		const endpoint = options.mcpBaseURL;
		const headers = {
			"content-type": "application/json",
			"accept": "application/json, text/event-stream",
			"user-agent": USER_AGENT
		};
		let response;
		try {
			response = await fetch(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: MCP_PROTOCOL_VERSION,
						capabilities: {},
						clientInfo: { name: "um-dsh-websearch", version: "0.2.0" }
					}
				}),
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`Exa anonymous MCP initialize failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) throw new WebError(`Exa anonymous MCP initialize failed (HTTP ${response.status})`, "WEB_PROVIDER_ERROR");
		const initResult = await mcpSseData(response, signal);
		if (initResult == null || initResult.error !== void 0) throw new WebError(`Exa anonymous MCP initialize failed: ${mcpErrorMessage(initResult) ?? "no result"}`, "WEB_PROVIDER_ERROR");
		const session = response.headers.get("mcp-session-id");
		let toolResponse;
		try {
			toolResponse = await fetch(endpoint, {
				method: "POST",
				headers: {
					...headers,
					...(session !== null ? { "mcp-session-id": session } : {})
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/call",
					params: {
						name: MCP_TOOL_WEB_SEARCH,
						arguments: { query: request.query, numResults }
					}
				}),
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`Exa anonymous MCP search failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!toolResponse.ok) throw new WebError(`Exa anonymous MCP search failed (HTTP ${toolResponse.status})`, "WEB_PROVIDER_ERROR");
		const toolResult = await mcpSseData(toolResponse, signal);
		if (toolResult == null || toolResult.error !== void 0) throw new WebError(`Exa anonymous MCP search failed: ${mcpErrorMessage(toolResult) ?? "no result"}`, "WEB_PROVIDER_ERROR");
		const content = toolResult.result?.content;
		const text = Array.isArray(content) ? content.filter((entry) => entry?.type === "text").map((entry) => entry.text).join("\n") : "";
		return { sources: parseMcpResults(text), truncated: false };
	}
	/**
	 * Resolve one operation's credential without retaining it on the provider.
	 * @param options - the caller's snapshot, so the key and the endpoint it is sent to come from one section.
	 * @param signal - abort signal for the surrounding search.
	 * @returns the resolved key.
	 */
	async apiKey(options, signal) {
		throwIfSearchAborted(signal);
		if (options.apiKey !== void 0 && options.apiKey.length > 0) {
			this.keyPresence = "yes";
			return options.apiKey;
		}
		if (options.apiKeyEnvInvalid) throw new WebError(`Exa search has no API key: the configured key reference is not a valid environment-variable name (use letters, digits, and underscores, starting with a letter or underscore); fix it in the web-search-exa settings section`, "WEB_PROVIDER_CREDENTIAL_MISSING");
		let resolved;
		try {
			resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(void 0), signal);
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`Exa search credential resolution failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		this.keyPresence = resolved !== void 0 && resolved.length > 0 ? "yes" : "no";
		if (this.keyPresence === "yes") return resolved;
		throw new WebError(`Exa search has no API key for "${options.apiKeyEnv ?? DEFAULT_API_KEY_ENV}"; store it through the credentials service (the web Models page writes it), export it in the launching environment, set a literal "apiKey" in the web-search-exa settings section, or enable allowAnonymous to search through Exa's public MCP endpoint`, "WEB_PROVIDER_CREDENTIAL_MISSING");
	}
};
/** Clamp one search's result count into the range the Exa API accepts. */
function clampResults(requested, fallback) {
	if (!isPositiveInteger(requested)) return fallback;
	return Math.min(requested, 10);
}
/**
 * Race a same-process asynchronous preflight against caller cancellation. The
 * attached settlement handlers keep observing an uncooperative operation after
 * abort so a later rejection cannot become unhandled.
 */
function abortable(operation, signal) {
	if (signal === void 0) return operation;
	if (signal.aborted) return Promise.reject(searchAborted(signal));
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(searchAborted(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolve(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			reject(new Error(String(error).replace(/^Error: /u, ""), { cause: error }));
		});
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
//#endregion
//#region lib/types/index.js
/**
 * Register an Exa-backed provider in `ctx.web`. Authenticated searches call the
 * `/search` REST API with a literal or referenced `EXA_API_KEY` credential;
 * `allowAnonymous` instead searches through Exa's public hosted MCP endpoint
 * (`web_search_exa`) with no key at all. The provider ships disabled; flip
 * `enabled` in its Settings section (or composition config) to make it usable,
 * then point `web.searchProvider` at `"exa"` to select it.
 * @module um-dsh-websearch
 */
/** Cordis plugin name used by loader diagnostics. */
const name = "web-search-exa";
/** The web seam this provider registers into. */
const inject = ["web"];
const Config = z.object({
	enabled: z.boolean().default(false),
	allowAnonymous: z.boolean().default(false),
	apiKey: z.string().role("secret"),
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
	baseURL: z.string().default(EXA_DEFAULT_BASE_URL),
	mcpBaseURL: z.string().default(EXA_MCP_DEFAULT_BASE_URL),
	numResults: z.number().step(1).min(1).max(10).default(DEFAULT_NUM_RESULTS),
	searchType: z.string().default(DEFAULT_SEARCH_TYPE)
});
/** Settings namespace carrying this provider's switch, key reference, and endpoint. */
const WEB_SEARCH_EXA_SETTINGS_NAMESPACE = settingsNamespace("web-search-exa");
/** Register the Exa search provider with `ctx.web`. */
function apply(ctx, config) {
	// A composition row may omit `config` entirely; normalize once so the
	// settings-absent fallback (`current()` returning the entry) never feeds
	// `undefined` into resolveOptions.
	const entry = config != null && typeof config === "object" ? config : {};
	let current = () => entry;
	const provider = new ExaSearchProvider(() => {
		const section = current();
		return resolveOptions(ctx, section != null && typeof section === "object" ? section : entry);
	});
	installSettingsSection(ctx, WEB_SEARCH_EXA_SETTINGS_NAMESPACE, Config, entry, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {
			// The section may have flipped enabled, toggled anonymous mode, or
			// renamed the key reference.
			void provider.prime();
		}
	});
	ctx.on("credentials/reference-updated", (ref) => {
		if (ref === provider.resolveOptions().apiKeyEnv) void provider.prime();
	});
	ctx.web.registerSearchProvider(provider);
	void provider.prime();
}
//#endregion
export { Config, DEFAULT_API_KEY_ENV, DEFAULT_NUM_RESULTS, DEFAULT_SEARCH_TYPE, EXA_DEFAULT_BASE_URL, EXA_MCP_DEFAULT_BASE_URL, EXA_PROVIDER_ID, ExaSearchProvider, MCP_PROTOCOL_VERSION, MCP_TOOL_WEB_SEARCH, SEARCH_BASE_URL_ENV, WEB_SEARCH_EXA_SETTINGS_NAMESPACE, apply, inject, name };
