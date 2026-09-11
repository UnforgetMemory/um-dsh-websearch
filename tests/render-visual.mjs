// Visual harness: renders the settings card in every key state to fixture
// files for Playwright headless-browser testing.
// Generates three files in tests/visual/fixtures/:
//   index.html       — static HTML for screenshot/visual-snapshot tests
//   interactive.html — interactive page with browser mini React for interaction tests
//   lab.html         — viewport lab (4 iframe widths) for responsive testing
// Run: node tests/render-visual.mjs  → prints fixture paths.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "visual", "fixtures");
mkdirSync(FIXTURES, { recursive: true });

// ---- Minimal React stub (Node.js, same contract as tests/render.test.mjs). ----
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
		return {
			type: "div",
			props: { className: props.className ?? "" },
			children: [
				React.createElement("div", { className: props.contentClassName ?? "" },
					React.createElement("h2", { className: "um-dsh-websearch-modalTitle" }, props.title),
					props.description ? React.createElement("p", { className: "um-dsh-websearch-modalDescription" }, props.description) : null,
					...kidsArr),
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
	const rendered = typeof el.type === "function" ? invokeComponent(el) : el;
	for (const effect of frame.effects) effect();
	return rendered;
}

/** Invoke a function-component vnode like React: `key` never reaches props. */
function invokeComponent(node) {
	const props = { ...(node.props ?? {}) };
	delete props.key;
	return node.type(props, ...(node.children ?? []));
}

// ---- Test data ----
const PROVIDERS = [
	{ id: "exa", name: "Exa", enabled: true, primaryTier: "paid", paid: { enabled: true, baseURL: "https://api.exa.ai" }, free: { enabled: false, baseURL: "https://mcp.exa.ai/mcp" }, keys: [{ ref: "UM_WS_EXA_API_KEY", enabled: true, allowFreeToPaid: true, allowPaidToFree: false }], keysStrategy: "ordered", numResults: 5, params: { searchType: "auto" } },
	{ id: "parallel", name: "Parallel", enabled: true, primaryTier: "free", paid: { enabled: false, baseURL: "https://api.parallel.ai" }, free: { enabled: true, baseURL: "https://search.parallel.ai/mcp" }, keys: [{ ref: "UM_WS_PARALLEL_API_KEY", enabled: true, allowFreeToPaid: false, allowPaidToFree: true }], keysStrategy: "ordered", numResults: 10, params: { mode: "fast" } },
	{ id: "deepseek", name: "DeepSeek Official", enabled: false, primaryTier: "paid", paid: { enabled: false, baseURL: "https://api.deepseek.com/anthropic/v1" }, free: { enabled: false, baseURL: "" }, keys: [{ ref: "UM_WS_DEEPSEEK_API_KEY", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }], keysStrategy: "ordered", numResults: 5, params: { model: "deepseek-v4-flash", maxUses: 5 } }
];

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
			cache: { enabled: true, ttlSeconds: 120 },
			providers: PROVIDERS
		},
		user: { enabled: false, concurrency: 1, providers: PROVIDERS }
	};
}

