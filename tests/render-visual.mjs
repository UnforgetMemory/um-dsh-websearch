// Fixture generator for the browser suite of `um-dsh-websearch`.
//
// Writes ONE page — tests/visual/fixtures/card.html — that boots the SHIPPED
// lib/client.js in a real browser against:
//
//   * a mini React (createElement / jsx-runtime / useState / useEffect /
//     useRef / useSyncExternalStore) that renders one component call per frame
//     into real DOM, so clicks and typing drive the card's own staging logic;
//   * a STUB primitives module whose components render deterministic DOM and
//     record every props object they receive. The real
//     @deepseek-ai/dsh-client-ui-primitives components are framework-owned:
//     they need real React plus CSS-module imports that do not resolve outside
//     the DSH web bundle, so the stub mirrors only their contract (which props
//     the card passes, and which control reaches which callback) — never their
//     pixels. The pixel baselines therefore cover this card's own layout plus
//     the stub controls, not the shipped look of the primitives;
//   * a mock DSH ctx exposing the five injected services (slots, locale,
//     configForms with get/whileServed, remote.credentials with describe/set,
//     remote.$on, effect), logging everything into window.__testLog.
//
// Run: node tests/render-visual.mjs  → prints the fixture path.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "visual", "fixtures");
mkdirSync(FIXTURES, { recursive: true });

// The plugin source is inlined at GENERATION time, so the fixture always runs
// the file that is on disk right now.
const source = readFileSync(join(__dirname, "..", "lib", "client.js"), "utf8");

// Fixture data. Kept in the generator so the spec asserts against one source.
const snapshot = {
	status: "ready",
	writable: true,
	revision: 7,
	mode: "host",
	base: { enabled: true },
	user: { enabled: false },
	value: {
		enabled: false,
		defaultProvider: "exa",
		concurrency: 1,
		cache: { enabled: true, ttlSeconds: 120 },
		providers: [
			{
				id: "exa", name: "Exa", enabled: true, primaryTier: "paid",
				paid: { enabled: true, baseURL: "https://api.exa.ai" },
				free: { enabled: false, baseURL: "https://mcp.exa.ai/mcp" },
				keys: [{ ref: "UM_WS_EXA_API_KEY", enabled: true, allowFreeToPaid: true, allowPaidToFree: false }],
				keysStrategy: "ordered", numResults: 5, params: { searchType: "auto" }
			},
			{
				id: "parallel", name: "Parallel", enabled: true, primaryTier: "free",
				paid: { enabled: false, baseURL: "https://api.parallel.ai" },
				free: { enabled: true, baseURL: "https://search.parallel.ai/mcp" },
				keys: [{ ref: "UM_WS_PARALLEL_API_KEY", enabled: true, allowFreeToPaid: false, allowPaidToFree: true }],
				keysStrategy: "ordered", numResults: 10, params: { mode: "fast" }
			},
			{
				id: "deepseek", name: "DeepSeek Official", enabled: false, primaryTier: "paid",
				paid: { enabled: false, baseURL: "https://api.deepseek.com/anthropic/v1" },
				free: { enabled: false, baseURL: "" },
				keys: [{ ref: "UM_WS_DEEPSEEK_API_KEY", enabled: true, allowFreeToPaid: false, allowPaidToFree: false }],
				keysStrategy: "ordered", numResults: 5, params: { model: "deepseek-v4-flash" }
			}
		]
	}
};

