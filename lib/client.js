window.__ModuleLoader__.load({
	id: "um-dsh-websearch",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");
		const Primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/exa-card.js
		/** Settings namespace this card claims. Must match the Host half's settingsNamespace. */
		const NS = "web-search-exa";
		const SEARCH_TYPES = ["auto", "neural", "keyword"];
		const PARALLEL_MODES = ["turbo", "fast", "basic", "advanced"];
		// About-tab facts: display-only mirrors of the package metadata.
		const ABOUT_VERSION = "0.5.0";
		const ABOUT_SOURCE_URL = "https://github.com/UnforgetMemory/um-dsh-websearch";
		const ABOUT_AUTHOR = "UnforgetMemory";
		const ABOUT_DONATE_URL = "https://ko-fi.com/unforgetmemory";
		// Mirrors the Host's reference grammar (dsh-credentials keeps the pattern
		// private), so an invalid reference is caught at the form instead of
		// degrading the provider after save.
		const KEY_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

		function injectCssOnce() {
			if (typeof document === "undefined") return;
			// Visual parity with the shipped plugin cards: these rules mirror the
			// product's card/field stylesheets value-for-value under stable names.
			const css = [
				// ---- Design tokens (um-dsh-websearch namespace) ----
				// Defined on both the card and the modal content: the Modal may
				// portal its content out of the card's subtree, so the token scope
				// must not depend on inheritance from the card alone.
				":where(.um-dsh-websearch-card,.um-dsh-websearch-modalContent,.um-dsh-websearch-dialog){--um-dsh-websearch-radius-lg:12px;--um-dsh-websearch-radius-md:8px;--um-dsh-websearch-space-1:4px;--um-dsh-websearch-space-2:8px;--um-dsh-websearch-space-3:12px;--um-dsh-websearch-space-4:16px;--um-dsh-websearch-field-h:34px;--um-dsh-websearch-dialog-w:720px;--um-dsh-websearch-ease:cubic-bezier(.22,.61,.36,1);--um-dsh-websearch-dur:.16s;--um-dsh-websearch-tint-brand:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,var(--dsw-alias-bg-base));--um-dsh-websearch-tint-error:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,var(--dsw-alias-bg-base))}",
				// ---- Card (first screen) ----
				".um-dsh-websearch-card{min-width:0;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:var(--um-dsh-websearch-radius-lg);list-style:none;transition:border-color var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease),background var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease)}",
				".um-dsh-websearch-card:hover{border-color:var(--dsw-alias-label-dimmed)}",
				".um-dsh-websearch-header{width:100%;align-items:center;gap:var(--um-dsh-websearch-space-3);padding:14px var(--um-dsh-websearch-space-4);display:flex;min-width:0;box-sizing:border-box}",
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
				// ---- Modal sizing (design-system grounded) ----
				// Ant Design: 16px content padding, responsive width (default 520,
				// large variants for forms). Carbon / Red Hat: cap the height and
				// scroll INSIDE the content, never the page; horizontal overflow is
				// a bug, so overflow-x is explicitly hidden.
				// The primitive's dialog defaults to min(380px, 100%) (verified in
				// ui-primitives Modal.module.css); its `className` prop lands on the
				// DIALOG panel, which is portaled to body level — so a viewport-
				// relative width is exact and adaptive. `contentClassName` only
				// scopes the inner scroll region.
				".um-dsh-websearch-dialog{width:min(var(--um-dsh-websearch-dialog-w),calc(100vw - 48px))}",
				".um-dsh-websearch-modalContent{box-sizing:border-box;max-height:min(72vh,600px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable}",
				".um-dsh-websearch-modalBody{width:100%;min-width:0;box-sizing:border-box}",
				// ---- Tabs ----
				".um-dsh-websearch-tabs{border-bottom:1px solid var(--dsw-alias-border-l2);gap:2px;display:flex;min-width:0}",
				".um-dsh-websearch-tab{appearance:none;background:0 0;border:0;border-bottom:2px solid transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:13px;font-weight:500;line-height:1.5;margin-bottom:-1px;padding:8px 12px;flex:none;transition:color var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease),border-color var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease),background var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease)}",
				".um-dsh-websearch-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}",
				".um-dsh-websearch-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
				".um-dsh-websearch-tab[aria-selected=\"true\"]{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary)}",
				".um-dsh-websearch-panel{flex-direction:column;gap:var(--um-dsh-websearch-space-2);display:flex;min-width:0;animation:um-dsh-websearch-panel-in .18s var(--um-dsh-websearch-ease)}",
				"@keyframes um-dsh-websearch-panel-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}",
				// ---- About ----
				".um-dsh-websearch-about{flex-direction:column;gap:10px;padding:var(--um-dsh-websearch-space-2) 0;display:flex;min-width:0}",
				".um-dsh-websearch-aboutRow{display:flex;gap:var(--um-dsh-websearch-space-3);align-items:baseline;flex-wrap:wrap;min-width:0}",
				".um-dsh-websearch-aboutLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;width:88px;flex:none}",
				".um-dsh-websearch-aboutValue{color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;overflow-wrap:anywhere;min-width:0}",
				".um-dsh-websearch-aboutLink{color:var(--dsw-alias-brand-primary);font-size:13px;line-height:1.5;text-decoration:none;overflow-wrap:anywhere}",
				".um-dsh-websearch-aboutLink:hover{text-decoration:underline}",
				// ---- Strategy panel (Overview tab) ----
				".um-dsh-websearch-strategy{flex-direction:column;gap:var(--um-dsh-websearch-space-2);display:flex;min-width:0}",
				".um-dsh-websearch-backendRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:var(--um-dsh-websearch-radius-md);padding:var(--um-dsh-websearch-space-3);display:flex;flex-direction:column;gap:var(--um-dsh-websearch-space-2);min-width:0;box-sizing:border-box}",
				".um-dsh-websearch-backendHead{display:flex;align-items:center;gap:var(--um-dsh-websearch-space-2);min-width:0}",
				".um-dsh-websearch-backendName{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);line-height:1.5;flex:none}",
				".um-dsh-websearch-roleBadge{border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;flex:none;white-space:nowrap}",
				// Tinted chips: the background mixes the semantic color into the
				// theme base and the text uses the semantic token — every pair is
				// theme-adaptive, no hardcoded on-color anywhere.
				".um-dsh-websearch-roleBadge-rolePrimary{background:var(--um-dsh-websearch-tint-brand);color:var(--dsw-alias-brand-primary)}",
				".um-dsh-websearch-roleBadge-roleFallback{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}",
				".um-dsh-websearch-roleBadge-roleOff{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}",
				".um-dsh-websearch-roleBadge-rolePrimaryDisabled{background:var(--um-dsh-websearch-tint-error);color:var(--dsw-alias-state-error-primary)}",
				".um-dsh-websearch-primaryRow{display:flex;align-items:center;gap:var(--um-dsh-websearch-space-2);min-width:0;flex-wrap:wrap}",
				".um-dsh-websearch-radio{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:1.5;padding:3px 10px;border-radius:999px;transition:color var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease),border-color var(--um-dsh-websearch-dur) var(--um-dsh-websearch-ease)}",
				".um-dsh-websearch-radio:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
				".um-dsh-websearch-radio[aria-checked=\"true\"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}",
				".um-dsh-websearch-radio:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
				".um-dsh-websearch-radio:disabled{cursor:default;opacity:.55}",
				".um-dsh-websearch-warning{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2);border-radius:var(--um-dsh-websearch-radius-md);margin:0;padding:var(--um-dsh-websearch-space-2) var(--um-dsh-websearch-space-3);font-size:12px;line-height:1.5;display:flex;align-items:center;gap:var(--um-dsh-websearch-space-2);flex-wrap:wrap;min-width:0;overflow-wrap:anywhere}",
				"@media (prefers-reduced-motion: reduce){.um-dsh-websearch-card,.um-dsh-websearch-switch,.um-dsh-websearch-knob,.um-dsh-websearch-tab,.um-dsh-websearch-panel,.um-dsh-websearch-radio{transition:none;animation:none}}",
				// ---- Footers ----
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
				// ---- Switch (the knob is the only absolutely-positioned element,
				// and it stays inside its relative switch track) ----
				".um-dsh-websearch-switch{appearance:none;position:relative;width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-border-l3);border:none;cursor:pointer;transition:background var(--um-dsh-websearch-dur);flex:none;padding:0;margin:0}",
				".um-dsh-websearch-switch:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
				".um-dsh-websearch-switch[aria-checked=\"true\"]{background:var(--dsw-alias-brand-primary)}",
				".um-dsh-websearch-switch[aria-checked=\"true\"]:hover:not(:disabled){filter:brightness(1.08)}",
				".um-dsh-websearch-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
				".um-dsh-websearch-switch:disabled{cursor:default;opacity:.55}",
				".um-dsh-websearch-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-base);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform var(--um-dsh-websearch-dur);pointer-events:none}",
				".um-dsh-websearch-switch[aria-checked=\"true\"] .um-dsh-websearch-knob{transform:translateX(16px)}"
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

		/**
		 * The set of boolean field names that coerce by truthiness. Kept as one
		 * list so a new toggle added later is not silently stored as a string.
		 */
		const BOOLEAN_FIELDS = new Set([
			"enabled",
			"exaEnabled",
			"parallelEnabled",
			"allowAnonymous",
			"fallbackToPaid",
			"fallbackToAnonymous",
			"parallelAllowAnonymous",
			"parallelFallbackToPaid",
			"parallelFallbackToAnonymous"
		]);

		/** Coerce one staged value into the section's stored shape at write time. */
		function coerce(name, raw, fallback) {
			if (BOOLEAN_FIELDS.has(name)) return raw === true;
			if (name === "numResults") {
				const n = Math.round(Number(raw));
				if (!Number.isFinite(n) || n < 1 || n > 10) return fallback;
				return n;
			}
			if (name === "parallelNumResults") {
				const n = Math.round(Number(raw));
				if (!Number.isFinite(n) || n < 1 || n > 20) return fallback;
				return n;
			}
			if (typeof raw !== "string") return fallback;
			const trimmed = raw.trim();
			return trimmed.length > 0 ? trimmed : fallback;
		}

		/** Whether one field's staged value differs from its committed value. */
		function isDirty(name, stagedValue, committed) {
			if (stagedValue === undefined) return false;
			if (typeof stagedValue === "boolean") return !!stagedValue !== !!committed;
			return String(stagedValue ?? "") !== String(committed ?? "");
		}

		/**
		 * One field's staged-value violation as a copy KEY, or undefined when
		 * acceptable. Callers translate the key so copy follows the UI language.
		 */
		function fieldErrorOf(name, stagedValue) {
			if (stagedValue === undefined) return undefined;
			if (name === "numResults") {
				const n = Number(stagedValue);
				if (!(Number.isInteger(n) && n >= 1 && n <= 10)) return "invalidNumResults";
			} else if (name === "parallelNumResults") {
				const n = Number(stagedValue);
				if (!(Number.isInteger(n) && n >= 1 && n <= 20)) return "invalidParallelNumResults";
			} else if (name === "apiKeyEnv" || name === "parallelApiKeyEnv") {
				if (!(typeof stagedValue === "string" && KEY_REF_PATTERN.test(stagedValue.trim()))) return "invalidKeyRef";
			}
			return undefined;
		}

		/**
		 * One presentational field row. All form state lives in the card; this only
		 * draws the committed/staged pair it is handed and reports edits upward.
		 */
		function FieldRow(props) {
			const { field, committed, stagedValue, dirty, t } = props;
			const display = stagedValue !== undefined ? stagedValue : committed;
			const errorKey = fieldErrorOf(field.name, stagedValue);
			const invalid = errorKey !== undefined;
			let control;
			if (field.options) {
				control = React.createElement(
					"select",
					{
						className: "um-dsh-websearch-input",
						value: String(display ?? ""),
						onChange: (e) => props.onChange(e.target.value),
						disabled: !props.writable
					},
					field.options.map((opt) => React.createElement("option", { key: opt.value, value: opt.value }, opt.label))
				);
			} else if (field.kind === "boolean") {
				control = React.createElement(
					"button",
					{
						type: "button",
						role: "switch",
						className: "um-dsh-websearch-switch",
						"aria-checked": !!display,
						"aria-label": t(field.labelKey),
						onClick: (e) => {
							e.stopPropagation();
							props.onChange(!display);
						},
						disabled: !props.writable
					},
					React.createElement("span", { className: "um-dsh-websearch-knob" })
				);
			} else {
				control = React.createElement("input", {
					className: "um-dsh-websearch-input" + (invalid ? " um-dsh-websearch-inputInvalid" : ""),
					type: field.kind === "number" ? "number" : "text",
					value: display == null ? "" : String(display),
					onChange: (e) => props.onChange(e.target.value),
					disabled: !props.writable
				});
			}
			const badges = React.createElement(
				"span",
				{
					className: "um-dsh-websearch-badges",
					// Display-only: swallow clicks so the boolean header's toggle
					// (or the label's focus) never fires from a badge tap.
					onClick: (e) => {
						e.stopPropagation();
						e.preventDefault();
					}
				},
				dirty ? React.createElement("span", { className: "um-dsh-websearch-pending" }, t("unsaved")) : null,
				props.userOverridden === true ? React.createElement("span", { className: "um-dsh-websearch-badge" }, t("overridden")) : null,
				props.userOverridden === true
					? React.createElement("button", {
						type: "button",
						className: "um-dsh-websearch-reset",
						disabled: !props.writable,
						onClick: (e) => {
							e.stopPropagation();
							props.onReset();
						}
					}, t("reset"))
					: null
			);
			return React.createElement(
				"div",
				{ className: "um-dsh-websearch-field" },
				field.kind === "boolean"
					? React.createElement(
						"div",
						{ className: "um-dsh-websearch-fhead" },
						control,
						React.createElement("span", { className: "um-dsh-websearch-flabel" }, t(field.labelKey)),
						badges
					)
					: React.createElement(
						React.Fragment,
						null,
						React.createElement(
							"label",
							{ className: "um-dsh-websearch-fhead" },
							React.createElement("span", { className: "um-dsh-websearch-flabel" }, t(field.labelKey)),
							badges
						),
						control
					),
				field.hintKey ? React.createElement("p", { className: "um-dsh-websearch-hint" }, t(field.hintKey)) : null,
				invalid ? React.createElement("p", { className: "um-dsh-websearch-fieldError", role: "alert" }, t(errorKey)) : null
			);
		}

		/**
		 * Field metadata. The card splits the flat namespace into a first-screen
		 * master switch plus three modal groups; `apiKey`/`parallelApiKey` are
		 * deliberately absent (they never belong in the settings file).
		 */
		const MASTER_FIELD = { name: "enabled", labelKey: "enabled", kind: "boolean", hintKey: "enabledHint" };
		const FIELDS_STRATEGY = [
			{ name: "preferred", labelKey: "preferred", hintKey: "preferredHint", options: [{ value: "exa", label: "exa" }, { value: "parallel", label: "parallel" }] },
			{ name: "exaEnabled", labelKey: "exaEnabled", kind: "boolean", hintKey: "exaEnabledHint" },
			{ name: "parallelEnabled", labelKey: "parallelEnabled", kind: "boolean", hintKey: "parallelEnabledHint" }
		];
		const FIELDS_EXA = [
			{ name: "allowAnonymous", labelKey: "allowAnonymous", kind: "boolean", hintKey: "allowAnonymousHint" },
			{ name: "fallbackToPaid", labelKey: "fallbackToPaid", kind: "boolean", hintKey: "fallbackToPaidHint" },
			{ name: "fallbackToAnonymous", labelKey: "fallbackToAnonymous", kind: "boolean", hintKey: "fallbackToAnonymousHint" },
			{ name: "apiKeyEnv", labelKey: "apiKeyEnv", hintKey: "apiKeyEnvHint" },
			{ name: "baseURL", labelKey: "baseURL", hintKey: "baseURLHint" },
			{ name: "mcpBaseURL", labelKey: "mcpBaseURL", hintKey: "mcpBaseURLHint" },
			{ name: "numResults", labelKey: "numResults", hintKey: "numResultsHint", kind: "number" },
			{ name: "searchType", labelKey: "searchType", hintKey: "searchTypeHint", options: SEARCH_TYPES.map((v) => ({ value: v, label: v })) }
		];
		const FIELDS_PARALLEL = [
			{ name: "parallelAllowAnonymous", labelKey: "parallelAllowAnonymous", kind: "boolean", hintKey: "parallelAllowAnonymousHint" },
			{ name: "parallelFallbackToPaid", labelKey: "parallelFallbackToPaid", kind: "boolean", hintKey: "parallelFallbackToPaidHint" },
			{ name: "parallelFallbackToAnonymous", labelKey: "parallelFallbackToAnonymous", kind: "boolean", hintKey: "parallelFallbackToAnonymousHint" },
			{ name: "parallelApiKeyEnv", labelKey: "parallelApiKeyEnv", hintKey: "parallelApiKeyEnvHint" },
			{ name: "parallelBaseURL", labelKey: "parallelBaseURL", hintKey: "parallelBaseURLHint" },
			{ name: "parallelMcpBaseURL", labelKey: "parallelMcpBaseURL", hintKey: "parallelMcpBaseURLHint" },
			{ name: "parallelNumResults", labelKey: "parallelNumResults", hintKey: "parallelNumResultsHint", kind: "number" },
			{ name: "parallelMode", labelKey: "parallelMode", hintKey: "parallelModeHint", options: PARALLEL_MODES.map((v) => ({ value: v, label: v })) }
		];
		/** The union of every rendered field, in write order. */
		const ALL_FIELDS = [MASTER_FIELD, ...FIELDS_STRATEGY, ...FIELDS_EXA, ...FIELDS_PARALLEL];
		/** The Modal's tabbed pages: strategy overview, two backend pages, about. */
		const DETAIL_TABS = [
			{ id: "strategy", labelKey: "tabStrategy", fields: FIELDS_STRATEGY },
			{ id: "exa", labelKey: "tabExa", fields: FIELDS_EXA },
			{ id: "parallel", labelKey: "tabParallel", fields: FIELDS_PARALLEL },
			{ id: "about", labelKey: "tabAbout", fields: null }
		];
		/** Factory defaults mirrored from the Host Config schema, for override detection. */
		const FIELD_DEFAULTS = {
			enabled: false,
			preferred: "exa",
			exaEnabled: true,
			parallelEnabled: false,
			allowAnonymous: false,
			fallbackToPaid: false,
			fallbackToAnonymous: false,
			apiKeyEnv: "EXA_API_KEY",
			baseURL: "https://api.exa.ai",
			mcpBaseURL: "https://mcp.exa.ai/mcp",
			numResults: 5,
			searchType: "auto",
			parallelAllowAnonymous: false,
			parallelFallbackToPaid: false,
			parallelFallbackToAnonymous: false,
			parallelApiKeyEnv: "PARALLEL_API_KEY",
			parallelBaseURL: "https://api.parallel.ai",
			parallelMcpBaseURL: "https://search.parallel.ai/mcp",
			parallelNumResults: 10,
			parallelMode: "fast"
		};

		/** English copy for the card, registered under the plugin's locale namespace. */
		const en = {
			title: "UM web search",
			description: "Unofficial web search plugin.",
			expand: "Show settings",
			collapse: "Hide settings",
			enabled: "Enable search",
			enabledHint: "Master switch — off keeps the provider registered but unusable.",
			allowAnonymous: "Allow anonymous access",
			allowAnonymousHint: "On: public MCP, no key. Off: REST /search with a key.",
			fallbackToPaid: "Fall back to paid search",
			fallbackToPaidHint: "Retry through REST /search when the anonymous MCP is rejected.",
			fallbackToAnonymous: "Fall back to anonymous access",
			fallbackToAnonymousHint: "Retry through the public MCP when REST fails (bad key, balance, limit).",
			apiKeyEnv: "API key reference",
			apiKeyEnvHint: "Credentials-service reference; the key itself never lands here.",
			baseURL: "REST endpoint base",
			baseURLHint: "/search is appended. Default https://api.exa.ai",
			mcpBaseURL: "Anonymous MCP base",
			mcpBaseURLHint: "Default https://mcp.exa.ai/mcp; point at a proxy if needed.",
			numResults: "Default result count (1–10)",
			numResultsHint: "Used when a search carries no explicit count.",
			searchType: "Search type",
			searchTypeHint: "auto / neural / keyword (REST only)",
			preferred: "Preferred backend",
			preferredHint: "Backend tried first; the other one degrades in.",
			exaEnabled: "Enable Exa backend",
			exaEnabledHint: "Exa backend on/off.",
			parallelEnabled: "Enable Parallel backend",
			parallelEnabledHint: "Parallel backend on/off.",
			parallelAllowAnonymous: "Allow Parallel anonymous access",
			parallelAllowAnonymousHint: "On: anonymous MCP (result count ignored). Off: REST /v1/search.",
			parallelFallbackToPaid: "Parallel: fall back to paid search",
			parallelFallbackToPaidHint: "Retry through REST /v1/search when the anonymous MCP is rejected.",
			parallelFallbackToAnonymous: "Parallel: fall back to anonymous access",
			parallelFallbackToAnonymousHint: "Retry through the anonymous MCP when REST fails.",
			parallelApiKeyEnv: "Parallel API key reference",
			parallelApiKeyEnvHint: "Credentials-service reference. Default PARALLEL_API_KEY.",
			parallelBaseURL: "Parallel REST endpoint base",
			parallelBaseURLHint: "Default https://api.parallel.ai; /v1/search appended.",
			parallelMcpBaseURL: "Parallel anonymous MCP base",
			parallelMcpBaseURLHint: "Default https://search.parallel.ai/mcp; point at a proxy if needed.",
			parallelNumResults: "Parallel default result count (1–20)",
			parallelNumResultsHint: "REST only — the MCP tool has no count parameter.",
			parallelMode: "Parallel search mode",
			parallelModeHint: "turbo / fast / basic / advanced. Default fast.",
			tabStrategy: "Overview",
			tabExa: "Exa",
			tabParallel: "Parallel",
			tabAbout: "About",
			detailsButton: "Advanced settings…",
			detailsSuffix: " · Advanced settings",
			detailsDescription: "Strategy, per-backend options and about, one page per tab.",
			aboutVersion: "Version",
			aboutAuthor: "Author",
			aboutSource: "Source",
			aboutSourceRepo: "GitHub repository",
			aboutDonate: "Support",
			aboutDonateCta: "Buy me a coffee on Ko-fi",
			statusExaFirstParallelOff: "Strategy: Exa first · Parallel disabled",
			statusExaFirstParallelOn: "Strategy: Exa first · Parallel on as fallback",
			statusParallelFirstExaOff: "Strategy: Parallel first · Exa disabled",
			statusParallelFirstExaOn: "Strategy: Parallel first · Exa on as fallback",
			statusExaOffParallelServes: "Strategy: served by Parallel · Exa is off",
			statusParallelOffExaServes: "Strategy: served by Exa · Parallel is off",
			statusAllOff: "Strategy: both backends off · search unavailable",
			backendExa: "Exa",
			backendParallel: "Parallel",
			setPrimary: "Set as primary",
			rolePrimary: "Primary",
			roleFallback: "Fallback",
			roleOff: "Off",
			rolePrimaryDisabled: "Primary · off",
			warnPreferredDisabled: "The preferred backend is off; the other one serves.",
			warnAllDisabled: "Both backends are off; search is unavailable.",
			swapPrimary: "Swap",
			invalidNumResults: "Enter an integer from 1 to 10",
			invalidParallelNumResults: "Enter an integer from 1 to 20",
			invalidKeyRef: "Use letters, digits, and underscores, starting with a letter or underscore",
			unsaved: "Unsaved",
			overridden: "Overridden",
			reset: "Reset to default",
			readOnly: "This deployment stores settings read-only; changes cannot be saved.",
			liveHint: "Saved changes take effect on the next search — no restart needed",
			saveFailed: "The save failed; server state was restored.",
			save: "Save",
			saving: "Saving…",
			discard: "Discard"
		};
		/** Simplified Chinese copy for the card. */
		const zh = {
			title: "UM 网页搜索",
			description: "非官方网页搜索插件",
			expand: "展开设置",
			collapse: "收起设置",
			enabled: "启用搜索",
			enabledHint: "总开关：关闭后提供者保持注册但不可用。",
			allowAnonymous: "允许匿名访问",
			allowAnonymousHint: "开启走公共 MCP（免密钥）；关闭走 REST 密钥。",
			fallbackToPaid: "匿名失败回退付费",
			fallbackToPaidHint: "匿名被拒时改走 REST /search。",
			fallbackToAnonymous: "付费失败回退匿名",
			fallbackToAnonymousHint: "付费失败（坏钥/欠费/限流）时改走公共 MCP。",
			apiKeyEnv: "API 密钥引用名",
			apiKeyEnvHint: "凭据库引用名；密钥本身不落此处。",
			baseURL: "接口基址 (REST)",
			baseURLHint: "自动拼 /search。默认 https://api.exa.ai",
			mcpBaseURL: "匿名 MCP 基址",
			mcpBaseURLHint: "默认 mcp.exa.ai/mcp；可指向自建代理。",
			numResults: "默认结果数 (1–10)",
			numResultsHint: "搜索未指定条数时的默认值。",
			searchType: "检索类型",
			searchTypeHint: "auto / neural / keyword（仅 REST）",
			preferred: "优先后端",
			preferredHint: "先尝试的后端；另一个作降级备用。",
			exaEnabled: "启用 Exa 后端",
			exaEnabledHint: "Exa 后端启停。",
			parallelEnabled: "启用 Parallel 后端",
			parallelEnabledHint: "Parallel 后端启停。",
			parallelAllowAnonymous: "允许 Parallel 匿名访问",
			parallelAllowAnonymousHint: "开启走匿名 MCP（忽略条数）；关闭走 REST。",
			parallelFallbackToPaid: "Parallel 匿名失败回退付费",
			parallelFallbackToPaidHint: "匿名被拒时改走 REST /v1/search。",
			parallelFallbackToAnonymous: "Parallel 付费失败回退匿名",
			parallelFallbackToAnonymousHint: "付费失败时改走匿名 MCP。",
			parallelApiKeyEnv: "Parallel API 密钥引用名",
			parallelApiKeyEnvHint: "凭据库引用名。默认 PARALLEL_API_KEY。",
			parallelBaseURL: "Parallel 接口基址 (REST)",
			parallelBaseURLHint: "默认 api.parallel.ai，自动拼 /v1/search。",
			parallelMcpBaseURL: "Parallel 匿名 MCP 基址",
			parallelMcpBaseURLHint: "默认 search.parallel.ai/mcp；可指向自建代理。",
			parallelNumResults: "Parallel 默认结果数 (1–20)",
			parallelNumResultsHint: "仅 REST 生效；MCP 工具无条数参数。",
			parallelMode: "Parallel 搜索模式",
			parallelModeHint: "turbo / fast / basic / advanced。默认 fast。",
			tabStrategy: "综合",
			tabExa: "Exa",
			tabParallel: "Parallel",
			tabAbout: "关于",
			detailsButton: "详细配置…",
			detailsSuffix: " · 详细配置",
			detailsDescription: "策略、各后端参数与关于信息分页呈现。",
			aboutVersion: "版本",
			aboutAuthor: "作者",
			aboutSource: "来源",
			aboutSourceRepo: "GitHub 仓库",
			aboutDonate: "支持",
			aboutDonateCta: "Ko-fi 请我喝杯咖啡",
			statusExaFirstParallelOff: "策略：Exa 优先 · Parallel 未启用",
			statusExaFirstParallelOn: "策略：Exa 优先 · Parallel 已启用备用",
			statusParallelFirstExaOff: "策略：Parallel 优先 · Exa 未启用",
			statusParallelFirstExaOn: "策略：Parallel 优先 · Exa 已启用备用",
			statusExaOffParallelServes: "策略：当前由 Parallel 服务 · Exa 已停用",
			statusParallelOffExaServes: "策略：当前由 Exa 服务 · Parallel 已停用",
			statusAllOff: "策略：两后端均已停用 · 搜索不可用",
			backendExa: "Exa",
			backendParallel: "Parallel",
			setPrimary: "设为优先",
			rolePrimary: "优先",
			roleFallback: "备用",
			roleOff: "停用",
			rolePrimaryDisabled: "首选 · 已停用",
			warnPreferredDisabled: "首选后端已停用，当前由另一后端服务。",
			warnAllDisabled: "两个后端均已停用，搜索不可用。",
			swapPrimary: "交换优先",
			invalidNumResults: "请输入 1–10 的整数",
			invalidParallelNumResults: "请输入 1–20 的整数",
			invalidKeyRef: "仅限字母、数字、下划线，以字母或下划线开头",
			unsaved: "未保存",
			overridden: "已覆盖",
			reset: "恢复默认",
			readOnly: "当前连接为只读，无法修改此配置。",
			liveHint: "更改保存后即时生效，无需重启",
			saveFailed: "保存失败，已恢复服务器状态。",
			save: "保存",
			saving: "保存中…",
			discard: "放弃"
		};
		/** Copy fallback when the locale seat is absent (degrades to Chinese). */
		const FALLBACK_T = (key) => zh[key] ?? key;

		/**
		 * Pick the copy key for the first-screen status line purely from the
		 * effective strategy values (staged overrides committed). No template
		 * substitution is needed because the four grammar shapes are distinct.
		 */
		function statusKeyOf(preferred, exaEnabled, parallelEnabled) {
			const exaOn = exaEnabled === true;
			const parOn = parallelEnabled === true;
			const isExa = preferred !== "parallel";
			if (!exaOn && !parOn) return "statusAllOff";
			if (isExa) {
				if (!exaOn) return "statusExaOffParallelServes";
				return parOn ? "statusExaFirstParallelOn" : "statusExaFirstParallelOff";
			}
			if (!parOn) return "statusParallelOffExaServes";
			return exaOn ? "statusParallelFirstExaOn" : "statusParallelFirstExaOff";
		}

		/** The About page: version, author, source and donation links. */
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

		/** The card header: title, description, and the header-level dirty badge. */
		function CardHeader(props) {
			return React.createElement(
				"div",
				{ className: "um-dsh-websearch-header" },
				React.createElement(
					"span",
					{ className: "um-dsh-websearch-headText" },
					React.createElement("span", { className: "um-dsh-websearch-name" }, props.t("title")),
					React.createElement("span", { className: "um-dsh-websearch-description" }, props.t("description"))
				),
				props.dirty ? React.createElement("span", { className: "um-dsh-websearch-pending" }, props.t("unsaved")) : null
			);
		}

		/**
		 * The Exa provider configuration card, dispatched under key `web-search-exa`.
		 * Owns the whole staged form in one state object so dirtiness, the header
		 * badge, and both footers (first screen and Modal) always derive from the
		 * same render pass.
		 */
		function ExaSettingsCard(props) {
			injectCssOnce();
			const scope = props.__scope;
			// Copy resolves through the renderer's locale seat when present, then
			// the apply-bound translator, then the Chinese fallback map.
			const t = props.t ?? props.__t ?? FALLBACK_T;
			// The snapshot lives in state so every publish re-derives committed
			// values and the override badge from the same render pass, live.
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
			const [activeTab, setActiveTab] = React.useState(DETAIL_TABS[0].id);
			const resetKey = ready ? snap.revision : 0;
			// A revision bump means a commit landed (ours or external): re-mirror.
			React.useEffect(() => { setStaged({}); setFailed(false); }, [resetKey]);
			const committedOf = (name) => (value != null ? value[name] : undefined);
			const stagedOf = (name) => (Object.prototype.hasOwnProperty.call(staged, name) ? staged[name] : undefined);
			const changeField = (name, next) => setStaged((prev) => ({ ...prev, [name]: next }));
			const dirtyNames = ALL_FIELDS.filter((f) => isDirty(f.name, stagedOf(f.name), committedOf(f.name))).map((f) => f.name);
			const hasDirty = dirtyNames.length > 0;
			// Mirrors the shipped cards' form discipline: a draft the field cannot
			// accept blocks the save instead of being silently rewritten.
			const hasInvalid = dirtyNames.some((name) => fieldErrorOf(name, stagedOf(name)) !== undefined);
			// "已覆盖" means the stored user value genuinely differs from the
			// deployment default (the base layer if it names the field, else the
			// factory default) — not merely that a key exists, so re-saving a
			// value equal to the default no longer pretends to be an override.
			const overriddenOf = (name) => {
				if (snap == null) return false;
				const user = snap.user;
				if (user == null || !Object.prototype.hasOwnProperty.call(user, name)) return false;
				const base = snap.base != null && Object.prototype.hasOwnProperty.call(snap.base, name) ? snap.base[name] : FIELD_DEFAULTS[name];
				return String(user[name]) !== String(base);
			};
			const resetField = async (name) => {
				if (scope == null) return;
				setSaving(true);
				try {
					await scope.unset(name);
					setStaged((prev) => {
						const next = { ...prev };
						delete next[name];
						return next;
					});
					setFailed(false);
				} catch (e) {
					setFailed(true);
				} finally {
					setSaving(false);
					setSnap(scope.getSnapshot());
				}
			};
			const discard = () => {
				setStaged({});
				setFailed(false);
			};
			const save = async () => {
				if (scope == null || !hasDirty || hasInvalid) return;
				setSaving(true);
				try {
					for (const name of dirtyNames) {
						await scope.set(name, coerce(name, staged[name], committedOf(name)));
					}
					setStaged({});
					setFailed(false);
				} catch (e) {
					setFailed(true);
				} finally {
					setSaving(false);
					setSnap(scope.getSnapshot());
				}
			};
			if (!ready) return null;
			// The status line reads the effective strategy: staged wins over
			// committed so a half-typed Modal edit updates the first screen live.
			const effectivePreferred = stagedOf("preferred") ?? committedOf("preferred") ?? FIELD_DEFAULTS.preferred;
			const effectiveExaEnabled = Object.prototype.hasOwnProperty.call(staged, "exaEnabled")
				? staged["exaEnabled"]
				: (committedOf("exaEnabled") ?? FIELD_DEFAULTS.exaEnabled);
			const effectiveParallelEnabled = Object.prototype.hasOwnProperty.call(staged, "parallelEnabled")
				? staged["parallelEnabled"]
				: (committedOf("parallelEnabled") ?? FIELD_DEFAULTS.parallelEnabled);
			const renderField = (field, key) =>
				React.createElement(FieldRow, {
					key: key ?? field.name,
					field,
					t,
					committed: committedOf(field.name),
					stagedValue: stagedOf(field.name),
					dirty: isDirty(field.name, stagedOf(field.name), committedOf(field.name)),
					writable,
					userOverridden: overriddenOf(field.name),
					onReset: () => void resetField(field.name),
					onChange: (next) => changeField(field.name, next)
				});
			// The Overview panel shows the EFFECTIVE strategy, not the raw config:
			// a disabled preferred backend is reported as such, the backend that
			// actually serves first is named, and a one-click swap fixes the
			// mismatch. Roles derive from staged values so edits preview live.
			const renderStrategyPanel = () => {
				const roleOf = (isExa) => {
					const primary = isExa ? effectivePreferred !== "parallel" : effectivePreferred === "parallel";
					const enabled = isExa ? effectiveExaEnabled : effectiveParallelEnabled;
					if (primary && enabled) return "rolePrimary";
					if (primary && !enabled) return "rolePrimaryDisabled";
					if (!primary && enabled) return "roleFallback";
					return "roleOff";
				};
				const badgesOf = (name) => {
					const dirty = isDirty(name, stagedOf(name), committedOf(name));
					const over = overriddenOf(name);
					return React.createElement(
						"span",
						{
							className: "um-dsh-websearch-badges",
							onClick: (e) => { e.stopPropagation(); e.preventDefault(); }
						},
						dirty ? React.createElement("span", { className: "um-dsh-websearch-pending" }, t("unsaved")) : null,
						over ? React.createElement("span", { className: "um-dsh-websearch-badge" }, t("overridden")) : null,
						over
							? React.createElement("button", {
								type: "button",
								className: "um-dsh-websearch-reset",
								disabled: !writable,
								onClick: () => void resetField(name)
							}, t("reset"))
							: null
					);
				};
				const backendRow = (isExa) => {
					const field = isExa ? FIELDS_STRATEGY[1] : FIELDS_STRATEGY[2];
					const primary = isExa ? effectivePreferred !== "parallel" : effectivePreferred === "parallel";
					return React.createElement(
						"div",
						{ className: "um-dsh-websearch-backendRow" },
						React.createElement(
							"div",
							{ className: "um-dsh-websearch-backendHead" },
							React.createElement("span", { className: "um-dsh-websearch-backendName" }, t(isExa ? "backendExa" : "backendParallel")),
							React.createElement("span", { className: "um-dsh-websearch-roleBadge um-dsh-websearch-roleBadge-" + roleOf(isExa) }, t(roleOf(isExa)))
						),
						renderField(field, "strategy-" + field.name),
						React.createElement(
							"div",
							{ className: "um-dsh-websearch-primaryRow" },
							React.createElement("button", {
								type: "button",
								role: "radio",
								className: "um-dsh-websearch-radio" + (primary ? " um-dsh-websearch-radioOn" : ""),
								"aria-checked": primary,
								disabled: !writable,
								onClick: () => changeField("preferred", isExa ? "exa" : "parallel")
							}, t("setPrimary")),
							primary ? badgesOf("preferred") : null
						)
					);
				};
				const preferredOn = effectivePreferred !== "parallel" ? effectiveExaEnabled : effectiveParallelEnabled;
				const otherOn = effectivePreferred !== "parallel" ? effectiveParallelEnabled : effectiveExaEnabled;
				const warnKey = !effectiveExaEnabled && !effectiveParallelEnabled
					? "warnAllDisabled"
					: (!preferredOn && otherOn ? "warnPreferredDisabled" : undefined);
				return React.createElement(
					"div",
					{ className: "um-dsh-websearch-strategy" },
					React.createElement("p", { className: "um-dsh-websearch-statusLine" }, t(statusKeyOf(effectivePreferred, effectiveExaEnabled, effectiveParallelEnabled))),
					warnKey !== undefined
						? React.createElement(
							"p",
							{ className: "um-dsh-websearch-warning", role: "status" },
							t(warnKey),
							warnKey === "warnPreferredDisabled"
								? React.createElement("button", {
									type: "button",
									className: "um-dsh-websearch-reset",
									disabled: !writable,
									onClick: () => changeField("preferred", effectivePreferred === "exa" ? "parallel" : "exa")
								}, t("swapPrimary"))
								: null
						)
						: null,
					backendRow(true),
					backendRow(false)
				);
			};
			// The footer buttons are shared between the first screen and the Modal
			// footer, so a staged edit made in either place flows through the same
			// save loop and the same header dirty badge.
			const footerButtons = React.createElement(
				"div",
				{ className: "um-dsh-websearch-footer" },
				React.createElement("span", { className: "um-dsh-websearch-liveHint" }, t("liveHint")),
				failed ? React.createElement("p", { className: "um-dsh-websearch-failed", role: "status" }, t("saveFailed")) : null,
				React.createElement(Primitives.Button, {
					variant: "outline",
					size: "sm",
					disabled: !hasDirty || saving,
					onClick: discard
				}, t("discard")),
				React.createElement(Primitives.Button, {
					variant: "primary",
					size: "sm",
					disabled: !hasDirty || hasInvalid || saving,
					onClick: save
				}, saving ? t("saving") : t("save"))
			);
			const modalFooter = React.createElement(
				"div",
				{ className: "um-dsh-websearch-modalFooter" },
				failed ? React.createElement("p", { className: "um-dsh-websearch-failed", role: "status" }, t("saveFailed")) : null,
				React.createElement(Primitives.Button, {
					variant: "outline",
					size: "sm",
					disabled: !hasDirty || saving,
					onClick: discard
				}, t("discard")),
				React.createElement(Primitives.Button, {
					variant: "primary",
					size: "sm",
					disabled: !hasDirty || hasInvalid || saving,
					onClick: save
				}, saving ? t("saving") : t("save"))
			);
			return React.createElement(
				"li",
				{ className: "um-dsh-websearch-card" },
				React.createElement(CardHeader, { dirty: hasDirty, t }),
				React.createElement(
					"div",
					{ className: "um-dsh-websearch-body" },
					!writable ? React.createElement("p", { className: "um-dsh-websearch-readOnly", role: "status" }, t("readOnly")) : null,
					renderField(MASTER_FIELD),
					React.createElement(
						"p",
						{ className: "um-dsh-websearch-statusLine" },
						t(statusKeyOf(effectivePreferred, effectiveExaEnabled, effectiveParallelEnabled))
					),
					React.createElement(
						"div",
						{ className: "um-dsh-websearch-detailsRow" },
						React.createElement(Primitives.Button, {
							variant: "outline",
							size: "sm",
							disabled: !writable,
							onClick: () => setModalOpen(true)
						}, t("detailsButton"))
					),
					hasDirty ? footerButtons : null
				),
				// The Modal owns its own chrome; contentClassName only scopes the
				// scroll area. Closing it never discards the shared staged state.
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
							DETAIL_TABS.map((tab) =>
								React.createElement(
									"button",
									{
										key: tab.id,
										type: "button",
										role: "tab",
										className: "um-dsh-websearch-tab",
										"aria-selected": activeTab === tab.id,
										onClick: () => setActiveTab(tab.id)
									},
									t(tab.labelKey)
								)
							)
						),
						// Only the active page mounts, so each switch replays the
						// entrance animation and inactive fields stay out of the tree.
						DETAIL_TABS.filter((tab) => tab.id === activeTab).map((tab) => {
							if (tab.id === "about") return React.createElement(AboutPanel, { key: "about", t });
							if (tab.id === "strategy") return React.createElement("div", { key: tab.id, className: "um-dsh-websearch-panel", role: "tabpanel" }, renderStrategyPanel());
							return React.createElement(
								"div",
								{ key: tab.id, className: "um-dsh-websearch-panel", role: "tabpanel" },
								(tab.fields ?? []).map((f) => renderField(f))
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
			// Official plugin-card i18n: bind a translator to the plugin's own
			// namespace, register the dictionaries through a fiber effect, and
			// declare `locale` on the slot entry so the renderer derives the `t`
			// seat and re-renders the card on every language switch.
			const t = locale !== undefined && typeof locale.bind === "function" ? locale.bind(NS) : FALLBACK_T;
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
						React.createElement(ExaSettingsCard, {
							...props,
							__scope: scope,
							__t: t
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