// Boot the module once to capture the slot component and its dictionaries.
const localeStore = {};
// Credentials-domain mock: fixture refs are "configured" so the static pages
// render the configured badge.
const configuredRefs = new Set(PROVIDERS.flatMap((p) => (p.keys ?? []).map((k) => k.ref)));
const credentialsApi = {
	describe: async ({ refs }) => ({
		result: { value: { credentials: Object.fromEntries((refs ?? []).map((ref) => [ref, { configured: configuredRefs.has(ref), writable: true }])) } }
	}),
	set: async () => {}
};
const ctx = {
	get: (name) => ({ slots: ctx.slots, settingsScope: { bind: () => ({ getSnapshot: makeSnapshot, subscribe: () => () => {}, set: async () => {}, unset: async () => {} }) }, locale: ctx.locale, connection: { api: { credentials: credentialsApi } } })[name],
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

// ---- Static HTML generation ----
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function toHtml(node) {
	if (node == null || node === false || node === true) return "";
	if (typeof node === "string" || typeof node === "number") return escape(String(node));
	if (Array.isArray(node)) return node.map(toHtml).join("");
	if (typeof node.type === "function") return toHtml(invokeComponent(node));
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

const renderState = (lang, seeds) => render(component, { t: tOf(lang) }, seeds);
function extractModal(rendered) {
	for (const kid of rendered.children ?? []) {
		if (kid != null && typeof kid === "object" && kid.type === Primitives.Modal) {
			return Primitives.Modal(kid.props ?? {}, ...(kid.children ?? []));
		}
	}
	return null;
}

// ---- Theme tokens (shared by all fixture pages) ----
const THEME = `:root{--dsw-alias-bg-base:#101014;--dsw-alias-bg-layer-2:#1a1a20;--dsw-alias-bg-layer-3:#202028;--dsw-alias-border-l2:#33333d;--dsw-alias-border-l3:#3a3a46;--dsw-alias-label-primary:#ececf1;--dsw-alias-label-secondary:#a8a8b4;--dsw-alias-label-tertiary:#70707e;--dsw-alias-label-dimmed:#5a5a68;--dsw-alias-brand-primary:#4d9fff;--dsw-alias-state-error-primary:#ff5c6c;--dsw-alias-interactive-bg-hover:#2a2a33;--dsw-alias-label-error:#ff5c6c}`;

// ---- Generate index.html (static, for screenshot tests) ----
const S = makeSnapshot();
const stagedEdits = { concurrency: "4" };
const sections = [
	["首屏（zh，含已覆盖/未保存徽章）", "section", renderState("zh", [S, false, stagedEdits, false, false, "providers", true])],
	["首屏（en）", "section", renderState("en", [S, false, stagedEdits, false, false, "providers", true])],
	["详细配置 · 数据源（zh）", "dialog", extractModal(renderState("zh", [S, true, stagedEdits, false, false, "providers", true]))],
	["详细配置 · 关于（zh）", "dialog", extractModal(renderState("zh", [S, true, stagedEdits, false, false, "about", true]))],
	["详细配置 · 数据源（en）", "dialog", extractModal(renderState("en", [S, true, stagedEdits, false, false, "providers", true]))],
	["数据源 · 默认停用警示（zh）", "dialog", extractModal(renderState("zh", [S, true, { providers: [{ ...PROVIDERS[0], enabled: false }, PROVIDERS[1], PROVIDERS[2]] }, false, false, "providers", true]))],
	["数据源 · 全部停用（zh）", "dialog", extractModal(renderState("zh", [S, true, { providers: [{ ...PROVIDERS[0], enabled: false }, { ...PROVIDERS[1], enabled: false }, PROVIDERS[2]] }, false, false, "providers", true]))],
	["自适应宽度（bare，zh 数据源）", "bare", extractModal(renderState("zh", [S, true, stagedEdits, false, false, "providers", true]))]
];
const indexBody = sections
	.map(([title, kind, node]) => {
		const inner = kind === "section"
			? `<ul class="card-list">${toHtml(node)}</ul>`
			: kind === "bare"
				? `<div class="bare">${toHtml(node)}</div>`
				: `<div class="backdrop"><div class="dialog-frame">${toHtml(node)}</div></div>`;
		return `<div class="case" data-case="${title}"><h3>${title}</h3>${inner}</div>`;
	})
	.join("\n");
const indexHtml = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
${THEME}
body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:"Segoe UI",system-ui,sans-serif;margin:0;padding:20px 12px}
h3{font-size:12px;color:var(--dsw-alias-label-tertiary);font-weight:500;margin:0 0 8px;letter-spacing:.04em}
.case{margin-bottom:28px}
.card-list{list-style:none;margin:0;padding:0;max-width:560px}
.backdrop{background:rgba(8,8,10,.55);border:1px dashed var(--dsw-alias-border-l2);border-radius:16px;padding:8px}
.dialog-frame{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.45);padding:8px 4px;width:fit-content;max-width:100%}
.bare{padding:24px;max-width:100%;box-sizing:border-box}
${injectedCss ?? ""}
</style></head><body>${indexBody}</body></html>`;

// ---- Generate lab.html (viewport lab, for responsive testing) ----
const bareHtml = toHtml(extractModal(renderState("zh", [S, true, stagedEdits, false, false, "strategy", true])));
const labFrames = [1280, 720, 480, 380].map((w) => {
	const srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${THEME}${injectedCss ?? ""}.um-dsh-websearch-dialog{border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-2);padding:16px;box-sizing:border-box}.um-dsh-websearch-modalTitle{margin:0 0 4px;font-size:16px;font-weight:600}.um-dsh-websearch-modalDescription{margin:0 0 12px;font-size:12px;color:var(--dsw-alias-label-tertiary)}</style></head><body style="margin:0;padding:24px;background:var(--dsw-alias-bg-base)">${bareHtml}</body></html>`;
	return `<iframe class="lab-frame" data-vw="${w}" style="width:${w}px;height:900px" srcdoc="${escape(srcdoc)}"></iframe>`;
}).join("\n");
const labHtml = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
${THEME}
body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:"Segoe UI",system-ui,sans-serif;margin:0;padding:20px 12px}
h3{font-size:12px;color:var(--dsw-alias-label-tertiary);font-weight:500;margin:0 0 8px}
.lab{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}
.lab-frame{border:1px solid var(--dsw-alias-border-l2);flex:none;background:var(--dsw-alias-bg-base)}
</style></head><body><h3>视口实验室（iframe：1280 / 720 / 480 / 380）</h3><div class="lab">${labFrames}</div></body></html>`;

// ---- Generate interactive.html (for Playwright interaction tests) ----
// This page includes a browser-compatible mini React that renders the actual
// component from lib/client.js with real DOM elements and state management.
// Playwright can click buttons, toggle switches, type in inputs, and read
// window.__testLog.scopeCalls to verify scope.set/unset calls.
const interactiveHtml = `<!doctype html><html lang="zh">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
${THEME}
${injectedCss ?? ""}
body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:"Segoe UI",system-ui,sans-serif;margin:0;padding:20px 12px}
#root{max-width:800px}
</style></head>
<body>
<div id="root"></div>
<div id="test-log" data-testid="test-log" style="display:none"></div>
<script>
"use strict";
// ---- Mini React (browser-compatible, with re-render on state change) ----
var R = (function() {
  var r = {};
  var states = [], idx = 0, effects = [], comp = null, props = null, root = null;
  var mounted = false;
  r.Fragment = Symbol.for('react.fragment');

  function ce(type, p, ...children) {
    p = p || {};
    var flatKids = children.flat(9).filter(function(c) { return c != null && c !== false && c !== true; });
    if (typeof type === 'function') {
      // Emulate React: the reconciliation key never reaches component props.
      var pc = {};
      for (var k2 in p) { if (k2 !== 'key') pc[k2] = p[k2]; }
      return type(pc, ...flatKids);
    }
    if (type === r.Fragment || (typeof type === 'symbol')) {
      var frag = document.createDocumentFragment();
      for (var i = 0; i < flatKids.length; i++) {
        var ch = flatKids[i];
        if (typeof ch === 'string' || typeof ch === 'number') frag.appendChild(document.createTextNode(String(ch)));
        else if (ch instanceof Node) frag.appendChild(ch);
      }
      return frag;
    }
    var el = document.createElement(type);
    for (var key in p) {
      if (key === 'children') continue;
      var v = p[key];
      if (typeof v === 'function' && key.startsWith('on')) {
        el.addEventListener(key.slice(2).toLowerCase(), v);
      } else if (key === 'className') {
        el.className = v;
      } else if (key === 'style' && typeof v === 'object') {
        for (var sk in v) el.style[sk] = v[sk];
      } else if (key === 'disabled') {
        el.disabled = !!v;
      } else if (key === 'value' && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
        el.value = v;
      } else if (key === 'checked' && el.tagName === 'INPUT') {
        el.checked = !!v;
      } else if (v === true) {
        el.setAttribute(key, '');
      } else if (v === false || v == null) {
        continue;
      } else if (typeof v !== 'object') {
        el.setAttribute(key, String(v));
      }
    }
    for (var i = 0; i < flatKids.length; i++) {
      var child = flatKids[i];
      if (typeof child === 'string' || typeof child === 'number') el.appendChild(document.createTextNode(String(child)));
      else if (child instanceof Node) el.appendChild(child);
    }
    return el;
  }

  function useSt(init) {
    var i = idx++;
    if (i >= states.length) states[i] = typeof init === 'function' ? init() : init;
    return [states[i], function(v) {
      states[i] = typeof v === 'function' ? v(states[i]) : v;
      reRender();
    }];
  }

  function useEf(fn) { effects.push(fn); }

  function doRender() {
    var el = ce(comp, props);
    root.innerHTML = '';
    root.appendChild(el);
    if (!mounted) {
      mounted = true;
      for (var i = 0; i < effects.length; i++) effects[i]();
    }
  }

  function reRender() {
    requestAnimationFrame(function() {
      if (!comp || !root) return;
      idx = 0; effects = [];
      doRender();
    });
  }

  r.createElement = ce;
  r.useState = useSt;
  r.useEffect = useEf;
  r.render = function(c, p, rootEl) {
    comp = c; props = p; root = rootEl;
    states = []; idx = 0; effects = [];
    doRender();
  };
  r.reRender = reRender;
  return r;
})();

