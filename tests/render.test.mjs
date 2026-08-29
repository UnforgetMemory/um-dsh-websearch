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
	const rendered = typeof el.type === "function" ? el.type(el.props ?? {}, ...(el.children ?? [])) : el;
	for (const effect of frame.effects) effect();
	return rendered;
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
	if (typeof node.type === "function") return collectText(node.type(node.props ?? {}, ...(node.children ?? [])), out);
	for (const child of node.children ?? []) collectText(child, out);
	return out;
}

const textOf = (el) => collectText(el).join("\u0001");

/** One ready scope snapshot: composition base + stored user overrides. */
function makeSnapshot() {
	return {
		status: "ready",
		writable: true,
		revision: 7,
		base: { enabled: true },
		value: {
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
		},
		user: { enabled: false, numResults: 5 }
	};
}

/** Fake settingsScope that records every set/unset so saves can be asserted. */
function makeFakeScope() {
	const calls = [];
	return {
		calls,
		getSnapshot: makeSnapshot,
		subscribe: () => () => {},
		set: async (name, value) => {
			calls.push([name, value]);
		},
		unset: async (name) => {
			calls.push(["unset", name]);
		}
	};
}


function makeHarness(lang) {
	const localeStore = {};
	const calls = [];
	// The slot wrapper clones its own scope over any test-passed __scope, so the
	// harness's scope is the one ExaSettingsCard actually writes through.
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
		get: (name) => ({ slots: ctx.slots, settingsScope: { bind: () => scope }, locale })[name],
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
	if (typeof node.type === "function") return findButtons(node.type(node.props ?? {}, ...(node.children ?? [])), out);
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
	const seed = [makeSnapshot(), true, {}, false, false];
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
	// numResults stores the factory default: not a real override, no badge.
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
	const el = render(h.ctx.captured.component, { __t: (k) => h.localeStore["web-search-exa"].en[k] ?? k, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, [makeSnapshot(), true, {}, false, false]);
	// The field header div carries no onClick: only the switch itself toggles.
	const fheads = [];
	const walk = (node) => {
		if (node == null || typeof node !== "object") return;
		if (Array.isArray(node)) return node.forEach(walk);
		// Function components may receive their subtree as rest args (Modal
		// included): pass children through so the walk reaches the rows.
		if (typeof node.type === "function") return walk(node.type(node.props ?? {}, ...(node.children ?? [])));
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
		const el = render(h.ctx.captured.component, { __t: (k) => h.localeStore["web-search-exa"][lang][k] ?? k, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, [makeSnapshot(), true, {}, false, false]);
		return toHtml(el);
	};
	const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	function toHtml(node) {
		if (node == null || node === false || node === true) return "";
		if (typeof node === "string" || typeof node === "number") return escape(String(node));
		if (Array.isArray(node)) return node.map(toHtml).join("");
		if (typeof node.type === "function") return toHtml(node.type(node.props ?? {}, ...(node.children ?? [])));
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

test("first screen shows master row, status line and details button — no modal chrome", () => {
	const h = makeHarness("en");
	const scope = makeFakeScope();
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	// modalOpen=false (position 1): the Modal's subtree is null.
	const el = render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), false, {}, false, false]);
	const text = textOf(el);
	assert.match(text, /Enable search/, "master enabled row renders on the first screen");
	assert.match(text, /Strategy: Exa first · Parallel disabled/, "status line summarises the committed strategy");
	assert.match(text, /Advanced settings…/, "details button opens the Modal");
	// No tab chrome and no detail-only fields while the Modal is closed.
	const tabs = [];
	const walk = (node) => {
		if (node == null || typeof node !== "object") return;
		if (Array.isArray(node)) return node.forEach(walk);
		if (typeof node.type === "function") return walk(node.type(node.props ?? {}, ...(node.children ?? [])));
		if (node.props?.className === "um-dsh-websearch-tab") tabs.push(node);
		(node.children ?? []).forEach(walk);
	};
	walk(el);
	assert.equal(tabs.length, 0, "no tab buttons render on the first screen");
	for (const label of ["Overview", "Preferred backend", "API key reference", "Parallel default result count (1–20)", "Parallel search mode"]) {
		assert.ok(!text.includes(label), `detail "${label}" stays inside the Modal`);
	}
});

test("modal renders four tabs; each tab hosts its own fields", () => {
	const h = makeHarness("en");
	const scope = makeFakeScope();
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const seedTab = (tab) => [makeSnapshot(), true, {}, false, false, tab];
	// Default (strategy) tab: four tab labels, strategy fields and status line.
	const elDefault = render(h.ctx.captured.component, { t, __scope: scope }, seedTab("strategy"));
	const textDefault = textOf(elDefault);
	for (const label of ["Overview", "Exa", "Parallel", "About"]) {
		assert.ok(textDefault.includes(label), `tab "${label}" renders`);
	}
	assert.ok(textDefault.includes("Set as primary"), "strategy tab hosts the primary controls");
	assert.ok(textDefault.includes("Strategy: Exa first · Parallel disabled"), "strategy tab repeats the status line");
	assert.ok(!textDefault.includes("API key reference"), "exa fields stay off the strategy tab");
	const tabButtons = findButtons(elDefault).filter((b) => b.props.role === "tab");
	assert.equal(tabButtons.length, 4, "four tabs render");
	assert.deepEqual(tabButtons.map((b) => b.props["aria-selected"]), [true, false, false, false], "only the active tab is selected");
	assert.ok(typeof tabButtons[1].props.onClick === "function", "tabs carry a click handler");
	// Exa tab.
	const textExa = textOf(render(h.ctx.captured.component, { t, __scope: scope }, seedTab("exa")));
	for (const label of ["Allow anonymous access", "Fall back to paid search", "API key reference", "REST endpoint base", "Default result count (1–10)", "Search type"]) {
		assert.ok(textExa.includes(label), `exa field "${label}" renders on the exa tab`);
	}
	assert.ok(!textExa.includes("Parallel API key reference"), "parallel fields stay off the exa tab");
	// Parallel tab.
	const textParallel = textOf(render(h.ctx.captured.component, { t, __scope: scope }, seedTab("parallel")));
	for (const label of ["Allow Parallel anonymous access", "Parallel API key reference", "Parallel default result count (1–20)", "Parallel search mode"]) {
		assert.ok(textParallel.includes(label), `parallel field "${label}" renders on the parallel tab`);
	}
	assert.ok(!textParallel.includes("Set as primary"), "strategy controls stay off the parallel tab");
	// About tab: metadata, no fields.
	const textAbout = textOf(render(h.ctx.captured.component, { t, __scope: scope }, seedTab("about")));
	for (const copy of ["0.4.0", "UnforgetMemory", "GitHub repository", "Ko-fi"]) {
		assert.ok(textAbout.includes(copy), `about tab renders ${copy}`);
	}
	assert.ok(!textAbout.includes("Set as primary"), "about tab renders no fields");
});

test("strategy summary follows preferred, exaEnabled and parallelEnabled", () => {
	const h = makeHarness("en");
	const scope = makeFakeScope();
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	// The status line reads the effective values, so a staged edit updates it
	// live even before save.
	const cases = [
		{ staged: {}, expect: "Strategy: Exa first · Parallel disabled" },
		{ staged: { parallelEnabled: true }, expect: "Strategy: Exa first · Parallel on as fallback" },
		{ staged: { preferred: "parallel", parallelEnabled: true }, expect: "Strategy: Parallel first · Exa on as fallback" },
		// The effective strategy follows the enable flags, not the raw
		// preference: a preferred backend that is off never claims "first".
		{ staged: { preferred: "parallel" }, expect: "Strategy: served by Exa · Parallel is off" },
		{ staged: { preferred: "parallel", exaEnabled: false, parallelEnabled: true }, expect: "Strategy: Parallel first · Exa disabled" },
		{ staged: { exaEnabled: false, parallelEnabled: true }, expect: "Strategy: served by Parallel · Exa is off" },
		{ staged: { preferred: "parallel", exaEnabled: false }, expect: "Strategy: both backends off · search unavailable" },
		{ staged: { exaEnabled: false, parallelEnabled: false }, expect: "Strategy: both backends off · search unavailable" }
	];
	for (const { staged, expect } of cases) {
		const el = render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), false, staged, false, false]);
		const text = textOf(el);
		assert.ok(text.includes(expect), `status line reflects ${JSON.stringify(staged)} → "${expect}"`);
	}
});