const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>um-dsh-websearch · card fixture</title>
<style>
:root{--dsw-alias-bg-base:#101014;--dsw-alias-bg-layer-2:#1a1a20;--dsw-alias-bg-layer-3:#202028;--dsw-alias-border-l2:#33333d;--dsw-alias-border-l3:#3a3a46;--dsw-alias-label-primary:#ececf1;--dsw-alias-label-secondary:#a8a8b4;--dsw-alias-label-tertiary:#70707e;--dsw-alias-label-dimmed:#5a5a68;--dsw-alias-brand-primary:#4d9fff;--dsw-alias-state-error-primary:#ff5c6c;--dsw-alias-interactive-bg-hover:#2a2a33;--dsw-alias-label-error:#ff5c6c}
*{box-sizing:border-box}
body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:"Segoe UI",system-ui,sans-serif;margin:0;padding:16px}
#card-root{width:640px;max-width:100%}
.dsh-settings-form{display:flex;flex-direction:column;gap:12px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
.dsh-settings-form > .dsh-save{align-self:flex-start}
.dsw-control-row{display:flex;align-items:center;gap:8px;justify-content:space-between}
.dsw-control-row > .dsw-control-label{min-width:0}
.dsw-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsw-section{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:8px}
.dsw-provider-row{display:flex;align-items:center;gap:8px}
.dsw-provider-row .dsw-grow{flex:1 1 auto;min-width:0}
.dsw-provider-name{flex:1 1 auto;min-width:0}
.dsw-field{display:flex;flex-direction:column;gap:4px}
.dsw-field input{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l3);border-radius:6px;color:inherit;padding:4px 6px;font:inherit}
.dsw-switch{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l3);border-radius:999px;color:inherit;padding:2px 10px;font:inherit;cursor:pointer}
.dsw-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary);color:#0b0b0f}
.dsw-switch[disabled]{opacity:.5;cursor:default}
.dsw-button{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l3);border-radius:6px;color:inherit;padding:4px 10px;font:inherit;cursor:pointer}
.dsw-button[disabled]{opacity:.5;cursor:default}
.dsw-button-primary{background:var(--dsw-alias-brand-primary);color:#0b0b0f}
.dsw-tag{display:inline-block;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;padding:1px 8px;font-size:12px}
.dsw-segmented{display:inline-flex;gap:4px}
.dsw-segmented > span{border:1px solid var(--dsw-alias-border-l3);border-radius:6px;padding:2px 8px;font-size:12px}
.dsw-modal{position:relative;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2);padding:12px;margin-top:12px}
.dsw-modal h2{margin:0 0 4px;font-size:16px}
.dsw-disclosure{border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:6px 8px}
.dsw-disclosure > summary{cursor:pointer}
</style>
</head>
<body>
<div id="card-root" data-testid="card-root"></div>
<script>
"use strict";
// ---- Mini React -----------------------------------------------------------
// One component call per frame over real DOM. createElement returns a lazy
// thunk for function components so hooks run in the right order while the tree
// is being built; the reconciler is a full re-render from the root, which is
// enough for a settings card.
var R = (function () {
  var r = {};
  var hooks = null;      // current component frame
  var frameSlots = [];   // one persistent frame per render position
  var frameIndex = 0;    // the position the next component call occupies
  var hIdx = 0;
  var effects = [];
  var storeCleanups = [];  // live useSyncExternalStore subscriptions
  var pending = false;
  var root = null;
  var rootView = "page";
  var rootProps = null;

  function flat(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v === null || v === undefined || v === false || v === true) continue;
      if (Array.isArray(v)) { out = out.concat(flat(v)); continue; }
      out.push(v);
    }
    return out;
  }
  function ce(type, config) {
    var props = {};
    for (var k in (config || {})) if (k !== "key") props[k] = config[k];
    var kids = flat([].slice.call(arguments, 2));
    if (kids.length > 0) props.children = kids.length === 1 ? kids[0] : kids;
    if (typeof type === "function") return { thunk: type, props: props };
    return { type: type, props: props };
  }
  function create(type, config) {
    var props = {};
    for (var k in (config || {})) if (k !== "key") props[k] = config[k];
    var kids = flat([].slice.call(arguments, 2));
    if (kids.length > 0) props.children = kids.length === 1 ? kids[0] : kids;
    // Only a function component is a thunk; a host element (and a Fragment
    // symbol) must keep its type or dom() would call it as a function.
    if (typeof type === "function") return { thunk: type, props: props };
    return { type: type, props: props };
  }
  function applyProps(el, props) {
    for (var key in props) {
      if (key === "children") continue;
      var v = props[key];
      // Value-like props must land even when empty ("" / false): a controlled
      // input's blank value is meaningful, not an absent attribute.
      if (key === "value") { el.value = v === undefined || v === null ? "" : String(v); continue; }
      if (key === "checked" || key === "disabled" || key === "open") { el[key] = v === true; continue; }
      if (v === undefined || v === null || v === false) continue;
      if (typeof v === "function") {
        if (key.slice(0, 2) !== "on") continue;
        var event = key.slice(2).toLowerCase();
        // React's onChange is the input event, not the DOM change event.
        if (event === "change") { el.addEventListener("input", v); el.addEventListener("change", v); }
        else el.addEventListener(event, v);
        continue;
      }
      if (key === "style" && typeof v === "object") {
        for (var s in v) el.style[s] = v[s];
        continue;
      }
      if (key === "className") { el.className = v; continue; }
      if (v === true) { el.setAttribute(key, ""); continue; }
      if (typeof v === "object") continue;
      el.setAttribute(key, String(v));
    }
  }
  function dom(node) {
    if (node === null || node === undefined || node === false || node === true) return null;
    if (typeof node === "string" || typeof node === "number") return document.createTextNode(String(node));
    if (Array.isArray(node)) {
      var frag = document.createDocumentFragment();
      for (var i = 0; i < node.length; i++) {
        var c = dom(node[i]);
        if (c !== null) frag.appendChild(c);
      }
      return frag;
    }
    if (typeof node !== "object") return null;
    if (node.thunk) {
      var savedHooks = hooks, savedIdx = hIdx, savedSlot = frameIndex;
      // The frame is keyed by the component's position in the render order and
      // REUSED across renders, so useState/useRef keep their values; a fresh
      // frame per render would reset every hook on each repaint.
      hooks = frameSlots[frameIndex] || (frameSlots[frameIndex] = { states: [], refs: [] });
      frameIndex += 1;
      hIdx = 0;
      var out = node.thunk(node.props);
      var collected = hooks;
      hooks = savedHooks; hIdx = savedIdx; frameIndex = savedSlot;
      var el = dom(out);
      if (el !== null) el.__umHooks = collected;
      return el;
    }
    if (node.type === r.Fragment) return dom(node.props.children);
    if (typeof node.type === "symbol") return dom(node.props.children);
    var host = document.createElement(node.type);
    applyProps(host, node.props);
    var kids = flat([node.props.children]);
    for (var j = 0; j < kids.length; j++) {
      var child = dom(kids[j]);
      if (child !== null) host.appendChild(child);
    }
    return host;
  }
  function flushEffects() {
    var queue = effects;
    effects = [];
    for (var i = 0; i < queue.length; i++) {
      var cleanup = queue[i].fn();
      if (typeof cleanup === "function") queue[i].cleanups.push(cleanup);
    }
  }
  function render() {
    if (root === null) return;
    effects = [];
    frameIndex = 0;
    for (var s = 0; s < storeCleanups.length; s++) storeCleanups[s]();
    storeCleanups = [];
    while (root.firstChild) root.removeChild(root.firstChild);
    var el = dom({ thunk: rootProps.component, props: rootProps.props });
    if (el !== null) root.appendChild(el);
    flushEffects();
    window.__testLog.renders += 1;
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; render(); });
  }
  r.Fragment = Symbol.for("react.fragment");
  r.createElement = ce;
  r.jsx = create;
  r.jsxs = create;
  r.useState = function (init) {
    // The setter must keep its OWN frame: the module-level hooks variable is
    // restored to the parent frame (null at the root) once the component call
    // returns, so a closure over it would throw when an event handler fires.
    var frame = hooks;
    var i = hIdx++;
    if (!(i in frame.states)) frame.states[i] = typeof init === "function" ? init() : init;
    return [frame.states[i], function (next) {
      frame.states[i] = typeof next === "function" ? next(frame.states[i]) : next;
      schedule();
    }];
  };
  r.useRef = function (init) {
    var frame = hooks;
    var i = hIdx++;
    if (!(i in frame.refs)) frame.refs[i] = { current: init };
    return frame.refs[i];
  };
  r.useEffect = function (fn) { effects.push({ fn: fn, cleanups: [] }); };
  // A settings card reads its state through this hook, so it must actually
  // subscribe: returning a bare snapshot would freeze the card on its first
  // render. Each frame re-subscribes; the previous frame's subscriptions are
  // released at the top of the next render.
  r.useSyncExternalStore = function (subscribe, getSnapshot) {
    var unsubscribe = subscribe(function () { schedule(); });
    if (typeof unsubscribe === "function") storeCleanups.push(unsubscribe);
    return getSnapshot();
  };
  /** Force a full re-render; the snapshot store calls this on every change. */
  r.rerender = function () { schedule(); };
  r.mount = function (component, props, host) {
    root = host;
    rootProps = { component: component, props: props };
    render();
  };
  r.setProps = function (props) {
    rootProps.props = props;
    schedule();
  };
  return r;
})();

