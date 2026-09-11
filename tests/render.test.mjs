import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- Minimal React stub: enough surface for one real component call per frame. ----
let frame = null;
function beginFrame(seedStates) {
	frame = { states: seedStates ?? [], effects: [], idx: 0 };
}
const React = {
	Fragment: Symbol.for("react.fragment"),
	createElement(type, props, ...kids) {
		return { type, props: props ?? {}, children: kids.flat(9).filter((c) => c !== null && c !== false && c !== undefined) };
	},
	useState(init) {
		const i = frame.idx++;
		if (!(i in frame.states)) frame.states[i] = typeof init === "function" ? init() : init;
		const set = (v) => {
			frame.states[i] = typeof v === "function" ? v(frame.states[i]) : v;
		};
		return [frame.states[i], set];
	},
	useEffect(fn) {
		frame.effects.push(fn);
	}
};

// ---- Browser globals the client module expects. ----
let injectedCss = null;
globalThis.document = {
	querySelector: () => null,
	createElement: (tag) => ({ dataset: {}, set textContent(v) { injectedCss = v; } }),
	head: { appendChild() {} }
};
let factory = null;
globalThis.window = { __ModuleLoader__: { load(def) { factory = def.factory; } } };

const Primitives = {
	Button: (props, ...kids) => ({ type: "button", props: { ...props, className: "dsw-btn dsw-btn-" + (props.variant ?? "default") }, children: kids }),
	IconChevronDownOutline14: (props) => ({ type: "span", props: { ...props }, children: [] }),
	// Modal mirrors the primitive's contract: renders null while closed, and
	// when open returns a node that exposes title/description/footer as props
	// AND renders them as children so traversal can walk the group headings and
	// field rows the card passes in.
	Modal: (props, ...kids) => {
		if (!props.open) return null;
		const kidsArr = kids.length > 0 ? kids : Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : [];
		return {
			type: "div",
			props: { className: props.contentClassName ?? "", title: props.title, description: props.description, footer: props.footer, children: kidsArr },
			children: [
				React.createElement("h2", { className: "um-dsh-websearch-modalTitle" }, props.title),
				props.description ? React.createElement("p", { className: "um-dsh-websearch-modalDescription" }, props.description) : null,
				...kidsArr,
				props.footer
			]
		};
	}
};
const modules = { react: React, "@deepseek-ai/dsh-client-ui-primitives": Primitives };

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
new Function("window", "require", source)(globalThis.window, (name) => modules[name]);
const cardModule = factory((name) => modules[name]);

/** Render one component call in a fresh frame, then run its effects. */
function render(component, props, seedStates) {
	beginFrame(seedStates);
	const el = component(props);
	// The slot wrapper defers the card: run it once here so every later
	// traversal reads the same seeded hook frame. Re-invoking it afterwards
	// would consume fresh hook indices and silently reset open/staged.
	const rendered = typeof el.type === "function" ? invokeComponent(el) : el;
	for (const effect of frame.effects) effect();
	return rendered;
}

/**
 * Invoke a function-component vnode the way React does: the `key` prop is
 * consumed for reconciliation and NEVER reaches component props. The
 * KeyEditor "Add key crash" regression was exactly a component reading
 * `props.key` — this emulation keeps that class of bug caught.
 */
function invokeComponent(node) {
	const props = { ...(node.props ?? {}) };
	delete props.key;
	return node.type(props, ...(node.children ?? []));
}

function collectText(node, out = []) {
	if (node == null || node === false || node === true) return out;
	if (typeof node === "string" || typeof node === "number") {
		out.push(String(node));
		return out;
	}
	if (Array.isArray(node)) {
		for (const child of node) collectText(child, out);
		return out;
	}
	if (typeof node.type === "function") return collectText(invokeComponent(node), out);
	for (const child of node.children ?? []) collectText(child, out);
	return out;
}

const textOf = (el) => collectText(el).join("\u0001");

