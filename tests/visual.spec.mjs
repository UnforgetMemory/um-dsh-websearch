import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Browser suite for the `um-dsh-websearch` settings card (ADR-0006 D3).
 *
 * The page under test is tests/visual/fixtures/card.html — the SHIPPED
 * lib/client.js booted against the stub primitives and the mock DSH ctx that
 * tests/render-visual.mjs generates. The real primitives are framework-owned
 * (real React + CSS modules inside the DSH web bundle), so the stub mirrors
 * their contract, not their pixels: every assertion below is behavioural, and
 * the three screenshot cases cover this card's own layout only.
 *
 * Regenerate the fixture and the baselines with:
 *   node tests/render-visual.mjs && npx playwright test --update-snapshots
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'visual', 'fixtures', 'card.html');
if (!existsSync(FIXTURE)) throw new Error(`missing fixture ${FIXTURE}; run: node tests/render-visual.mjs`);
const PAGE = pathToFileURL(FIXTURE).href;

const EXA_KEY = 'UM_WS_EXA_API_KEY';
const EXA_KEY_2 = 'UM_WS_EXA_API_KEY_1';
/** The references the fixture's provider list names, in provider order. */
const REFS = ['UM_WS_EXA_API_KEY', 'UM_WS_PARALLEL_API_KEY', 'UM_WS_DEEPSEEK_API_KEY'];

/** Open the fixture and wait until the card has mounted and rendered. */
async function open(page, { served = true } = {}) {
	await page.addInitScript((flag) => {
		window.__umTestConfig = { served: flag };
	}, served);
	await page.goto(PAGE);
	await page.waitForFunction(() => window.__testLog && window.__testLog.ready === true);
}

/** The card's own state object, read through the injected snapshot hook. */
const state = (page) => page.evaluate(() => window.__testLog.state());
/** Every `scope.mutate` call, in order. */
const scopeCalls = (page) => page.evaluate(() => window.__testLog.scopeCalls);
/** Every `remote.credentials.set(ref, value)` call, in order. */
const credSetCalls = (page) => page.evaluate(() => window.__testLog.credSetCalls);

const saveButton = (page) => page.getByTestId('settings-save');
const sw = (page, label) => page.locator(`[role=switch][aria-label="${label}"]`);
const configButton = (page, index = 0) => page.getByRole('button', { name: '详细配置…', exact: true }).nth(index);

/** Expand one provider's details and return the modal. */
async function openDetails(page, index = 0) {
	await configButton(page, index).click();
	await expect(page.getByTestId('details-modal')).toBeVisible();
	return page.getByTestId('details-modal');
}

/** Expand the details, add a key row, and return the staged state. */
async function addKey(page) {
	await openDetails(page);
	await page.getByRole('button', { name: '添加密钥', exact: true }).click();
	await expect.poll(async () => (await state(page)).providers[0].keys.length).toBe(2);
	return state(page);
}

// ─── registration ───────────────────────────────────────────────────────────

test('registers into plugins.row.config under um-dsh-websearch#um-web-search only after whileServed', async ({ page }) => {
	await open(page, { served: false });
	expect(await page.evaluate(() => window.__testLog.registration())).toBeNull();
	expect(await page.evaluate(() => window.__testLog.whileServedCalls)).toEqual([['um-web-search']]);
	expect(await page.evaluate(() => window.__testLog.configFormsGet)).toEqual(['um-web-search']);
	expect(await page.evaluate(() => window.__testLog.injectCalls)).toEqual([]);

	await page.evaluate(() => window.__testLog.setServed(true));
	await expect.poll(async () => (await page.evaluate(() => window.__testLog.registration())) !== null).toBe(true);

	const registered = await page.evaluate(() => {
		const entry = window.__testLog.registration();
		return {
			key: entry.descriptor.key,
			name: entry.descriptor.name,
			order: entry.descriptor.order,
			locale: entry.descriptor.locale,
			label: entry.descriptor.label(),
			injects: Object.keys(entry.descriptor.inject()).sort(),
			injectCalls: window.__testLog.injectCalls,
		};
	});
	expect(registered.key).toBe('um-dsh-websearch#um-web-search');
	expect(registered.name).toBe('plugins.row.config');
	expect(registered.locale).toBe('um-dsh-websearch');
	expect(registered.label).toBe('UM 网页搜索');
	expect(registered.injectCalls).toEqual(['plugins.row.config']);
	// The injected face is the snapshot hook plus the shared form actions.
	expect(registered.injects).toEqual(['discard', 'edit', 'hooks', 'resetField', 'save']);
	expect(await page.evaluate(() => window.__testLog.effects)).toContain('um-dsh-websearch: page');
});