// ---- Mock primitives (browser DOM) ----
var Primitives = {
  Button: function(props, ...kids) {
    var el = document.createElement('button');
    el.className = 'dsw-btn dsw-btn-' + (props.variant || 'default');
    for (var key in props) {
      if (key === 'variant' || key === 'children') continue;
      var v = props[key];
      if (typeof v === 'function') el.addEventListener(key.slice(2).toLowerCase(), v);
      else if (key === 'disabled') el.disabled = !!v;
      else if (typeof v !== 'object') el.setAttribute(key, String(v));
    }
    var flatKids = kids.flat(9).filter(function(c) { return c != null && c !== false; });
    for (var i = 0; i < flatKids.length; i++) {
      var child = flatKids[i];
      if (typeof child === 'string' || typeof child === 'number') el.appendChild(document.createTextNode(String(child)));
      else if (child instanceof Node) el.appendChild(child);
    }
    return el;
  },
  IconChevronDownOutline14: function(props) {
    var el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    return el;
  },
  Modal: function(props, ...kids) {
    if (!props.open) return document.createTextNode('');
    var kidsArr = kids.length > 0 ? kids : Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : [];
    var flatKids = kidsArr.flat(9).filter(function(c) { return c != null && c !== false; });
    var backdrop = document.createElement('div');
    backdrop.className = props.className || '';
    backdrop.setAttribute('role', 'dialog');
    var content = document.createElement('div');
    content.className = props.contentClassName || '';
    var title = document.createElement('h2');
    title.className = 'um-dsh-websearch-modalTitle';
    title.textContent = props.title || '';
    content.appendChild(title);
    if (props.description) {
      var desc = document.createElement('p');
      desc.className = 'um-dsh-websearch-modalDescription';
      desc.textContent = props.description;
      content.appendChild(desc);
    }
    for (var i = 0; i < flatKids.length; i++) {
      var child = flatKids[i];
      if (typeof child === 'string' || typeof child === 'number') content.appendChild(document.createTextNode(String(child)));
      else if (child instanceof Node) content.appendChild(child);
    }
    if (props.footer && props.footer instanceof Node) content.appendChild(props.footer);
    backdrop.appendChild(content);
    return backdrop;
  }
};