// ---- Stub primitives ------------------------------------------------------
// Deterministic DOM + a full prop log. The real primitives own their pixels;
// these stand in only for their contract.
var PrimitiveCalls = {};
// SettingsFormModel is the ONE stub that is not a bare prop recorder: the card
// constructs it, so the fixture mirrors the official class (dsh-client-ui-
// primitives lib/index.js) closely enough that staged-draft semantics survive —
// section scalars stage as path ops, write-only drafts drop when blank, and a
// save is the single point where a draft becomes a mutation.
function settingsNumberField(field) {
  return { field: field, format: function (value) { return typeof value === "number" ? String(value) : ""; },
    parse: function (text) {
      var trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      var parsed = Number(trimmed);
      return isFinite(parsed) ? { kind: "set", value: parsed } : undefined;
    } };
}
function settingsTextField(field) {
  return { field: field, format: function (value) { return typeof value === "string" ? value : ""; },
    parse: function (text) {
      var trimmed = text.trim();
      return trimmed === "" ? { kind: "clear" } : { kind: "set", value: trimmed };
    } };
}
function SettingsFormModel(scope, specs, secrets) {
  this.scope = scope;
  this.specs = {};
  for (var i = 0; i < specs.length; i++) this.specs[specs[i].field] = specs[i];
  this.secretSpecs = {};
  for (var j = 0; j < (secrets || []).length; j++) this.secretSpecs[secrets[j].field] = secrets[j];
  this.staged = {};
  this.listeners = [];
  this.storeListeners = [];
  this.saving = false;
  this.failed = false;
}
SettingsFormModel.prototype.bind = function (project) {
  var self = this;
  var snapshot = project();
  var store = {
    getSnapshot: function () { return snapshot; },
    subscribe: function (listener) { self.storeListeners.push(listener); return function () {}; },
    set: function (next) {
      if (window.__umDebug) console.log('store.set ' + JSON.stringify({ enabled: next.enabled, dirty: next.dirty }));
      if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
      snapshot = next;
      for (var i = 0; i < self.storeListeners.length; i++) self.storeListeners[i]();
    }
  };
  this.bound = store;
  this.listeners.push(function () { store.set(project()); });
  return store;
};
SettingsFormModel.prototype.shell = function () {
  var snapshot = this.scope.getSnapshot();
  var plan = this.plan();
  if (window.__umDebug) console.log("shell plan " + JSON.stringify({ staged: Object.keys(this.staged), plan: plan, specs: Object.keys(this.specs) }));
  var invalid = false;
  for (var i = 0; i < plan.length; i++) if (plan[i].run === undefined && plan[i].op === undefined) invalid = true;
  return { available: snapshot.status === "ready", writable: snapshot.writable, dirty: plan.length > 0, invalid: invalid, saving: this.saving, failed: this.failed };
};
SettingsFormModel.prototype.field = function (field) {
  var staged = this.staged[field];
  if (Object.prototype.hasOwnProperty.call(this.secretSpecs, field)) return { text: staged ? staged.text : "", overridden: false, invalid: false };
  // A write-only whole-value control has no scalar spec and no section path:
  // its draft text is all the card reads back.
  if (!Object.prototype.hasOwnProperty.call(this.specs, field)) return { text: staged ? staged.text : "", overridden: false, invalid: false };
  var spec = this.specs[field];
  if (staged === undefined) {
    var user = this.scope.getSnapshot().user;
    return { text: spec.format(this.sectionValue(field)), overridden: user !== undefined && Object.prototype.hasOwnProperty.call(user, field), invalid: false };
  }
  var write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
  return { text: staged.text, overridden: write !== undefined && write.kind === "set", invalid: write === undefined };
};
SettingsFormModel.prototype.actions = function () {
  var self = this;
  return {
    edit: function (field, text) { self.stage(field, { text: text, clear: false }); },
    resetField: function (field) { self.stage(field, { text: self.specs[field].format(self.scope.getSnapshot().base ? self.scope.getSnapshot().base[field] : undefined), clear: true }); },
    save: function () { return self.save(); },
    discard: function () {
      if (Object.keys(self.staged).length === 0 && !self.failed) return;
      self.staged = {};
      self.failed = false;
      self.publish();
    }
  };
};
SettingsFormModel.prototype.save = function () {
  var self = this;
  var plan = this.plan();
  var invalid = false;
  for (var i = 0; i < plan.length; i++) if (plan[i].run === undefined && plan[i].op === undefined) invalid = true;
  if (plan.length === 0 || this.saving || !this.scope.getSnapshot().writable || invalid) return Promise.resolve();
  this.saving = true;
  this.failed = false;
  this.publish();
  var ops = [];
  for (var j = 0; j < plan.length; j++) if (plan[j].op !== undefined) ops.push(plan[j].op);
  /** Run one write-only control's write, then carry the landed flag forward. */
  var runStep = function (chain, run) {
    return chain.then(function (current) { return Promise.resolve(run()).then(function (next) { return current && next !== false; }); });
  };
  var landed = ops.length === 0 ? Promise.resolve(true) : this.scope.mutate(ops, this.baseline ? this.baseline.revision : undefined);
  return landed.then(function (ok) {
    var chain = Promise.resolve(ok);
    for (var k = 0; k < plan.length; k++) {
      if (plan[k].run === undefined) continue;
      chain = runStep(chain, plan[k].run);
    }
    return chain;
  }).then(function (ok) {
    if (ok) { self.staged = {}; self.baseline = undefined; }
    self.failed = !ok;
  }).catch(function () { self.failed = true; }).then(function () { self.saving = false; self.publish(); });
};
SettingsFormModel.prototype.dispose = function () { this.listeners = []; this.storeListeners = []; };
/** Parse one write-only draft, keeping the type the section value already has. */
function parseDraft(text, current) {
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return undefined;
  }
  if (typeof current === "boolean") return parsed === true || parsed === "true";
  if (typeof current === "number" && typeof parsed === "string" && parsed.trim() !== "" && isFinite(Number(parsed))) return Number(parsed);
  return parsed;
}
/** Bind one write-only control's draft to the run a save performs. */
function makeWriteRun(spec, text) {
  return function () { return spec.write(text); };
}
SettingsFormModel.prototype.plan = function () {  var plan = [];
  for (var field in this.staged) {
    var staged = this.staged[field];
    // 1. A write-only control: its own write() runs on save, and a blank draft
    //    drops. The official model plans { field, run } for these (primitives
    //    lib/index.js:6613-6620) — planning { field, text } instead would leave
    //    every entry with neither run nor op, which the shell reads as an
    //    invalid form and the save button then never enables.
    if (Object.prototype.hasOwnProperty.call(this.secretSpecs, field)) {
      var secret = this.secretSpecs[field];
      var literal = staged.text.trim();
      if (literal !== "") plan.push({ field: field, run: makeWriteRun(secret, literal) });
      continue;
    }
    // 2. A write-only whole-value control (enabled, cache, providers): it has
    //    no scalar spec, so its staged text is the JSON of the value a save
    //    writes. The official model keeps the section value's type, which is
    //    what turns the master switch's "true" draft into a real boolean; an
    //    unparseable draft is the card's own signal that the form is invalid.
    if (!Object.prototype.hasOwnProperty.call(this.specs, field)) {
      if (staged.text.trim() === "") continue;
      var value = parseDraft(staged.text, this.sectionValue(field));
      if (value === undefined) plan.push({ field: field });
      else plan.push({ field: field, op: { op: "set", path: [field], value: value } });
      continue;
    }
    // 3. A section scalar: format-compare, parse, then set/clear/unset.
    var spec = this.specs[field];
    if (staged.clear) {
      var user = this.scope.getSnapshot().user;
      if (user !== undefined && Object.prototype.hasOwnProperty.call(user, field)) plan.push({ field: field, op: { op: "unset", path: [field] } });
      continue;
    }
    if (staged.text === spec.format(this.sectionValue(field))) continue;
    var write = spec.parse(staged.text);
    if (write === undefined) plan.push({ field: field });
    else if (write.kind === "clear") plan.push({ field: field, op: { op: "unset", path: [field] } });
    else plan.push({ field: field, op: { op: "set", path: [field], value: write.value } });
  }
  return plan;
};
SettingsFormModel.prototype.stage = function (field, edit) {
  this.baseline = this.baseline || this.scope.getSnapshot();
  this.staged[field] = edit;
  this.failed = false;
  this.publish();
};
SettingsFormModel.prototype.sectionValue = function (field) {
  var value = this.scope.getSnapshot().value;
  return value === undefined ? undefined : value[field];
};
SettingsFormModel.prototype.publish = function () {
  for (var i = 0; i < this.listeners.length; i++) this.listeners[i]();
};
var Primitives = {
  SettingsFormModel: SettingsFormModel,
  settingsTextField: settingsTextField,
  settingsNumberField: settingsNumberField,
  SettingsForm: function (props) {
    PrimitiveCalls.SettingsForm = (PrimitiveCalls.SettingsForm || []).concat([props]);
    if (!props.state.available) {
      return R.createElement("p", { className: "dsh-settings-form-unavailable" }, props.labels.unavailable);
    }
    var blocked = !props.state.dirty || props.state.invalid || props.state.saving;
    var kids = [props.state.writable ? null : R.createElement("p", { className: "dsh-settings-form-readonly" }, props.labels.readOnly)];
    kids.push(props.children);
    if (props.state.failed) kids.push(R.createElement("p", { className: "dsh-settings-form-failed" }, props.labels.saveFailed));
    kids.push(R.createElement("button", {
      type: "button",
      className: "dsw-button dsw-button-primary dsh-save",
      "data-testid": "settings-save",
      disabled: blocked,
      onClick: function () { return props.onSave(); }
    }, props.state.saving ? props.labels.saving : props.labels.save));
    return R.createElement("div", { className: "dsh-settings-form", "data-dirty": String(props.state.dirty), "data-invalid": String(props.state.invalid) }, kids);
  },
  SettingsValueField: function (props) {
    PrimitiveCalls.SettingsValueField = (PrimitiveCalls.SettingsValueField || []).concat([props]);
    return R.createElement("div", { className: "dsw-field", "data-field": props.id, "data-testid": props.id }, [
      R.createElement("label", { htmlFor: props.id }, props.label),
      R.createElement("input", {
        id: props.id,
        type: props.numeric ? "number" : "text",
        value: props.text === undefined || props.text === null ? "" : String(props.text),
        disabled: props.disabled,
        onChange: function (event) { return props.onEdit(event.target.value); }
      }),
      props.invalid
        ? R.createElement("span", { className: "dsw-hint dsw-invalid" }, props.invalidLabel)
        : R.createElement("span", { className: "dsw-hint" }, props.hint),
      props.overridden
        ? R.createElement("button", { type: "button", className: "dsw-button dsw-reset", onClick: function () { return props.onReset(); } }, props.resetLabel)
        : null
    ]);
  },
  SettingsSecretField: function (props) {
    PrimitiveCalls.SettingsSecretField = (PrimitiveCalls.SettingsSecretField || []).concat([props]);
    return R.createElement("div", { className: "dsw-field", "data-field": props.id }, [
      R.createElement("label", { htmlFor: props.id }, props.label),
      R.createElement("input", {
        id: props.id,
        type: "password",
        autoComplete: "new-password",
        value: props.text === undefined || props.text === null ? "" : String(props.text),
        disabled: props.disabled,
        onChange: function (event) { return props.onEdit(event.target.value); }
      }),
      R.createElement("span", { className: "dsw-hint dsw-secret-state" }, props.stateLabel),
      R.createElement("span", { className: "dsw-hint" }, props.hint)
    ]);
  },
  Switch: function (props) {
    PrimitiveCalls.Switch = (PrimitiveCalls.Switch || []).concat([props]);
    return R.createElement("button", {
      type: "button",
      className: "dsw-switch",
      role: "switch",
      "aria-checked": props.checked === true ? "true" : "false",
      "aria-label": props.label,
      disabled: props.disabled === true,
      onClick: function () { return props.onChange(props.checked !== true); }
    }, props.checked === true ? "on" : "off");
  },
  Button: function (props) {
    PrimitiveCalls.Button = (PrimitiveCalls.Button || []).concat([props]);
    return R.createElement("button", {
      type: "button",
      className: "dsw-button dsw-button-" + (props.variant || "default"),
      disabled: props.disabled === true,
      title: props.title,
      "aria-label": props["aria-label"],
      onClick: function () { return props.onClick(); }
    }, props.children);
  },
  Tag: function (props) {
    PrimitiveCalls.Tag = (PrimitiveCalls.Tag || []).concat([props]);
    return R.createElement("span", { className: "dsw-tag", "data-tone": props.tone || "neutral" }, props.children);
  },
  SegmentedControl: function (props) {
    PrimitiveCalls.SegmentedControl = (PrimitiveCalls.SegmentedControl || []).concat([props]);
    return R.createElement("span", { className: "dsw-segmented", role: "radiogroup", "aria-label": props.label },
      (props.options || []).map(function (option) {
        return R.createElement("button", {
          type: "button",
          role: "radio",
          "aria-checked": String(option.value === props.value),
          disabled: props.disabled === true,
          onClick: function () { return props.onChange(option.value); }
        }, option.label);
      }));
  },
  Modal: function (props) {
    PrimitiveCalls.Modal = (PrimitiveCalls.Modal || []).concat([props]);
    if (props.open !== true) return null;
    return R.createElement("div", { className: "dsw-modal", role: "dialog", "data-testid": "details-modal" }, [
      R.createElement("h2", null, props.title),
      R.createElement("p", { className: "dsw-hint" }, props.description),
      props.children,
      R.createElement("div", { className: "dsw-modal-footer" }, [
        props.footer,
        R.createElement("button", { type: "button", className: "dsw-button dsw-modal-close", "aria-label": props.closeLabel, onClick: function () { return props.onClose(); } }, props.closeLabel)
      ])
    ]);
  },
  DisclosureRow: function (props) {
    PrimitiveCalls.DisclosureRow = (PrimitiveCalls.DisclosureRow || []).concat([props]);
    var head = [
      props.icon,
      R.createElement("span", { className: "dsw-disclosure-title" }, props.title),
      props.collapsedContent
    ];
    return R.createElement("div", { className: "dsw-disclosure", "data-open": String(props.open === true) }, [
      R.createElement("div", {
        className: "dsw-disclosure-head",
        role: "button",
        tabIndex: 0,
        "aria-expanded": String(props.open === true),
        "aria-label": props.title,
        onClick: function () { return props.onToggle(); }
      }, head),
      props.open === true ? props.children : null
    ]);
  },
  IconApiOutlineRegular: function (props) { PrimitiveCalls.IconApiOutlineRegular = true; return R.createElement("span", { className: "dsw-icon", "data-icon": "api" }); },
  IconTrashOutlineRegular: function (props) { PrimitiveCalls.IconTrashOutlineRegular = true; return R.createElement("span", { className: "dsw-icon", "data-icon": "trash" }); },
  IconPlusOutlineRegular: function (props) { PrimitiveCalls.IconPlusOutlineRegular = true; return R.createElement("span", { className: "dsw-icon", "data-icon": "plus" }); },
  IconChevronUpOutlineRegular: function (props) { PrimitiveCalls.IconChevronUpOutlineRegular = true; return R.createElement("span", { className: "dsw-icon", "data-icon": "chevron-up" }); },
  IconChevronDownOutlineRegular: function (props) { PrimitiveCalls.IconChevronDownOutlineRegular = true; return R.createElement("span", { className: "dsw-icon", "data-icon": "chevron-down" }); }
};