// ─── summary ────────────────────────────────────────────────────────────────

test('view:"summary" renders the one-line strategy summary and no form', async ({ page }) => {
	await open(page);
	await page.evaluate(() => window.__testLog.setView('summary'));
	await expect(page.getByTestId('card-root')).toHaveText('网页搜索：所有数据源均已停用。');
	expect(await page.locator('#card-root input').count()).toBe(0);
	expect(await page.locator('[data-testid=settings-save]').count()).toBe(0);

	// Enabling the master switch turns the same view into the ordered strategy line.
	await page.evaluate(() => window.__testLog.setView('page'));
	await sw(page, '启用网页搜索').click();
	await page.evaluate(() => window.__testLog.setView('summary'));
	await expect(page.getByTestId('card-root')).toHaveText('网页搜索：Exa → Parallel · 并发 1');
});

// ─── master switch ──────────────────────────────────────────────────────────

test('the master switch stages enabled and enables the save button', async ({ page }) => {
	await open(page);
	await expect(sw(page, '启用网页搜索')).toHaveAttribute('aria-checked', 'false');
	await expect(saveButton(page)).toBeDisabled();

	await sw(page, '启用网页搜索').click();
	await expect(sw(page, '启用网页搜索')).toHaveAttribute('aria-checked', 'true');
	await expect(saveButton(page)).toBeEnabled();
	expect((await state(page)).enabled).toBe(true);
	// A dirty form is exactly what the primitives gate the save on.
	expect(await page.locator('[data-testid=settings-save]').evaluate((el) => el.disabled)).toBe(false);
});

// ─── save shape ─────────────────────────────────────────────────────────────

test('save sends exactly the expected scope.mutate ops, providers as ONE path op', async ({ page }) => {
	await open(page);
	// Two write-only controls staged: the master switch and the provider list.
	// Each one writes itself, so the save issues one mutation per control — the
	// contract under test is the SHAPE of each op, never a per-element write.
	await sw(page, '启用网页搜索').click();
	await sw(page, 'Exa').click();
	await saveButton(page).click();
	await expect.poll(async () => (await scopeCalls(page)).length).toBe(2);

	const calls = await scopeCalls(page);
	expect(calls).toHaveLength(2);
	expect(calls[0].ops).toEqual([{ op: 'set', path: ['enabled'], value: true }]);
	expect(calls[1].ops).toHaveLength(1);
	expect(calls[1].ops[0].op).toBe('set');
	expect(calls[1].ops[0].path).toEqual(['providers']);
	expect(calls[1].ops[0].value).toHaveLength(3);
	expect(calls[1].ops[0].value.map((provider) => provider.id)).toEqual(['exa', 'parallel', 'deepseek']);
	expect(calls[1].ops[0].value[0].enabled).toBe(false);
	// Never per-element writes: one path op carries the whole list.
	expect(calls.flatMap((call) => call.ops).filter((op) => op.path[0] === 'providers')).toHaveLength(1);
	expect(calls.flatMap((call) => call.ops).filter((op) => op.path.length > 1)).toHaveLength(0);
	for (const call of calls) expect(typeof call.expectedRevision).toBe('number');
	expect(await credSetCalls(page)).toEqual([]);
});

// ─── providers: enable + reorder ────────────────────────────────────────────

test('a provider enable toggle reaches the staged providers array', async ({ page }) => {
	await open(page);
	await expect(sw(page, 'Exa')).toHaveAttribute('aria-checked', 'true');
	await sw(page, 'Exa').click();
	await expect(sw(page, 'Exa')).toHaveAttribute('aria-checked', 'false');
	await saveButton(page).click();
	await expect.poll(async () => (await scopeCalls(page)).length).toBe(1);

	const ops = (await scopeCalls(page))[0].ops;
	expect(ops).toHaveLength(1);
	expect(ops[0].path).toEqual(['providers']);
	expect(ops[0].value[0]).toMatchObject({ id: 'exa', enabled: false });
	expect(ops[0].value[1]).toMatchObject({ id: 'parallel', enabled: true });
	// The per-key fallback flags of the untouched providers survive the round trip.
	expect(ops[0].value[0].keys).toEqual([{ ref: EXA_KEY, enabled: true, allowFreeToPaid: true, allowPaidToFree: false }]);
});

