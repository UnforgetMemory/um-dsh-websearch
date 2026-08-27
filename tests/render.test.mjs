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
	IconChevronDownOutline14: (props) => ({ type: "span", props: { ...props }, children: [] })
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
		value: { enabled: false, apiKeyEnv: "EXA_API_KEY", baseURL: "https://api.exa.ai", mcpBaseURL: "https://mcp.exa.ai/mcp", numResults: 5, searchType: "auto" },
		user: { enabled: false, numResults: 5 }
	};
}

function makeHarness(lang) {
	const localeStore = {};
	const scope = {
		getSnapshot: makeSnapshot,
		subscribe: () => () => {},
		set: async () => {},
		unset: async () => {}
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
	return { ctx, localeStore, locale };
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
	assert.equal(descriptor.label(), "Exa web search");
	const seed = [makeSnapshot(), true, {}, false, false];
	const elEn = render(component, { t: (k) => en.localeStore["web-search-exa"].en[k] ?? k, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, seed);
	const enText = textOf(elEn);
	assert.match(enText, /Exa web search/);
	assert.match(enText, /Enable Exa search/);
	assert.match(enText, /Overridden/);
	assert.match(enText, /Reset to default/);
	assert.match(enText, /Save/);
	assert.ok(injectedCss !== null && injectedCss.includes(".umexa-card{"), "card css injected on first render");
	// numResults stores the factory default: not a real override, no badge.
	const enButtons = findButtons(elEn).map((b) => collectText(b).join(""));
	assert.equal(enButtons.filter((label) => label === "Reset to default").length, 1, "only the genuine override offers a reset");
	assert.ok(enButtons.includes("Save") && enButtons.includes("Discard"), "footer actions render");
	assert.ok(!enText.includes("已覆盖"), "zh copy must not leak into en render");

	const zh = makeHarness("zh");
	const elZh = render(zh.ctx.captured.component, { __t: zh.locale.bind("web-search-exa"), __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, seed);
	const zhText = collectText(elZh).join(" ");
	assert.match(zhText, /Exa 网页搜索/);
	assert.match(zhText, /启用 Exa 搜索/);
	assert.match(zhText, /已覆盖/);
	assert.match(zhText, /恢复默认/);
	assert.ok(!zhText.includes("Exa web search"), "en copy must not leak into zh render");
});

test("boolean header no longer toggles from element bubbling", () => {
	const h = makeHarness("en");
	const el = render(h.ctx.captured.component, { __t: (k) => h.localeStore["web-search-exa"].en[k] ?? k, __scope: { getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} } }, [makeSnapshot(), true, {}, false, false]);
	// The field header div carries no onClick: only the switch itself toggles.
	const fheads = [];
	const walk = (node) => {
		if (node == null || typeof node !== "object") return;
		if (Array.isArray(node)) return node.forEach(walk);
		if (typeof node.type === "function") return walk(node.type(node.props ?? {}));
		if (node.props?.className === "umexa-fhead") fheads.push(node);
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
	for (const copy of ["Exa web search", "Enable Exa search", "Exa 网页搜索", "启用 Exa 搜索"]) {
		assert.ok(page.includes(copy), `snapshot page renders ${copy}`);
	}
	const out = join(tmpdir(), "umexa-render-snapshot.html");
	writeFileSync(out, page, "utf8");
	assert.ok(injectedCss !== null, "card css captured for the snapshot");
});