// ---- Mock DSH context -----------------------------------------------------
var localeStore = {};
var t = function (key, params) {
  var text = (localeStore["um-dsh-websearch"] && localeStore["um-dsh-websearch"].zh && localeStore["um-dsh-websearch"].zh[key]) || key;
  if (params === undefined) return text;
  return text.replace(/\\{(\\w+)\\}/g, function (match, name) {
    return params[name] === undefined ? match : String(params[name]);
  });
};

var snapshot = ${JSON.stringify(snapshot)};
var scopeCalls = [];
var credSetCalls = [];
var describeCalls = [];
var credentials = ${JSON.stringify({
	UM_WS_EXA_API_KEY: "sk-stored-exa",
	UM_WS_PARALLEL_API_KEY: "sk-stored-parallel",
	UM_WS_DEEPSEEK_API_KEY: "sk-stored-deepseek"
})};
var readonlyRefs = [];
var rejectMutations = false;
var listeners = [];
var served = true;
// A spec may pre-seed the harness through addInitScript before the module boots.
if (window.__umTestConfig && window.__umTestConfig.served === false) served = false;
var watchers = [];
var registrations = [];
var injectCalls = [];
var events = {};

function applyOps(value, ops) {
  var next = JSON.parse(JSON.stringify(value));
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    var path = op.path.slice();
    var last = path.pop();
    var target = next;
    for (var j = 0; j < path.length; j++) {
      if (target[path[j]] === undefined) target[path[j]] = {};
      target = target[path[j]];
    }
    if (op.op === "unset") delete target[last];
    else target[last] = JSON.parse(JSON.stringify(op.value));
  }
  return next;
}
function notify() {
  for (var i = 0; i < listeners.slice().length; i++) listeners[i]();
}
var scope = {
  getSnapshot: function () { return snapshot; },
  subscribe: function (listener) { listeners.push(listener); return function () {}; },
  mutate: function (ops, expectedRevision) {
    scopeCalls.push({ ops: JSON.parse(JSON.stringify(ops)), expectedRevision: expectedRevision });
    if (rejectMutations) return Promise.resolve(false);
    snapshot = { status: snapshot.status, writable: snapshot.writable, mode: snapshot.mode, base: snapshot.base, user: snapshot.user, revision: (snapshot.revision || 0) + 1, value: applyOps(snapshot.value, ops) };
    notify();
    return Promise.resolve(true);
  },
  set: function (field, value) { return scope.mutate([{ op: "set", path: [field], value: value }], snapshot.revision); },
  unset: function (field) { return scope.mutate([{ op: "unset", path: [field] }], snapshot.revision); }
};
var credentialsApi = {
  describe: function (refs) {
    describeCalls.push(refs.slice());
    var views = {};
    for (var i = 0; i < refs.length; i++) {
      views[refs[i]] = { configured: Object.prototype.hasOwnProperty.call(credentials, refs[i]), writable: readonlyRefs.indexOf(refs[i]) < 0 };
    }
    return Promise.resolve({ ok: true, value: views });
  },
  set: function (ref, value) {
    credSetCalls.push([ref, value]);
    credentials[ref] = value;
    return Promise.resolve();
  }
};
var ctx = {
  locale: {
    bind: function (ns) { return t; },
    register: function (ns, dictionaries) { localeStore[ns] = dictionaries; return function () { delete localeStore[ns]; }; }
  },
  configForms: {
    get: function (entryId) { window.__testLog.configFormsGet.push(entryId); return scope; },
    whileServed: function (namespaces, register) {
      window.__testLog.whileServedCalls.push(namespaces.slice());
      var live = null;
      var sync = function () {
        if (served && live === null) live = register({ namespaces: namespaces.slice() }) || null;
        else if (!served && live !== null) { var dispose = live; live = null; if (dispose) dispose(); }
      };
      sync();
      watchers.push(sync);
      return function () {};
    }
  },
  slots: {
    inject: function (slot, register) { injectCalls.push(slot); return register(); },
    register: function (descriptor, component) {
      var entry = { descriptor: descriptor, component: component };
      registrations.push(entry);
      return function () {
        var index = registrations.indexOf(entry);
        if (index >= 0) registrations.splice(index, 1);
      };
    }
  },
  remote: {
    credentials: credentialsApi,
    $on: function (event, handler) {
      events[event] = handler;
      return function () { delete events[event]; };
    }
  },
  effect: function (callback, label) {
    var cleanup = callback();
    window.__testLog.effects.push(label);
    return function () { if (typeof cleanup === "function") cleanup(); };
  }
};