const PROVIDERS = [
	{ id: "exa", name: "Exa", enabled: true, primaryTier: "paid", paid: { enabled: true, baseURL: "https://api.exa.ai" }, free: { enabled: false, baseURL: "https://mcp.exa.ai/mcp" }, keys: [], keysStrategy: "ordered", numResults: 5, params: { searchType: "auto" } },
	{ id: "parallel", name: "Parallel", enabled: false, primaryTier: "paid", paid: { enabled: false, baseURL: "https://api.parallel.ai" }, free: { enabled: false, baseURL: "https://search.parallel.ai/mcp" }, keys: [], keysStrategy: "ordered", numResults: 10, params: { mode: "fast" } },
	{ id: "deepseek", name: "DeepSeek Official", enabled: false, primaryTier: "paid", paid: { enabled: false, baseURL: "https://api.deepseek.com/anthropic/v1" }, free: { enabled: false, baseURL: "" }, keys: [], keysStrategy: "ordered", numResults: 5, params: { model: "deepseek-v4-flash", maxUses: 5 } }
];

/** One ready scope snapshot: composition base + stored user overrides. */
function makeSnapshot() {
	return {
		status: "ready",
		writable: true,
		revision: 7,
		base: { enabled: true },
		value: {
			enabled: false,
			defaultProvider: "exa",
			concurrency: 1,
			cache: { enabled: false, ttlSeconds:60 },
			providers: PROVIDERS
		},
		user: { enabled: false }
	};
}

function makeHarness(lang) {
	const localeStore = {};
	const calls = [];
	const credStore = {};
	const credentialsApi = {
		describe: async ({ refs }) => ({
			result: { value: { credentials: Object.fromEntries((refs ?? []).map((ref) => [ref, { configured: credStore[ref] !== undefined, writable: true }])) } }
		}),
		set: async ({ ref, value }) => {
			calls.push(["credentials.set", ref, value]);
			credStore[ref] = value;
		}
	};
	const scope = {
		getSnapshot: makeSnapshot,
		subscribe: () => () => {},
		set: async (name, value) => {
			calls.push([name, value]);
		},
		unset: async (name) => {
			calls.push(["unset", name]);
		}
	};
	const ctx = {
		get: (name) => ({ slots: ctx.slots, settingsScope: { bind: () => scope }, locale, connection: { api: { credentials: credentialsApi } } })[name],
		effect: (fn) => {
			fn();
			return () => {};
		},
		slots: {
			inject: (key, fn) => {
				ctx.captured = fn();
			},
			register: (descriptor, component) => ({ descriptor, component })
		}
	};
	const locale = {
		bind: (ns) => (key) => localeStore[ns]?.[lang]?.[key] ?? key,
		register: (ns, bundles) => {
			localeStore[ns] = bundles;
		},
		getSnapshot: () => ({ revision: 1 }),
		subscribe: () => () => {}
	};
	ctx.locale = locale;
	cardModule.apply(ctx);
	return { ctx, localeStore, locale, calls };
}

const findButtons = (node, out = []) => {
	if (node == null || typeof node !== "object") return out;
	if (Array.isArray(node)) {
		for (const child of node) findButtons(child, out);
		return out;
	}
	// Function components own their subtree: call them (children as rest args,
	// matching the createElement stub) before looking for host buttons.
	if (typeof node.type === "function") return findButtons(invokeComponent(node), out);
	if (node.type === "button") out.push(node);
	for (const child of node.children ?? []) findButtons(child, out);
	return out;
};

