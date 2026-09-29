window.__ModuleLoader__.load({
	id: "um-dsh-websearch",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const { jsx, jsxs } = require("react/jsx-runtime");
		const P = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/constants.js
		/**
		 * Browser half of `um-dsh-websearch`: one `plugins.row.config` card over the
		 * settings namespace the Host loader entry owns, built on the official
		 * `SettingsForm` / `SettingsFormModel` primitives (ADR-0006 D3).
		 *
		 * The Host half owns the schema. Its volatile surface is `enabled`,
		 * `defaultProvider`, `concurrency`, `cache`, and the whole `providers` array;
		 * array elements can never be volatile, so the provider list is written as
		 * ONE `providers` path op. The shared form model stages section scalars
		 * through field specs and everything else through write-only controls, and a
		 * save is the single point where a draft becomes a document mutation.
		 * @module um-dsh-websearch/client
		 */
		/** Settings namespace = the Host loader entry id the bundle patch inserts. */
		const SETTINGS_NS = "um-web-search";
		/** Dictionary namespace owned by this plugin (NOT the settings namespace). */
		const NS = "um-dsh-websearch";
		/** Slot a bundle's own row configuration registers into. */
		const SLOT = "plugins.row.config";
		/** `<package name>#<row id>`: the key `ui-plugin-manager` dispatches this row with. */
		const ROW_KEY = "um-dsh-websearch#um-web-search";
		/** Registration order hint for the slot ledger. */
		const ORDER = 60;
		/** Defaults the Host schema resolves these fields to. */
		const DEFAULT_NUM_RESULTS = 5;
		const DEFAULT_CACHE_TTL_SECONDS = 60;
		/** Credential-reference grammar the credentials domain accepts. */
		const KEY_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
		/**
		 * The fields this card stages. `defaultProvider` and `concurrency` are section
		 * scalars (field specs); the rest are write-only controls whose value is not a
		 * scalar path the form model can address.
		 */
		const F = Object.freeze({
			defaultProvider: "defaultProvider",
			concurrency: "concurrency",
			enabled: "enabled",
			cache: "cache",
			providers: "providers",
			keys: "keys"
		});
		/** Credential references the built-in providers suggest for a new key row. */
		const KEY_REF_BASE = Object.freeze({
			exa: "UM_WS_EXA_API_KEY",
			parallel: "UM_WS_PARALLEL_API_KEY",
			deepseek: "UM_WS_DEEPSEEK_API_KEY"
		});
		//#endregion
		//#region lib/types/client/layout.js
		/**
		 * Structural layout only: flex geometry plus the one tertiary-label theme
		 * token the primitives' own hint text uses. Every colour, border, radius, and
		 * type scale belongs to the primitives.
		 */
		const ROW = { display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" };
		const STACK = { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 };
		const GROW = { flex: "1 1 auto", minWidth: 0 };
		const HINT = { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: "18px" };
		const HEADING = { fontWeight: 600 };
		//#endregion
		//#region lib/types/client/locales.js
		/**
		 * Bilingual copy as `[english, simplified chinese]` per key. One table keeps
		 * the two dictionaries from drifting apart, and the two objects it builds are
		 * what `ctx.locale.register` receives.
		 */
		const COPY = {
			title: ["UM web search", "UM 网页搜索"],
			description: ["Unofficial multi-provider web search: Exa, Parallel, and DeepSeek Official behind one provider.", "非官方多源网页搜索：Exa、Parallel 与 DeepSeek 官方统一在一个提供方之后。"],
			summaryAllOff: ["Web search: every provider is off.", "网页搜索：所有数据源均已停用。"],
			summaryOrder: ["Web search: {order} · concurrency {n}", "网页搜索：{order} · 并发 {n}"],
			enabled: ["Enable web search", "启用网页搜索"],
			enabledHint: ["Master switch. Off keeps the providers configured but search unavailable.", "总开关：关闭后数据源保持配置但搜索不可用。"],
			defaultProvider: ["Default provider", "默认数据源"],
			defaultProviderHint: ["Provider id served first. Leave blank to use the composition default.", "优先服务的数据源 id；留空则使用组合层默认值。"],
			concurrency: ["Concurrency", "并发数"],
			concurrencyHint: ["1 = sequential fallback chain; above 1 fans one search out across every enabled source (1–8).", "1 = 顺序回退链；大于 1 时把一次搜索并发分发到所有启用源（1–8）。"],
			cacheEnabled: ["Result cache", "结果缓存"],
			cacheEnabledHint: ["Serve repeat queries from the in-memory cache.", "重复查询直接命中内存缓存。"],
			cacheTtlSeconds: ["Cache TTL (seconds)", "缓存 TTL（秒）"],
			cacheTtlSecondsHint: ["How long one cached result stays fresh (1–86400).", "一条缓存结果的保鲜时长（1–86400）。"],
			providersHeading: ["Providers", "数据源"],
			providersHint: ["Array order is the fallback order after the default provider.", "数组顺序即默认数据源之后的回退顺序。"],
			providerId: ["Provider id", "数据源 id"],
			configure: ["Configure…", "详细配置…"],
			moveUp: ["Move up", "上移"],
			moveDown: ["Move down", "下移"],
			rolePrimary: ["Default", "默认"],
			roleFallback: ["Fallback", "备用"],
			roleOff: ["Off", "停用"],
			warnAllDisabled: ["Every provider is off, so search is unavailable.", "所有数据源均已停用，搜索不可用。"],
			warnDefaultDisabled: ["The default provider is off; the first enabled provider serves.", "默认数据源已停用，由首个启用数据源服务。"],
			detailsTitle: ["Provider details", "数据源详细配置"],
			detailsDescription: ["Tiers, keys, endpoints, and parameters for one provider.", "单个数据源的档位、密钥、端点与参数。"],
			primaryTier: ["Primary tier", "首选档位"],
			primaryTierHint: ["The tier tried first; the other one serves as the switch-gated fallback.", "先尝试的档位；另一档位作为开关门控的回退。"],
			tierPaid: ["Paid (REST)", "付费（REST）"],
			tierFree: ["Free (anonymous)", "免费（匿名）"],
			paidEnabled: ["Paid REST tier", "付费 REST 档位"],
			paidEnabledHint: ["Serve searches through the REST endpoint with a key.", "经 REST 端点 + 密钥提供搜索。"],
			paidBaseURL: ["Paid REST base URL", "付费 REST 基址"],
			paidBaseURLHint: ["The provider's API endpoint; the search path is appended.", "数据源的 API 端点；自动拼接搜索路径。"],
			freeEnabled: ["Free anonymous tier", "免费匿名档位"],
			freeEnabledHint: ["Serve searches through the public MCP endpoint, no key needed.", "经公共 MCP 端点提供搜索，无需密钥。"],
			freeBaseURL: ["Free MCP base URL", "免费 MCP 基址"],
			freeBaseURLHint: ["The provider's public MCP endpoint; point at a proxy if needed.", "数据源的公共 MCP 端点；可指向自建代理。"],
			keysStrategy: ["Key strategy", "多密钥策略"],
			keysStrategyHint: ["ordered = array order; random = shuffled once per search.", "ordered = 数组序；random = 每次搜索洗牌一次。"],
			strategyOrdered: ["Ordered", "按顺序"],
			strategyRandom: ["Random", "随机"],
			numResults: ["Default result count", "默认结果数"],
			numResultsHint: ["Used when a search carries no explicit count (1–20).", "搜索未指定条数时的默认值（1–20）。"],
			paramsHeading: ["Provider parameters", "数据源参数"],
			paramsHint: ["Provider-specific options, stored as the Host receives them.", "数据源专属选项，按宿主收到的原样存储。"],
			keysHeading: ["API keys", "API 密钥"],
			keysHint: ["Key values are written to the DSH credential store under the generated reference — never into settings.", "密钥值经官方 DSH 凭据库写入（引用名自动生成），不落设置文件。"],
			keyValue: ["API key value", "API 密钥值"],
			keyValueHint: ["Leave blank to keep the stored key.", "留空表示保持当前已存密钥。"],
			keyConfigured: ["Configured", "已配置"],
			keyUnconfigured: ["Not configured", "未配置"],
			keyEnabled: ["Key enabled", "启用该密钥"],
			allowFreeToPaid: ["Free → paid fallback", "免费 → 付费回退"],
			allowPaidToFree: ["Paid → free fallback", "付费 → 免费回退"],
			addKey: ["Add key", "添加密钥"],
			removeKey: ["Remove", "移除"],
			close: ["Close", "关闭"],
			overridden: ["Overridden", "已覆盖"],
			reset: ["Reset to default", "恢复默认"],
			invalidNumber: ["Enter a number, or leave blank to use the default.", "请填数字；留空表示使用默认值。"],
			readOnly: ["This deployment stores settings read-only.", "本部署的设置为只读。"],
			unavailable: ["This plugin is not loaded, so it cannot be configured right now.", "该插件当前未加载，暂时无法配置。"],
			save: ["Save", "保存"],
			saving: ["Saving…", "保存中…"],
			saveFailed: ["The deployment did not accept these values; they were left for you to correct.", "本部署没有接受这些值，已保留供你修改。"]
		};
		const en = {};
		const zh = {};
		for (const [key, [english, chinese]] of Object.entries(COPY)) {
			en[key] = english;
			zh[key] = chinese;
		}
		//#endregion
		//#region lib/types/client/drafts.js
		/**
		 * Conversions between a write-only control's draft text and the value a save
		 * writes. A write-only control has no section path to seed from, so its draft
		 * is a JSON encoding of the value the card would store; a blank draft means
		 * "nothing staged", which is also what makes the form clean again.
		 */
		/** Parse draft text, tolerating anything a control could have staged. */
		function tryParse(text) {
			try {
				return JSON.parse(text);
			} catch {
				return undefined;
			}
		}
		/** Read a write-only control's staged value, falling back to the Host's. */
		function readStaged(text, fallback) {
			if (typeof text !== "string" || text.trim() === "") return fallback;
			const parsed = tryParse(text);
			return parsed === undefined ? fallback : parsed;
		}
		/** Round a draft into a whole number the Host schema accepts. */
		function clampInt(raw, min, max, fallback) {
			const value = Math.round(Number(raw));
			return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
		}
		/** Every non-empty credential reference the provider list names. */
		function keyRefsOf(providers) {
			return (Array.isArray(providers) ? providers : []).flatMap((provider) =>
				(Array.isArray(provider?.keys) ? provider.keys : []).map((key) => String(key?.ref ?? "")).filter((ref) => ref.length > 0)
			);
		}
		/** The provider's display name: the Host's own name, falling back to its id. */
		function displayName(provider) {
			const name = provider?.name;
			return typeof name === "string" && name.length > 0 ? name : String(provider?.id ?? "");
		}
		/** The reference base a provider suggests for its next key row. */
		function keyRefBase(provider) {
			const id = String(provider?.id ?? "");
			return KEY_REF_BASE[id] ?? `UM_WS_${id.toUpperCase().replace(/[^A-Z0-9]+/gu, "_")}_API_KEY`;
		}
		/**
		 * The next auto-generated credential reference: the provider's base name, or
		 * `<base>_<n>` with the smallest free suffix. References are generated once
		 * when a key row is added and are never hand-edited, so they stay stable.
		 */
		function nextKeyRef(base, keys) {
			const taken = new Set((Array.isArray(keys) ? keys : []).map((key) => String(key?.ref ?? "")));
			if (!taken.has(base)) return base;
			let suffix = taken.size;
			while (taken.has(`${base}_${suffix}`)) suffix += 1;
			return `${base}_${suffix}`;
		}
		/**
		 * Normalize a provider list into the shape the editor renders. Number drafts
		 * ride through verbatim so a half-typed value is echoed back; the write path
		 * is what coerces them.
		 */
		function cloneProviders(list) {
			return (Array.isArray(list) ? list : []).map((provider) => ({
				id: String(provider?.id ?? ""),
				name: String(provider?.name ?? ""),
				enabled: provider?.enabled !== false,
				primaryTier: provider?.primaryTier === "free" ? "free" : "paid",
				paid: { enabled: provider?.paid?.enabled === true, baseURL: String(provider?.paid?.baseURL ?? "") },
				free: { enabled: provider?.free?.enabled === true, baseURL: String(provider?.free?.baseURL ?? "") },
				keys: (Array.isArray(provider?.keys) ? provider.keys : []).map((key) => ({
					ref: String(key?.ref ?? ""),
					enabled: key?.enabled !== false,
					allowFreeToPaid: key?.allowFreeToPaid === true,
					allowPaidToFree: key?.allowPaidToFree === true
				})),
				keysStrategy: provider?.keysStrategy === "random" ? "random" : "ordered",
				numResults: provider?.numResults !== undefined ? provider.numResults : DEFAULT_NUM_RESULTS,
				params: provider?.params != null && typeof provider.params === "object" ? { ...provider.params } : {}
			}));
		}
		/**
		 * Coerce the staged provider list into the array one `providers` path op
		 * stores. `params` passes through untouched: the Host schema declares it as a
		 * free dictionary and its runtime guards own those values.
		 */
		function serializeProviders(list) {
			return cloneProviders(list).map((provider) => ({
				...provider,
				paid: { ...provider.paid, baseURL: provider.paid.baseURL.trim() },
				free: { ...provider.free, baseURL: provider.free.baseURL.trim() },
				numResults: clampInt(provider.numResults, 1, 20, DEFAULT_NUM_RESULTS)
			}));
		}
		/** Coerce the staged cache draft into the object one `cache` path op stores. */
		function serializeCache(cache) {
			return { enabled: cache?.enabled === true, ttlSeconds: clampInt(cache?.ttlSeconds, 1, 86400, DEFAULT_CACHE_TTL_SECONDS) };
		}
		/** The non-blank credential drafts in one `keys` draft, keyed by reference. */
		function keyDraftsOf(text) {
			return Object.fromEntries(Object.entries(readStaged(text, {})).filter(([, value]) => typeof value === "string" && value.trim() !== ""));
		}
		/** Encode a credential-draft map as staged text; empty means "nothing staged". */
		function keyDraftsText(drafts) {
			return Object.keys(drafts).length === 0 ? "" : JSON.stringify(drafts);
		}
		//#endregion
		//#region lib/types/client/controller.js
		/**
		 * Bridges the `um-web-search` settings form and the credentials domain onto
		 * the card.
		 *
		 * Section scalars stage through the shared form model's field specs. The
		 * provider list and the cache are whole volatile values the model cannot
		 * address as scalars, so they ride write-only controls whose draft is the JSON
		 * of the value a save would write; credential literals ride one more
		 * write-only control holding every non-blank key draft, and are written
		 * through `remote.credentials` rather than the settings document.
		 */
		var UmWebSearchCardController = class {
			scope;
			ctx;
			form;
			store;
			/** Whether each watched reference currently holds a value. */
			credentials = {};
			/** The reference set the credential answers describe; guards re-reads. */
			refFingerprint = "";
			/** Bumped per read so a superseded answer never overwrites a newer one. */
			credentialGeneration = 0;
			/**
			 * @param scope - the shared configuration form for the entry the Host serves.
			 * @param ctx - the page plugin's context, whose `remote.credentials` namespace
			 * answers for the references the provider list names.
			 */
			constructor(scope, ctx) {
				this.scope = scope;
				this.ctx = ctx;
				this.form = new P.SettingsFormModel(
					scope,
					[P.settingsTextField(F.defaultProvider), P.settingsNumberField(F.concurrency)],
					[
						{ field: F.enabled, write: (text) => this.writeSection(F.enabled, text === "true") },
						{ field: F.cache, write: (text) => this.writeStructured(F.cache, text, serializeCache) },
						{ field: F.providers, write: (text) => this.writeStructured(F.providers, text, serializeProviders) },
						{ field: F.keys, write: (text) => this.writeCredentials(readStaged(text, {})) }
					]
				);
				this.store = this.form.bind(() => this.projection());
			}
			/**
			 * Build the state the card renders. The provider list is read from the
			 * staged draft when one stands, so the credential watch follows what the
			 * user is about to save rather than only what the Host already holds.
			 */
			projection() {
				const committed = this.scope.getSnapshot().value;
				const providers = cloneProviders(this.effectiveProviders());
				this.watch(keyRefsOf(providers));
				return {
					...this.form.shell(),
					enabled: readStaged(this.form.field(F.enabled).text, committed?.enabled) === true,
					defaultProvider: this.form.field(F.defaultProvider),
					concurrency: this.form.field(F.concurrency),
					cache: readStaged(this.form.field(F.cache).text, committed?.cache) ?? { enabled: false, ttlSeconds: DEFAULT_CACHE_TTL_SECONDS },
					providers,
					keys: readStaged(this.form.field(F.keys).text, {}),
					keysText: this.form.field(F.keys).text,
					credentials: this.credentials
				};
			}
			/**
			 * Build the face the row's slot registration injects: the snapshot hook and
			 * the form actions.
			 */
			inject() {
				return { hooks: { umWebSearchCard: this.store }, ...this.form.actions() };
			}
			/** The provider list the card is showing: the staged draft, else the Host's. */
			effectiveProviders() {
				const staged = this.form.field(F.providers).text;
				const parsed = staged.trim() === "" ? undefined : tryParse(staged);
				const list = parsed !== undefined ? parsed : this.scope.getSnapshot().value?.providers;
				return Array.isArray(list) ? list : [];
			}
			/** Every reference the credential watch currently follows. */
			watchedRefs() {
				return keyRefsOf(this.effectiveProviders());
			}
			/**
			 * Write one whole volatile field as a single path op.
			 * @returns whether the Host accepted the write.
			 */
			writeSection(field, value) {
				return this.scope.mutate([{ op: "set", path: [field], value }], this.scope.getSnapshot().revision);
			}
			/**
			 * Write one structured write-only control (the provider list, the cache).
			 *
			 * The settings model has no parse spec for a write-only control, so it
			 * cannot tell a corrupt draft from a good one and would hand the raw text
			 * over for coercion — writing an empty list and silently dropping the
			 * user's whole configuration. The card stages only `JSON.stringify` of a
			 * value it holds, so unparseable text means corruption: refuse it, which
			 * the form reports as a failed save and keeps the draft for correction.
			 * @returns whether the Host accepted the write.
			 */
			writeStructured(field, text, serialize) {
				const parsed = tryParse(text);
				if (parsed === undefined) return false;
				return this.writeSection(field, serialize(parsed));
			}
			/**
			 * Write every staged credential literal, then re-read the badges.
			 *
			 * A blank draft never reaches here: the form model drops blank write-only
			 * drafts from its plan, which is what keeps the stored key. A reference the
			 * credentials domain would refuse is reported as an unaccepted save rather
			 * than silently skipped.
			 * @returns whether every write crossed the wire.
			 */
			async writeCredentials(drafts) {
				let accepted = true;
				for (const [ref, value] of Object.entries(drafts)) {
					const literal = typeof value === "string" ? value.trim() : "";
					if (literal === "") continue;
					if (!KEY_REF_PATTERN.test(ref)) {
						accepted = false;
						continue;
					}
					try {
						await this.ctx.remote.credentials.set(ref, literal);
					} catch {
						accepted = false;
					}
				}
				await this.readCredentials(this.watchedRefs());
				return accepted;
			}
			/**
			 * Follow one reference set: a change of set clears the stale answers and
			 * asks the credentials domain about the new one.
			 */
			watch(refs) {
				const fingerprint = [...refs].sort().join("|");
				if (fingerprint === this.refFingerprint) return;
				this.refFingerprint = fingerprint;
				this.credentials = {};
				void this.readCredentials(refs);
			}
			/**
			 * Ask the credentials domain which references hold a value.
			 *
			 * A key can be written from somewhere else, and the settings section does
			 * not change when it is, so the answers are published only while they still
			 * describe the reference set in force.
			 */
			async readCredentials(refs) {
				if (refs.length === 0) {
					this.credentials = {};
					return;
				}
				const generation = ++this.credentialGeneration;
				let views;
				try {
					const response = await this.ctx.remote.credentials.describe(refs);
					if (response?.ok === true) views = response.value;
				} catch {
					views = undefined;
				}
				if (generation !== this.credentialGeneration) return;
				const next = {};
				for (const ref of refs) next[ref] = { configured: views?.[ref]?.configured === true, writable: views?.[ref]?.writable !== false };
				this.credentials = next;
				this.store?.set(this.projection());
			}
			/** Re-read after the Host reports a change to a reference this card watches. */
			refreshCredential(ref) {
				const refs = this.watchedRefs();
				if (!refs.includes(ref)) return;
				void this.readCredentials(refs);
			}
			/** Release the form's accepted-value subscription. */
			dispose() {
				this.form.dispose();
			}
		};
		//#endregion
		//#region lib/types/client/controls.js
		/**
		 * One labelled control row: the label and its hint on the left, the control on
		 * the right, optional extra content underneath.
		 */
		function ControlRow(props) {
			return jsxs("div", {
				style: STACK,
				children: [
					jsxs("div", {
						style: ROW,
						children: [
							jsxs("div", {
								style: GROW,
								children: [jsx("div", { children: props.label }), props.hint === undefined ? null : jsx("div", { style: HINT, children: props.hint })]
							}),
							props.control ?? null
						]
					}),
					props.children ?? null
				]
			});
		}
		/**
		 * A labelled text control for a draft the card owns rather than the section.
		 * The shared value field is fully controlled, so a sub-field of the provider
		 * list renders through it with `overridden`/`invalid` false: no section entry
		 * stands behind that draft, so there is nothing to reset or reject.
		 */
		function DraftField(props) {
			return jsx(P.SettingsValueField, {
				id: props.id,
				label: props.label,
				hint: props.hint,
				text: props.text,
				numeric: props.numeric === true,
				disabled: props.disabled,
				overridden: false,
				invalid: false,
				invalidLabel: props.t("invalidNumber"),
				onEdit: props.onEdit
			});
		}
		/** A section heading with its one-line explanation and its content. */
		function Section(props) {
			return jsxs("div", {
				style: STACK,
				children: [jsx("div", { style: HEADING, children: props.title }), props.hint === undefined ? null : jsx("div", { style: HINT, children: props.hint }), props.children]
			});
		}
		/**
		 * One key row: the generated reference, its configured badge, and — while open
		 * — the write-only credential control and the two fallback switches.
		 */
		function KeyRow(props) {
			const { t, entry, provider, draft, credential, disabled, open, onToggle, onDraft, onPatch, onRemove } = props;
			const configured = credential?.configured === true;
			const stateLabel = configured ? t("keyConfigured") : t("keyUnconfigured");
			const switchRow = (label, checked, onChange) =>
				jsx(ControlRow, { label, control: jsx(P.Switch, { checked, disabled, label, onChange }) });
			return jsx(P.DisclosureRow, {
				icon: jsx(P.IconApiOutlineRegular, {}),
				title: entry.ref,
				open,
				expandable: true,
				expandOnRowClick: true,
				onToggle,
				collapsedContent: jsx(P.Tag, { tone: configured ? "success" : "quiet", children: stateLabel }),
				children: jsxs("div", {
					style: STACK,
					children: [
						jsx(P.SettingsSecretField, {
							id: `um-ws-key-${provider.id}-${entry.ref}`,
							label: t("keyValue"),
							hint: t("keyValueHint"),
							text: draft,
							configured,
							stateLabel,
							disabled: disabled || credential?.writable === false,
							onEdit: onDraft
						}),
						switchRow(t("keyEnabled"), entry.enabled, (next) => onPatch({ enabled: next })),
						switchRow(t("allowFreeToPaid"), entry.allowFreeToPaid, (next) => onPatch({ allowFreeToPaid: next })),
						switchRow(t("allowPaidToFree"), entry.allowPaidToFree, (next) => onPatch({ allowPaidToFree: next })),
						jsx("div", {
							style: ROW,
							children: jsx(P.Button, { variant: "ghost", size: "sm", icon: jsx(P.IconTrashOutlineRegular, {}), disabled, onClick: onRemove, children: t("removeKey") })
						})
					]
				})
			});
		}
		/**
		 * One provider's detail editor: tiers, endpoints, key strategy, result count,
		 * provider parameters, and the key list. Every control stages; nothing here
		 * writes.
		 */
		function ProviderDetails(props) {
			const { t, provider, disabled, keyDrafts, credentials, openKey, onToggleKey, onChange, onKeyDraft, onKeyAdd } = props;
			const patchKey = (ref, patch) => onChange({ keys: provider.keys.map((entry) => (entry.ref === ref ? { ...entry, ...patch } : entry)) });
			const toggleRow = (label, hint, checked, patch) =>
				jsx(ControlRow, {
					label,
					hint,
					control: jsx(P.Switch, { checked, disabled, label, onChange: (next) => onChange(patch(next)) })
				});
			const segmentRow = (id, label, hint, value, options, patch) =>
				jsx(ControlRow, {
					label,
					hint,
					control: jsx(P.SegmentedControl, { id, value, options, onChange: (next) => onChange(patch(next)), label, disabled })
				});
			return jsxs("div", {
				style: STACK,
				children: [
					jsx(ControlRow, { label: t("providerId"), hint: provider.id, control: jsx(P.Tag, { tone: "quiet", children: displayName(provider) }) }),
					segmentRow("um-ws-primary-tier", t("primaryTier"), t("primaryTierHint"), provider.primaryTier, [
						{ value: "paid", label: t("tierPaid") },
						{ value: "free", label: t("tierFree") }
					], (tier) => ({
						primaryTier: tier,
						...(tier === "paid" ? { paid: { ...provider.paid, enabled: true } } : { free: { ...provider.free, enabled: true } })
					})),
					toggleRow(t("paidEnabled"), t("paidEnabledHint"), provider.paid.enabled, (next) => ({ paid: { ...provider.paid, enabled: next } })),
					jsx(DraftField, {
						t,
						id: `um-ws-paid-url-${provider.id}`,
						label: t("paidBaseURL"),
						hint: t("paidBaseURLHint"),
						text: provider.paid.baseURL,
						disabled,
						onEdit: (text) => onChange({ paid: { ...provider.paid, baseURL: text } })
					}),
					toggleRow(t("freeEnabled"), t("freeEnabledHint"), provider.free.enabled, (next) => ({ free: { ...provider.free, enabled: next } })),
					jsx(DraftField, {
						t,
						id: `um-ws-free-url-${provider.id}`,
						label: t("freeBaseURL"),
						hint: t("freeBaseURLHint"),
						text: provider.free.baseURL,
						disabled,
						onEdit: (text) => onChange({ free: { ...provider.free, baseURL: text } })
					}),
					segmentRow("um-ws-keys-strategy", t("keysStrategy"), t("keysStrategyHint"), provider.keysStrategy, [
						{ value: "ordered", label: t("strategyOrdered") },
						{ value: "random", label: t("strategyRandom") }
					], (strategy) => ({ keysStrategy: strategy })),
					jsx(DraftField, {
						t,
						id: `um-ws-num-results-${provider.id}`,
						label: t("numResults"),
						hint: t("numResultsHint"),
						text: String(provider.numResults ?? ""),
						numeric: true,
						disabled,
						onEdit: (text) => onChange({ numResults: text })
					}),
					jsx(Section, {
						title: t("paramsHeading"),
						hint: t("paramsHint"),
						children: Object.entries(provider.params).map(([name, value]) =>
							jsx(DraftField, {
								key: name,
								t,
								id: `um-ws-param-${provider.id}-${name}`,
								label: name,
								text: value === undefined || value === null ? "" : String(value),
								disabled,
								onEdit: (text) =>
									onChange({
										params: { ...provider.params, [name]: typeof value === "number" && text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text }
									})
							})
						)
					}),
					jsx(Section, {
						title: t("keysHeading"),
						hint: t("keysHint"),
						children: jsxs("div", {
							style: STACK,
							children: [
								...provider.keys.map((entry) =>
									jsx(
										KeyRow,
										{
											t,
											entry,
											provider,
											draft: keyDrafts[entry.ref] ?? "",
											credential: credentials[entry.ref],
											disabled,
											open: openKey === entry.ref,
											onToggle: () => onToggleKey(openKey === entry.ref ? null : entry.ref),
											onDraft: (text) => onKeyDraft(entry.ref, text),
											onPatch: (patch) => patchKey(entry.ref, patch),
											onRemove: () => onChange({ keys: provider.keys.filter((key) => key.ref !== entry.ref) })
										},
										entry.ref
									)
								),
								jsx("div", {
									style: ROW,
									children: jsx(P.Button, { variant: "outline", size: "sm", icon: jsx(P.IconPlusOutlineRegular, {}), disabled, onClick: () => onKeyAdd(provider), children: t("addKey") })
								})
							]
						})
					})
				]
			});
		}
		/**
		 * One provider row: its name, the role it currently plays, its position in the
		 * fallback order, its enable switch, and the way into its details.
		 */
		function ProviderRow(props) {
			const { t, provider, index, count, disabled, isDefault, onToggle, onMove, onConfigure } = props;
			const on = provider.enabled !== false;
			const orderButton = (label, direction, delta, enabled) =>
				jsx(P.Button, {
					variant: "ghost",
					size: "sm",
					icon: jsx(direction, {}),
					disabled: disabled || !enabled,
					onClick: () => onMove(delta),
					"aria-label": label,
					title: label
				});
			return jsxs("div", {
				style: ROW,
				children: [
					jsx("span", { style: GROW, children: displayName(provider) }),
					jsx(P.Tag, { tone: on ? (isDefault ? "info" : "neutral") : "quiet", children: t(on ? (isDefault ? "rolePrimary" : "roleFallback") : "roleOff") }),
					orderButton(t("moveUp"), P.IconChevronUpOutlineRegular, -1, index > 0),
					orderButton(t("moveDown"), P.IconChevronDownOutlineRegular, 1, index < count - 1),
					jsx(P.Button, { variant: "outline", size: "sm", disabled, onClick: onConfigure, children: t("configure") }),
					jsx(P.Switch, { checked: on, disabled, label: displayName(provider), onChange: onToggle })
				]
			});
		}
		//#endregion
		//#region lib/types/client/UmWebSearchCard.js
		/** The row's one-liner, which the Plugins page renders as the row description. */
		function summaryText(state, t) {
			const served = state.providers.filter((provider) => provider.enabled !== false);
			if (!state.enabled || served.length === 0) return t("summaryAllOff");
			return t("summaryOrder", { order: served.map(displayName).join(" → "), n: state.concurrency.text });
		}
		/**
		 * Render the row's one-liner or its settings form, as the Plugins page asks.
		 *
		 * The provider list is the one volatile value that is not a scalar, so the
		 * card stages it whole: every provider edit re-encodes the list into the
		 * `providers` write-only control, and the credential drafts are pruned to the
		 * references the list still names.
		 * @param props - the view asked for, locale copy, the card's state, and its actions.
		 * @returns the one-liner, or the form.
		 */
		function UmWebSearchCard(props) {
			const { t } = props;
			const state = props.useUmWebSearchCard((snapshot) => snapshot);
			const [editing, setEditing] = React.useState(null);
			const [openKey, setOpenKey] = React.useState(null);
			if (props.view === "summary") return summaryText(state, t);
			const disabled = !state.writable;
			const providers = state.providers;
			const active = providers.find((provider) => provider.id === editing) ?? providers[0] ?? null;
			// The staged credential drafts live in the write-only `keys` control's
			// raw TEXT (`keysText`): `keys` is the parsed map, which cannot round-trip
			// a draft that is still being typed.
			const keyDrafts = keyDraftsOf(state.keysText);
			const closeDetails = () => {
				setEditing(null);
				setOpenKey(null);
			};
			const stageProviders = (next) => {
				props.edit(F.providers, JSON.stringify(next));
				const live = new Set(keyRefsOf(next));
				const kept = Object.fromEntries(Object.entries(keyDrafts).filter(([ref]) => live.has(ref)));
				if (Object.keys(kept).length !== Object.keys(keyDrafts).length) props.edit(F.keys, keyDraftsText(kept));
			};
			const patchProvider = (id, patch) => stageProviders(providers.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider)));
			const moveProvider = (index, direction) => {
				const target = index + direction;
				if (target < 0 || target >= providers.length) return;
				const next = [...providers];
				[next[index], next[target]] = [next[target], next[index]];
				stageProviders(next);
			};
			const setKeyDraft = (ref, text) => {
				const next = { ...keyDrafts };
				if (text.trim() === "") delete next[ref];
				else next[ref] = text;
				props.edit(F.keys, keyDraftsText(next));
			};
			const addKey = (provider) => {
				const ref = nextKeyRef(keyRefBase(provider), provider.keys);
				patchProvider(provider.id, { keys: [...provider.keys, { ref, enabled: true, allowFreeToPaid: false, allowPaidToFree: false }] });
				setOpenKey(ref);
			};
			const served = providers.filter((provider) => provider.enabled !== false);
			const warning =
				served.length === 0
					? "warnAllDisabled"
					: providers.find((provider) => provider.id === state.defaultProvider.text)?.enabled === false
						? "warnDefaultDisabled"
						: undefined;
			const sectionField = (id, field, labelKey, hintKey, numeric) =>
				jsx(P.SettingsValueField, {
					id,
					label: t(labelKey),
					hint: t(hintKey),
					overriddenLabel: t("overridden"),
					resetLabel: t("reset"),
					invalidLabel: t("invalidNumber"),
					numeric: numeric === true,
					disabled,
					...state[field],
					onEdit: (text) => props.edit(F[field], text),
					onReset: () => props.resetField(F[field])
				});
			return jsxs(P.SettingsForm, {
				labels: {
					unavailable: t("unavailable"),
					readOnly: t("readOnly"),
					saveFailed: t("saveFailed"),
					save: t("save"),
					saving: t("saving")
				},
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					jsx(ControlRow, {
						key: "enabled",
						label: t("enabled"),
						hint: t("enabledHint"),
						control: jsx(P.Switch, { checked: state.enabled, disabled, label: t("enabled"), onChange: (next) => props.edit(F.enabled, next ? "true" : "false") })
					}),
					sectionField("um-ws-default-provider", "defaultProvider", "defaultProvider", "defaultProviderHint"),
					sectionField("um-ws-concurrency", "concurrency", "concurrency", "concurrencyHint", true),
					jsx(ControlRow, {
						key: "cacheEnabled",
						label: t("cacheEnabled"),
						hint: t("cacheEnabledHint"),
						control: jsx(P.Switch, {
							checked: state.cache.enabled === true,
							disabled,
							label: t("cacheEnabled"),
							onChange: (next) => props.edit(F.cache, JSON.stringify({ ...state.cache, enabled: next }))
						})
					}),
					jsx(DraftField, {
						key: "cacheTtlSeconds",
						t,
						id: "um-ws-cache-ttl",
						label: t("cacheTtlSeconds"),
						hint: t("cacheTtlSecondsHint"),
						text: String(state.cache.ttlSeconds ?? ""),
						numeric: true,
						disabled,
						onEdit: (text) => props.edit(F.cache, JSON.stringify({ ...state.cache, ttlSeconds: text }))
					}),
					jsx(Section, {
						key: "providers",
						title: t("providersHeading"),
						hint: t("providersHint"),
						children: jsxs("div", {
							style: STACK,
							children: [
								...providers.map((provider, index) =>
									jsx(
										ProviderRow,
										{
											t,
											provider,
											index,
											count: providers.length,
											disabled,
											isDefault: provider.id === state.defaultProvider.text,
											onToggle: (next) => patchProvider(provider.id, { enabled: next }),
											onMove: (direction) => moveProvider(index, direction),
											onConfigure: () => {
												setEditing(provider.id);
												setOpenKey(null);
											}
										},
										provider.id === "" ? String(index) : provider.id
									)
								),
								warning === undefined ? null : jsx(P.Tag, { tone: "warning", children: t(warning) })
							]
						})
					}),
					jsx(P.Modal, {
						key: "details",
						open: editing !== null && active !== null,
						onClose: closeDetails,
						title: t("detailsTitle"),
						description: t("detailsDescription"),
						closeLabel: t("close"),
						footer: jsx(P.Button, { variant: "outline", size: "sm", onClick: closeDetails, children: t("close") }),
						children:
							editing === null || active === null
								? null
								: jsxs("div", {
										style: STACK,
										children: [
											providers.length > 1
												? jsx(P.SegmentedControl, {
														id: "um-ws-provider-picker",
														value: active.id,
														options: providers.map((provider) => ({ value: provider.id, label: displayName(provider) })),
														onChange: (id) => {
															setEditing(id);
															setOpenKey(null);
														},
														label: t("providersHeading"),
														disabled
													})
												: null,
											jsx(ProviderDetails, {
												t,
												provider: active,
												disabled,
												keyDrafts,
												credentials: state.credentials,
												openKey,
												onToggleKey: setOpenKey,
												onChange: (patch) => patchProvider(active.id, patch),
												onKeyDraft: setKeyDraft,
												onKeyAdd: addKey
											})
										]
									})
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Required services (cordis fiber inject). */
		const inject = ["slots", "locale", "configForms", "remote", "remote.credentials"];
		/**
		 * Mount the row's configuration card while the Host serves its namespace, so a
		 * deployment that never composed this plugin shows no trace of it.
		 * @param ctx - the browser plugin context.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "um-dsh-websearch: dictionaries");
			const card = new UmWebSearchCardController(ctx.configForms.get(SETTINGS_NS), ctx);
			ctx.effect(() => () => {
				card.dispose();
			}, "um-dsh-websearch: form subscription");
			ctx.effect(() => ctx.remote.$on("credentials/reference-updated", (ref) => {
				card.refreshCredential(ref);
			}), "um-dsh-websearch: credential invalidations");
			ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NS], () => ctx.slots.inject(SLOT, () => ctx.slots.register({
				name: SLOT,
				key: ROW_KEY,
				order: ORDER,
				label: () => t("title"),
				locale: NS,
				inject: () => card.inject()
			}, UmWebSearchCard))), "um-dsh-websearch: page");
		}
		//#endregion
		exports.SETTINGS_NS = SETTINGS_NS;
		exports.NS = NS;
		exports.SLOT = SLOT;
		exports.ROW_KEY = ROW_KEY;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
