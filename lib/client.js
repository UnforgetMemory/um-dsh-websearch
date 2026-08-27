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
		// Mirrors the Host's reference grammar (dsh-credentials keeps the pattern
		// private), so an invalid reference is caught at the form instead of
		// degrading the provider after save.
		const KEY_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

		function injectCssOnce() {
			if (typeof document === "undefined") return;
			// Visual parity with the shipped plugin cards: these rules mirror the
			// product's card/field stylesheets value-for-value under stable names.
			const css = [
				".umexa-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}",
				".umexa-card:hover{border-color:var(--dsw-alias-label-dimmed)}",
				".umexa-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
				".umexa-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
				".umexa-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
				".umexa-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
				".umexa-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}",
				".umexa-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
				".umexa-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}",
				".umexa-chevronOpen{transform:rotate(180deg)}",
				".umexa-pending,.umexa-badge{white-space:nowrap;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",
				".umexa-badges{align-items:center;gap:8px;display:inline-flex}",
				".umexa-reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}",
				".umexa-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
				".umexa-reset:disabled{cursor:default}",
				".umexa-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}",
				".umexa-readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}",
				".umexa-footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}",
				".umexa-failed{min-width:0;color:var(--dsw-alias-state-error-primary);flex:1;margin:0;font-size:12px;line-height:1.5}",
				".umexa-fieldError{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:1.5}",
				".umexa-liveHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;margin-right:auto}",
				".umexa-field{flex-direction:column;gap:6px;padding:12px 0;display:flex}",
				".umexa-field+.umexa-field{border-top:1px solid var(--dsw-alias-border-l2)}",
				".umexa-fhead{align-items:center;gap:8px;display:flex}",
				".umexa-flabel{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}",
				".umexa-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}",
				".umexa-input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;width:100%;box-sizing:border-box}",
				".umexa-input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}",
				".umexa-inputInvalid{border-color:var(--dsw-alias-label-error)}",
				".umexa-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
				".umexa-switch{appearance:none;position:relative;width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-border-l3);border:none;cursor:pointer;transition:background .16s;flex:none;padding:0;margin:0}",
				".umexa-switch:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
				".umexa-switch[aria-checked=\"true\"]{background:var(--dsw-alias-brand-primary)}",
				".umexa-switch[aria-checked=\"true\"]:hover:not(:disabled){filter:brightness(1.08)}",
				".umexa-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
				".umexa-switch:disabled{cursor:default;opacity:.55}",
				".umexa-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-base);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .16s;pointer-events:none}",
				".umexa-switch[aria-checked=\"true\"] .umexa-knob{transform:translateX(16px)}"
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

		/** Coerce one staged value into the section's stored shape at write time. */
		function coerce(name, raw, fallback) {
			if (name === "enabled" || name === "allowAnonymous") return raw === true;
			if (name === "numResults") {
				const n = Math.round(Number(raw));
				if (!Number.isFinite(n) || n < 1 || n > 10) return fallback;
				return n;
			}
			if (typeof raw !== "string") return fallback;
			const trimmed = raw.trim();
			return trimmed.length > 0 ? trimmed : fallback;
		}

		/** Whether one field's staged value differs from its committed value. */
		function isDirty(name, stagedValue, committed) {
			if (stagedValue === undefined) return false;
			if (typeof stagedValue === "boolean" || name === "enabled" || name === "allowAnonymous") return !!stagedValue !== !!committed;
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
			} else if (name === "apiKeyEnv" && !(typeof stagedValue === "string" && KEY_REF_PATTERN.test(stagedValue.trim()))) {
				return "invalidKeyRef";
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
						className: "umexa-input",
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
						className: "umexa-switch",
						"aria-checked": !!display,
						"aria-label": t(field.labelKey),
						onClick: (e) => {
							e.stopPropagation();
							props.onChange(!display);
						},
						disabled: !props.writable
					},
					React.createElement("span", { className: "umexa-knob" })
				);
			} else {
				control = React.createElement("input", {
					className: "umexa-input" + (invalid ? " umexa-inputInvalid" : ""),
					type: field.kind === "number" ? "number" : "text",
					value: display == null ? "" : String(display),
					onChange: (e) => props.onChange(e.target.value),
					disabled: !props.writable
				});
			}
			const badges = React.createElement(
				"span",
				{
					className: "umexa-badges",
					// Display-only: swallow clicks so the boolean header's toggle
					// (or the label's focus) never fires from a badge tap.
					onClick: (e) => {
						e.stopPropagation();
						e.preventDefault();
					}
				},
				dirty ? React.createElement("span", { className: "umexa-pending" }, t("unsaved")) : null,
				props.userOverridden === true ? React.createElement("span", { className: "umexa-badge" }, t("overridden")) : null,
				props.userOverridden === true
					? React.createElement("button", {
						type: "button",
						className: "umexa-reset",
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
				{ className: "umexa-field" },
				field.kind === "boolean"
					? React.createElement(
						"div",
						{ className: "umexa-fhead" },
						control,
						React.createElement("span", { className: "umexa-flabel" }, t(field.labelKey)),
						badges
					)
					: React.createElement(
						React.Fragment,
						null,
						React.createElement(
							"label",
							{ className: "umexa-fhead" },
							React.createElement("span", { className: "umexa-flabel" }, t(field.labelKey)),
							badges
						),
						control
					),
				field.hintKey ? React.createElement("p", { className: "umexa-hint" }, t(field.hintKey)) : null,
				invalid ? React.createElement("p", { className: "umexa-fieldError", role: "alert" }, t(errorKey)) : null
			);
		}

		/** Field metadata rendered by the card, in order. Copy resolves through `t`. */
		const FIELDS = [
			{ name: "enabled", labelKey: "enabled", kind: "boolean", hintKey: "enabledHint" },
			{ name: "allowAnonymous", labelKey: "allowAnonymous", kind: "boolean", hintKey: "allowAnonymousHint" },
			{ name: "apiKeyEnv", labelKey: "apiKeyEnv", hintKey: "apiKeyEnvHint" },
			{ name: "baseURL", labelKey: "baseURL", hintKey: "baseURLHint" },
			{ name: "mcpBaseURL", labelKey: "mcpBaseURL", hintKey: "mcpBaseURLHint" },
			{ name: "numResults", labelKey: "numResults", hintKey: "numResultsHint", kind: "number" },
			{ name: "searchType", labelKey: "searchType", hintKey: "searchTypeHint", options: SEARCH_TYPES.map((v) => ({ value: v, label: v })) }
		];
		/** Factory defaults mirrored from the Host Config schema, for override detection. */
		const FIELD_DEFAULTS = {
			enabled: false,
			allowAnonymous: false,
			apiKeyEnv: "EXA_API_KEY",
			baseURL: "https://api.exa.ai",
			mcpBaseURL: "https://mcp.exa.ai/mcp",
			numResults: 5,
			searchType: "auto"
		};

		/** English copy for the card, registered under the plugin's locale namespace. */
		const en = {
			title: "Exa web search",
			description: "The Exa search provider.",
			expand: "Show settings",
			collapse: "Hide settings",
			enabled: "Enable Exa search",
			enabledHint: "While off, the provider stays registered but unavailable; turning it on takes effect on the next search.",
			allowAnonymous: "Allow anonymous access",
			allowAnonymousHint: "When on, searches go through Exa's public MCP with no key. When off, REST /search with a key is used.",
			apiKeyEnv: "API key reference",
			apiKeyEnvHint: "Credentials-service reference (an environment variable name). The key itself resolves through it and never lands in the settings file.",
			baseURL: "REST endpoint base",
			baseURLHint: "/search is appended. Default https://api.exa.ai",
			mcpBaseURL: "Anonymous MCP base",
			mcpBaseURLHint: "Anonymous search endpoint. Default https://mcp.exa.ai/mcp; point it at a self-hosted proxy if needed.",
			numResults: "Default result count (1–10)",
			numResultsHint: "Result count used when a search carries no explicit one.",
			searchType: "Search type",
			searchTypeHint: "auto / neural / keyword (REST only)",
			invalidNumResults: "Enter an integer from 1 to 10",
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
			title: "Exa 网页搜索",
			description: "Exa 搜索提供方。",
			expand: "展开设置",
			collapse: "收起设置",
			enabled: "启用 Exa 搜索",
			enabledHint: "关闭时提供者保持注册但不可选；开启后下一次搜索即生效。",
			allowAnonymous: "允许匿名访问",
			allowAnonymousHint: "开启后默认走 Exa 公开 MCP（无需密钥）。关闭时用 REST /search 并需密钥。",
			apiKeyEnv: "API 密钥引用名",
			apiKeyEnvHint: "凭据服务引用（环境变量名）。密钥本体经该引用解析，不落设置文档。",
			baseURL: "接口基址 (REST)",
			baseURLHint: "/search 自动拼接。默认 https://api.exa.ai",
			mcpBaseURL: "匿名 MCP 基址",
			mcpBaseURLHint: "匿名搜索端点。默认 https://mcp.exa.ai/mcp；可指向自建代理。",
			numResults: "默认结果数 (1–10)",
			numResultsHint: "搜索未指定条数时的默认值。",
			searchType: "检索类型",
			searchTypeHint: "auto / neural / keyword（仅 REST）",
			invalidNumResults: "请输入 1–10 的整数",
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

		/** The disclosure header, structurally identical to the shipped card header. */
		function CardHeader(props) {
			return React.createElement(
				"button",
				{
					type: "button",
					className: "umexa-header",
					"aria-expanded": props.open,
					"aria-label": (props.open ? props.t("collapse") : props.t("expand")) + ": " + props.t("title"),
					onClick: props.onToggle
				},
				React.createElement(
					"span",
					{ className: "umexa-headText" },
					React.createElement("span", { className: "umexa-name" }, props.t("title")),
					React.createElement("span", { className: "umexa-description" }, props.t("description"))
				),
				props.dirty ? React.createElement("span", { className: "umexa-pending" }, props.t("unsaved")) : null,
				React.createElement(Primitives.IconChevronDownOutline14, {
					className: "umexa-chevron" + (props.open ? " umexa-chevronOpen" : "")
				})
			);
		}

		/**
		 * The Exa provider configuration card, dispatched under key `web-search-exa`.
		 * Owns the whole staged form in one state object so dirtiness, the header
		 * badge, and footer buttons always derive from the same render pass.
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
			const [open, setOpen] = React.useState(false);
			const [staged, setStaged] = React.useState({});
			const [saving, setSaving] = React.useState(false);
			const [failed, setFailed] = React.useState(false);
			const resetKey = ready ? snap.revision : 0;
			// A revision bump means a commit landed (ours or external): re-mirror.
			React.useEffect(() => { setStaged({}); setFailed(false); }, [resetKey]);
			const committedOf = (name) => (value != null ? value[name] : undefined);
			const stagedOf = (name) => (Object.prototype.hasOwnProperty.call(staged, name) ? staged[name] : undefined);
			const changeField = (name, next) => setStaged((prev) => ({ ...prev, [name]: next }));
			const dirtyNames = FIELDS.filter((f) => isDirty(f.name, stagedOf(f.name), committedOf(f.name))).map((f) => f.name);
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
			return React.createElement(
				"li",
				{ className: "umexa-card" + (open ? " umexa-cardOpen" : "") },
				React.createElement(CardHeader, { open, dirty: hasDirty, onToggle: () => setOpen(!open), t }),
				open
					? React.createElement(
						"div",
						{ className: "umexa-body" },
						!writable ? React.createElement("p", { className: "umexa-readOnly", role: "status" }, t("readOnly")) : null,
						FIELDS.map((field) =>
							React.createElement(FieldRow, {
								key: field.name,
								field,
								t,
								committed: committedOf(field.name),
								stagedValue: stagedOf(field.name),
								dirty: isDirty(field.name, stagedOf(field.name), committedOf(field.name)),
								writable,
								userOverridden: overriddenOf(field.name),
								onReset: () => void resetField(field.name),
								onChange: (next) => changeField(field.name, next)
							})
						),
						React.createElement(
							"div",
							{ className: "umexa-footer" },
							React.createElement("span", { className: "umexa-liveHint" }, t("liveHint")),
							failed ? React.createElement("p", { className: "umexa-failed", role: "status" }, t("saveFailed")) : null,
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
						)
					)
					: null
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