test("strategy panel shows effective roles, warnings and swap control", () => {
	const h = makeHarness("en");
	const scope = makeFakeScope();
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	const renderTab = (staged) => render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), true, staged, false, false, "strategy"]);
	// Default committed state: preferred=exa, exa on, parallel off.
	const el = renderTab({});
	const text = textOf(el);
	assert.ok(text.includes("Set as primary"), "primary controls render");
	assert.ok(text.includes("Primary") && text.includes("Off"), "roles render (exa primary, parallel off)");
	const radios = findButtons(el).filter((b) => b.props.role === "radio");
	assert.equal(radios.length, 2, "one primary radio per backend");
	assert.deepEqual(radios.map((b) => b.props["aria-checked"]), [true, false], "only the preferred backend is checked");
	assert.ok(!text.includes("The preferred backend is off"), "no warning while the preferred backend is enabled");
	// Preferred disabled while the other backend is enabled: the effective
	// strategy names the serving backend, the warning explains the mismatch,
	// and a one-click swap fixes it.
	const warn = renderTab({ preferred: "exa", exaEnabled: false, parallelEnabled: true });
	const warnText = textOf(warn);
	assert.ok(warnText.includes("Strategy: served by Parallel · Exa is off"), "effective strategy names the serving backend");
	assert.ok(warnText.includes("The preferred backend is off; the other one serves."), "warning explains the mismatch");
	assert.ok(warnText.includes("Swap"), "one-click swap is offered");
	assert.ok(warnText.includes("Primary · off") && warnText.includes("Fallback"), "roles reflect the disabled preferred backend");
	// Both backends off.
	const off = renderTab({ exaEnabled: false, parallelEnabled: false });
	const offText = textOf(off);
	assert.ok(offText.includes("Strategy: both backends off · search unavailable"), "all-off strategy message");
	assert.ok(offText.includes("Both backends are off; search is unavailable."), "all-off warning renders");
});

