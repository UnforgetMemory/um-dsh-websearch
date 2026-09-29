import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Browser-half suite for `um-dsh-websearch` (ADR-0006 D3): the row's settings
 * card is the OFFICIAL `SettingsForm` over the `um-web-search` settings
 * namespace, so this suite asserts the card's contract with the primitives,
 * with `configForms`, and with `remote.credentials` — not the retired bespoke
 * DOM.
 *
 * The harness is the old suite's technique kept intact: one real component call
 * per frame over a minimal React stub, a stub primitives module whose
 * components record their props, and the shipped `lib/client.js` evaluated
 * through its `window.__ModuleLoader__` wrapper.
 *
 * The one piece that is NOT a bare prop recorder is `SettingsFormModel` (and
 * its two field specs): the real one cannot be imported here because the
 * published bundle imports CSS modules and `@deepseek-ai/dsh-client-store`,
 * neither of which resolves outside a browser bundle. The copy below mirrors
 * `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2` `lib/index.js:7104-7377`
 * line for line, because the card's staged-draft semantics (one `mutate` for
 * every scalar op, blank write-only drafts dropped, the staged baseline as the
 * revision fence) ARE what these tests assert.
 */

// ---- Minimal React stub: enough surface for one real component call per frame. ----
let frame = null;
let current = null;
function beginFrame(seedStates) {
	frame = { states: seedStates ?? [], effects: [], refs: [], idx: 0 };
	current = { text: [], nodes: [], components: {} };
}
/** Record one primitive component's props for the assertions of one render. */
function record(name, props) {
	(current.components[name] ??= []).push(props);
}
/** Build an element the way `react/jsx-runtime` does: children ride in props. */
function element(type, config, key) {
	const props = { ...(config ?? {}) };
	const raw = props.children;
	const children = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
	return { type, props, children, key: key ?? props.key };
}
const React = {
	Fragment: Symbol.for("react.fragment"),
	createElement(type, props, ...kids) {
		return element(type, kids.length === 0 ? props : { ...(props ?? {}), children: kids });
	},
	useState(init) {
		const i = frame.idx++;
		if (!(i in frame.states)) frame.states[i] = typeof init === "function" ? init() : init;
		return [frame.states[i], (next) => {
			frame.states[i] = typeof next === "function" ? next(frame.states[i]) : next;
		}];
	},
	useEffect(fn) {
		frame.effects.push(fn);
	},
	useRef(init) {
		const i = frame.idx++;
		if (!(i in frame.refs)) frame.refs[i] = { current: init };
		return frame.refs[i];
	},
	useSyncExternalStore(_subscribe, getSnapshot) {
		return getSnapshot();
	}
};
const jsxRuntime = {
	Fragment: React.Fragment,
	jsx: (type, config, key) => element(type, config, key),
	jsxs: (type, config, key) => element(type, config, key)
};