test('↑/↓ reorder swaps the index and reaches the staged providers array', async ({ page }) => {
	await open(page);
	// Each provider row is: name span · role tag · ↑ · ↓ · Configure · Switch.
	const names = () => page.locator('[role=switch][aria-label="Exa"], [role=switch][aria-label="Parallel"], [role=switch][aria-label="DeepSeek Official"]').locator('xpath=../span[1]');
	await expect(names()).toHaveText(['Exa', 'Parallel', 'DeepSeek Official']);
	await expect(page.locator('[aria-label=上移]').first()).toBeDisabled();

	await page.locator('[aria-label=下移]').first().click();
	await expect(names()).toHaveText(['Parallel', 'Exa', 'DeepSeek Official']);
	expect((await state(page)).providers.map((provider) => provider.id)).toEqual(['parallel', 'exa', 'deepseek']);

	await saveButton(page).click();
	await expect.poll(async () => (await scopeCalls(page)).length).toBe(1);
	const ops = (await scopeCalls(page))[0].ops;
	expect(ops).toHaveLength(1);
	expect(ops[0].path).toEqual(['providers']);
	expect(ops[0].value.map((provider) => provider.id)).toEqual(['parallel', 'exa', 'deepseek']);
});

// ─── keys ───────────────────────────────────────────────────────────────────

test('"add key" generates the next UM_WS_* reference deterministically', async ({ page }) => {
	await open(page);
	const staged = await addKey(page);
	expect(staged.providers[0].keys.map((key) => key.ref)).toEqual([EXA_KEY, EXA_KEY_2]);
	expect(staged.providers[0].keys[1]).toMatchObject({ ref: EXA_KEY_2, enabled: true, allowFreeToPaid: false, allowPaidToFree: false });
	// The new row is the one the card opens, and nothing is written yet.
	await expect(page.locator(`#um-ws-key-exa-${EXA_KEY_2}`)).toBeVisible();
	expect(await scopeCalls(page)).toEqual([]);
	expect(await credSetCalls(page)).toEqual([]);

	await saveButton(page).click();
	await expect.poll(async () => (await scopeCalls(page)).length).toBe(1);
	expect((await scopeCalls(page))[0].ops[0].value[0].keys.map((key) => key.ref)).toEqual([EXA_KEY, EXA_KEY_2]);
});

test('a typed key value stages and save calls remote.credentials.set(ref, value) positionally', async ({ page }) => {
	await open(page);
	await addKey(page);
	const input = page.locator(`#um-ws-key-exa-${EXA_KEY_2}`);
	await input.fill('sk-live-secret');
	await expect(input).toHaveValue('sk-live-secret');
	// The draft is staged, not written: nothing crosses the wire before the save.
	expect(await credSetCalls(page)).toEqual([]);

	await saveButton(page).click();
	await expect.poll(async () => (await credSetCalls(page)).length).toBe(1);
	// POSITIONAL: two arguments, never a request object.
	expect(await credSetCalls(page)).toEqual([[EXA_KEY_2, 'sk-live-secret']]);
	// The literal never leaks into the settings document.
	const ops = (await scopeCalls(page))[0].ops;
	expect(ops).toHaveLength(1);
	expect(JSON.stringify(ops)).not.toContain('sk-live-secret');
	expect(ops[0].value[0].keys.map((key) => key.ref)).toEqual([EXA_KEY, EXA_KEY_2]);
});

test('a blank key draft calls nothing', async ({ page }) => {
	await open(page);
	await openDetails(page);
	await page.locator(`[role=button][aria-label="${EXA_KEY}"]`).click();
	const input = page.locator(`#um-ws-key-exa-${EXA_KEY}`);
	await expect(input).toHaveValue('');
	// Typing stages the literal; clearing it drops the draft again.
	await input.fill('sk-typed');
	await expect(saveButton(page)).toBeEnabled();
	await input.fill('');
	await expect(input).toHaveValue('');
	// Nothing is staged, so the form is clean: there is nothing to save and
	// therefore nothing to write (a blank draft never clears a stored key).
	await expect(saveButton(page)).toBeDisabled();
	expect(await credSetCalls(page)).toEqual([]);
	expect(await scopeCalls(page)).toEqual([]);
});

// ─── credentials: describe + invalidation ───────────────────────────────────

