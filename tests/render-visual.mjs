// Visual harness: renders the settings card in every key state to one HTML
// page for headless-browser screenshots. Not part of the node:test suite.
// Run: node tests/render-visual.mjs  → prints the HTML path.
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- Minimal React stub (same contract as tests/render.test.mjs). ----
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
		return [frame.states[i], (v) => {
			frame.states[i] = typeof v === "function" ? v(frame.states[i]) : v;
		}];
	},
	useEffect(fn) {
		frame.effects.push(fn);
	}
};

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
	Modal: (props, ...kids) => {
		if (!props.open) return null;
		const kidsArr = kids.length > 0 ? kids : Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : [];
		// Faithful to the primitive: className lands on the DIALOG panel,
		// contentClassName on the inner scroll region, footer beside it.
		return {
			type: "div",
			props: { className: props.className ?? "" },
			children: [
				React.createElement(
					"div",
					{ className: props.contentClassName ?? "" },
					React.createElement("h2", { className: "um-dsh-websearch-modalTitle" }, props.title),
					props.description ? React.createElement("p", { className: "um-dsh-websearch-modalDescription" }, props.description) : null,
					...kidsArr
				),
				props.footer
			]
		};
	}
};
const modules = { react: React, "@deepseek-ai/dsh-client-ui-primitives": Primitives };
const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
new Function("window", "require", source)(globalThis.window, (name) => modules[name]);
const cardModule = factory((name) => modules[name]);

function render(component, props, seedStates) {
	beginFrame(seedStates);
	const el = component(props);
	const rendered = typeof el.type === "function" ? el.type(el.props ?? {}, ...(el.children ?? [])) : el;
	for (const effect of frame.effects) effect();
	return rendered;
}

function makeSnapshot() {
	return {
		status: "ready",
		writable: true,
		revision: 7,
		base: { enabled: true },
		value: {
			enabled: false, preferred: "exa", exaEnabled: true, parallelEnabled: true,
			allowAnonymous: true, fallbackToPaid: true, fallbackToAnonymous: false,
			apiKeyEnv: "EXA_API_KEY", baseURL: "https://api.exa.ai", mcpBaseURL: "https://mcp.exa.ai/mcp",
			numResults: 5, searchType: "auto",
			parallelAllowAnonymous: false, parallelFallbackToPaid: false, parallelFallbackToAnonymous: true,
			parallelApiKeyEnv: "PARALLEL_API_KEY", parallelBaseURL: "https://api.parallel.ai",
			parallelMcpBaseURL: "https://search.parallel.ai/mcp", parallelNumResults: 10, parallelMode: "fast"
		},
		user: { enabled: false, numResults: 5, parallelEnabled: true, parallelMode: "turbo" }
	};
}