test("card renders localized copy in en and zh from the same tree", () => {
	const en = makeHarness("en");
	const { descriptor, component } = en.ctx.captured;
	assert.equal(descriptor.key, "web-search-exa");
	assert.equal(descriptor.locale, "web-search-exa");
	assert.equal(typeof descriptor.label, "function");
	assert.equal(descriptor.label(), "UM web search");
	const seed = [makeSnapshot(), true, {}, false, false, "providers", true];
	const elEn = render(component, { t: (k) => en.localeStore["web-search-exa"].en[k] ?? k, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, seed);
	const enText = textOf(elEn);
	assert.match(enText, /UM web search/);
	assert.match(enText, /Enable search/);
	assert.match(enText, /Overridden/);
	assert.match(enText, /Reset to default/);
	assert.match(enText, /Save/);
	assert.ok(injectedCss !== null && injectedCss.includes(".um-dsh-websearch-card{"), "card css injected on first render");
	assert.ok(injectedCss !== null && !injectedCss.includes("umexa-"), "no legacy umexa- class names remain");
	assert.ok(injectedCss !== null && injectedCss.includes("--um-dsh-websearch-dialog-w:720px"), "design tokens ship under the um-dsh-websearch namespace");
	assert.ok(injectedCss !== null && injectedCss.includes(".um-dsh-websearch-dialog{width:min("), "dialog panel carries the adaptive width rule");
	assert.ok(injectedCss !== null && injectedCss.includes("--um-dsh-websearch-tint-brand:color-mix"), "brand tint derives from theme tokens");
	assert.ok(injectedCss !== null && !injectedCss.includes("#0b0b0e") && !injectedCss.includes("color:#fff"), "no hardcoded on-color anywhere — every tinted surface uses semantic text tokens");
	// enabled stores an override (user: false vs base: true): one reset badge.
	const enButtons = findButtons(elEn).map((b) => collectText(b).join(""));
	assert.equal(enButtons.filter((label) => label === "Reset to default").length, 1, "only the genuine override offers a reset");
	assert.ok(enButtons.includes("Save") && enButtons.includes("Discard"), "footer actions render");
	assert.ok(!enText.includes("已覆盖"), "zh copy must not leak into en render");

	const zh = makeHarness("zh");
	const elZh = render(zh.ctx.captured.component, { __t: zh.locale.bind("web-search-exa"), __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, seed);
	const zhText = collectText(elZh).join(" ");
	assert.match(zhText, /UM 网页搜索/);
	assert.match(zhText, /启用搜索/);
	assert.match(zhText, /已覆盖/);
	assert.match(zhText, /恢复默认/);
	assert.ok(!zhText.includes("UM web search"), "en copy must not leak into zh render");
});

test("boolean header no longer toggles from element bubbling", () => {
	const h = makeHarness("en");
	const el = render(h.ctx.captured.component, { __t: (k) => h.localeStore["web-search-exa"].en[k] ?? k, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, [makeSnapshot(), true, {}, false, false, "providers", true]);
	// The field header label carries no onClick: only the switch itself toggles.
	const fheads = [];
	const walk = (node) => {
		if (node == null || typeof node !== "object") return;
		if (Array.isArray(node)) return node.forEach(walk);
		// Function components may receive their subtree as rest args (Modal
		// included): pass children through so the walk reaches the rows.
		if (typeof node.type === "function") return walk(invokeComponent(node));
		if (node.props?.className === "um-dsh-websearch-fhead") fheads.push(node);
		(node.children ?? []).forEach(walk);
	};
	walk(el);
	assert.ok(fheads.length >= 2, "boolean field headers render");
	for (const head of fheads) assert.equal(head.props.onClick, undefined, "fhead must not carry a row-level toggle");
});

test("visual snapshot artifact renders both languages", () => {
	const html = (lang) => {
		const h = makeHarness(lang);
		const el = render(h.ctx.captured.component, { __t: (k) => h.localeStore["web-search-exa"][lang][k] ?? k, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, [makeSnapshot(), true, {}, false, false, "providers", true]);
		return toHtml(el);
	};
	const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	function toHtml(node) {
		if (node == null || node === false || node === true) return "";
		if (typeof node === "string" || typeof node === "number") return escape(String(node));
		if (Array.isArray(node)) return node.map(toHtml).join("");
		if (typeof node.type === "function") return toHtml(invokeComponent(node));
		// Fragment sentinels are symbols: the children stand alone, no tag.
		if (typeof node.type === "symbol") return (node.children ?? []).map(toHtml).join("");
		const props = node.props ?? {};
		const attrs = [];
		for (const [key, value] of Object.entries(props)) {
			if (key === "children" || key.startsWith("__") || typeof value === "function" || value == null) continue;
			if (key === "className") attrs.push(`class="${escape(value)}"`);
			else if (value === true) attrs.push(key);
			else if (typeof value !== "object") attrs.push(`${key}="${escape(String(value))}"`);
		}
		const inner = (node.children ?? []).map(toHtml).join("");
		if (node.type === "input") return `<input${attrs.length ? " " + attrs.join(" ") : ""}>`;
		return `<${node.type}${attrs.length ? " " + attrs.join(" ") : ""}>${inner}</${node.type}>`;
	}
	const page = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--dsw-alias-bg-base:#101014;--dsw-alias-bg-layer-2:#1a1a20;--dsw-alias-bg-layer-3:#202028;--dsw-alias-border-l2:#33333d;--dsw-alias-border-l3:#3a3a46;--dsw-alias-label-primary:#ececf1;--dsw-alias-label-secondary:#a8a8b4;--dsw-alias-label-tertiary:#70707e;--dsw-alias-label-dimmed:#5a5a68;--dsw-alias-brand-primary:#4d9fff;--dsw-alias-state-error-primary:#ff5c6c;--dsw-alias-bg-module-platform:#26262e;--dsw-alias-interactive-bg-hover:#2a2a33;--dsw-alias-label-error:#ff5c6c}
body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:system-ui, sans-serif;margin:0;padding:20px}
.wrap{display:flex;gap:24px}.col{width:480px}.col h2{font-size:13px;color:var(--dsw-alias-label-tertiary);font-weight:500}
ul{list-style:none;margin:0;padding:0}
${injectedCss ?? ""}
</style></head><body><div class="wrap"><div class="col"><h2>English</h2><ul>${html("en")}</ul></div><div class="col"><h2>中文</h2><ul>${html("zh")}</ul></div></div></body></html>`;
	// The artifact is for human eyes; pin both languages so it cannot go
	// blank silently.
	for (const copy of ["UM web search", "Enable search", "UM 网页搜索", "启用搜索"]) {
		assert.ok(page.includes(copy), `snapshot page renders ${copy}`);
	}
	const out = join(tmpdir(), "um-dsh-websearch-render-snapshot.html");
	writeFileSync(out, page, "utf8");
	assert.ok(injectedCss !== null, "card css captured for the snapshot");
});

test("first screen shows master row, status line, provider rows and details button — no modal chrome", () => {
	const h = makeHarness("en");
	const scope = {
		getSnapshot: makeSnapshot,
		subscribe: () => () => {},
		set: async () => {},
		unset: async () => {}
	};
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const el = render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), false, {}, false, false, "providers", true]);
	const text = textOf(el);
	assert.match(text, /Enable search/, "master enabled row renders on the first screen");
	assert.match(text, /Strategy: Exa · concurrency 1/, "status line summarises the committed strategy");
	assert.match(text, /Concurrency/, "concurrency field renders on the first screen");
	assert.match(text, /Enable result cache/, "cache switch renders on the first screen");
	assert.match(text, /Advanced settings…/, "details button opens the Modal");
	assert.match(text, /Exa/), "provider rows render with their names";
	assert.match(text, /Primary/), "role badges render";
	// No tab chrome while the Modal is closed.
	const tabs = [];
	const walk = (node) => {
		if (node == null || typeof node !== "object") return;
		if (Array.isArray(node)) return node.forEach(walk);
		if (typeof node.type === "function") return walk(invokeComponent(node));
		if (node.props?.className === "um-dsh-websearch-tab") tabs.push(node);
		(node.children ?? []).forEach(walk);
	};
	walk(el);
	assert.equal(tabs.length, 0, "no tab buttons render on the first screen");
	for (const label of ["Primary tier", "Paid REST tier", "Add key", "API key value"]) {
		assert.ok(!text.includes(label), `detail "${label}" stays inside the Modal`);
	}
});

test("card header is a collapse button; the body renders only while open", () => {
	const h = makeHarness("en");
	const scope = {
		getSnapshot: makeSnapshot,
		subscribe: () => () => {},
		set: async () => {},
		unset: async () => {}
	};
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	// Closed card: header button only, no body chrome.
	const closed = render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), false, {}, false, false, "providers", false]);
	const closedText = textOf(closed);
	const headerBtn = findButtons(closed).find((b) => b.props.className === "um-dsh-websearch-header");
	assert.ok(headerBtn !== undefined, "the header is a button");
	assert.equal(headerBtn.props["aria-expanded"], "false", "closed card declares aria-expanded=false");
	assert.equal(headerBtn.props["aria-label"], "Show settings: UM web search", "header carries the show-settings label");
	assert.ok(typeof headerBtn.props.onClick === "function", "header toggles on click");
	assert.ok(!closedText.includes("Enable search"), "the body stays hidden while the card is closed");
	// Open card: full first screen renders.
	const open = render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), false, {}, false, false, "providers", true]);
	const openText = textOf(open);
	const openBtn = findButtons(open).find((b) => b.props.className === "um-dsh-websearch-header");
	assert.equal(openBtn.props["aria-expanded"], "true", "open card declares aria-expanded=true");
	assert.equal(openBtn.props["aria-label"], "Hide settings: UM web search", "header carries the hide-settings label");
	assert.match(openText, /Enable search/, "the body renders while the card is open");
});

test("modal renders one tab per provider plus about; the active provider's editor renders; about shows metadata", () => {
	const h = makeHarness("en");
	const scope = {
		getSnapshot: makeSnapshot,
		subscribe: () => () => {},
		set: async () => {},
		unset: async () => {}
	};
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const seedTab = (tab) => [makeSnapshot(), true, {}, false, false, tab, true];
	// A stale id ("providers") resolves to the first provider (exa).
	const elDefault = render(h.ctx.captured.component, { t, __scope: scope }, seedTab("providers"));
	const textDefault = textOf(elDefault);
	assert.ok(textDefault.includes("About"), "about tab label renders");
	for (const label of ["Exa", "Parallel", "DeepSeek 官方"]) {
		assert.ok(textDefault.includes(label), `provider tab renders "${label}"`);
	}
	// Only the active provider's editor is mounted.
	for (const label of ["Primary tier", "Paid REST tier", "Free anonymous tier", "Add key"]) {
		assert.ok(textDefault.includes(label), `exa editor renders "${label}"`);
	}
	assert.ok(!textDefault.includes("Parallel search mode"), "inactive provider editors stay unmounted");
	const tabButtons = findButtons(elDefault).filter((b) => b.props.role === "tab");
	assert.equal(tabButtons.length, 4, "four tabs render (three providers + about)");
	assert.deepEqual(tabButtons.map((b) => b.props["aria-selected"]), [true, false, false, false], "only the active tab is selected");
	assert.ok(typeof tabButtons[1].props.onClick === "function", "tabs carry a click handler");
	// Selecting the Parallel tab mounts that editor instead.
	const elParallel = render(h.ctx.captured.component, { t, __scope: scope }, seedTab("parallel"));
	const textParallel = textOf(elParallel);
	assert.ok(textParallel.includes("Parallel search mode"), "parallel tab renders its own editor");
	assert.ok(!textParallel.includes("Search type"), "exa editor is unmounted on the parallel tab");
	const textAbout = textOf(render(h.ctx.captured.component, { t, __scope: scope }, seedTab("about")));
	for (const copy of ["0.6.0", "UnforgetMemory", "GitHub repository", "Ko-fi"]) {
		assert.ok(textAbout.includes(copy), `about tab renders ${copy}`);
	}
	assert.ok(!textAbout.includes("Paid REST tier"), "provider editors stay off the about tab");
});

test("status line follows the staged strategy and concurrency", () => {
	const h = makeHarness("en");
	const scope = {
		getSnapshot: makeSnapshot,
		subscribe: () => () => {},
		set: async () => {},
		unset: async () => {}
	};
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const cases = [
		{ staged: {}, expect: "Strategy: Exa · concurrency 1" },
		{ staged: { concurrency: "3" }, expect: "Strategy: Exa · concurrency 3" },
		{ staged: { providers: [{ ...PROVIDERS[0], enabled: false }, PROVIDERS[1], PROVIDERS[2]] }, expect: "Strategy: all providers off · search unavailable" },
		{ staged: { providers: [{ ...PROVIDERS[0], enabled: true }, { ...PROVIDERS[1], enabled: true }, PROVIDERS[2]] }, expect: "Strategy: Exa → Parallel · concurrency 1" }
	];
	for (const { staged, expect } of cases) {
		const el = render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), false, staged, false, false, "providers", true]);
		assert.ok(textOf(el).includes(expect), `status line reflects ${JSON.stringify(staged)} → "${expect}"`);
	}
});

test("staging marks the header dirty and save writes coerced values through the scope", async () => {
	const h = makeHarness("en");
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const staged = { concurrency: "3" };
	const el = render(h.ctx.captured.component, { t, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, [makeSnapshot(), true, staged, false, false, "providers", true]);
	const text = textOf(el);
	assert.ok(text.includes("Unsaved"), "header carries the unsaved badge while the Modal holds edits");
	const saveButtons = findButtons(el).filter((b) => collectText(b).join("") === "Save");
	assert.ok(saveButtons.length >= 1, "save button renders in both footers");
	assert.equal(saveButtons[0].props.disabled, false, "save is enabled for valid staged values");
	await saveButtons[0].props.onClick();
	// concurrency must land as a number, not the raw typed string.
	assert.deepEqual(h.calls, [["concurrency", 3]], "save writes the coerced value through scope.set");
});

test("saving an edited providers list writes the whole array and clears the legacy flat keys", async () => {
	const h = makeHarness("en");
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	// Edit the parallel provider's enabled flag to true.
	const edited = [PROVIDERS[0], { ...PROVIDERS[1], enabled: true }, PROVIDERS[2]];
	const el = render(h.ctx.captured.component, { t, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, [makeSnapshot(), true, { providers: edited }, false, false, "providers", true]);
	const saveBtn = findButtons(el).find((b) => collectText(b).join("") === "Save");
	await saveBtn.props.onClick();
	const setCalls = h.calls.filter(([name]) => name !== "unset");
	assert.equal(setCalls.length, 1, "only the providers array is written");
	assert.equal(setCalls[0][0], "providers");
	assert.equal(setCalls[0][1][1].enabled, true, "the coerced array carries the edit");
	assert.equal(setCalls[0][1].length, 3, "the whole providers array is stored");
	const unsets = h.calls.filter(([name]) => name === "unset").map(([, key]) => key);
	assert.equal(unsets.length, 21, "every legacy flat key is cleared after the new shape lands");
	assert.ok(unsets.includes("preferred") && unsets.includes("allowAnonymous") && unsets.includes("parallelApiKeyEnv"), "legacy strategy keys are among the cleared");
});

test("invalid staged values block the save (numResults range, key reference grammar)", () => {
	const h = makeHarness("en");
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const scope = {
		getSnapshot: makeSnapshot,
		subscribe: () => () => {},
		set: async () => {},
		unset: async () => {}
	};
	const renderStaged = (staged) => render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), true, staged, false, false, "providers", true]);
	// 21 is above the ceiling: the editor shows the range error and save is blocked.
	const elBad = renderStaged({ providers: [{ ...PROVIDERS[0], numResults: 21 }, PROVIDERS[1], PROVIDERS[2]] });
	assert.ok(textOf(elBad).includes("Enter an integer from 1 to 20"), "21 shows the range error message");
	assert.equal(findButtons(elBad).find((b) => collectText(b).join("") === "Save").props.disabled, true, "save is disabled at the invalid count");
	// A malformed key reference blocks the save too (defense in depth: refs are
	// auto-generated by the UI now, but the validator still guards the config).
	const elRef = renderStaged({ providers: [{ ...PROVIDERS[0], keys: [{ ref: "not a name", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }] }, PROVIDERS[1], PROVIDERS[2]] });
	assert.equal(findButtons(elRef).find((b) => collectText(b).join("") === "Save").props.disabled, true, "save is disabled at the invalid reference");
	// Concurrency out of range blocks the save.
	const elConc = renderStaged({ concurrency: "9" });
	assert.ok(textOf(elConc).includes("Enter an integer from 1 to 8"), "concurrency 9 shows its own range error");
	assert.equal(findButtons(elConc).find((b) => collectText(b).join("") === "Save").props.disabled, true, "save is disabled at concurrency 9");
});

test("key editor rows never read the reserved key prop (real-React add-key crash regression)", () => {
	const h = makeHarness("en");
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const scope = {
		getSnapshot: makeSnapshot,
		subscribe: () => () => {},
		set: async () => {},
		unset: async () => {}
	};
	// The test React emulates real React by stripping `key` from component
	// props. The previous code destructured `props.key` inside KeyEditor and
	// crashed on "Add key" in the real settings page.
	const staged = { providers: [{ ...PROVIDERS[0], keys: [{ ref: "UM_WS_EXA_API_KEY", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }] }, PROVIDERS[1], PROVIDERS[2]] };
	const el = render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), true, staged, false, false, "exa", true]);
	const text = textOf(el);
	assert.match(text, /UM_WS_EXA_API_KEY/, "the auto-generated ref renders as the row title");
	assert.match(text, /Not configured/, "the credential state badge renders");
});

test("adding a key generates the next credential reference automatically", () => {
	const h = makeHarness("en");
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const scope = {
		getSnapshot: makeSnapshot,
		subscribe: () => () => {},
		set: async () => {},
		unset: async () => {}
	};
	const states = [makeSnapshot(), true, { providers: [{ ...PROVIDERS[0], keys: [{ ref: "UM_WS_EXA_API_KEY", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }] }, PROVIDERS[1], PROVIDERS[2]] }, false, false, "exa", true];
	const el = render(h.ctx.captured.component, { t, __scope: scope }, states);
	const addBtn = findButtons(el).find((b) => collectText(b).join("") === "Add key");
	assert.ok(addBtn !== undefined, "the add-key button renders");
	addBtn.props.onClick();
	const el2 = render(h.ctx.captured.component, { t, __scope: scope }, states);
	assert.match(textOf(el2), /UM_WS_EXA_API_KEY_1/, "the second key gets the _1 suffix");
	assert.match(textOf(el2), /UM_WS_EXA_API_KEY/, "the first key keeps the base reference");
});

test("save writes staged key values through the credentials wire face, never into the config", async () => {
	const h = makeHarness("en");
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	// Note: the slot wrapper injects the harness-bound scope over any __scope
	// prop, so every scope write lands in h.calls.
	const states = [makeSnapshot(), true, { providers: [{ ...PROVIDERS[0], keys: [{ ref: "UM_WS_EXA_API_KEY", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }] }, PROVIDERS[1], PROVIDERS[2]] }, false, false, "exa", true, { UM_WS_EXA_API_KEY: "sk-secret" }];
	const el = render(h.ctx.captured.component, { t, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, states);
	const saveBtn = findButtons(el).find((b) => collectText(b).join("") === "Save");
	assert.equal(saveBtn.props.disabled, false, "a staged key value enables save");
	await saveBtn.props.onClick();
	const credCall = h.calls.find((c) => c[0] === "credentials.set");
	assert.deepEqual(credCall, ["credentials.set", "UM_WS_EXA_API_KEY", "sk-secret"], "the value rides the credentials wire face");
	const providersCall = h.calls.find((c) => c[0] === "providers");
	assert.equal(JSON.stringify(providersCall[1][0].keys[0]).includes("sk-secret"), false, "the literal never lands in the config");
});

test("whitespace-only key values never count as dirty, and written values are trimmed", async () => {
	const h = makeHarness("en");
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const scope = { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} };
	// Whitespace alone must not mark the form dirty (non-blank semantics).
	const elBlank = render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), true, {}, false, false, "exa", true, { UM_WS_EXA_API_KEY: "   " }]);
	const blankSave = findButtons(elBlank).find((b) => collectText(b).join("") === "Save");
	assert.equal(blankSave.props.disabled, true, "whitespace alone never marks the form dirty");
	// A padded real value writes the trimmed literal.
	const states = [makeSnapshot(), true, { providers: [{ ...PROVIDERS[0], keys: [{ ref: "UM_WS_EXA_API_KEY", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }] }, PROVIDERS[1], PROVIDERS[2]] }, false, false, "exa", true, { UM_WS_EXA_API_KEY: "  sk-padded  " }];
	const el = render(h.ctx.captured.component, { t, __scope: scope }, states);
	const saveBtn = findButtons(el).find((b) => collectText(b).join("") === "Save");
	await saveBtn.props.onClick();
	const credCall = h.calls.find((c) => c[0] === "credentials.set");
	assert.deepEqual(credCall, ["credentials.set", "UM_WS_EXA_API_KEY", "sk-padded"], "the written literal is trimmed");
});

test("key rows are accordion items — collapsed by default, exactly one open at a time", () => {
	const h = makeHarness("en");
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const scope = { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} };
	const staged = { providers: [{ ...PROVIDERS[0], keys: [{ ref: "UM_WS_EXA_API_KEY", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }, { ref: "UM_WS_EXA_API_KEY_1", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }] }, PROVIDERS[1], PROVIDERS[2]] };
	// Default: every row collapsed — no value inputs render.
	const collapsed = render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), true, staged, false, false, "exa", true]);
	assert.ok(!textOf(collapsed).includes("Written to the DSH credential store under the reference above"), "collapsed rows hide the value field");
	// Accordion state lives after the card states: 8=credStates, 9=openKey.
	// NB: every render() must receive its OWN seed array — the reset effect
	// rewrites index 2 (staged) in the shared array after each frame.
	const freshSeeds = () => [makeSnapshot(), true, staged, false, false, "exa", true, {}, {}, "UM_WS_EXA_API_KEY_1"];
	const elText = render(h.ctx.captured.component, { t, __scope: scope }, freshSeeds());
	assert.match(textOf(elText), /Written to the DSH credential store under the reference above/, "the open row renders its value field");
	const clickSeeds = freshSeeds();
	const el = render(h.ctx.captured.component, { t, __scope: scope }, clickSeeds);
	const toggles = findButtons(el).filter((b) => b.props.className === "um-dsh-websearch-keyToggle");
	assert.deepEqual(toggles.map((b) => b.props["aria-expanded"]), ["false", "true"], "only the second row is open");
	// Opening the first row closes the second (mutates this frame's openKey).
	toggles[0].props.onClick();
	const openSeeds = freshSeeds();
	openSeeds[9] = clickSeeds[9];
	const el2 = render(h.ctx.captured.component, { t, __scope: scope }, openSeeds);
	const toggles2 = findButtons(el2).filter((b) => b.props.className === "um-dsh-websearch-keyToggle");
	assert.deepEqual(toggles2.map((b) => b.props["aria-expanded"]), ["true", "false"], "opening one row closes the other");
});

test("staged numeric strings echo in the editor and coerce on save (review regression)", async () => {
	const h = makeHarness("en");
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	// A typed "15" must not be clobbered back to 5 by the display clone, and the
	// save must land the coerced number.
	const staged = { providers: [{ ...PROVIDERS[0], numResults: "15" }, PROVIDERS[1], PROVIDERS[2]] };
	const el = render(h.ctx.captured.component, { t, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, [makeSnapshot(), true, staged, false, false, "providers", true]);
	assert.ok(!textOf(el).includes("Enter an integer from 1 to 20"), "a valid typed string shows no range error");
	const saveBtn = findButtons(el).find((b) => collectText(b).join("") === "Save");
	assert.equal(saveBtn.props.disabled, false, "save is enabled for the typed string");
	await saveBtn.props.onClick();
	const setCall = h.calls.find(([name]) => name === "providers");
	assert.equal(setCall[1][0].numResults, 15, "the typed string lands as a number");
});

test("the up/down buttons reorder providers and the save stores the new array order", async () => {
	const h = makeHarness("en");
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const states = [makeSnapshot(), true, {}, false, false, "providers", true];
	const el = render(h.ctx.captured.component, { t, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, states);
	const downButtons = findButtons(el).filter((b) => b.props["aria-label"] === "Move down");
	assert.ok(downButtons.length >= 1, "each provider row carries a move-down button");
	downButtons[0].props.onClick();
	// Re-render over the mutated frame states so the tree reflects the reorder.
	const el2 = render(h.ctx.captured.component, { t, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, states);
	assert.ok(textOf(el2).includes("Unsaved"), "reordering marks the form dirty");
	const saveBtn = findButtons(el2).find((b) => collectText(b).join("") === "Save");
	await saveBtn.props.onClick();
	const setCall = h.calls.find(([name]) => name === "providers");
	assert.ok(setCall, "save writes the providers array");
	assert.equal(setCall[1][0].id, "parallel", "the moved provider now leads the stored array");
});