window.__testLog = {
  renders: 0,
  scopeCalls: scopeCalls,
  credSetCalls: credSetCalls,
  describeCalls: describeCalls,
  credentials: credentials,
  readonlyRefs: readonlyRefs,
  effects: [],
  injectCalls: injectCalls,
  whileServedCalls: [],
  configFormsGet: [],
  localeStore: localeStore,
  primitiveCalls: PrimitiveCalls,
  events: events,
  emit: function (event, payload) { if (events[event]) events[event](payload); },
  setServed: function (next) {
    served = next;
    for (var i = 0; i < watchers.length; i++) watchers[i]();
    mountCard();
  },
  setRejectMutations: function (next) { rejectMutations = next; },
  registration: function () { return registrations.length === 0 ? null : registrations[0]; },
  state: function () { return registrations.length === 0 ? null : registrations[0].descriptor.inject().hooks.umWebSearchCard.getSnapshot(); },
  setView: function (view) {
    if (rootProps === null) return;
    rootProps.view = view;
    R.setProps(rootProps);
  },
  edit: function (field, text) { rootProps.edit(field, text); },
  save: function () { return rootProps.save(); },
  discard: function () { return rootProps.discard(); },
  ready: false
};

// ---- Boot the shipped module ---------------------------------------------
var modules = { react: R, "react/jsx-runtime": R, "@deepseek-ai/dsh-client-ui-primitives": Primitives };
var factory = null;
window.__ModuleLoader__ = { load: function (definition) { factory = definition.factory; } };
var source = ${JSON.stringify(source)};
new Function("window", "require", source)(window, function (name) {
  if (modules[name] === undefined) throw new Error("unstubbed module edge " + name);
  return modules[name];
});
var cardModule = factory(function (name) { return modules[name]; });
window.__testLog.module = cardModule;
cardModule.apply(ctx);