// Boot the module once to capture the slot component and its dictionaries.
const localeStore = {};
const ctx = {
	get: (name) => ({ slots: ctx.slots, settingsScope: { bind: () => ({ getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} }) }, locale: ctx.locale })[name],
	effect: (fn) => { fn(); return () => {}; },
	slots: {
		inject: (key, fn) => { ctx.captured = fn(); },
		register: (descriptor, component) => ({ descriptor, component })
	}
};
ctx.locale = {
	bind: (ns) => (key) => localeStore[ns]?.zh?.[key] ?? key,
	register: (ns, bundles) => { localeStore[ns] = bundles; },
	getSnapshot: () => ({ revision: 1 }),
	subscribe: () => () => {}
};
cardModule.apply(ctx);
const component = ctx.captured.component;
const tOf = (lang) => (k) => localeStore["web-search-exa"][lang][k] ?? k;

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function toHtml(node) {
	if (node == null || node === false || node === true) return "";
	if (typeof node === "string" || typeof node === "number") return escape(String(node));
	if (Array.isArray(node)) return node.map(toHtml).join("");
	if (typeof node.type === "function") return toHtml(node.type(node.props ?? {}, ...(node.children ?? [])));
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

// The slot wrapper re-binds its own `__t`, so language control goes through
// the `t` prop, which ExaSettingsCard prefers over `__t`.
const renderState = (lang, seeds) => render(component, { t: tOf(lang) }, seeds);
/** The Modal is a lazy element inside the card tree; evaluate and return it alone. */
function extractModal(rendered) {
	for (const kid of rendered.children ?? []) {
		if (kid != null && typeof kid === "object" && kid.type === Primitives.Modal) {
			return Primitives.Modal(kid.props ?? {}, ...(kid.children ?? []));
		}
	}
	return null;
}
const S = makeSnapshot();
const stagedEdits = { parallelMode: "turbo" };
const sections = [
	["首屏（zh，含已覆盖/未保存徽章）", "section", renderState("zh", [S, false, stagedEdits, false, false])],
	["首屏（en）", "section", renderState("en", [S, false, stagedEdits, false, false])],
	["详细配置 · 综合（zh）", "dialog", extractModal(renderState("zh", [S, true, stagedEdits, false, false, "strategy"]))],
	["详细配置 · Exa（zh）", "dialog", extractModal(renderState("zh", [S, true, stagedEdits, false, false, "exa"]))],
	["详细配置 · Parallel（zh，staged 编辑）", "dialog", extractModal(renderState("zh", [S, true, stagedEdits, false, false, "parallel"]))],
	["详细配置 · 关于（zh）", "dialog", extractModal(renderState("zh", [S, true, stagedEdits, false, false, "about"]))],
	["详细配置 · 综合（en）", "dialog", extractModal(renderState("en", [S, true, stagedEdits, false, false, "strategy"]))],
	["综合 · 首选停用警示（zh）", "dialog", extractModal(renderState("zh", [S, true, { preferred: "exa", exaEnabled: false, parallelEnabled: true }, false, false, "strategy"]))],
	["综合 · 全部停用（zh）", "dialog", extractModal(renderState("zh", [S, true, { exaEnabled: false, parallelEnabled: false }, false, false, "strategy"]))],
	["自适应宽度（bare，zh 综合）", "bare", extractModal(renderState("zh", [S, true, stagedEdits, false, false, "strategy"]))]
];
const body = sections
	.map(([title, kind, node]) => {
		const inner = kind === "section"
			? `<ul class="card-list">${toHtml(node)}</ul>`
			: kind === "bare"
				? `<div class="bare">${toHtml(node)}</div>`
				: `<div class="backdrop"><div class="dialog-frame">${toHtml(node)}</div></div>`;
		return `<div class="case"><h3>${title}</h3>${inner}</div>`;
	})
	.join("\n");
const page = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
:root{--dsw-alias-bg-base:#101014;--dsw-alias-bg-layer-2:#1a1a20;--dsw-alias-bg-layer-3:#202028;--dsw-alias-border-l2:#33333d;--dsw-alias-border-l3:#3a3a46;--dsw-alias-label-primary:#ececf1;--dsw-alias-label-secondary:#a8a8b4;--dsw-alias-label-tertiary:#70707e;--dsw-alias-label-dimmed:#5a5a68;--dsw-alias-brand-primary:#4d9fff;--dsw-alias-state-error-primary:#ff5c6c;--dsw-alias-interactive-bg-hover:#2a2a33;--dsw-alias-label-error:#ff5c6c}
body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:"Segoe UI",system-ui,sans-serif;margin:0;padding:20px 12px}
h3{font-size:12px;color:var(--dsw-alias-label-tertiary);font-weight:500;margin:0 0 8px;letter-spacing:.04em}
.case{margin-bottom:28px}
.card-list{list-style:none;margin:0;padding:0;max-width:560px}
.backdrop{background:rgba(8,8,10,.55);border:1px dashed var(--dsw-alias-border-l2);border-radius:16px;padding:8px}
.dialog-frame{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.45);padding:8px 4px;width:fit-content;max-width:100%}
.bare{padding:24px;max-width:100%;box-sizing:border-box}
.lab{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}
.lab-frame{border:1px solid var(--dsw-alias-border-l2);height:900px;flex:none;background:var(--dsw-alias-bg-base)}
.um-dsh-websearch-dialog{border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-2);padding:16px 16px 12px;box-sizing:border-box}
.um-dsh-websearch-modalTitle{margin:0 0 4px;font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary)}
.um-dsh-websearch-modalDescription{margin:0 0 12px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dsw-btn{appearance:none;border-radius:8px;font:inherit;font-size:12px;line-height:1.5;padding:5px 12px;cursor:pointer;border:1px solid transparent}
.dsw-btn:disabled{opacity:.5;cursor:default}
.dsw-btn-primary{background:var(--dsw-alias-brand-primary);color:#0b0b0e;border-color:transparent}
.dsw-btn-outline{background:transparent;color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.dsw-btn-default{background:transparent;color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
a{color:var(--dsw-alias-brand-primary)}
${injectedCss ?? ""}
</style></head><body>${body}</body></html>`;
const diagScript = `<script>
window.addEventListener('load', () => {
	const measure = (el) => el ? { cw: el.clientWidth, sw: el.scrollWidth, overflowX: el.scrollWidth > el.clientWidth } : null;
	const cases = [...document.querySelectorAll('.case')].map((c, i) => ({
		n: i + 1,
		title: c.querySelector('h3') ? c.querySelector('h3').textContent : '',
		dialog: measure(c.querySelector('.um-dsh-websearch-dialog')),
		modal: measure(c.querySelector('.um-dsh-websearch-modalContent')),
		frame: measure(c.querySelector('.dialog-frame')),
		list: measure(c.querySelector('.card-list'))
	}));
	const doc = { cw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
	const lab = [...document.querySelectorAll('.lab-frame')].map((f) => {
		try {
			const pre = f.contentDocument && f.contentDocument.querySelector('#lab-diag');
			return pre ? JSON.parse(pre.textContent) : { error: 'no diag in frame' };
		} catch (err) {
			return { error: String(err && err.message ? err.message : err) };
		}
	});
	const pre = document.createElement('pre');
	pre.id = 'um-dsh-websearch-diag';
	pre.textContent = JSON.stringify({ doc, lab, cases }, null, 1);
	document.body.appendChild(pre);
});
</script>`;
const bareHtml = toHtml(extractModal(renderState("zh", [S, true, stagedEdits, false, false, "strategy"])));
// Viewport lab: `vw` units resolve against the iframe's own viewport, so four
// fixed-width iframes give a deterministic dynamic-layout matrix that the
// headless `--window-size` flag cannot provide reliably.
const labFrames = [1280, 720, 480, 380].map((w) => {
	const srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>:root{--dsw-alias-bg-base:#101014;--dsw-alias-bg-layer-2:#1a1a20;--dsw-alias-bg-layer-3:#202028;--dsw-alias-border-l2:#33333d;--dsw-alias-border-l3:#3a3a46;--dsw-alias-label-primary:#ececf1;--dsw-alias-label-secondary:#a8a8b4;--dsw-alias-label-tertiary:#70707e;--dsw-alias-label-dimmed:#5a5a68;--dsw-alias-brand-primary:#4d9fff;--dsw-alias-state-error-primary:#ff5c6c;--dsw-alias-interactive-bg-hover:#2a2a33;--dsw-alias-label-error:#ff5c6c}${injectedCss ?? ""}.um-dsh-websearch-dialog{border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-2);padding:16px;box-sizing:border-box}.um-dsh-websearch-modalTitle{margin:0 0 4px;font-size:16px;font-weight:600}.um-dsh-websearch-modalDescription{margin:0 0 12px;font-size:12px;color:var(--dsw-alias-label-tertiary)}</style></head><body style="margin:0;padding:24px;background:var(--dsw-alias-bg-base)">${bareHtml}<script>window.addEventListener('load',()=>{const m=(el)=>el?{cw:el.clientWidth,sw:el.scrollWidth,overflowX:el.scrollWidth>el.clientWidth}:null;const pre=document.createElement('pre');pre.id='lab-diag';pre.textContent=JSON.stringify({vw:window.innerWidth,dialog:m(document.querySelector('.um-dsh-websearch-dialog')),content:m(document.querySelector('.um-dsh-websearch-modalContent'))});document.body.appendChild(pre);});</script></body></html>`;
	return `<iframe class="lab-frame" style="width:${w}px" srcdoc="${escape(srcdoc)}"></iframe>`;
}).join("\n");
const labSection = `<div class="case"><h3>视口实验室（iframe：1280 / 720 / 480 / 380）</h3><div class="lab">${labFrames}</div></div>`;
const out = join(tmpdir(), "um-dsh-websearch-visual.html");
writeFileSync(out, page.replace("</body></html>", labSection + diagScript + "</body></html>"), "utf8");
console.log(out);