test("staging in the modal marks the header dirty and save writes coerced values through the scope", async () => {
	const h = makeHarness("en");
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	// Two edits made inside the Modal, one of them a typed string that must be
	// coerced to a number on save.
	const staged = { parallelMode: "turbo", parallelNumResults: "15" };
	const el = render(h.ctx.captured.component, { t }, [makeSnapshot(), true, staged, false, false]);
	const text = textOf(el);
	assert.ok(text.includes("Unsaved"), "header carries the unsaved badge while the Modal holds edits");
	const saveButtons = findButtons(el).filter((b) => collectText(b).join("") === "Save");
	assert.ok(saveButtons.length >= 1, "save button renders in both footers");
	const saveBtn = saveButtons[0];
	assert.equal(saveBtn.props.disabled, false, "save is enabled for valid staged values");
	await saveBtn.props.onClick();
	// parallelNumResults must land as a number, not the raw typed string.
	// dirtyNames follow ALL_FIELDS order, so parallelNumResults lands before
	// parallelMode.
	assert.deepEqual(h.calls, [
		["parallelNumResults", 15],
		["parallelMode", "turbo"]
	], "save writes the coerced values through scope.set");
});

test("parallelNumResults rejects 21 and accepts 20", () => {
	const h = makeHarness("en");
	const scope = makeFakeScope();
	const t = (k) => h.localeStore["web-search-exa"].en[k] ?? k;
	// 21 is above the ceiling: the field surfaces the range error and save is
	// blocked by hasInvalid. The field lives on the parallel tab, so seed it.
	const elBad = render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), true, { parallelNumResults: 21 }, false, false, "parallel"]);
	assert.ok(textOf(elBad).includes("Enter an integer from 1 to 20"), "21 shows the range error message");
	const saveBad = findButtons(elBad).find((b) => collectText(b).join("") === "Save");
	assert.ok(saveBad, "save button still renders");
	assert.equal(saveBad.props.disabled, true, "save is disabled while parallelNumResults is out of range");
	// 20 is the inclusive ceiling: no error, save is enabled.
	const elOk = render(h.ctx.captured.component, { t, __scope: scope }, [makeSnapshot(), true, { parallelNumResults: 20 }, false, false, "parallel"]);
	assert.ok(!textOf(elOk).includes("Enter an integer from 1 to 20"), "20 is accepted with no error");
	const saveOk = findButtons(elOk).find((b) => collectText(b).join("") === "Save");
	assert.equal(saveOk.props.disabled, false, "save is enabled at the inclusive ceiling");
});