// ---- SettingsFormModel: mirror of the official primitives' form model. ----
/** Whole-number field spec. Mirrors `settingsNumberField` (lib/index.js:7110). */
function settingsNumberField(field) {
	return {
		field,
		format: (value) => (typeof value === "number" ? String(value) : ""),
		parse: (text) => {
			const trimmed = text.trim();
			if (trimmed === "") return { kind: "clear" };
			const parsed = Number(trimmed);
			return Number.isFinite(parsed) ? { kind: "set", value: parsed } : undefined;
		}
	};
}
/** Free-text field spec. Mirrors `settingsTextField` (lib/index.js:7131). */
function settingsTextField(field) {
	return {
		field,
		format: (value) => (typeof value === "string" ? value : ""),
		parse: (text) => {
			const trimmed = text.trim();
			return trimmed === "" ? { kind: "clear" } : { kind: "set", value: trimmed };
		}
	};
}
/** The snapshot store `bind` publishes through. */
function createSnapshotStore(initial) {
	let snapshot = initial;
	const listeners = new Set();
	return {
		getSnapshot: () => snapshot,
		set(next) {
			if (next === snapshot) return;
			snapshot = next;
			for (const listener of [...listeners]) listener();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
/** Staged edits over one scope. Mirrors `SettingsFormModel` (lib/index.js:7151). */
class SettingsFormModel {
	constructor(scope, specs, secrets = []) {
		this.scope = scope;
		this.specs = new Map(specs.map((spec) => [spec.field, spec]));
		this.secretSpecs = new Map(secrets.map((spec) => [spec.field, spec]));
		this.staged = new Map();
		this.listeners = new Set();
		this.saving = false;
		this.failed = false;
		this.unsubscribe = scope.subscribe(() => this.publish());
	}
	bind(project) {
		const store = createSnapshotStore(project());
		this.listeners.add(() => store.set(project()));
		return store;
	}
	shell() {
		const snapshot = this.scope.getSnapshot();
		const plan = this.plan();
		return {
			available: snapshot.status === "ready",
			writable: snapshot.writable,
			dirty: plan.length > 0,
			invalid: plan.some((item) => item.run === undefined && item.op === undefined),
			saving: this.saving,
			failed: this.failed
		};
	}
	field(field) {
		const staged = this.staged.get(field);
		if (this.secretSpecs.has(field)) return { text: staged?.text ?? "", overridden: false, invalid: false };
		const spec = this.spec(field);
		if (staged === undefined) {
			return { text: spec.format(this.sectionValue(field)), overridden: this.stored(field), invalid: false };
		}
		const write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
		return { text: staged.text, overridden: write?.kind === "set", invalid: write === undefined };
	}
	actions() {
		return {
			edit: (field, text) => this.stage(field, { text, clear: false }),
			resetField: (field) => this.stage(field, { text: this.spec(field).format(this.baseValue(field)), clear: true }),
			save: () => this.save(),
			discard: () => {
				if (this.staged.size === 0 && !this.failed) return;
				this.staged.clear();
				this.baseline = undefined;
				this.failed = false;
				this.publish();
			}
		};
	}
	async save() {
		const plan = this.plan();
		if (!plan.length || this.saving || !this.scope.getSnapshot().writable || plan.some((item) => item.run === undefined && item.op === undefined)) return;
		this.saving = true;
		this.failed = false;
		this.publish();
		try {
			const ops = plan.flatMap((item) => (item.op === undefined ? [] : [item.op]));
			let landed = !ops.length || (await this.scope.mutate(ops, this.baseline?.revision));
			if (!landed) {
				this.failed = true;
				return;
			}
			for (const item of plan) if (item.run) landed = (await item.run()) && landed;
			if (landed) {
				this.staged.clear();
				this.baseline = undefined;
			}
			this.failed = !landed;
		} catch {
			this.failed = true;
		} finally {
			this.saving = false;
			this.publish();
		}
	}
	dispose() {
		this.unsubscribe();
		this.listeners.clear();
	}
	plan() {
		const plan = [];
		for (const [field, staged] of this.staged) {
			const secret = this.secretSpecs.get(field);
			if (secret !== undefined) {
				const value = staged.text.trim();
				if (value !== "") plan.push({ field, run: () => secret.write(value) });
				continue;
			}
			const spec = this.spec(field);
			if (staged.clear) {
				if (this.stored(field)) plan.push({ field, op: { op: "unset", path: [field] } });
				continue;
			}
			if (staged.text === spec.format(this.sectionValue(field))) continue;
			const write = spec.parse(staged.text);
			if (write === undefined) plan.push({ field });
			else if (write.kind === "clear") plan.push({ field, op: { op: "unset", path: [field] } });
			else plan.push({ field, op: { op: "set", path: [field], value: write.value } });
		}
		return plan;
	}
	stage(field, edit) {
		this.baseline ??= this.scope.getSnapshot();
		this.staged.set(field, edit);
		this.failed = false;
		this.publish();
	}
	spec(field) {
		const spec = this.specs.get(field);
		if (spec === undefined) throw new Error(`plugin card has no field ${field}`);
		return spec;
	}
	sectionValue(field) {
		return this.scope.getSnapshot().value?.[field];
	}
	baseValue(field) {
		return this.scope.getSnapshot().base?.[field];
	}
	stored(field) {
		const user = this.scope.getSnapshot().user;
		return user !== undefined && Object.hasOwn(user, field);
	}
	publish() {
		for (const listener of this.listeners) listener();
	}
}

// ---- Primitives stub: simple functions recording their props. ----
const host = (type, props, children) => ({ type, props: { ...props, children }, children });
const icon = (name) => (props) => {
	record(name, props);
	return host("span", { "data-icon": name }, []);
};
const Primitives = {
	SettingsFormModel,
	settingsTextField,
	settingsNumberField,
	/** Mirrors the official form's unavailable/read-only notices and its save gate. */
	SettingsForm(props) {
		record("SettingsForm", props);
		if (!props.state.available) return host("p", { className: "settingsForm-unavailable" }, [props.labels.unavailable]);
		const blocked = !props.state.dirty || props.state.invalid || props.state.saving;
		return host("div", { className: "settingsForm" }, [
			props.state.writable ? null : host("p", { className: "settingsForm-readOnly" }, [props.labels.readOnly]),
			props.children,
			props.state.failed ? host("p", { className: "settingsForm-failed" }, [props.labels.saveFailed]) : null,
			host("button", { className: "settingsForm-save", disabled: blocked, onClick: props.onSave }, [
				props.state.saving ? props.labels.saving : props.labels.save
			])
		]);
	},
	SettingsValueField(props) {
		record("SettingsValueField", props);
		return host("div", { className: "settingsValueField" }, [
			props.label,
			props.text,
			props.overridden ? props.resetLabel : null,
			props.invalid ? props.invalidLabel : props.hint
		]);
	},
	SettingsSecretField(props) {
		record("SettingsSecretField", props);
		return host("div", { className: "settingsSecretField" }, [props.label, props.text, props.stateLabel, props.hint]);
	},
	Switch(props) {
		record("Switch", props);
		return host("span", { className: "switch" }, []);
	},
	Button(props) {
		record("Button", props);
		return host("button", { className: "button", disabled: props.disabled, onClick: props.onClick }, [props.children]);
	},
	Tag(props) {
		record("Tag", props);
		return host("span", { className: "tag" }, [props.children]);
	},
	SegmentedControl(props) {
		record("SegmentedControl", props);
		return host("span", { className: "segmented" }, [props.label]);
	},
	SegmentedTabs(props) {
		record("SegmentedTabs", props);
		return host("span", { className: "segmentedTabs" }, []);
	},
	Input(props) {
		record("Input", props);
		return host("input", { className: "input" }, []);
	},
	Pill(props) {
		record("Pill", props);
		return host("span", { className: "pill" }, [props.children]);
	},
	/** Mirrors the official modal: nothing renders while it is closed. */
	Modal(props) {
		record("Modal", props);
		if (!props.open) return null;
		return host("div", { className: "modal" }, [props.title, props.description, props.children, props.footer]);
	},
	DisclosureRow(props) {
		record("DisclosureRow", props);
		return host("div", { className: "disclosure" }, [props.icon, props.title, props.collapsedContent, props.open ? props.children : null]);
	},
	IconApiOutlineRegular: icon("IconApiOutlineRegular"),
	IconTrashOutlineRegular: icon("IconTrashOutlineRegular"),
	IconPlusOutlineRegular: icon("IconPlusOutlineRegular"),
	IconChevronUpOutlineRegular: icon("IconChevronUpOutlineRegular"),
	IconChevronDownOutlineRegular: icon("IconChevronDownOutlineRegular")
};

// ---- Browser globals: the module loader wrapper and a network guard. ----
const loads = [];
const required = [];
let factory = null;
const browserWindow = {
	__ModuleLoader__: {
		load(definition) {
			loads.push(definition);
			factory = definition.factory;
		}
	}
};
const modules = { react: React, "react/jsx-runtime": jsxRuntime, "@deepseek-ai/dsh-client-ui-primitives": Primitives };
function requireModule(name) {
	required.push(name);
	const loaded = modules[name];
	assert.ok(loaded !== undefined, `unstubbed module edge ${name}`);
	return loaded;
}
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
let fetches = 0;
globalThis.window = browserWindow;
globalThis.fetch = (...args) => {
	fetches += 1;
	return originalFetch(...args);
};
after(() => {
	globalThis.window = originalWindow;
	globalThis.fetch = originalFetch;
});

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
new Function("window", "require", source)(browserWindow, requireModule);
const cardModule = factory(requireModule);

// ---- Fixtures. ----
const KEY_REF = "UM_WS_EXA_API_KEY";
const keyRef = (ref, overrides = {}) => ({ ref, enabled: true, allowFreeToPaid: false, allowPaidToFree: false, ...overrides });
const exaProvider = (overrides = {}) => ({
	id: "exa", name: "Exa", enabled: true, primaryTier: "paid",
	paid: { enabled: true, baseURL: "https://api.exa.ai" },
	free: { enabled: false, baseURL: "https://mcp.exa.ai/mcp" },
	keys: [], keysStrategy: "ordered", numResults: 5, params: { searchType: "auto" },
	...overrides
});
const parallelProvider = (overrides = {}) => ({
	id: "parallel", name: "Parallel", enabled: false, primaryTier: "paid",
	paid: { enabled: false, baseURL: "https://api.parallel.ai" },
	free: { enabled: false, baseURL: "https://search.parallel.ai/mcp" },
	keys: [], keysStrategy: "ordered", numResults: 10, params: { mode: "fast" },
	...overrides
});
const deepseekProvider = (overrides = {}) => ({
	id: "deepseek", name: "DeepSeek Official", enabled: false, primaryTier: "paid",
	paid: { enabled: false, baseURL: "https://api.deepseek.com/anthropic/v1" },
	free: { enabled: false, baseURL: "" },
	keys: [], keysStrategy: "ordered", numResults: 5, params: { model: "deepseek-v4-flash" },
	...overrides
});
const trio = () => [exaProvider(), parallelProvider(), deepseekProvider()];

/** One scope snapshot: composition base, stored user layer, resolved value. */
function makeSnapshot({
	status = "ready", writable = true, revision = 7,
	enabled = false, defaultProvider = "exa", concurrency = 1,
	cache = { enabled: false, ttlSeconds: 60 }, providers = trio(),
	base = { enabled: true }, user = { enabled: false }
} = {}) {
	return { status, writable, revision, mode: "host", value: { enabled, defaultProvider, concurrency, cache, providers }, base, user };
}
/** A snapshot whose exa provider already names one credential reference. */
const snapshotWithKey = (ref = KEY_REF) =>
	makeSnapshot({ providers: [exaProvider({ keys: [keyRef(ref)] }), parallelProvider(), deepseekProvider()] });

// ---- Scope (configForms.get(entryId) face). ----
/** Apply one `set`/`unset` path op list to a section value. */
function applyOps(value, ops) {
	const next = structuredClone(value);
	for (const op of ops) {
		const path = [...op.path];
		const last = path.pop();
		let target = next;
		for (const step of path) {
			if (target[step] === undefined) target[step] = {};
			target = target[step];
		}
		if (op.op === "unset") delete target[last];
		else target[last] = structuredClone(op.value);
	}
	return next;
}
function makeScope(initial, control) {
	let snapshot = initial;
	const listeners = new Set();
	const mutations = [];
	const notify = () => {
		for (const listener of [...listeners]) listener();
	};
	const scope = {
		getSnapshot: () => snapshot,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async mutate(ops, expectedRevision) {
			mutations.push({ ops: structuredClone(ops), expectedRevision });
			if (control.reject) return false;
			snapshot = { ...snapshot, value: applyOps(snapshot.value, ops) };
			notify();
			return true;
		},
		async set(field, value) {
			return scope.mutate([{ op: "set", path: [field], value }], snapshot.revision);
		},
		async unset(field) {
			return scope.mutate([{ op: "unset", path: [field] }], snapshot.revision);
		}
	};
	return {
		scope,
		mutations,
		commit(value) {
			snapshot = { ...snapshot, value, revision: (snapshot.revision ?? 0) + 1 };
			notify();
		}
	};
}

// ---- Harness: the five injected services, wired the way the Host wires them. ----
function makeHarness(options = {}) {
	const lang = options.lang ?? "en";
	const control = { reject: options.rejectMutations === true };
	const bundles = {};
	const registerCalls = [];
	const t = (key, params) => {
		const text = bundles[cardModule.NS]?.[lang]?.[key] ?? key;
		return params === undefined ? text : text.replace(/\{(\w+)\}/gu, (match, name) => (params[name] === undefined ? match : String(params[name])));
	};
	const locale = {
		bind: (ns) => {
			locale.bindCalls.push(ns);
			return t;
		},
		bindCalls: [],
		register: (ns, dictionaries) => {
			registerCalls.push([ns, dictionaries]);
			bundles[ns] = dictionaries;
			return () => {
				delete bundles[ns];
			};
		}
	};
	const { scope, mutations, commit } = makeScope(options.snapshot ?? makeSnapshot(), control);
	const getCalls = [];
	const whileServedCalls = [];
	const watchers = [];
	let served = options.served !== false;
	const configForms = {
		get(entryId) {
			getCalls.push(entryId);
			return scope;
		},
		whileServed(namespaces, register) {
			whileServedCalls.push([...namespaces]);
			let live = null;
			const sync = () => {
				if (served && live === null) live = register(new Set(namespaces)) ?? null;
				else if (!served && live !== null) {
					const dispose = live;
					live = null;
					dispose?.();
				}
			};
			sync();
			watchers.push(sync);
			return () => {
				const index = watchers.indexOf(sync);
				if (index >= 0) watchers.splice(index, 1);
				if (live !== null) {
					const dispose = live;
					live = null;
					dispose?.();
				}
			};
		}
	};
	const registrations = [];
	const injectCalls = [];
	const slots = {
		inject(slot, register) {
			injectCalls.push(slot);
			return register();
		},
		register(descriptor, component) {
			const entry = { descriptor, component };
			registrations.push(entry);
			return () => {
				const index = registrations.indexOf(entry);
				if (index >= 0) registrations.splice(index, 1);
			};
		}
	};
	const credentialsStore = new Map(Object.entries(options.credentials ?? {}));
	const describeCalls = [];
	const setCalls = [];
	const events = [];
	const remote = {
		credentials: {
			async describe(refs) {
				describeCalls.push([...refs]);
				if (options.describeThrows === true) throw new Error("credentials domain down");
				if (options.describeRefuses === true) return { ok: false, error: { code: "unavailable" } };
				return {
					ok: true,
					value: Object.fromEntries(
						refs.map((ref) => [ref, { configured: credentialsStore.has(ref), writable: options.readOnlyCredentials?.[ref] !== true }])
					)
				};
			},
			async set(ref, value) {
				setCalls.push([ref, value]);
				if (options.setThrows === true) throw new Error("credential write refused");
				credentialsStore.set(ref, value);
			}
		},
		$on(event, handler) {
			events.push({ event, handler });
			return () => {
				const index = events.findIndex((entry) => entry.handler === handler);
				if (index >= 0) events.splice(index, 1);
			};
		}
	};
	const effects = [];
	const ctx = {
		locale,
		configForms,
		slots,
		remote,
		effect(callback, label) {
			const cleanup = callback();
			effects.push({ label, cleanup });
			return () => {
				if (typeof cleanup === "function") cleanup();
			};
		}
	};
	cardModule.apply(ctx);
	const harness = {
		ctx, scope, mutations, commit, t, lang, credentialsStore,
		registrations, registerCalls, describeCalls, setCalls, events, effects, getCalls, whileServedCalls, injectCalls,
		locale,
		component: () => registrations[0]?.component,
		descriptor: () => registrations[0]?.descriptor,
		face: () => registrations[0].descriptor.inject(),
		state: () => harness.face().hooks.umWebSearchCard.getSnapshot(),
		event: (name) => events.find((entry) => entry.event === name)?.handler,
		setServed(next) {
			served = next;
			for (const sync of [...watchers]) sync();
		},
		dispose() {
			for (const { cleanup } of [...effects].reverse()) if (typeof cleanup === "function") cleanup();
		}
	};
	return harness;
}
/** One `setTimeout(…, 0)` flush for the card's fire-and-forget credential reads. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---- Traversal: one walk per render, recording text, host nodes, and props. ----
function invokeComponent(node) {
	const props = { ...node.props };
	// Real React consumes `key` for reconciliation: it never reaches props.
	delete props.key;
	return node.type(props, ...node.children);
}
function visit(node) {
	if (node === null || node === undefined || node === false || node === true) return;
	if (typeof node === "string" || typeof node === "number") {
		current.text.push(String(node));
		return;
	}
	if (Array.isArray(node)) {
		for (const child of node) visit(child);
		return;
	}
	if (typeof node !== "object") return;
	if (typeof node.type === "function") {
		visit(invokeComponent(node));
		return;
	}
	current.nodes.push(node);
	for (const child of node.children ?? []) visit(child);
}
/** Render the card once in a fresh frame and index the resulting tree. */
function renderCard(harness, options = {}) {
	beginFrame(options.seeds ?? []);
	const face = harness.face();
	const tree = harness.component()({
		view: options.view ?? "page",
		t: options.t ?? harness.t,
		...face,
		useUmWebSearchCard: (selector) => selector(face.hooks.umWebSearchCard.getSnapshot())
	});
	for (const effect of frame.effects) effect();
	visit(tree);
	return { tree, text: current.text, nodes: current.nodes, components: current.components, plain: current.text.join(" ") };
}
const propsOf = (view, name, match = () => true) => (view.components[name] ?? []).find(match);
const allProps = (view, name, match = () => true) => (view.components[name] ?? []).filter(match);
const saveButton = (view) => view.nodes.find((node) => node.type === "button" && node.props.className === "settingsForm-save");

/** Render the page and open the first provider's details modal. */
function openProvider(harness, options = {}) {
	const seeds = [null, null];
	let view = renderCard(harness, { seeds, ...options });
	const configure = allProps(view, "Button", (props) => props.children === harness.t("configure"))[options.index ?? 0];
	assert.ok(configure !== undefined, "the row offers a configure control");
	configure.onClick();
	return { seeds, view: renderCard(harness, { seeds, ...options }) };
}
/** Render the page, open one provider's details, and open one of its key rows. */
function openKeyRow(harness, ref, options = {}) {
	const { seeds, view } = openProvider(harness, options);
	if (ref === undefined) return { seeds, view };
	const row = propsOf(view, "DisclosureRow", (props) => props.title === ref);
	assert.ok(row !== undefined, `the key row ${ref} renders`);
	row.onToggle();
	return { seeds, view: renderCard(harness, { seeds, ...options }) };
}

// ---- module + registration -------------------------------------------------

test("module: the loader receives one definition for the package id over three module edges", () => {
	assert.equal(loads.length, 1);
	assert.equal(loads[0].id, "um-dsh-websearch");
	assert.equal(typeof loads[0].factory, "function");
	assert.deepEqual(required, ["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives"]);
	assert.equal(Object.prototype.toString.call(cardModule), "[object Module]", "the factory returns a module namespace object");
});

test("module: exports the namespace constants, the five services, and apply", () => {
	assert.equal(cardModule.SETTINGS_NS, "um-web-search");
	assert.equal(cardModule.NS, "um-dsh-websearch");
	assert.equal(cardModule.SLOT, "plugins.row.config");
	assert.equal(cardModule.ROW_KEY, "um-dsh-websearch#um-web-search");
	assert.deepEqual(cardModule.inject, ["slots", "locale", "configForms", "remote", "remote.credentials"]);
	assert.equal(cardModule.inject.length, 5, "exactly the five services the card reads");
	assert.equal(typeof cardModule.apply, "function");
	assert.deepEqual(Object.keys(cardModule).sort(), ["NS", "ROW_KEY", "SETTINGS_NS", "SLOT", "apply", "inject"]);
});

test("apply: asks configForms for the entry id and registers one row page on the served namespace", () => {
	const h = makeHarness();
	assert.deepEqual(h.getCalls, ["um-web-search"], "the settings namespace is the loader entry id");
	assert.deepEqual(h.whileServedCalls, [["um-web-search"]]);
	assert.deepEqual(h.injectCalls, ["plugins.row.config"]);
	assert.equal(h.registrations.length, 1, "exactly one page is registered");
	const { descriptor } = h.registrations[0];
	assert.equal(descriptor.name, "plugins.row.config");
	assert.equal(descriptor.key, "um-dsh-websearch#um-web-search");
	assert.equal(descriptor.locale, "um-dsh-websearch");
	assert.equal(descriptor.order, 60);
	assert.equal(descriptor.label(), "UM web search");
	const face = descriptor.inject();
	assert.deepEqual(Object.keys(face.hooks), ["umWebSearchCard"]);
	for (const action of ["edit", "resetField", "save", "discard"]) {
		assert.equal(typeof face[action], "function", `${action} is injected`);
	}
	assert.deepEqual(h.events.map((entry) => entry.event), ["credentials/reference-updated"]);
});

test("apply: the page exists only while the Host serves the settings namespace", () => {
	const h = makeHarness({ served: false });
	assert.deepEqual(h.whileServedCalls, [["um-web-search"]]);
	assert.equal(h.registrations.length, 0, "an unserved namespace registers nothing");
	assert.equal(h.injectCalls.length, 0, "and never touches the slot ledger");
	h.setServed(true);
	assert.equal(h.registrations.length, 1, "serving the namespace registers the page once");
	h.setServed(true);
	assert.equal(h.registrations.length, 1, "re-serving is idempotent");
	h.setServed(false);
	assert.equal(h.registrations.length, 0, "the page is disposed when the namespace goes away");
	h.setServed(true);
	assert.equal(h.registrations.length, 1, "and comes back when it returns");
});

test("apply: registers the bilingual dictionaries under the plugin namespace", () => {
	const h = makeHarness();
	assert.deepEqual(h.registerCalls.map(([ns]) => ns), ["um-dsh-websearch"], "the dictionary namespace is NOT the settings namespace");
	assert.equal(h.locale.bindCalls[0], "um-dsh-websearch");
	const [, dictionaries] = h.registerCalls[0];
	assert.deepEqual(Object.keys(dictionaries).sort(), ["en", "zh"]);
	assert.deepEqual(Object.keys(dictionaries.en), Object.keys(dictionaries.zh), "the two dictionaries cannot drift apart");
	assert.ok(Object.keys(dictionaries.en).length >= 60, "the card's whole surface is translated");
	for (const key of ["title", "summaryAllOff", "summaryOrder", "keyConfigured", "keyUnconfigured", "save", "saveFailed", "invalidNumber", "close"]) {
		assert.ok(key in dictionaries.en && key in dictionaries.zh, `${key} is translated in both languages`);
	}
	assert.equal(dictionaries.en.title, "UM web search");
	assert.equal(dictionaries.zh.title, "UM 网页搜索");
	assert.equal(dictionaries.en.summaryOrder, "Web search: {order} · concurrency {n}");
});

test("apply: the row label and the card copy come from the locale bound to the plugin namespace", () => {
	const en = makeHarness({ lang: "en" });
	assert.equal(en.descriptor().label(), "UM web search");
	const enView = renderCard(en);
	assert.match(enView.plain, /Enable web search/u);
	assert.match(enView.plain, /Providers/u);
	assert.match(enView.plain, /Save/u);
	const zh = makeHarness({ lang: "zh" });
	assert.equal(zh.descriptor().label(), "UM 网页搜索");
	const zhView = renderCard(zh);
	assert.match(zhView.plain, /启用网页搜索/u);
	assert.match(zhView.plain, /数据源/u);
	assert.match(zhView.plain, /保存/u);
	assert.ok(!zhView.plain.includes("Enable web search"), "en copy never leaks into the zh card");
});

test("apply: disposing the plugin tears the page down and stops publishing", () => {
	const h = makeHarness();
	const store = h.face().hooks.umWebSearchCard;
	const before = store.getSnapshot();
	h.commit({ ...h.scope.getSnapshot().value, concurrency: 4 });
	const after = store.getSnapshot();
	assert.notEqual(after, before, "a scope change republishes while the card lives");
	assert.equal(after.concurrency.text, "4");
	h.dispose();
	h.commit({ ...h.scope.getSnapshot().value, concurrency: 6 });
	assert.equal(store.getSnapshot(), after, "nothing publishes once the plugin is disposed");
	assert.equal(h.registrations.length, 0, "the row page is unregistered");
});

// ---- controller: the save path ---------------------------------------------

test("save: section scalars ride ONE mutate carrying both path ops and the scope revision", async () => {
	const h = makeHarness();
	const face = h.face();
	face.edit("defaultProvider", "  parallel  ");
	face.edit("concurrency", "3");
	await face.save();
	assert.equal(h.mutations.length, 1, "one mutation for every scalar op");
	assert.deepEqual(h.mutations[0].ops, [
		{ op: "set", path: ["defaultProvider"], value: "parallel" },
		{ op: "set", path: ["concurrency"], value: 3 }
	]);
	assert.equal(h.mutations[0].expectedRevision, 7, "the revision fence is the scope snapshot's revision");
	assert.equal(h.state().dirty, false, "an accepted save clears the drafts");
	assert.equal(h.state().defaultProvider.text, "parallel", "the accepted value is read back");
});

test("save: the whole provider list rides ONE providers path op, never per-element writes", async () => {
	const h = makeHarness();
	const face = h.face();
	const next = h.state().providers.map((provider) => ({ ...provider, enabled: provider.id !== "deepseek" }));
	face.edit("providers", JSON.stringify(next));
	await face.save();
	assert.equal(h.mutations.length, 1, "one mutation for the whole array");
	assert.equal(h.mutations[0].ops.length, 1, "and one single path op inside it");
	assert.equal(h.mutations[0].ops[0].op, "set");
	assert.deepEqual(h.mutations[0].ops[0].path, ["providers"], "the array is volatile as a whole: elements can never be");
	assert.deepEqual(
		h.mutations[0].ops[0].value.map((provider) => [provider.id, provider.enabled]),
		[["exa", true], ["parallel", true], ["deepseek", false]]
	);
	assert.equal(h.mutations[0].expectedRevision, 7);
});

test("save: cache rides one object op and enabled one boolean op", async () => {
	const h = makeHarness();
	const face = h.face();
	face.edit("cache", JSON.stringify({ enabled: true, ttlSeconds: 120 }));
	face.edit("enabled", "true");
	await face.save();
	assert.deepEqual(h.mutations.map((mutation) => mutation.ops), [
		[{ op: "set", path: ["cache"], value: { enabled: true, ttlSeconds: 120 } }],
		[{ op: "set", path: ["enabled"], value: true }]
	]);
	assert.ok(h.mutations.every((mutation) => mutation.expectedRevision === 7), "every write carries the same fence");
});

test("save: an out-of-range cache TTL clamps back to the default instead of writing garbage", async () => {
	const h = makeHarness();
	h.face().edit("cache", JSON.stringify({ enabled: true, ttlSeconds: "99999" }));
	await h.face().save();
	assert.deepEqual(h.mutations[0].ops[0].value, { enabled: true, ttlSeconds: 60 });
});

test("save: an emptied numeric draft clears the field with an unset op", async () => {
	const h = makeHarness();
	const face = h.face();
	face.edit("concurrency", "");
	await face.save();
	assert.deepEqual(h.mutations[0].ops, [{ op: "unset", path: ["concurrency"] }]);
});

test("save: a refused mutation surfaces as state.failed and keeps every draft", async () => {
	const h = makeHarness({ rejectMutations: true });
	const face = h.face();
	face.edit("enabled", "true");
	await face.save();
	assert.equal(h.mutations.length, 1);
	assert.equal(h.state().failed, true);
	assert.equal(h.state().dirty, true, "the draft stays so the user can correct it");
	assert.equal(h.state().enabled, true, "and the staged value stays on screen");
	assert.match(renderCard(h).plain, /did not accept these values/u);
});

test("discard: every staged draft is dropped and the form is clean again", () => {
	const h = makeHarness();
	const face = h.face();
	face.edit("defaultProvider", "parallel");
	face.edit("providers", JSON.stringify(h.state().providers.map((provider) => ({ ...provider, enabled: false }))));
	assert.equal(h.state().dirty, true);
	face.discard();
	assert.equal(h.state().dirty, false);
	assert.equal(h.state().defaultProvider.text, "exa");
	assert.deepEqual(h.state().providers.map((provider) => provider.enabled), [true, false, false]);
	assert.equal(h.mutations.length, 0, "discarding never writes");
});

// ---- controller: provider editing helpers ----------------------------------

test("providers: the row switch stages the toggled list and the save stores it", async () => {
	const h = makeHarness();
	const seeds = [];
	let view = renderCard(h, { seeds });
	const exaSwitch = propsOf(view, "Switch", (props) => props.label === "Exa");
	assert.equal(exaSwitch.checked, true);
	exaSwitch.onChange(false);
	view = renderCard(h, { seeds });
	assert.equal(propsOf(view, "Switch", (props) => props.label === "Exa").checked, false, "the row reflects the staged toggle");
	assert.ok(propsOf(view, "Tag", (props) => props.children === h.t("roleOff")) !== undefined, "the role badge follows");
	await h.face().save();
	assert.deepEqual(
		h.mutations[0].ops[0].value.map((provider) => [provider.id, provider.enabled]),
		[["exa", false], ["parallel", false], ["deepseek", false]]
	);
});

test("providers: move down/up swaps the fallback order and the edges are inert", async () => {
	const h = makeHarness();
	const seeds = [];
	let view = renderCard(h, { seeds });
	const down = allProps(view, "Button", (props) => props["aria-label"] === "Move down");
	assert.equal(down.length, 3, "every row carries both order controls");
	assert.equal(down[0].disabled, false);
	assert.equal(allProps(view, "Button", (props) => props["aria-label"] === "Move up")[0].disabled, true, "the head cannot move up");
	assert.equal(down[2].disabled, true, "the tail cannot move down");
	down[0].onClick();
	view = renderCard(h, { seeds });
	assert.deepEqual(h.state().providers.map((provider) => provider.id), ["parallel", "exa", "deepseek"]);
	allProps(view, "Button", (props) => props["aria-label"] === "Move up")[0].onClick();
	assert.deepEqual(h.state().providers.map((provider) => provider.id), ["parallel", "exa", "deepseek"], "an out-of-range move is a no-op");
	await h.face().save();
	assert.deepEqual(h.mutations[0].ops[0].value.map((provider) => provider.id), ["parallel", "exa", "deepseek"]);
});

test("providers: adding a key auto-generates the next credential reference", () => {
	const h = makeHarness({ snapshot: snapshotWithKey() });
	const { seeds, view } = openProvider(h);
	const add = propsOf(view, "Button", (props) => props.children === h.t("addKey"));
	assert.ok(add !== undefined, "the key section offers an add control");
	add.onClick();
	const second = renderCard(h, { seeds });
	assert.deepEqual(h.state().providers[0].keys.map((key) => key.ref), [KEY_REF, `${KEY_REF}_1`], "the second key takes the next free suffix");
	const newRow = propsOf(second, "DisclosureRow", (props) => props.title === `${KEY_REF}_1`);
	assert.equal(newRow.open, true, "the new row opens for the value the user is about to type");
	propsOf(second, "Button", (props) => props.children === h.t("addKey")).onClick();
	const third = renderCard(h, { seeds });
	assert.deepEqual(h.state().providers[0].keys.map((key) => key.ref), [KEY_REF, `${KEY_REF}_1`, `${KEY_REF}_2`]);
	assert.match(third.plain, new RegExp(KEY_REF, "u"));
});

test("providers: a provider with no built-in base still gets a UM_WS_ reference", () => {
	const custom = exaProvider({ id: "my-source", name: "My Source" });
	const h = makeHarness({ snapshot: makeSnapshot({ providers: [custom, parallelProvider(), deepseekProvider()] }) });
	const { view } = openProvider(h);
	propsOf(view, "Button", (props) => props.children === h.t("addKey")).onClick();
	assert.deepEqual(h.state().providers[0].keys.map((key) => key.ref), ["UM_WS_MY_SOURCE_API_KEY"]);
});

test("providers: the per-key fallback switches patch that entry of the staged array", async () => {
	const h = makeHarness({ snapshot: snapshotWithKey() });
	await flush();
	const { seeds, view } = openKeyRow(h, KEY_REF);
	// Every interaction starts from a fresh render: a control's handler closes
	// over the list it was rendered with, so clicking two from one stale tree
	// would drop the first edit.
	const toggle = (label, next) => propsOf(renderCard(h, { seeds }), "Switch", (props) => props.label === label).onChange(next);
	assert.equal(propsOf(view, "Switch", (props) => props.label === h.t("allowPaidToFree")).checked, false);
	toggle(h.t("allowPaidToFree"), true);
	toggle(h.t("allowFreeToPaid"), true);
	toggle(h.t("keyEnabled"), false);
	const next = renderCard(h, { seeds });
	assert.deepEqual(h.state().providers[0].keys[0], { ref: KEY_REF, enabled: false, allowFreeToPaid: true, allowPaidToFree: true });
	assert.match(next.plain, new RegExp(KEY_REF, "u"), "the generated reference is the row title, never the reserved React key");
	await h.face().save();
	assert.deepEqual(h.mutations[0].ops[0].value[0].keys, [{ ref: KEY_REF, enabled: false, allowFreeToPaid: true, allowPaidToFree: true }]);
});

test("providers: tier, key strategy, and result-count edits stage and coerce on save", async () => {
	const h = makeHarness();
	const { seeds, view } = openProvider(h);
	const strategy = propsOf(view, "SegmentedControl", (props) => props.id === "um-ws-keys-strategy");
	assert.equal(strategy.value, "ordered");
	assert.deepEqual(strategy.options.map((option) => option.value), ["ordered", "random"]);
	strategy.onChange("random");
	propsOf(renderCard(h, { seeds }), "SegmentedControl", (props) => props.id === "um-ws-primary-tier").onChange("free");
	propsOf(renderCard(h, { seeds }), "SettingsValueField", (props) => props.id === "um-ws-num-results-exa").onEdit("15");
	assert.equal(h.state().providers[0].numResults, "15", "a half-typed draft echoes verbatim");
	await h.face().save();
	const [exa] = h.mutations[0].ops[0].value;
	assert.equal(exa.keysStrategy, "random");
	assert.equal(exa.primaryTier, "free");
	assert.equal(exa.free.enabled, true, "choosing the free primary tier switches that tier on");
	assert.equal(exa.numResults, 15, "the typed string lands as a number");
});

test("providers: tier switches and base URL drafts stage, and the save trims the URLs", async () => {
	const h = makeHarness();
	const { seeds } = openProvider(h);
	const toggle = (label, next) => propsOf(renderCard(h, { seeds }), "Switch", (props) => props.label === label).onChange(next);
	const edit = (id, text) => propsOf(renderCard(h, { seeds }), "SettingsValueField", (props) => props.id === id).onEdit(text);
	toggle(h.t("paidEnabled"), false);
	toggle(h.t("freeEnabled"), true);
	edit("um-ws-paid-url-exa", "  https://api.exa.ai/v2  ");
	edit("um-ws-free-url-exa", " https://mcp.exa.ai/mcp ");
	await h.face().save();
	const [exa] = h.mutations[0].ops[0].value;
	assert.equal(exa.paid.enabled, false);
	assert.equal(exa.free.enabled, true);
	assert.equal(exa.paid.baseURL, "https://api.exa.ai/v2");
	assert.equal(exa.free.baseURL, "https://mcp.exa.ai/mcp");
});

test("providers: the details modal renders one picker per provider and the close footer", () => {
	const h = makeHarness();
	const { seeds, view } = openProvider(h);
	const modal = propsOf(view, "Modal");
	assert.equal(modal.open, true);
	assert.equal(modal.title, "Provider details");
	assert.equal(modal.description, "Tiers, keys, endpoints, and parameters for one provider.");
	assert.equal(modal.closeLabel, "Close");
	assert.ok(modal.footer !== undefined, "the modal carries its own close control");
	const picker = propsOf(view, "SegmentedControl", (props) => props.id === "um-ws-provider-picker");
	assert.deepEqual(picker.options.map((option) => option.value), ["exa", "parallel", "deepseek"]);
	picker.onChange("deepseek");
	const switched = renderCard(h, { seeds });
	assert.equal(propsOf(switched, "SettingsValueField", (props) => props.id === "um-ws-param-deepseek-model").text, "deepseek-v4-flash");
	assert.match(switched.plain, /DeepSeek Official/u);
});

// ---- controller: credentials ------------------------------------------------

test("keys: describe drives the configured badge and the writability of the value control", async () => {
	const h = makeHarness({ snapshot: snapshotWithKey(), credentials: { [KEY_REF]: "stored-key" } });
	await flush();
	assert.deepEqual(h.describeCalls, [[KEY_REF]], "the card asks about exactly the references its list names");
	assert.deepEqual(h.state().credentials[KEY_REF], { configured: true, writable: true });
	const { view } = openKeyRow(h, KEY_REF);
	const secret = propsOf(view, "SettingsSecretField", (props) => props.id === `um-ws-key-exa-${KEY_REF}`);
	assert.equal(secret.configured, true);
	assert.equal(secret.stateLabel, "Configured");
	assert.equal(secret.disabled, false);
	assert.equal(secret.text, "", "the value never rides a response: the control starts blank");
	assert.equal(propsOf(view, "Tag", (props) => props.children === "Configured").tone, "success");
});

test("keys: an unconfigured and a read-only reference render honestly", async () => {
	const h = makeHarness({ snapshot: snapshotWithKey(), readOnlyCredentials: { [KEY_REF]: true } });
	await flush();
	assert.deepEqual(h.state().credentials[KEY_REF], { configured: false, writable: false });
	const { view } = openKeyRow(h, KEY_REF);
	const secret = propsOf(view, "SettingsSecretField", (props) => props.id === `um-ws-key-exa-${KEY_REF}`);
	assert.equal(secret.configured, false);
	assert.equal(secret.stateLabel, "Not configured");
	assert.equal(secret.disabled, true, "a reference the active provider cannot write is read-only");
	assert.equal(propsOf(view, "Tag", (props) => props.children === "Not configured").tone, "quiet");
});

test("keys: a typed value saves through the positional credentials wire face, never into settings", async () => {
	const h = makeHarness({ snapshot: snapshotWithKey() });
	await flush();
	const { view } = openKeyRow(h, KEY_REF);
	propsOf(view, "SettingsSecretField", (props) => props.id === `um-ws-key-exa-${KEY_REF}`).onEdit("  sk-secret  ");
	assert.equal(h.state().dirty, true, "a staged key value marks the form dirty");
	assert.deepEqual(h.state().keys, { [KEY_REF]: "  sk-secret  " });
	await h.face().save();
	assert.deepEqual(h.setCalls, [[KEY_REF, "sk-secret"]], "set(ref, value) is positional and the literal is trimmed");
	assert.equal(JSON.stringify(h.mutations).includes("sk-secret"), false, "the literal never lands in the settings document");
	assert.equal(h.mutations.length, 0, "nothing but the credential was staged");
	assert.equal(h.state().failed, false);
	assert.deepEqual(h.state().credentials[KEY_REF], { configured: true, writable: true }, "the badge is re-read after the write");
});

test("keys: the staged draft is echoed back into the value control", () => {
	const h = makeHarness({ snapshot: snapshotWithKey() });
	const { seeds, view } = openKeyRow(h, KEY_REF);
	propsOf(view, "SettingsSecretField", (props) => props.id === `um-ws-key-exa-${KEY_REF}`).onEdit("sk-typed");
	const staged = renderCard(h, { seeds });
	assert.equal(propsOf(staged, "SettingsSecretField", (props) => props.id === `um-ws-key-exa-${KEY_REF}`).text, "sk-typed", "a controlled secret field must echo what was typed");
});

test("keys: a blank or whitespace draft writes nothing and keeps the stored credential", async () => {
	const h = makeHarness({ snapshot: snapshotWithKey(), credentials: { [KEY_REF]: "stored-key" } });
	await flush();
	const { seeds, view } = openKeyRow(h, KEY_REF);
	propsOf(view, "SettingsSecretField", (props) => props.id === `um-ws-key-exa-${KEY_REF}`).onEdit("   ");
	assert.equal(h.state().dirty, false, "whitespace alone never marks the form dirty");
	assert.deepEqual(h.state().keys, {});
	await h.face().save();
	assert.deepEqual(h.setCalls, [], "no write is attempted for a blank draft");
	assert.equal(h.mutations.length, 0);
	assert.equal(h.credentialsStore.get(KEY_REF), "stored-key", "the stored credential survives");
});

test("keys: a refused credential write surfaces as an unaccepted save", async () => {
	const h = makeHarness({ snapshot: snapshotWithKey(), setThrows: true });
	await flush();
	const face = h.face();
	face.edit("keys", JSON.stringify({ [KEY_REF]: "sk-secret" }));
	await face.save();
	assert.equal(h.setCalls.length, 1, "the write was attempted");
	assert.equal(h.state().failed, true, "a write that did not cross the wire is reported, not swallowed");
	assert.equal(h.state().dirty, true, "the draft stays for the user");
});

test("keys: credentials/reference-updated refreshes the badge for watched references only", async () => {
	const h = makeHarness({ snapshot: snapshotWithKey() });
	await flush();
	assert.equal(h.state().credentials[KEY_REF].configured, false);
	const handler = h.event("credentials/reference-updated");
	assert.equal(typeof handler, "function");
	h.credentialsStore.set(KEY_REF, "sk-live");
	handler(KEY_REF);
	await flush();
	assert.equal(h.state().credentials[KEY_REF].configured, true, "the badge follows an out-of-band write");
	const before = h.describeCalls.length;
	handler("SOME_UNWATCHED_REF");
	await flush();
	assert.equal(h.describeCalls.length, before, "a reference this card does not name is ignored");
	assert.deepEqual(h.describeCalls.at(-1), [KEY_REF]);
});

test("keys: drafts for two keys coexist", () => {
	const h = makeHarness({ snapshot: snapshotWithKey() });
	const { seeds, view } = openKeyRow(h, KEY_REF);
	const field = (target, id) => propsOf(target, "SettingsSecretField", (props) => props.id === `um-ws-key-exa-${id}`);
	field(view, KEY_REF).onEdit("sk-first");
	propsOf(renderCard(h, { seeds }), "Button", (props) => props.children === h.t("addKey")).onClick();
	// The added row opens on its own, so its secret control is the one on screen.
	const second = renderCard(h, { seeds });
	field(second, `${KEY_REF}_1`).onEdit("sk-second");
	assert.deepEqual(h.state().keys, { [KEY_REF]: "sk-first", [`${KEY_REF}_1`]: "sk-second" }, "typing the second key must not discard the first draft");
});

test("keys: removing a key prunes its draft so nothing orphaned is written", async () => {
	const h = makeHarness({ snapshot: snapshotWithKey() });
	const { seeds, view } = openKeyRow(h, KEY_REF);
	const field = (target, id) => propsOf(target, "SettingsSecretField", (props) => props.id === `um-ws-key-exa-${id}`);
	assert.ok(field(view, KEY_REF) !== undefined);
	propsOf(renderCard(h, { seeds }), "Button", (props) => props.children === h.t("addKey")).onClick();
	const typed = renderCard(h, { seeds });
	field(typed, `${KEY_REF}_1`).onEdit("sk-second");
	propsOf(renderCard(h, { seeds }), "Button", (props) => props.children === h.t("removeKey")).onClick();
	const removed = renderCard(h, { seeds });
	assert.deepEqual(h.state().providers[0].keys.map((key) => key.ref), [KEY_REF]);
	assert.deepEqual(h.state().keys, {}, "the removed row's draft goes with it");
	await h.face().save();
	assert.deepEqual(h.setCalls, [], "no credential is written for a removed key");
});

// ---- validation --------------------------------------------------------------

test("validation: an unparseable numeric draft marks the form invalid and blocks the save", async () => {
	const h = makeHarness();
	const seeds = [];
	let view = renderCard(h, { seeds });
	propsOf(view, "SettingsValueField", (props) => props.id === "um-ws-concurrency").onEdit("many");
	view = renderCard(h, { seeds });
	assert.equal(h.state().invalid, true);
	assert.equal(h.state().dirty, true, "an unparseable draft is still an edit, so it is never silently dropped");
	assert.match(view.plain, /Enter a number, or leave blank to use the default\./u, "the field shows its invalid label");
	assert.equal(saveButton(view).props.disabled, true, "the form refuses to save while a draft is unparseable");
	await h.face().save();
	assert.deepEqual(h.mutations, [], "and nothing crosses the wire");
});

test("validation: a hand-corrupted providers draft is refused, never coerced or crashed", async () => {
	// No UI path stages a non-JSON providers draft (the card always writes
	// JSON.stringify output), so this exercises the card's defensive branch: the
	// row keeps showing the Host's list, and the save REFUSES the draft instead
	// of coercing it to an empty list. A write-only control carries no parse
	// spec, so the form model cannot mark it `invalid` — the refusal surfaces as
	// a failed save that keeps the draft for correction.
	const h = makeHarness();
	h.face().edit("providers", "{not json");
	assert.deepEqual(h.state().providers.map((provider) => provider.id), ["exa", "parallel", "deepseek"]);
	assert.equal(h.state().dirty, true);
	await h.face().save();
	assert.deepEqual(h.mutations, [], "a corrupt draft writes nothing at all");
	assert.equal(h.state().failed, true, "the refusal is reported, not swallowed");
	assert.equal(h.state().dirty, true, "the draft stays for the user to correct");
});

test("validation: a read-only deployment disables every control and refuses the save", async () => {
	const h = makeHarness({ snapshot: makeSnapshot({ writable: false }) });
	const seeds = [];
	let view = renderCard(h, { seeds });
	assert.match(view.plain, /This deployment stores settings read-only\./u);
	assert.equal(propsOf(view, "Switch", (props) => props.label === "Enable web search").disabled, true);
	assert.equal(propsOf(view, "SettingsValueField", (props) => props.id === "um-ws-default-provider").disabled, true);
	const { view: details } = openProvider(h);
	assert.equal(propsOf(details, "Button", (props) => props.children === h.t("addKey")).disabled, true);
	h.face().edit("enabled", "true");
	await h.face().save();
	assert.deepEqual(h.mutations, [], "a read-only scope never accepts a write");
});

test("validation: the reset control clears a stored override through an unset op", async () => {
	const h = makeHarness({ snapshot: makeSnapshot({ defaultProvider: "exa", user: { defaultProvider: "exa" } }) });
	const seeds = [];
	const view = renderCard(h, { seeds });
	const field = propsOf(view, "SettingsValueField", (props) => props.id === "um-ws-default-provider");
	assert.equal(field.overridden, true, "the user layer carries this field");
	assert.equal(propsOf(view, "SettingsValueField", (props) => props.id === "um-ws-concurrency").overridden, false);
	field.onReset();
	await h.face().save();
	assert.deepEqual(h.mutations[0].ops, [{ op: "unset", path: ["defaultProvider"] }]);
});

// ---- render smoke ------------------------------------------------------------

test("render: the summary view is the row one-liner and the page view is the form", () => {
	const off = makeHarness();
	const offView = renderCard(off, { view: "summary" });
	assert.equal(typeof offView.tree, "string", "the summary is plain text, not a tree");
	assert.equal(offView.tree, "Web search: every provider is off.");
	const on = makeHarness({
		snapshot: makeSnapshot({ enabled: true, concurrency: 2, providers: [exaProvider(), parallelProvider({ enabled: true }), deepseekProvider()] })
	});
	assert.equal(renderCard(on, { view: "summary" }).tree, "Web search: Exa → Parallel · concurrency 2");
	const form = propsOf(renderCard(on), "SettingsForm");
	assert.equal(form.state.available, true);
	assert.equal(propsOf(renderCard(on), "SettingsValueField", (props) => props.id === "um-ws-concurrency").text, "2");
});

test("render: the page view hands SettingsForm its labels, its state, and the save/discard actions", async () => {
	const h = makeHarness();
	const seeds = [];
	let view = renderCard(h, { seeds });
	const form = propsOf(view, "SettingsForm");
	assert.equal(form.labels.save, "Save");
	assert.equal(form.labels.saving, "Saving…");
	assert.equal(form.labels.saveFailed, "The deployment did not accept these values; they were left for you to correct.");
	assert.equal(form.labels.readOnly, "This deployment stores settings read-only.");
	assert.equal(form.labels.unavailable, "This plugin is not loaded, so it cannot be configured right now.");
	assert.equal(form.state.available, true);
	assert.equal(form.state.writable, true);
	assert.equal(form.state.dirty, false);
	assert.equal(form.state.invalid, false);
	assert.equal(form.state.failed, false);
	assert.equal(form.state.providers.length, 3);
	assert.equal(typeof form.onSave, "function");
	assert.equal(typeof form.onDiscard, "function");
	assert.equal(saveButton(view).props.disabled, true, "a clean form cannot save");
	propsOf(view, "Switch", (props) => props.label === "Enable web search").onChange(true);
	view = renderCard(h, { seeds });
	assert.equal(propsOf(view, "SettingsForm").state.dirty, true);
	assert.equal(saveButton(view).props.disabled, false);
	assert.equal(propsOf(view, "Switch", (props) => props.label === "Result cache").checked, false);
	await saveButton(view).props.onClick();
	assert.deepEqual(h.mutations[0].ops, [{ op: "set", path: ["enabled"], value: true }]);
	assert.deepEqual(h.mutations[0].ops[0].value, true, "the switch stages a boolean, not its draft text");
});

test("render: an unserved namespace renders the unavailable notice instead of the controls", () => {
	const h = makeHarness({ snapshot: makeSnapshot({ status: "loading" }) });
	const view = renderCard(h);
	assert.equal(propsOf(view, "SettingsForm").state.available, false);
	assert.match(view.plain, /This plugin is not loaded, so it cannot be configured right now\./u);
	assert.equal(saveButton(view), undefined, "no save control renders for an unserved namespace");
});

test("render: the card never touches the network", () => {
	assert.equal(fetches, 0, "every credential read rides the injected remote, never fetch");
});
