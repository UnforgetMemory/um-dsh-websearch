window.__ModuleLoader__.load({
	id: "um-dsh-websearch",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");
		const Primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/um-card.js
		/** Settings namespace this card claims. Must match the Host half's settingsNamespace. */
		const NS = "web-search-exa";
		const KEY_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
		// About-tab facts: display-only mirrors of the package metadata.
		const ABOUT_VERSION = "0.6.0";
		const ABOUT_SOURCE_URL = "https://github.com/UnforgetMemory/um-dsh-websearch";
		const ABOUT_AUTHOR = "UnforgetMemory";
		const ABOUT_DONATE_URL = "https://ko-fi.com/unforgetmemory";
		/** Legacy flat keys the pre-0.6.0 model owned; a save clears them so the Host migration stops firing. */
		const LEGACY_KEYS = [
			"preferred", "exaEnabled", "parallelEnabled",
			"allowAnonymous", "fallbackToPaid", "fallbackToAnonymous",
			"apiKey", "apiKeyEnv", "baseURL", "mcpBaseURL", "numResults", "searchType",
			"parallelAllowAnonymous", "parallelFallbackToPaid", "parallelFallbackToAnonymous",
			"parallelApiKey", "parallelApiKeyEnv", "parallelBaseURL", "parallelMcpBaseURL",
			"parallelNumResults", "parallelMode"
		];
		/** Builtin provider metadata: localized display names + the UM_WS_ key suggestion. */
		const BUILTIN_META = [
			{ id: "exa", zh: "Exa", keyRef: "UM_WS_EXA_API_KEY", params: [{ name: "searchType", kind: "select", options: ["auto", "neural", "keyword"] }] },
			{ id: "parallel", zh: "Parallel", keyRef: "UM_WS_PARALLEL_API_KEY", params: [{ name: "mode", kind: "select", options: ["turbo", "fast", "basic", "advanced"] }] },
			{ id: "deepseek", zh: "DeepSeek 官方", keyRef: "UM_WS_DEEPSEEK_API_KEY", params: [{ name: "model", kind: "text" }, { name: "maxUses", kind: "number" }] }
		];
		const builtinOf = (id) => BUILTIN_META.find((meta) => meta.id === id);
		const displayName = (entry) => builtinOf(entry.id)?.zh ?? (typeof entry.name === "string" && entry.name.length > 0 ? entry.name : entry.id);
		/** Auto-generated credential reference for the next key row: the base
		 * name, or base_N with the smallest free suffix. Refs are generated
		 * once at add-time and never user-edited, so they stay stable. */
		const nextKeyRef = (base, keys) => {
			const refs = new Set((keys ?? []).map((entry) => entry.ref));
			if (!refs.has(base)) return base;
			let n = (keys ?? []).length;
			while (refs.has(base + "_" + n)) n += 1;
			return base + "_" + n;
		};
		/** Factory defaults mirrored from the Host Config schema, for override detection. */
		const FIELD_DEFAULTS = {
			enabled: false,
			defaultProvider: "exa",
			concurrency: 1,
			cacheEnabled: false,
			cacheTtlSeconds: 60,
			providers: [
				{ id: "exa", name: "Exa", enabled: true, primaryTier: "paid", paid: { enabled: true, baseURL: "https://api.exa.ai" }, free: { enabled: false, baseURL: "https://mcp.exa.ai/mcp" }, keys: [], keysStrategy: "ordered", numResults: 5, params: { searchType: "auto" } },
				{ id: "parallel", name: "Parallel", enabled: false, primaryTier: "paid", paid: { enabled: false, baseURL: "https://api.parallel.ai" }, free: { enabled: false, baseURL: "https://search.parallel.ai/mcp" }, keys: [], keysStrategy: "ordered", numResults: 10, params: { mode: "fast" } },
				{ id: "deepseek", name: "DeepSeek Official", enabled: false, primaryTier: "paid", paid: { enabled: false, baseURL: "https://api.deepseek.com/anthropic/v1" }, free: { enabled: false, baseURL: "" }, keys: [], keysStrategy: "ordered", numResults: 5, params: { model: "deepseek-v4-flash", maxUses: 5 } }
			]
		};

		function injectCssOnce() {
			if (typeof document === "undefined") return;
			const css = [
				":where(.um-dsh-websearch-card,.um-dsh-websearch-modalContent,.um-dsh-websearch-dialog){--um-dsh-websearch-radius-lg:12px;--um-dsh-websearch-radius-md:8px;--um-dsh-websearch-space-1:4px;--um-dsh-websearch-space-2:8px;--um-dsh-websearch-space-3:12px;--um-dsh-websearch-space-4:16px;--um-dsh-websearch-field-h:34px;--um-dsh-websearch-dialog-w:720px;--um-dsh-websearch-ease:cubic-bezier(.22,.61,.36,1);--um-dsh-websearch-dur:.16s;--um-dsh-websearch-tint-brand:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,var(--dsw-alias-bg-base));--um-dsh-websearch-tint-error:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,var(--dsw-alias-bg-base))}",
				".um-dsh-websearch-card{min-width:0;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:var(--um-dsh-websearch-radius-lg);list-style:none;transition:border-color var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease),background var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease)}",
				".um-dsh-websearch-card:hover{border-color:var(--dsw-alias-label-dimmed)}",
				".um-dsh-websearch-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:var(--um-dsh-websearch-space-3);padding:14px var(--um-dsh-websearch-space-4);display:flex;min-width:0;box-sizing:border-box}",
				".um-dsh-websearch-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
				".um-dsh-websearch-headerChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease)}",
				".um-dsh-websearch-header[aria-expanded=\"true\"] .um-dsh-websearch-headerChevron{transform:rotate(180deg)}",
				".um-dsh-websearch-headText{flex-direction:column;flex:1;gap:var(--um-dsh-websearch-space-1);min-width:0;display:flex}",
				".um-dsh-websearch-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}",
				".um-dsh-websearch-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5;overflow-wrap:anywhere}",
				".um-dsh-websearch-pending,.um-dsh-websearch-badge{white-space:nowrap;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",
				".um-dsh-websearch-badges{align-items:center;gap:var(--um-dsh-websearch-space-2);display:inline-flex;flex-wrap:wrap;min-width:0}",
				".um-dsh-websearch-reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}",
				".um-dsh-websearch-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
				".um-dsh-websearch-reset:disabled{cursor:default}",
				".um-dsh-websearch-body{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:var(--um-dsh-websearch-space-2);padding:var(--um-dsh-websearch-space-3) var(--um-dsh-websearch-space-4) var(--um-dsh-websearch-space-3);display:flex;min-width:0;box-sizing:border-box}",
				".um-dsh-websearch-readOnly{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}",
				".um-dsh-websearch-statusLine{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:var(--um-dsh-websearch-radius-md);margin:0;padding:var(--um-dsh-websearch-space-2) var(--um-dsh-websearch-space-3);font-size:13px;line-height:1.5;overflow-wrap:anywhere;min-width:0}",
				".um-dsh-websearch-detailsRow{align-items:center;padding-top:var(--um-dsh-websearch-space-1);display:flex;flex-wrap:wrap;gap:var(--um-dsh-websearch-space-2)}",
				".um-dsh-websearch-dialog{width:min(var(--um-dsh-websearch-dialog-w),calc(100vw - 48px))}",
				".um-dsh-websearch-modalContent{box-sizing:border-box;max-height:min(72vh,600px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable}",
				".um-dsh-websearch-modalBody{width:100%;min-width:0;box-sizing:border-box}",
				".um-dsh-websearch-tabs{border-bottom:1px solid var(--dsw-alias-border-l2);gap:2px;display:flex;min-width:0}",
				".um-dsh-websearch-tab{appearance:none;background:0 0;border:0;border-bottom:2px solid transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:13px;font-weight:500;line-height:1.5;margin-bottom:-1px;padding:8px 12px;flex:none;transition:color var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease),border-color var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease),background var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease)}",
				".um-dsh-websearch-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}",
				".um-dsh-websearch-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
				".um-dsh-websearch-tab[aria-selected=\"true\"]{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary)}",
				".um-dsh-websearch-panel{flex-direction:column;gap:var(--um-dsh-websearch-space-2);display:flex;min-width:0;animation:um-dsh-websearch-panel-in .18s var(--um-dsh-websearch-ease)}",
				"@keyframes um-dsh-websearch-panel-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}",
				".um-dsh-websearch-about{flex-direction:column;gap:10px;padding:var(--um-dsh-websearch-space-2) 0;display:flex;min-width:0}",
				".um-dsh-websearch-aboutRow{display:flex;gap:var(--um-dsh-websearch-space-3);align-items:baseline;flex-wrap:wrap;min-width:0}",
				".um-dsh-websearch-aboutLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;width:88px;flex:none}",
				".um-dsh-websearch-aboutValue{color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;overflow-wrap:anywhere;min-width:0}",
				".um-dsh-websearch-aboutLink{color:var(--dsw-alias-brand-primary);font-size:13px;line-height:1.5;text-decoration:none;overflow-wrap:anywhere}",
				".um-dsh-websearch-aboutLink:hover{text-decoration:underline}",
				// ---- Provider list (first screen) ----
				".um-dsh-websearch-providerRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:var(--um-dsh-websearch-radius-md);padding:var(--um-dsh-websearch-space-3);display:flex;flex-direction:column;gap:var(--um-dsh-websearch-space-2);min-width:0;box-sizing:border-box}",
				".um-dsh-websearch-providerHead{display:flex;align-items:center;gap:var(--um-dsh-websearch-space-2);min-width:0}",
				".um-dsh-websearch-providerName{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);line-height:1.5;flex:1;min-width:0;overflow-wrap:anywhere}",
				".um-dsh-websearch-orderBtn{appearance:none;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:6px;cursor:pointer;font:inherit;font-size:11px;line-height:1;padding:5px 8px;flex:none}",
				".um-dsh-websearch-orderBtn:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
				".um-dsh-websearch-orderBtn:disabled{cursor:default;opacity:.45}",
				".um-dsh-websearch-roleBadge{border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;flex:none;white-space:nowrap}",
				".um-dsh-websearch-roleBadge-rolePrimary{background:var(--um-dsh-websearch-tint-brand);color:var(--dsw-alias-brand-primary)}",
				".um-dsh-websearch-roleBadge-roleFallback{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}",
				".um-dsh-websearch-roleBadge-roleOff{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}",
				".um-dsh-websearch-warning{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2);border-radius:var(--um-dsh-websearch-radius-md);margin:0;padding:var(--um-dsh-websearch-space-2) var(--um-dsh-websearch-space-3);font-size:12px;line-height:1.5;display:flex;align-items:center;gap:var(--um-dsh-websearch-space-2);flex-wrap:wrap;min-width:0;overflow-wrap:anywhere}",
				"@media (prefers-reduced-motion: reduce){.um-dsh-websearch-card,.um-dsh-websearch-switch,.um-dsh-websearch-knob,.um-dsh-websearch-tab,.um-dsh-websearch-panel,.um-dsh-websearch-radio{transition:none;animation:none}}",
				".um-dsh-websearch-footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:var(--um-dsh-websearch-space-2);padding:var(--um-dsh-websearch-space-3) 0 var(--um-dsh-websearch-space-1);display:flex;flex-wrap:wrap;min-width:0}",
				".um-dsh-websearch-modalFooter{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:var(--um-dsh-websearch-space-2);padding-top:var(--um-dsh-websearch-space-3);display:flex;flex-wrap:wrap;min-width:0}",
				".um-dsh-websearch-failed{min-width:0;color:var(--dsw-alias-state-error-primary);flex:1;margin:0;font-size:12px;line-height:1.5;overflow-wrap:anywhere}",
				".um-dsh-websearch-fieldError{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:1.5;overflow-wrap:anywhere}",
				".um-dsh-websearch-liveHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;margin-right:auto;overflow-wrap:anywhere}",
				// ---- Fields ----
				".um-dsh-websearch-field{flex-direction:column;gap:6px;padding:var(--um-dsh-websearch-space-3) 0;display:flex;min-width:0}",
				".um-dsh-websearch-field+.um-dsh-websearch-field{border-top:1px solid var(--dsw-alias-border-l2)}",
				".um-dsh-websearch-fhead{align-items:center;gap:var(--um-dsh-websearch-space-2);display:flex;min-width:0}",
				".um-dsh-websearch-flabel{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5;overflow-wrap:anywhere}",
				".um-dsh-websearch-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5;overflow-wrap:anywhere}",
				".um-dsh-websearch-input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:var(--um-dsh-websearch-field-h);font:inherit;color:var(--dsw-alias-label-primary);border-radius:var(--um-dsh-websearch-radius-md);padding:0 var(--um-dsh-websearch-space-3);font-size:13px;line-height:1.5;width:100%;box-sizing:border-box;min-width:0}",
				".um-dsh-websearch-input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}",
				".um-dsh-websearch-inputInvalid{border-color:var(--dsw-alias-label-error)}",
				".um-dsh-websearch-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
				".um-dsh-websearch-switch{appearance:none;position:relative;width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-border-l3);border:none;cursor:pointer;transition:background var(--um-dsh-websearch-dur);flex:none;padding:0;margin:0}",
				".um-dsh-websearch-switch:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
				".um-dsh-websearch-switch[aria-checked=\"true\"]{background:var(--dsw-alias-brand-primary)}",
				".um-dsh-websearch-switch[aria-checked=\"true\"]:hover:not(:disabled){filter:brightness(1.08)}",
				".um-dsh-websearch-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
				".um-dsh-websearch-switch:disabled{cursor:default;opacity:.55}",
				".um-dsh-websearch-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-base);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform var(--um-dsh-websearch-dur);pointer-events:none}",
				".um-dsh-websearch-switch[aria-checked=\"true\"] .um-dsh-websearch-knob{transform:translateX(16px)}",
				// ---- Provider editor (Modal) ----
				".um-dsh-websearch-providerEditor{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:var(--um-dsh-websearch-radius-md);padding:var(--um-dsh-websearch-space-3);display:flex;flex-direction:column;gap:var(--um-dsh-websearch-space-2);min-width:0;box-sizing:border-box}",
				".um-dsh-websearch-radio{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:1.5;padding:3px 10px;border-radius:999px;transition:color var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease),border-color var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease)}",
				".um-dsh-websearch-radio:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
				".um-dsh-websearch-radio[aria-checked=\"true\"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}",
				".um-dsh-websearch-radio:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
				".um-dsh-websearch-radio:disabled{cursor:default;opacity:.55}",
				".um-dsh-websearch-radioRow{display:flex;align-items:center;gap:var(--um-dsh-websearch-space-2);min-width:0;flex-wrap:wrap}",
				".um-dsh-websearch-keyRow{border-top:1px solid var(--dsw-alias-border-l2);padding-top:var(--um-dsh-websearch-space-2);display:flex;flex-direction:column;gap:var(--um-dsh-websearch-space-2);min-width:0}",
				".um-dsh-websearch-keyHead{display:flex;align-items:center;gap:var(--um-dsh-websearch-space-2);min-width:0}",
				".um-dsh-websearch-keyTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);flex:1;min-width:0;overflow-wrap:anywhere}",
				".um-dsh-websearch-keyState{border-radius:999px;padding:0 8px;font-size:11px;font-weight:500;line-height:17px;flex:none;white-space:nowrap}",
				".um-dsh-websearch-keyState-on{background:var(--um-dsh-websearch-tint-brand);color:var(--dsw-alias-brand-primary)}",
				".um-dsh-websearch-keyState-off{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}",
				".um-dsh-websearch-keyToggle{appearance:none;background:0 0;border:0;color:inherit;cursor:pointer;font:inherit;text-align:left;align-items:center;gap:var(--um-dsh-websearch-space-2);padding:0;display:flex;flex:1;min-width:0}",
				".um-dsh-websearch-keyToggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
				".um-dsh-websearch-keyChevron{display:inline-block;color:var(--dsw-alias-label-tertiary);flex:none;transition:transform var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease)}",
				".um-dsh-websearch-keyToggle[aria-expanded=\"false\"] .um-dsh-websearch-keyChevron{transform:rotate(-90deg)}",
				".um-dsh-websearch-removeBtn{appearance:none;background:0 0;border:none;color:var(--dsw-alias-state-error-primary);cursor:pointer;font:inherit;font-size:12px;line-height:1.5;padding:2px 6px}",
				".um-dsh-websearch-removeBtn:hover{text-decoration:underline}",
				".um-dsh-websearch-addKey{appearance:none;background:var(--dsw-alias-bg-layer-2);border:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:1.5;border-radius:var(--um-dsh-websearch-radius-md);padding:6px var(--um-dsh-websearch-space-3)}",
				".um-dsh-websearch-addKey:hover{color:var(--dsw-alias-label-primary)}",
				".um-dsh-websearch-tierHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.4;margin:0}",
				".um-dsh-websearch-tierHint-off{color:var(--dsw-alias-state-error-primary)}"
			].join("\n");
			const tagId = "um-dsh-websearch/card.css";
			if (document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "um-dsh-websearch";
				tag.dataset.pluginCss = tagId;
				tag.textContent = css;
				document.head.appendChild(tag);
			}
		}

		/** English copy for the card, registered under the plugin's locale namespace. */
		const en = {
			title: "UM web search",
			description: "Unofficial web search plugin.",
			enabled: "Enable search",
			enabledHint: "Master switch — off keeps the provider registered but unusable.",
			concurrency: "Concurrency",
			concurrencyHint: "1 = sequential fallback chain; >1 fans one search out across every enabled source (1–8).",
			cacheEnabled: "Enable result cache",
			cacheEnabledHint: "Serve repeat queries from the in-memory cache.",
			cacheTtlSeconds: "Cache TTL (seconds)",
			cacheTtlSecondsHint: "How long one cached result stays fresh (1–86400).",
			statusAllOff: "Strategy: all providers off · search unavailable",
			statusTemplate: "Strategy: {order} · concurrency {n}",
			providerRowHint: "Order matters — the first enabled provider serves first (sequential mode).",
			detailsButton: "Advanced settings…",
			detailsSuffix: " · Advanced settings",
			detailsDescription: "One editor tab per provider: tiers, keys, endpoints and params.",
			tabAbout: "About",
			aboutVersion: "Version",
			aboutAuthor: "Author",
			aboutSource: "Source",
			aboutSourceRepo: "GitHub repository",
			aboutDonate: "Support",
			aboutDonateCta: "Buy me a coffee on Ko-fi",
			primaryTier: "Primary tier",
			primaryTierHint: "The tier tried first; the other one serves as the switch-gated fallback.",
			tierFree: "Free (anonymous)",
			tierPaid: "Paid (REST)",
			paidEnabled: "Paid REST tier",
			paidEnabledHint: "Serve searches through the REST endpoint with a key.",
			freeEnabled: "Free anonymous tier",
			freeEnabledHint: "Serve searches through the public MCP endpoint, no key.",
			paidBaseURL: "Paid REST base URL",
			paidBaseURLHint: "The provider's API endpoint; the search path is appended.",
			freeBaseURL: "Free MCP base URL",
			freeBaseURLHint: "The provider's public MCP endpoint; point at a proxy if needed.",
			keysStrategy: "Key strategy",
			keysStrategyHint: "ordered = array order; random = shuffled once per search.",
			strategyOrdered: "Ordered",
			strategyRandom: "Random",
			numResults: "Default result count (1–20)",
			numResultsHint: "Used when a search carries no explicit count.",
			keysHeader: "API keys",
			keysHeaderHint: "API key values are written to the DSH credential store under auto-generated references.",
			keyValue: "API key value",
			keyValueHint: "Written to the DSH credential store under the reference above — never saved in settings, and stored values are never displayed. Leave blank to keep the current value.",
			keyConfigured: "Configured",
			keyUnconfigured: "Not configured",
			keyEnabled: "Key enabled",
			keyEnabledHint: "Disabled keys never participate in any strategy.",
			allowFreeToPaid: "Free → paid fallback",
			allowFreeToPaidHint: "After the free tier is rejected, retry this key's paid tier (only when the paid tier is on).",
			allowPaidToFree: "Paid → free fallback",
			allowPaidToFreeHint: "After this key's paid tier is rejected, retry the free tier (only when the free tier is on).",
			addKey: "Add key",
			removeKey: "Remove",
			searchType: "Search type",
			searchTypeHint: "auto / neural / keyword (REST only)",
			mode: "Parallel search mode",
			modeHint: "turbo / fast / basic / advanced. Default fast.",
			model: "Model",
			modelHint: "Anthropic-format model name for DeepSeek Official.",
			maxUses: "Max web_search uses",
			maxUsesHint: "Server-tool uses per request (1–20).",
			rolePrimary: "Primary",
			roleFallback: "Fallback",
			roleOff: "Off",
			warnDefaultDisabled: "The default provider is off; the first enabled provider serves.",
			warnAllDisabled: "Every provider is off; search is unavailable.",
			moveUp: "Move up",
			moveDown: "Move down",
			invalidNumResults: "Enter an integer from 1 to 20",
			invalidConcurrency: "Enter an integer from 1 to 8",
			invalidTtl: "Enter an integer from 1 to 86400",
			invalidMaxUses: "Enter an integer from 1 to 20",
			invalidKeyRef: "Use letters, digits, and underscores, starting with a letter or underscore",
			invalidProviderId: "Provider id may not be empty or duplicated",
			invalidKeysStrategy: "Choose ordered or random",
			unsaved: "Unsaved",
			overridden: "Overridden",
			reset: "Reset to default",
			readOnly: "This deployment stores settings read-only; changes cannot be saved.",
			liveHint: "Saved changes take effect on the next search — no restart needed",
			saveFailed: "The save failed; server state was restored.",
			save: "Save",
			saving: "Saving…",
			discard: "Discard",
			tierNotEnabled: "Tier not enabled — enable it above first",
			tierAutoEnabled: "Enabled automatically",
			showSettings: "Show settings",
			hideSettings: "Hide settings",
			expand: "Expand",
			collapse: "Collapse"
		};
		/** Simplified Chinese copy for the card. */
		const zh = {
			title: "UM 网页搜索",
			description: "非官方网页搜索插件",
			enabled: "启用搜索",
			enabledHint: "总开关：关闭后提供者保持注册但不可用。",
			concurrency: "并发数",
			concurrencyHint: "1 = 顺序回退链；>1 把一次搜索并发分发到所有启用源（1–8）。",
			cacheEnabled: "启用结果缓存",
			cacheEnabledHint: "重复查询直接命中内存缓存。",
			cacheTtlSeconds: "缓存 TTL（秒）",
			cacheTtlSecondsHint: "一条缓存结果的保鲜时长（1–86400）。",
			statusAllOff: "策略：全部停用 · 搜索不可用",
			statusTemplate: "策略：{order} · 并发 {n}",
			providerRowHint: "顺序即优先级——顺序模式下首个启用源先服务。",
			detailsButton: "详细配置…",
			detailsSuffix: " · 详细配置",
			detailsDescription: "每个数据源一个编辑页：档位、密钥、端点与参数。",
			tabAbout: "关于",
			aboutVersion: "版本",
			aboutAuthor: "作者",
			aboutSource: "来源",
			aboutSourceRepo: "GitHub 仓库",
			aboutDonate: "支持",
			aboutDonateCta: "Ko-fi 请我喝杯咖啡",
			primaryTier: "首选档位",
			primaryTierHint: "先尝试的档位；另一档位作为开关门控的回退。",
			tierFree: "免费（匿名）",
			tierPaid: "付费（REST）",
			paidEnabled: "付费 REST 档位",
			paidEnabledHint: "经 REST 端点 + 密钥提供搜索。",
			freeEnabled: "免费匿名档位",
			freeEnabledHint: "经公共 MCP 端点提供搜索，无需密钥。",
			paidBaseURL: "付费 REST 基址",
			paidBaseURLHint: "provider 的 API 端点；自动拼接搜索路径。",
			freeBaseURL: "免费 MCP 基址",
			freeBaseURLHint: "provider 的公共 MCP 端点；可指向自建代理。",
			keysStrategy: "多密钥策略",
			keysStrategyHint: "ordered = 数组序；random = 每次搜索洗牌一次。",
			strategyOrdered: "按顺序",
			strategyRandom: "随机",
			numResults: "默认结果数 (1–20)",
			numResultsHint: "搜索未指定条数时的默认值。",
			keysHeader: "API 密钥",
			keysHeaderHint: "密钥值经官方 DSH 凭据库写入（引用名自动生成），不落设置文件。",
			keyValue: "API 密钥值",
			keyValueHint: "写入 DSH 凭据库（引用名见上方），绝不写入设置文件，已存值绝不回显；留空表示保持当前值。",
			keyConfigured: "已配置",
			keyUnconfigured: "未配置",
			keyEnabled: "启用该密钥",
			keyEnabledHint: "停用的密钥不参与任何策略。",
			allowFreeToPaid: "免费 → 付费回退",
			allowFreeToPaidHint: "免费档位被拒后，用该密钥重试付费档位（仅当付费档位开启）。",
			allowPaidToFree: "付费 → 免费回退",
			allowPaidToFreeHint: "该密钥付费档位被拒后，重试免费档位（仅当免费档位开启）。",
			addKey: "添加密钥",
			removeKey: "移除",
			searchType: "检索类型",
			searchTypeHint: "auto / neural / keyword（仅 REST）",
			mode: "Parallel 搜索模式",
			modeHint: "turbo / fast / basic / advanced。默认 fast。",
			model: "模型",
			modelHint: "DeepSeek 官方的 Anthropic 格式模型名。",
			maxUses: "web_search 最大使用次数",
			maxUsesHint: "每次请求的 server tool 使用上限（1–20）。",
			rolePrimary: "优先",
			roleFallback: "备用",
			roleOff: "停用",
			warnDefaultDisabled: "默认数据源已停用，由首个启用数据源服务。",
			warnAllDisabled: "所有数据源均已停用，搜索不可用。",
			moveUp: "上移",
			moveDown: "下移",
			invalidNumResults: "请输入 1–20 的整数",
			invalidConcurrency: "请输入 1–8 的整数",
			invalidTtl: "请输入 1–86400 的整数",
			invalidMaxUses: "请输入 1–20 的整数",
			invalidKeyRef: "仅限字母、数字、下划线，以字母或下划线开头",
			invalidProviderId: "数据源 id 不能为空或重复",
			invalidKeysStrategy: "请选择 ordered 或 random",
			unsaved: "未保存",
			overridden: "已覆盖",
			reset: "恢复默认",
			readOnly: "当前连接为只读，无法修改此配置。",
			liveHint: "更改保存后即时生效，无需重启",
			saveFailed: "保存失败，已恢复服务器状态。",
			save: "保存",
			saving: "保存中…",
			discard: "放弃",
			tierNotEnabled: "该档位未启用——请先在上方启用",
			tierAutoEnabled: "已自动启用",
			showSettings: "展开设置",
			hideSettings: "收起设置",
			expand: "展开",
			collapse: "收起"
		};
		/** Copy fallback when the locale seat is absent (degrades to Chinese). */
		const FALLBACK_T = (key) => zh[key] ?? key;

		/** Small presentational helpers reused across the card. */
		function Field(props) {
			const { labelKey, hintKey, errorKey, control, badges, children } = props;
			return React.createElement(
				"div",
				{ className: "um-dsh-websearch-field" },
				React.createElement(
					"label",
					{ className: "um-dsh-websearch-fhead" },
					React.createElement("span", { className: "um-dsh-websearch-flabel" }, props.t(labelKey)),
					badges ?? null
				),
				control ?? children,
				hintKey !== undefined ? React.createElement("p", { className: "um-dsh-websearch-hint" }, props.t(hintKey)) : null,
				errorKey !== undefined ? React.createElement("p", { className: "um-dsh-websearch-fieldError", role: "alert" }, props.t(errorKey)) : null
			);
		}
		function Switch(props) {
			return React.createElement(
				"button",
				{
					type: "button",
					role: "switch",
					className: "um-dsh-websearch-switch",
					"aria-checked": !!props.checked,
					"aria-label": props.label,
					onClick: (e) => { e.stopPropagation(); props.onChange(!props.checked); },
					disabled: props.disabled === true
				},
				React.createElement("span", { className: "um-dsh-websearch-knob" })
			);
		}
		function Select(props) {
			return React.createElement(
				"select",
				{ className: "um-dsh-websearch-input", value: String(props.value ?? ""), onChange: (e) => props.onChange(e.target.value), disabled: props.disabled === true },
				props.options.map((opt) => React.createElement("option", { key: opt.value, value: opt.value }, opt.label))
			);
		}
		function TextInput(props) {
			return React.createElement("input", {
				className: "um-dsh-websearch-input" + (props.invalid === true ? " um-dsh-websearch-inputInvalid" : ""),
				type: props.kind === "number" ? "number" : props.kind === "password" ? "password" : "text",
				value: props.value == null ? "" : String(props.value),
				placeholder: props.placeholder,
				autoComplete: props.autoComplete,
				spellCheck: props.spellCheck === true ? "true" : undefined,
				onChange: (e) => props.onChange(e.target.value),
				disabled: props.disabled === true
			});
		}
		function RadioChip(props) {
			return React.createElement(
				"button",
				{
					type: "button",
					role: "radio",
					className: "um-dsh-websearch-radio",
					"aria-checked": props.checked === true,
					disabled: props.disabled === true,
					onClick: () => props.onChange()
				},
				props.label
			);
		}
		function Badges(props) {
			return React.createElement(
				"span",
				{
					className: "um-dsh-websearch-badges",
					onClick: (e) => { e.stopPropagation(); e.preventDefault(); }
				},
				props.dirty === true ? React.createElement("span", { className: "um-dsh-websearch-pending" }, props.t("unsaved")) : null,
				props.overridden === true ? React.createElement("span", { className: "um-dsh-websearch-badge" }, props.t("overridden")) : null,
				props.overridden === true
					? React.createElement("button", { type: "button", className: "um-dsh-websearch-reset", disabled: !props.writable, onClick: (e) => { e.stopPropagation(); props.onReset(); } }, props.t("reset"))
					: null
			);
		}

		// ---- model helpers ----------------------------------------------------
		function cloneProviders(list) {
			return (Array.isArray(list) ? list : []).map((entry) => ({
				id: entry?.id ?? "",
				name: entry?.name ?? "",
				enabled: entry?.enabled !== false,
				primaryTier: entry?.primaryTier === "paid" ? "paid" : "free",
				paid: { enabled: entry?.paid?.enabled === true, baseURL: typeof entry?.paid?.baseURL === "string" ? entry.paid.baseURL : "" },
				free: { enabled: entry?.free?.enabled === true, baseURL: typeof entry?.free?.baseURL === "string" ? entry.free.baseURL : "" },
				keys: (Array.isArray(entry?.keys) ? entry.keys : []).map((key) => ({
					ref: key?.ref ?? "",
					enabled: key?.enabled !== false,
					allowFreeToPaid: key?.allowFreeToPaid === true,
					allowPaidToFree: key?.allowPaidToFree === true
				})),
				keysStrategy: entry?.keysStrategy === "random" ? "random" : "ordered",
				// Staged number fields ride strings while the user types — pass the
				// raw value through so the editor echoes it; validation and the
				// save-time clamp handle the rest.
				numResults: entry?.numResults !== undefined ? entry.numResults : 5,
				params: entry?.params != null && typeof entry.params === "object" ? { ...entry.params } : {}
			}));
		}
		function coerceProvider(entry) {
			const base = cloneProviders([entry])[0];
			base.id = String(base.id).trim();
			base.name = String(base.name).trim();
			base.paid.baseURL = String(base.paid.baseURL).trim();
			base.free.baseURL = String(base.free.baseURL).trim();
			base.numResults = clampInt(base.numResults, 1, 20, 5);
			base.keys = base.keys.map((key) => {
				key.ref = String(key.ref).trim();
				return key;
			});
			if (base.params != null && typeof base.params === "object" && base.params.maxUses !== undefined) {
				base.params.maxUses = clampInt(base.params.maxUses, 1, 20, 5);
			}
			return base;
		}
		/** Coerce one staged global value into the section's stored shape. */
		function coerceGlobal(name, raw) {
			if (name === "enabled" || name === "cacheEnabled") return raw === true;
			if (name === "concurrency") return clampInt(raw, 1, 8, 1);
			if (name === "cacheTtlSeconds") return clampInt(raw, 1, 86400, 60);
			return typeof raw === "string" ? raw.trim() : raw;
		}
		const clampInt = (raw, min, max, fallback) => {
			const n = Math.round(Number(raw));
			if (!Number.isFinite(n) || n < min || n > max) return fallback;
			return n;
		};
		/** The effective ordered providers for display: enabled ones, default first. */
		function orderedProvidersOf(providers, defaultProvider) {
			const list = cloneProviders(providers);
			const pivot = list.findIndex((p) => p.id === defaultProvider);
			if (pivot > 0) return [...list.slice(pivot), ...list.slice(0, pivot)];
			return list;
		}
		/** Error keys per staged config; empty array = valid. */
		function configErrors(value) {
			const errors = [];
			const providers = Array.isArray(value?.providers) ? value.providers : [];
			const ids = new Set();
			for (const entry of providers) {
				const id = String(entry?.id ?? "").trim();
				if (id.length === 0 || ids.has(id)) { errors.push("invalidProviderId"); continue; }
				ids.add(id);
				for (const key of Array.isArray(entry?.keys) ? entry.keys : []) {
					const ref = String(key?.ref ?? "").trim();
					if (ref.length > 0 && !KEY_REF_PATTERN.test(ref)) errors.push("invalidKeyRef");
				}
				const n = Number(entry?.numResults);
				if (!Number.isInteger(n) || n < 1 || n > 20) errors.push("invalidNumResults");
				if (entry?.keysStrategy !== "ordered" && entry?.keysStrategy !== "random") errors.push("invalidKeysStrategy");
			}
			const concurrency = Number(value?.concurrency);
			if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) errors.push("invalidConcurrency");
			const ttl = Number(value?.cacheTtlSeconds);
			if (!Number.isInteger(ttl) || ttl < 1 || ttl > 86400) errors.push("invalidTtl");
			return errors;
		}

		function AboutPanel(props) {
			const { t } = props;
			const row = (labelKey, content) =>
				React.createElement(
					"div",
					{ className: "um-dsh-websearch-aboutRow" },
					React.createElement("span", { className: "um-dsh-websearch-aboutLabel" }, t(labelKey)),
					content
				);
			return React.createElement(
				"div",
				{ className: "um-dsh-websearch-about" },
				row("aboutVersion", React.createElement("span", { className: "um-dsh-websearch-aboutValue" }, ABOUT_VERSION)),
				row("aboutAuthor", React.createElement("span", { className: "um-dsh-websearch-aboutValue" }, ABOUT_AUTHOR)),
				row("aboutSource", React.createElement("a", { className: "um-dsh-websearch-aboutLink", href: ABOUT_SOURCE_URL, target: "_blank", rel: "noopener noreferrer" }, t("aboutSourceRepo"))),
				row("aboutDonate", React.createElement("a", { className: "um-dsh-websearch-aboutLink", href: ABOUT_DONATE_URL, target: "_blank", rel: "noopener noreferrer" }, t("aboutDonateCta")))
			);
		}

		function CardHeader(props) {
			const title = props.t("title");
			return React.createElement(
				"button",
				{
					type: "button",
					className: "um-dsh-websearch-header",
					"aria-expanded": props.open === true ? "true" : "false",
					"aria-label": (props.open === true ? props.t("hideSettings") : props.t("showSettings")) + ": " + title,
					onClick: props.onToggle
				},
				React.createElement(
					"span",
					{ className: "um-dsh-websearch-headText" },
					React.createElement("span", { className: "um-dsh-websearch-name" }, title),
					React.createElement("span", { className: "um-dsh-websearch-description" }, props.t("description"))
				),
				props.dirty ? React.createElement("span", { className: "um-dsh-websearch-pending" }, props.t("unsaved")) : null,
				React.createElement(Primitives.IconChevronDownOutline14, { className: "um-dsh-websearch-headerChevron", "aria-hidden": "true" })
			);
		}

		/** One key editor row inside a provider editor: an accordion item that
		 * collapses to its reference + state badge and expands to the value
		 * input and its switches. Exactly one row is open at a time. */
		function KeyEditor(props) {
			// Note: the data prop is named `entry` — React reserves `key` for
			// list reconciliation and strips it from component props.
			const { t, entry, writable, onChange, onRemove, provider, stagedValue, configured, onValueChange, open, onToggle } = props;
			const paidOff = provider && provider.paid.enabled === false;
			const freeOff = provider && provider.free.enabled === false;
			const ref = String(entry.ref ?? "");
			return React.createElement(
				"div",
				{ className: "um-dsh-websearch-keyRow" },
				React.createElement(
					"div",
					{ className: "um-dsh-websearch-keyHead" },
					React.createElement(
						"button",
						{
							type: "button",
							className: "um-dsh-websearch-keyToggle",
							"aria-expanded": open === true ? "true" : "false",
							"aria-label": (open === true ? t("collapse") : t("expand")) + ": " + ref,
							onClick: onToggle
						},
						React.createElement("span", { className: "um-dsh-websearch-keyChevron" }, "▼"),
						React.createElement("span", { className: "um-dsh-websearch-keyTitle" }, ref),
						React.createElement("span", { className: "um-dsh-websearch-keyState " + (configured === true ? "um-dsh-websearch-keyState-on" : "um-dsh-websearch-keyState-off") }, configured === true ? t("keyConfigured") : t("keyUnconfigured"))
					),
					React.createElement("button", { type: "button", className: "um-dsh-websearch-removeBtn", disabled: !writable, onClick: onRemove }, t("removeKey"))
				),
				open === true ? React.createElement(React.Fragment, null,
					Field({
						t, labelKey: "keyValue", hintKey: "keyValueHint",
						control: React.createElement(TextInput, { kind: "password", value: stagedValue ?? "", placeholder: configured === true ? "••••••" : undefined, autoComplete: "new-password", spellCheck: false, disabled: !writable, onChange: (v) => onValueChange(v) })
					}),
					Field({
						t, labelKey: "keyEnabled",
						control: React.createElement(Switch, { checked: entry.enabled, disabled: !writable, label: t("keyEnabled"), onChange: (v) => onChange({ enabled: v }) })
					}),
					Field({
						t, labelKey: "allowFreeToPaid", hintKey: "allowFreeToPaidHint",
						control: React.createElement(Switch, { checked: entry.allowFreeToPaid, disabled: !writable, label: t("allowFreeToPaid"), onChange: (v) => onChange({ allowFreeToPaid: v }) })
					}),
					(paidOff && entry.allowFreeToPaid === true) ? React.createElement("p", { className: "um-dsh-websearch-tierHint um-dsh-websearch-tierHint-off" }, t("tierNotEnabled")) : null,
					Field({
						t, labelKey: "allowPaidToFree", hintKey: "allowPaidToFreeHint",
						control: React.createElement(Switch, { checked: entry.allowPaidToFree, disabled: !writable, label: t("allowPaidToFree"), onChange: (v) => onChange({ allowPaidToFree: v }) })
					}),
					(freeOff && entry.allowPaidToFree === true) ? React.createElement("p", { className: "um-dsh-websearch-tierHint um-dsh-websearch-tierHint-off" }, t("tierNotEnabled")) : null
				) : null
			);
		}

		/** One provider editor card inside the Modal. */
		function ProviderEditor(props) {
			const { t, provider, writable, onChange, onMove, canMoveUp, canMoveDown, keyValues, credStates, onKeyValueChange } = props;
			// Accordion state: the single open key row (by its stable ref).
			const [openKey, setOpenKey] = React.useState(null);
			const meta = builtinOf(provider.id);
			const isDeepSeek = provider.id === "deepseek";
			const numResultsNumber = Number(provider.numResults);
			const numResultsInvalid = !Number.isInteger(numResultsNumber) || numResultsNumber < 1 || numResultsNumber > 20;
			const maxUsesInvalid = (value) => {
				const n = Number(value);
				return !Number.isInteger(n) || n < 1 || n > 20;
			};
			// Auto-enable the target tier when primaryTier changes to avoid
			// the logical contradiction of "primary = X but X is disabled".
			const changePrimaryTier = (tier) => {
				const patch = { primaryTier: tier };
				if (tier === "free" && !provider.free.enabled) {
					patch.free = { ...provider.free, enabled: true };
				} else if (tier === "paid" && !provider.paid.enabled) {
					patch.paid = { ...provider.paid, enabled: true };
				}
				onChange(patch);
			};
			const paramField = (param) => {
				const value = provider.params?.[param.name];
				const keyName = param.name === "searchType" ? "searchType" : param.name === "mode" ? "mode" : param.name === "model" ? "model" : "maxUses";
				if (param.kind === "select") {
					return Field({
						t, labelKey: keyName, hintKey: keyName + "Hint",
						control: React.createElement(Select, {
							value: value ?? param.options[0], disabled: !writable,
							options: param.options.map((v) => ({ value: v, label: v })),
							onChange: (v) => onChange({ params: { ...(provider.params ?? {}), [param.name]: v } })
						})
					});
				}
				return Field({
					t, labelKey: keyName, hintKey: keyName + "Hint",
					errorKey: param.name === "maxUses" && maxUsesInvalid(value) ? "invalidMaxUses" : undefined,
					control: React.createElement(TextInput, {
						kind: param.name === "maxUses" ? "number" : "text",
						value: value ?? "", disabled: !writable,
						onChange: (v) => onChange({ params: { ...(provider.params ?? {}), [param.name]: param.name === "maxUses" ? v : String(v) } })
					})
				});
			};
			return React.createElement(
				"div",
				{ className: "um-dsh-websearch-providerEditor" },
				React.createElement(
					"div",
					{ className: "um-dsh-websearch-providerHead" },
					React.createElement("button", { type: "button", className: "um-dsh-websearch-orderBtn", disabled: !writable || !canMoveUp, "aria-label": t("moveUp"), onClick: () => onMove(-1) }, "↑"),
					React.createElement("button", { type: "button", className: "um-dsh-websearch-orderBtn", disabled: !writable || !canMoveDown, "aria-label": t("moveDown"), onClick: () => onMove(1) }, "↓"),
					React.createElement("span", { className: "um-dsh-websearch-providerName" }, displayName(provider)),
					React.createElement(Switch, { checked: provider.enabled, disabled: !writable, label: displayName(provider), onChange: (v) => onChange({ enabled: v }) })
				),
				Field({
					t, labelKey: "primaryTier", hintKey: "primaryTierHint",
					control: React.createElement(
						"div",
						{ className: "um-dsh-websearch-radioRow" },
						React.createElement(RadioChip, { checked: provider.primaryTier === "free", disabled: !writable, label: t("tierFree"), onChange: () => changePrimaryTier("free") }),
						React.createElement(RadioChip, { checked: provider.primaryTier === "paid", disabled: !writable, label: t("tierPaid"), onChange: () => changePrimaryTier("paid") })
					)
				}),
				Field({
					t, labelKey: "paidEnabled", hintKey: "paidEnabledHint",
					control: React.createElement(Switch, { checked: provider.paid.enabled, disabled: !writable, label: t("paidEnabled"), onChange: (v) => onChange({ paid: { ...provider.paid, enabled: v } }) })
				}),
				Field({
					t, labelKey: "paidBaseURL", hintKey: "paidBaseURLHint",
					control: React.createElement(TextInput, { value: provider.paid.baseURL, disabled: !writable, onChange: (v) => onChange({ paid: { ...provider.paid, baseURL: v } }) })
				}),
				Field({
					t, labelKey: "freeEnabled", hintKey: "freeEnabledHint",
					control: React.createElement(Switch, { checked: provider.free.enabled, disabled: !writable || isDeepSeek, label: t("freeEnabled"), onChange: (v) => onChange({ free: { ...provider.free, enabled: v } }) })
				}),
				Field({
					t, labelKey: "freeBaseURL", hintKey: "freeBaseURLHint",
					control: React.createElement(TextInput, { value: provider.free.baseURL, disabled: !writable || isDeepSeek, onChange: (v) => onChange({ free: { ...provider.free, baseURL: v } }) })
				}),
				Field({
					t, labelKey: "keysStrategy", hintKey: "keysStrategyHint",
					control: React.createElement(Select, {
						value: provider.keysStrategy, disabled: !writable,
						options: [{ value: "ordered", label: t("strategyOrdered") }, { value: "random", label: t("strategyRandom") }],
						onChange: (v) => onChange({ keysStrategy: v })
					})
				}),
				Field({
					t, labelKey: "numResults", hintKey: "numResultsHint", errorKey: numResultsInvalid ? "invalidNumResults" : undefined,
					control: React.createElement(TextInput, { kind: "number", value: provider.numResults, invalid: numResultsInvalid, disabled: !writable, onChange: (v) => onChange({ numResults: v }) })
				}),
				...(meta?.params ?? []).map((param) => paramField(param)),
				Field({
					t, labelKey: "keysHeader", hintKey: "keysHeaderHint",
					control: null,
					children: React.createElement(
						"div",
						{ className: "um-dsh-websearch-panel" },
						React.createElement("button", {
							type: "button",
							className: "um-dsh-websearch-addKey",
							disabled: !writable,
							onClick: () => {
								const ref = nextKeyRef(meta?.keyRef ?? provider.id, provider.keys);
								onChange({ keys: [...provider.keys, { ref, enabled: true, allowFreeToPaid: false, allowPaidToFree: false }] });
								// Auto-open the new row so the value can be typed right away.
								setOpenKey(ref);
							}
						}, t("addKey")),
						provider.keys.map((key, index) =>
							React.createElement(KeyEditor, {
								key: index, t, entry: key, index, writable, provider,
								stagedValue: keyValues[key.ref] ?? "",
								configured: credStates[key.ref]?.configured === true,
								open: openKey === key.ref,
								onToggle: () => setOpenKey((prev) => prev === key.ref ? null : key.ref),
								onValueChange: (v) => onKeyValueChange(key.ref, v),
								onChange: (patch) => onChange({ keys: provider.keys.map((k, i) => i === index ? { ...k, ...patch } : k) }),
								onRemove: () => {
									if (openKey === key.ref) setOpenKey(null);
									onChange({ keys: provider.keys.filter((_, i) => i !== index) });
								}
							})
						)
					)
				})
			);
		}

		/**
		 * The settings card. Owns the whole staged form in one state object so
		 * dirtiness, the header badge, and both footers always derive from the
		 * same render pass.
		 */
		function UmWebSearchCard(props) {
			injectCssOnce();
			const scope = props.__scope;
			const t = props.t ?? props.__t ?? FALLBACK_T;
			const [snap, setSnap] = React.useState(() => (scope != null ? scope.getSnapshot() : undefined));
			React.useEffect(() => {
				if (scope == null || scope.subscribe === undefined) return undefined;
				return scope.subscribe(() => setSnap(scope.getSnapshot()));
			}, [scope]);
			const ready = snap != null && snap.status === "ready";
			const value = ready ? snap.value : undefined;
			const writable = !!(ready && snap.writable);
			const [modalOpen, setModalOpen] = React.useState(false);
			const [staged, setStaged] = React.useState({});
			const [saving, setSaving] = React.useState(false);
			const [failed, setFailed] = React.useState(false);
			const [activeTab, setActiveTab] = React.useState("providers");
			const [cardOpen, setCardOpen] = React.useState(false);
			// Staged key VALUES keyed by their (auto-generated) credential ref.
			// Values never enter the settings config: they are written through
			// the official credentials wire face on save.
			const [keyValues, setKeyValues] = React.useState({});
			const [credStates, setCredStates] = React.useState({});
			const credentialsApi = props.__credentialsApi ?? null;
			const resetKey = ready ? snap.revision : 0;
			React.useEffect(() => { setStaged({}); setKeyValues({}); setFailed(false); }, [resetKey]);
			const committedOf = (name) => (value != null ? value[name] : undefined);
			const stagedOf = (name) => (Object.prototype.hasOwnProperty.call(staged, name) ? staged[name] : undefined);
			const effective = (name, fallback) => stagedOf(name) !== undefined ? stagedOf(name) : (committedOf(name) !== undefined ? committedOf(name) : fallback);
			const effectiveEnabled = effective("enabled", FIELD_DEFAULTS.enabled) === true;
			const effectiveConcurrency = effective("concurrency", FIELD_DEFAULTS.concurrency);
			// The Host section nests the cache under one object; the card stages
			// its two members as flat fields and re-nests them on save.
			const committedCache = committedOf("cache") != null && typeof committedOf("cache") === "object" ? committedOf("cache") : {};
			const effectiveCacheEnabled = (stagedOf("cacheEnabled") ?? committedCache.enabled ?? FIELD_DEFAULTS.cacheEnabled) === true;
			const effectiveCacheTtl = stagedOf("cacheTtlSeconds") ?? committedCache.ttlSeconds ?? FIELD_DEFAULTS.cacheTtlSeconds;
			const effectiveProviders = cloneProviders(effective("providers", FIELD_DEFAULTS.providers));
			const effectiveDefault = effective("defaultProvider", FIELD_DEFAULTS.defaultProvider);
			const changeField = (name, next) => setStaged((prev) => ({ ...prev, [name]: next }));
			const committedBaselineOf = (name) => {
				if (name === "cacheEnabled") return committedCache.enabled !== undefined ? committedCache.enabled : FIELD_DEFAULTS.cacheEnabled;
				if (name === "cacheTtlSeconds") return committedCache.ttlSeconds !== undefined ? committedCache.ttlSeconds : FIELD_DEFAULTS.cacheTtlSeconds;
				return committedOf(name) !== undefined ? committedOf(name) : FIELD_DEFAULTS[name];
			};
			const isDirtyOf = (name) => stagedOf(name) !== undefined && JSON.stringify(stagedOf(name)) !== JSON.stringify(committedBaselineOf(name));
			const dirtyNames = ["enabled", "defaultProvider", "concurrency", "cacheEnabled", "cacheTtlSeconds", "providers"].filter(isDirtyOf);
			// Non-blank semantics: a value only counts (for dirtiness and for
			// writing) when it holds something beyond whitespace.
			const hasKeyValueDirty = Object.keys(keyValues).some((ref) => typeof keyValues[ref] === "string" && keyValues[ref].trim().length > 0);
			const hasDirty = dirtyNames.length > 0 || hasKeyValueDirty;
			const stagedConfig = {
				enabled: effectiveEnabled,
				defaultProvider: effectiveDefault,
				concurrency: effectiveConcurrency,
				cacheEnabled: effectiveCacheEnabled,
				cacheTtlSeconds: effectiveCacheTtl,
				providers: effectiveProviders
			};
			const errors = configErrors(stagedConfig);
			const hasInvalid = errors.length > 0;
			/** Ask the credentials domain which refs already hold a value. */
			const refreshCredStates = (providers) => {
				if (credentialsApi == null || typeof credentialsApi.describe !== "function") return;
				const refs = providers.flatMap((provider) => (provider.keys ?? []).map((entry) => entry.ref));
				if (refs.length === 0) return;
				credentialsApi.describe({ refs }).then((response) => {
					const views = response?.result?.value?.credentials ?? {};
					setCredStates((prev) => {
						let changed = false;
						const next = { ...prev };
						for (const ref of refs) {
							const view = views[ref];
							if (view === undefined) continue;
							const entry = { configured: view.configured === true, writable: view.writable !== false };
							if (next[ref]?.configured !== entry.configured || next[ref]?.writable !== entry.writable) changed = true;
							next[ref] = entry;
						}
						return changed ? next : prev;
					});
				}).catch(() => {});
			};
			const credFingerprint = effectiveProviders.map((provider) => (provider.keys ?? []).map((entry) => entry.ref).join(",")).join("|");
			React.useEffect(() => { refreshCredStates(effectiveProviders); }, [credFingerprint]);
			const overriddenOf = (name) => {
				if (snap == null) return false;
				const user = snap.user;
				if (user == null || !Object.prototype.hasOwnProperty.call(user, name)) return false;
				const base = snap.base != null && Object.prototype.hasOwnProperty.call(snap.base, name) ? snap.base[name] : FIELD_DEFAULTS[name];
				return JSON.stringify(user[name]) !== JSON.stringify(base);
			};
			const discard = () => { setStaged({}); setKeyValues({}); setFailed(false); };
			const save = async () => {
				if (scope == null || !hasDirty || hasInvalid) return;
				setSaving(true);
				try {
					for (const name of ["enabled", "defaultProvider", "concurrency", "cacheEnabled", "cacheTtlSeconds"]) {
						if (isDirtyOf(name)) await scope.set(name, coerceGlobal(name, stagedConfig[name]));
					}
					if (isDirtyOf("providers") || hasKeyValueDirty) {
						const coerced = effectiveProviders.map(coerceProvider);
						// Key values ride the official credentials wire face — they
						// never touch the settings config. Blank keeps the current
						// stored value (same contract as the official card).
						if (credentialsApi != null && typeof credentialsApi.set === "function") {
							for (const provider of coerced) {
								for (const entry of provider.keys ?? []) {
									const raw = keyValues[entry.ref];
									if (typeof raw !== "string") continue;
									const value = raw.trim();
									if (value.length > 0) {
										await credentialsApi.set({ ref: entry.ref, value });
									}
								}
							}
						}
						if (isDirtyOf("providers")) {
							await scope.set("providers", coerced);
							// Zero-storage migration (ADR-0004 D3): once the new shape is
							// stored, clear every legacy flat key so the Host stops
							// synthesizing over them.
							for (const legacy of LEGACY_KEYS) await scope.unset(legacy);
						}
					}
					if (isDirtyOf("cacheEnabled") || isDirtyOf("cacheTtlSeconds")) {
						await scope.set("cache", { enabled: stagedConfig.cacheEnabled, ttlSeconds: stagedConfig.cacheTtlSeconds });
					}
					refreshCredStates(effectiveProviders);
					setStaged({});
					setKeyValues({});
					setFailed(false);
				} catch {
					setFailed(true);
				} finally {
					setSaving(false);
					setSnap(scope.getSnapshot());
				}
			};
			if (!ready) return null;
			const ordered = orderedProvidersOf(effectiveProviders, effectiveDefault);
			const enabledProviders = ordered.filter((p) => p.enabled === true);
			const statusLine = () => {
				if (enabledProviders.length === 0) return t("statusAllOff");
				const order = enabledProviders.map(displayName).join(" → ");
				return t("statusTemplate").replace("{order}", order).replace("{n}", String(effectiveConcurrency));
			};
			const moveProvider = (index, direction) => {
				const list = [...effectiveProviders];
				const target = index + direction;
				if (target < 0 || target >= list.length) return;
				[list[index], list[target]] = [list[target], list[index]];
				changeField("providers", list);
			};
			const changeProvider = (index, patch) => {
				const list = effectiveProviders.map((entry, i) => i === index ? { ...entry, ...patch } : entry);
				changeField("providers", list);
			};
			const concurrencyInvalid = (() => { const n = Number(effectiveConcurrency); return !Number.isInteger(n) || n < 1 || n > 8; })();
			const ttlInvalid = (() => { const n = Number(effectiveCacheTtl); return !Number.isInteger(n) || n < 1 || n > 86400; })();
			const footerButtons = React.createElement(
				"div",
				{ className: "um-dsh-websearch-footer" },
				React.createElement("span", { className: "um-dsh-websearch-liveHint" }, t("liveHint")),
				failed ? React.createElement("p", { className: "um-dsh-websearch-failed", role: "status" }, t("saveFailed")) : null,
				React.createElement(Primitives.Button, { variant: "outline", size: "sm", disabled: !hasDirty || saving, onClick: discard }, t("discard")),
				React.createElement(Primitives.Button, { variant: "primary", size: "sm", disabled: !hasDirty || hasInvalid || saving, onClick: save }, saving ? t("saving") : t("save"))
			);
			const modalFooter = React.createElement(
				"div",
				{ className: "um-dsh-websearch-modalFooter" },
				failed ? React.createElement("p", { className: "um-dsh-websearch-failed", role: "status" }, t("saveFailed")) : null,
				React.createElement(Primitives.Button, { variant: "outline", size: "sm", disabled: !hasDirty || saving, onClick: discard }, t("discard")),
				React.createElement(Primitives.Button, { variant: "primary", size: "sm", disabled: !hasDirty || hasInvalid || saving, onClick: save }, saving ? t("saving") : t("save"))
			);
			const firstScreenRows = ordered.map((provider, index) => {
				const role = provider.enabled === true ? (provider.id === effectiveDefault ? "rolePrimary" : "roleFallback") : "roleOff";
				return React.createElement(
					"div",
					{ key: provider.id, className: "um-dsh-websearch-providerRow" },
					React.createElement(
						"div",
						{ className: "um-dsh-websearch-providerHead" },
						React.createElement("button", { type: "button", className: "um-dsh-websearch-orderBtn", disabled: !writable || index === 0, "aria-label": t("moveUp"), onClick: () => moveProvider(index, -1) }, "↑"),
						React.createElement("button", { type: "button", className: "um-dsh-websearch-orderBtn", disabled: !writable || index === ordered.length - 1, "aria-label": t("moveDown"), onClick: () => moveProvider(index, 1) }, "↓"),
						React.createElement("span", { className: "um-dsh-websearch-providerName" }, displayName(provider)),
						React.createElement("span", { className: "um-dsh-websearch-roleBadge um-dsh-websearch-roleBadge-" + role }, t(role)),
						React.createElement(Switch, { checked: provider.enabled, disabled: !writable, label: displayName(provider), onChange: (v) => changeProvider(ordered.findIndex((p) => p === provider), { enabled: v }) })
					)
				);
			});
			const warnKey = enabledProviders.length === 0 ? "warnAllDisabled" : (ordered.find((p) => p.id === effectiveDefault)?.enabled !== true ? "warnDefaultDisabled" : undefined);
			const modalTabs = [
				...effectiveProviders.map((provider) => ({ id: provider.id, label: displayName(provider) })),
				{ id: "about", labelKey: "tabAbout" }
			];
			const resolvedTab = modalTabs.some((tab) => tab.id === activeTab) ? activeTab : (modalTabs[0]?.id ?? "about");
			return React.createElement(
				"li",
				{ className: "um-dsh-websearch-card" },
				React.createElement(CardHeader, { dirty: hasDirty, t, open: cardOpen, onToggle: () => setCardOpen(!cardOpen) }),
				cardOpen ? React.createElement(
					"div",
					{ className: "um-dsh-websearch-body" },
					!writable ? React.createElement("p", { className: "um-dsh-websearch-readOnly", role: "status" }, t("readOnly")) : null,
					Field({
						t, labelKey: "enabled", hintKey: "enabledHint",
						badges: React.createElement(Badges, { t, dirty: isDirtyOf("enabled"), overridden: overriddenOf("enabled"), writable, onReset: () => scope?.unset("enabled") }),
						control: React.createElement(Switch, { checked: effectiveEnabled, disabled: !writable, label: t("enabled"), onChange: (v) => changeField("enabled", v) })
					}),
					React.createElement("p", { className: "um-dsh-websearch-statusLine" }, statusLine()),
					Field({
						t, labelKey: "concurrency", hintKey: "concurrencyHint", errorKey: concurrencyInvalid ? "invalidConcurrency" : undefined,
						control: React.createElement(TextInput, { kind: "number", value: effectiveConcurrency, disabled: !writable, onChange: (v) => changeField("concurrency", v) })
					}),
					Field({
						t, labelKey: "cacheEnabled", hintKey: "cacheEnabledHint",
						control: React.createElement(Switch, { checked: effectiveCacheEnabled, disabled: !writable, label: t("cacheEnabled"), onChange: (v) => changeField("cacheEnabled", v) })
					}),
					Field({
						t, labelKey: "cacheTtlSeconds", hintKey: "cacheTtlSecondsHint", errorKey: ttlInvalid ? "invalidTtl" : undefined,
						control: React.createElement(TextInput, { kind: "number", value: effectiveCacheTtl, disabled: !writable, onChange: (v) => changeField("cacheTtlSeconds", v) })
					}),
					React.createElement("p", { className: "um-dsh-websearch-hint" }, t("providerRowHint")),
					...firstScreenRows,
					warnKey !== undefined ? React.createElement("p", { className: "um-dsh-websearch-warning", role: "status" }, t(warnKey)) : null,
					React.createElement(
						"div",
						{ className: "um-dsh-websearch-detailsRow" },
						React.createElement(Primitives.Button, { variant: "outline", size: "sm", disabled: !writable, onClick: () => setModalOpen(true) }, t("detailsButton"))
					),
					hasDirty ? footerButtons : null
				) : null,
				React.createElement(
					Primitives.Modal,
					{
						open: modalOpen,
						onClose: () => setModalOpen(false),
						title: t("title") + t("detailsSuffix"),
						description: t("detailsDescription"),
						className: "um-dsh-websearch-dialog",
						contentClassName: "um-dsh-websearch-modalContent",
						footer: modalFooter
					},
					React.createElement(
						"div",
						{ className: "um-dsh-websearch-modalBody" },
						React.createElement(
							"div",
							{ className: "um-dsh-websearch-tabs", role: "tablist", "aria-label": t("title") + t("detailsSuffix") },
							modalTabs.map((tab) =>
								React.createElement(
									"button",
									{
										key: tab.id,
										type: "button",
										role: "tab",
										className: "um-dsh-websearch-tab",
										"aria-selected": resolvedTab === tab.id,
										onClick: () => setActiveTab(tab.id)
									},
									tab.labelKey !== undefined ? t(tab.labelKey) : tab.label
								)
							)
						),
						modalTabs.filter((tab) => tab.id === resolvedTab).map((tab) => {
							if (tab.id === "about") return React.createElement(AboutPanel, { key: "about", t });
							const index = effectiveProviders.findIndex((provider) => provider.id === tab.id);
							if (index < 0) return null;
							const provider = effectiveProviders[index];
							return React.createElement(
								"div",
								{ key: tab.id, className: "um-dsh-websearch-panel", role: "tabpanel" },
								React.createElement(ProviderEditor, {
									key: provider.id, t, provider, writable,
									keyValues, credStates,
									onKeyValueChange: (ref, value) => setKeyValues((prev) => ({ ...prev, [ref]: value })),
									canMoveUp: index > 0,
									canMoveDown: index < effectiveProviders.length - 1,
									onMove: (direction) => moveProvider(index, direction),
									onChange: (patch) => changeProvider(index, patch)
								})
							);
						})
					)
				)
			);
		}
		//#endregion
		//#region lib/types/client/index.js
		/**
		 * Browser half of um-dsh-websearch: registers one `settings.plugin.item`
		 * card claiming the `web-search-exa` namespace, so the Plugins settings tab
		 * dispatches it beside the built-in provider cards.
		 * @module um-dsh-websearch/client
		 */
		const inject = ["slots", "settingsScope", "locale"];
		function apply(ctx) {
			const slots = ctx.get("slots");
			const settingsScope = ctx.get("settingsScope");
			const locale = ctx.get("locale");
			if (slots === undefined || settingsScope === undefined) return;
			const scope = settingsScope.bind({ namespace: NS });
			const t = locale !== undefined && typeof locale.bind === "function" ? locale.bind(NS) : FALLBACK_T;
			// The official credentials wire face: key VALUES are written through
			// the DSH credentials domain (`connection.api.credentials.set`), never
			// into the settings section. Absent = the card degrades gracefully.
			const connection = ctx.get("connection");
			const credentialsApi = connection?.api?.credentials ?? null;
			if (locale !== undefined && typeof locale.register === "function") {
				ctx.effect(() => locale.register(NS, { zh, en }), "um-dsh-websearch: card dictionaries");
			}
			ctx.slots.inject("settings.plugin.item", () =>
				ctx.slots.register(
					{
						name: "settings.plugin.item",
						key: NS,
						locale: NS,
						label: () => t("title")
					},
					(props) =>
						React.createElement(UmWebSearchCard, {
							...props,
							__scope: scope,
							__t: t,
							__credentialsApi: credentialsApi
						})
				)
			);
		}
		//#endregion
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