// ---- Mock DSH context ----
var localeStore = {};
var scopeCalls = [];
var credCalls = [];
var configuredRefs = ${JSON.stringify(PROVIDERS.flatMap((p) => (p.keys ?? []).map((k) => k.ref)))};
var credentialsApi = {
  describe: function(req) {
    var views = {};
    (req && req.refs || []).forEach(function(ref) { views[ref] = { configured: configuredRefs.indexOf(ref) >= 0, writable: true }; });
    return Promise.resolve({ result: { value: { credentials: views } } });
  },
  set: function(req) { credCalls.push([req.ref, req.value]); configuredRefs.push(req.ref); return Promise.resolve(); }
};
var scopeState = {
  getSnapshot: function() {
    return ${JSON.stringify(makeSnapshot())};
  },
  subscribe: function() { return function(){}; },
  set: function(name, value) { scopeCalls.push(['set', name, value]); return Promise.resolve(); },
  unset: function(name) { scopeCalls.push(['unset', name]); return Promise.resolve(); }
};
var ctx = {
  get: function(name) {
    if (name === 'slots') return ctx.slots;
    if (name === 'settingsScope') return { bind: function() { return scopeState; } };
    if (name === 'locale') return ctx.locale;
    if (name === 'connection') return { api: { credentials: credentialsApi } };
    return undefined;
  },
  effect: function(fn) { fn(); return function(){}; },
  slots: {
    inject: function(key, fn) { fn(); },
    register: function(descriptor, component) { ctx.captured = { descriptor: descriptor, component: component }; }
  }
};
ctx.locale = {
  bind: function(ns) { return function(key) { return (localeStore[ns] && localeStore[ns].zh && localeStore[ns].zh[key]) || key; }; },
  register: function(ns, bundles) { localeStore[ns] = bundles; },
  getSnapshot: function() { return { revision: 1 }; },
  subscribe: function() { return function(){}; }
};

// ---- Load component from lib/client.js ----
var modules = { react: R, '@deepseek-ai/dsh-client-ui-primitives': Primitives };
var factory = null;
window.__ModuleLoader__ = { load: function(def) { factory = def.factory; } };
var source = ${JSON.stringify(source).replace(/`/g, '\\`')};
new Function('window', 'require', source)(window, function(name) { return modules[name]; });
var cardModule = factory(function(name) { return modules[name]; });
cardModule.apply(ctx);
var component = ctx.captured.component;

// ---- Render the component ----
R.render(component, {
  t: function(k) { return (localeStore['web-search-exa'] && localeStore['web-search-exa'].zh && localeStore['web-search-exa'].zh[k]) || k; }
}, document.getElementById('root'));

// ---- Expose test log ----
window.__testLog = {
  get scopeCalls() { return scopeCalls; },
  get credCalls() { return credCalls; },
  get localeStore() { return localeStore; }
};
</script>
</body></html>`;

// ---- Write files ----
const indexPath = join(FIXTURES, "index.html");
const labPath = join(FIXTURES, "lab.html");
const interactivePath = join(FIXTURES, "interactive.html");
writeFileSync(indexPath, indexHtml, "utf8");
writeFileSync(labPath, labHtml, "utf8");
writeFileSync(interactivePath, interactiveHtml, "utf8");

console.log(indexPath);
console.log(labPath);
console.log(interactivePath);