test('describe drives the configured badge and credentials/reference-updated refreshes it', async ({ page }) => {
	await open(page);
	await expect.poll(async () => (await page.evaluate(() => window.__testLog.describeCalls)).length).toBeGreaterThan(0);
	const firstDescribe = await page.evaluate(() => window.__testLog.describeCalls[0]);
	expect([...firstDescribe].sort()).toEqual([...REFS].sort());

	const badge = () => page.locator('.dsw-disclosure', { hasText: EXA_KEY }).first().locator('.dsw-tag');
	await openDetails(page);
	await expect(badge()).toHaveText('已配置');

	// The key is dropped from the store from somewhere else, then the Host
	// reports it: the badge must follow the answer, not the settings revision.
	await page.evaluate((ref) => {
		delete window.__testLog.credentials[ref];
		window.__testLog.emit('credentials/reference-updated', ref);
	}, EXA_KEY);
	await expect(badge()).toHaveText('未配置');

	await page.evaluate((ref) => {
		window.__testLog.credentials[ref] = 'sk-restored';
		window.__testLog.emit('credentials/reference-updated', ref);
	}, EXA_KEY);
	await expect(badge()).toHaveText('已配置');

	// A reference this card does not watch is ignored rather than re-read.
	const before = await page.evaluate(() => window.__testLog.describeCalls.length);
	await page.evaluate(() => window.__testLog.emit('credentials/reference-updated', 'UM_WS_SOMEONE_ELSE_KEY'));
	await page.waitForTimeout(200);
	expect(await page.evaluate(() => window.__testLog.describeCalls.length)).toBe(before);
});

// ─── validation ─────────────────────────────────────────────────────────────

test('an unparseable providers draft is refused instead of coerced to an empty list', async ({ page }) => {
	await open(page);
	// The settings model has no parse spec for a write-only control, so the form
	// itself cannot know the draft is corrupt; the CARD refuses it on save.
	await page.evaluate(() => window.__testLog.edit('providers', '{not json'));
	await expect(saveButton(page)).toBeEnabled();
	// The committed list is what renders while the draft cannot be parsed.
	expect((await state(page)).providers.map((provider) => provider.id)).toEqual(['exa', 'parallel', 'deepseek']);

	await page.evaluate(() => window.__testLog.save());
	await expect.poll(async () => (await state(page)).failed).toBe(true);
	expect(await scopeCalls(page)).toEqual([]);
	expect((await state(page)).providers.map((provider) => provider.id)).toEqual(['exa', 'parallel', 'deepseek']);

	// A parseable draft saves normally again.
	await page.evaluate(() => window.__testLog.edit('providers', JSON.stringify(window.__testLog.state().providers)));
	await page.evaluate(() => window.__testLog.save());
	await expect.poll(async () => (await scopeCalls(page)).length).toBe(1);
	expect(await state(page)).toMatchObject({ failed: false, dirty: false });
});

// ─── pre-write validation (the client-side mirror of the Host invariants) ───

test('a doomed candidate is refused before the wire with a specific warning', async ({ page }) => {
	await open(page);
	// "ghost" passes the string schema but breaks the default-provider
	// membership invariant the Host enforces on write; the card refuses it
	// before scope.mutate and explains itself instead of failing opaquely.
	await page.evaluate(() => window.__testLog.edit('defaultProvider', 'ghost'));
	await saveButton(page).click();
	await expect.poll(async () => (await state(page)).failed).toBe(true);
	expect(await scopeCalls(page)).toEqual([]);
	await expect(page.getByTestId('card-root')).toContainText('默认数据源「ghost」不在已配置的数据源中。');

	// Discard clears both the drafts and the warning.
	await page.evaluate(() => window.__testLog.discard());
	await expect(page.getByTestId('card-root')).not.toContainText('不在已配置的数据源中');
	expect(await state(page)).toMatchObject({ failed: false, dirty: false });
});

test('a duplicate provider id in the staged list is refused with its name', async ({ page }) => {
	await open(page);
	await page.evaluate(() => {
		const providers = window.__testLog.state().providers;
		window.__testLog.edit('providers', JSON.stringify([...providers, { ...providers[0] }]));
	});
	await saveButton(page).click();
	await expect.poll(async () => (await state(page)).failed).toBe(true);
	expect(await scopeCalls(page)).toEqual([]);
	await expect(page.getByTestId('card-root')).toContainText('数据源 id「exa」出现了不止一次。');
});

// ─── pixels (this card's own regions only) ──────────────────────────────────

test('pixels: default card', async ({ page }) => {
	await open(page);
	await expect(page.getByTestId('card-root')).toHaveScreenshot('card-default.png');
});

test('pixels: master switch on', async ({ page }) => {
	await open(page);
	await sw(page, '启用网页搜索').click();
	await expect(saveButton(page)).toBeEnabled();
	await expect(page.getByTestId('card-root')).toHaveScreenshot('card-enabled.png');
});

test('pixels: provider details open', async ({ page }) => {
	await open(page);
	await openDetails(page);
	await expect(page.getByTestId('details-modal')).toHaveScreenshot('card-details-open.png');
});