// ---- Mount ----------------------------------------------------------------
// The card only registers while the Host serves the namespace, so the mount is
// deferred: a page booted unserved still finishes booting (ready=true) and
// mounts as soon as setServed(true) registers the page.
var rootProps = null;
function mountCard() {
  if (rootProps !== null) return true;
  var entry = registrations[0];
  if (entry === undefined) return false;
  var face = entry.descriptor.inject();
  rootProps = {
    view: "page",
    t: t,
    edit: function (field, text) { entry.descriptor.inject().edit(field, text); R.rerender(); },
    resetField: function (field) { entry.descriptor.inject().resetField(field); R.rerender(); },
    save: function () { return entry.descriptor.inject().save(); },
    discard: function () { entry.descriptor.inject().discard(); R.rerender(); },
    // The card's snapshot store publishes through this hook, so the
    // subscription must schedule a re-render: a staged edit only shows up once
    // the page repaints.
    useUmWebSearchCard: function (selector) {
      return R.useSyncExternalStore(
        function (listener) { return face.hooks.umWebSearchCard.subscribe(listener); },
        function () { return selector(face.hooks.umWebSearchCard.getSnapshot()); }
      );
    }
  };
  R.mount(entry.component, rootProps, document.getElementById("card-root"));
  return true;
}
mountCard();
window.__testLog.ready = true;
</script>
</body>
</html>
`;

const target = join(FIXTURES, "card.html");
writeFileSync(target, html, "utf8");
console.log(target);
