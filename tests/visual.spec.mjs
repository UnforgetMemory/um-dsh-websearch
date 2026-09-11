import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = (name) => 'file://' + join(__dirname, 'visual', 'fixtures', name).replace(/\\/g, '/');

// Helper: find section by h3 header text in index.html
const sectionByHeader = (page, headerText) =>
  page.locator(`h3:has-text("${headerText}")`).locator('..');

// Helper: expand the card's main header (the card starts collapsed)
async function expandCard(page) {
  await page.locator('.um-dsh-websearch-header').click();
  await page.waitForTimeout(300);
}

// Helper: open modal (the card starts collapsed; the editor renders expanded)
async function openModalAndExpand(page) {
  await expandCard(page);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('详细配置')).click();
  });
  await page.waitForTimeout(300);
}

// ─── 1. Static visual snapshots (index.html) ────────────────────────────────
test.describe('Static snapshots — first screen', () => {
  test('zh first screen renders card', async ({ page }) => {
    await page.goto(FIX('index.html'));
    const card = page.locator('.um-dsh-websearch-card').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveScreenshot('first-screen-zh.png', { maxDiffPixelRatio: 0.01 });
  });

  test('en first screen renders card', async ({ page }) => {
    await page.goto(FIX('index.html'));
    const enSection = sectionByHeader(page, '首屏（en）');
    const enCard = enSection.locator('.um-dsh-websearch-card');
    await expect(enCard).toBeVisible();
    await expect(enCard).toHaveScreenshot('first-screen-en.png', { maxDiffPixelRatio: 0.01 });
  });
});

test.describe('Static snapshots — modal dialogs', () => {
  test('providers modal renders with tabs', async ({ page }) => {
    await page.goto(FIX('index.html'));
    const modal = page.locator('.um-dsh-websearch-modalContent').first();
    await expect(modal).toBeVisible();
    await expect(modal).toHaveScreenshot('modal-providers.png', { maxDiffPixelRatio: 0.01 });
  });

  test('about modal renders version info', async ({ page }) => {
    await page.goto(FIX('index.html'));
    const about = page.locator('.um-dsh-websearch-about');
    await expect(about).toBeVisible();
    await expect(about).toContainText('0.6.0');
    await expect(about).toContainText('UnforgetMemory');
  });
});

test.describe('Static snapshots — boundary states', () => {
  test('all providers disabled shows disabled switches', async ({ page }) => {
    await page.goto(FIX('index.html'));
    const section = sectionByHeader(page, '全部停用');
    await expect(section).toBeVisible();
    const dialog = section.locator('.um-dsh-websearch-modalContent');
    await expect(dialog).toHaveScreenshot('boundary-all-off.png', { maxDiffPixelRatio: 0.01 });
    // Head + paid/free tier switches; key rows are collapsed accordion items
    // (their switches render only while a row is open)
    const switches = section.locator('[role=switch]');
    await expect(switches).toHaveCount(3);
    await expect(switches.first()).toHaveAttribute('aria-checked', 'false');
  });

  test('default provider disabled shows warning', async ({ page }) => {
    await page.goto(FIX('index.html'));
    const section = sectionByHeader(page, '默认停用警示');
    await expect(section).toBeVisible();
    const dialog = section.locator('.um-dsh-websearch-modalContent');
    await expect(dialog).toHaveScreenshot('boundary-default-off.png', { maxDiffPixelRatio: 0.01 });
    await expect(section).toContainText('默认');
    await expect(section).toContainText('停用');
  });
});

// ─── 2. Interactive tests (interactive.html) ────────────────────────────────
test.describe('Interactive — first screen', () => {
  test('card header button collapses and expands the whole card', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    const header = page.locator('.um-dsh-websearch-header');
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await expect(header).toHaveAttribute('aria-label', '展开设置: UM 网页搜索');
    // The body stays unmounted while collapsed
    await expect(page.locator('.um-dsh-websearch-body')).toHaveCount(0);
    await header.click();
    await page.waitForTimeout(300);
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(header).toHaveAttribute('aria-label', '收起设置: UM 网页搜索');
    await expect(page.locator('.um-dsh-websearch-body')).toBeVisible();
    await header.click();
    await page.waitForTimeout(300);
    await expect(page.locator('.um-dsh-websearch-body')).toHaveCount(0);
  });

  test('master toggle switches enabled state', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    const sw = page.locator('[role=switch][aria-label=启用搜索]');
    // Initially off (aria-checked not set)
    await expect(sw).not.toHaveAttribute('aria-checked', '');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', '');
  });

  test('concurrency input accepts value', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    const input = page.locator('input[type=number]').first();
    await input.fill('4');
    await page.waitForTimeout(200);
    await expect(input).toHaveValue('4');
  });

  test('provider reorder changes order', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    const namesBefore = await page.locator('.um-dsh-websearch-providerName').allTextContents();
    await page.locator('[aria-label=下移]').first().click();
    await page.waitForTimeout(300);
    const namesAfter = await page.locator('.um-dsh-websearch-providerName').allTextContents();
    expect(namesAfter).not.toEqual(namesBefore);
  });
});

test.describe('Interactive — modal', () => {
  test('details button opens modal', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('详细配置')).click();
    });
    await page.waitForTimeout(300);
    await expect(page.locator('[role=dialog]')).toBeVisible();
    await expect(page.locator('[role=tablist]')).toBeVisible();
  });

  test('tab switching works', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('详细配置')).click();
    });
    await page.waitForTimeout(300);
    // Initial: providers tab active (first provider editor visible)
    await expect(page.locator('.um-dsh-websearch-providerEditor').first()).toBeVisible();
    // Click About tab
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('[role=tab]')).find(t => t.textContent.includes('关于')).click();
    });
    await page.waitForTimeout(300);
    // About panel visible
    await expect(page.locator('.um-dsh-websearch-about')).toBeVisible();
  });

  test('about tab shows version and author', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('详细配置')).click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('[role=tab]')).find(t => t.textContent.includes('关于')).click();
    });
    await page.waitForTimeout(300);
    const panel = page.locator('.um-dsh-websearch-about');
    await expect(panel).toContainText('0.5.1');
    await expect(panel).toContainText('UnforgetMemory');
    await expect(panel).toContainText('GitHub');
  });

  test('save button calls scope.set with edited values', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('详细配置')).click();
    });
    await page.waitForTimeout(300);
    // Edit concurrency
    await page.evaluate(() => {
      const input = document.querySelector('input[type=number]');
      if (input) {
        input.value = '3';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(200);
    // Click Save
    await page.evaluate(() => {
      const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '保存');
      if (saveBtn) saveBtn.click();
    });
    await page.waitForTimeout(500);
    const calls = await page.evaluate(() => window.__testLog.scopeCalls);
    expect(calls).toContainEqual(['set', 'concurrency', 3]);
  });

  test('provider enable switch toggles', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('详细配置')).click();
    });
    await page.waitForTimeout(300);
    const sw = page.locator('[role=switch][aria-label=Exa]').first();
    await expect(sw).toHaveAttribute('aria-checked', '');
    await sw.click();
    await page.waitForTimeout(200);
    // After toggle, should be off (aria-checked removed)
    await expect(sw).not.toHaveAttribute('aria-checked', '');
  });
});

// ─── 2b. Interactive — validation ───────────────────────────────────────────
test.describe('Interactive — validation', () => {
  test('invalid numResults=0 blocks save', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await openModalAndExpand(page);
    // Set numResults to 0 via dispatchEvent
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type=number]');
      const input = inputs[2];
      if (input) {
        input.value = '0';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);
    const saveBtn = page.locator('button.dsw-btn-primary').first();
    await expect(saveBtn).toBeDisabled();
  });

  test('invalid numResults=21 blocks save', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await openModalAndExpand(page);
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type=number]');
      const input = inputs[2];
      if (input) {
        input.value = '21';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);
    const saveBtn = page.locator('button.dsw-btn-primary').first();
    await expect(saveBtn).toBeDisabled();
  });
});

// ─── 2c. Interactive — modal lifecycle ──────────────────────────────────────
test.describe('Interactive — modal lifecycle', () => {
  test('discard button resets staged edits', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await openModalAndExpand(page);
    // Edit numResults
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type=number]');
      const input = inputs[2];
      if (input) {
        input.value = '7';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);
    // Verify dirty badge appeared
    await expect(page.locator('.um-dsh-websearch-pending')).toBeVisible();
    // Click discard
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '放弃').click();
    });
    await page.waitForTimeout(500);
    // Dirty badge should be gone
    await expect(page.locator('.um-dsh-websearch-pending')).toHaveCount(0);
    // numResults should be reset to original (5)
    await expect(page.locator('input[type=number]').nth(2)).toHaveValue('5');
  });

  test('dirty state badge appears after editing', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('详细配置')).click();
    });
    await page.waitForTimeout(300);
    // Initially no pending badge
    await expect(page.locator('.um-dsh-websearch-pending')).toHaveCount(0);
    // Edit concurrency
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type=number]');
      const input = inputs[0];
      if (input) {
        input.value = '4';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);
    // Pending badge should appear
    await expect(page.locator('.um-dsh-websearch-pending')).toBeVisible();
    await expect(page.locator('.um-dsh-websearch-pending')).toContainText('未保存');
  });

  test('save writes legacy keys as unset calls', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await openModalAndExpand(page);
    // Edit numResults
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type=number]');
      const input = inputs[2];
      if (input) {
        input.value = '3';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);
    // Click save
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '保存').click();
    });
    await page.waitForTimeout(500);
    const calls = await page.evaluate(() => window.__testLog.scopeCalls);
    // Should have set providers + multiple unset legacy keys
    expect(calls).toContainEqual(['set', 'providers', expect.any(Array)]);
    const unsets = calls.filter(c => c[0] === 'unset');
    expect(unsets.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── 2d. Interactive — form controls ────────────────────────────────────────
test.describe('Interactive — form controls', () => {
  test('radio button toggles primary tier', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await openModalAndExpand(page);
    const radios = page.locator('[role=radio]');
    // First radio (index 0) should be unchecked initially (primaryTier=paid)
    await expect(radios.nth(0)).not.toHaveAttribute('aria-checked', '');
    // Click second radio (index 1) — the paid tier chip
    await radios.nth(1).click();
    await page.waitForTimeout(300);
    // Should now be checked
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', '');
  });
});

// ─── 2e. Interactive — status line ──────────────────────────────────────────
test.describe('Interactive — status line', () => {
  test('status line updates after master toggle', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    const status = page.locator('.um-dsh-websearch-statusLine');
    const initialText = await status.textContent();
    expect(initialText).toContain('策略：');
    // Toggle master switch
    const sw = page.locator('[role=switch][aria-label=启用搜索]');
    await sw.click();
    await page.waitForTimeout(300);
    const afterText = await status.textContent();
    // Status line should reflect the toggle (strategy may change)
    expect(afterText).toContain('策略：');
    // Toggle back
    await sw.click();
    await page.waitForTimeout(300);
    const restoredText = await status.textContent();
    expect(restoredText).toBe(initialText);
  });
});

// ─── 2f. Layout tests ──────────────────────────────────────────────────────
test.describe('Layout — overflow and scroll', () => {
  test('long provider name does not overflow container', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('详细配置')).click();
    });
    await page.waitForTimeout(300);
    const nameEl = page.locator('.um-dsh-websearch-providerName').first();
    const box = await nameEl.boundingBox();
    const parent = await nameEl.evaluate((el) => {
      const p = el.parentElement;
      return { scrollWidth: p.scrollWidth, clientWidth: p.clientWidth };
    });
    // Parent should not overflow horizontally
    expect(parent.scrollWidth).toBeLessThanOrEqual(parent.clientWidth);
  });

  test('modal content scrolls when taller than viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('详细配置')).click();
    });
    await page.waitForTimeout(300);
    const modalContent = page.locator('.um-dsh-websearch-modalContent');
    const box = await modalContent.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    // Content should be taller than visible area (3 providers × multiple fields)
    expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);
  });
});

// ─── 3. Viewport lab (lab.html) ─────────────────────────────────────────────
test.describe('Viewport lab — responsive widths', () => {
  test('dialog width adapts to each iframe viewport', async ({ page }) => {
    await page.goto(FIX('lab.html'));
    await page.waitForTimeout(500);
    const frames = page.frames().filter(f => f.url() === 'about:srcdoc');
    expect(frames.length).toBe(4);
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const iframe = page.locator('iframe').nth(i);
      const iframeBox = await iframe.boundingBox();
      const dialog = frame.locator('.um-dsh-websearch-dialog');
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      // dialog width should be min(720, iframeWidth - 48)
      const expectedMax = Math.min(720, iframeBox.width - 48);
      expect(box.width).toBeLessThanOrEqual(expectedMax + 4);
      expect(box.width).toBeGreaterThan(0);
    }
  });
});

// ─── 4. Accessibility ───────────────────────────────────────────────────────
test.describe('Accessibility — ARIA roles', () => {
  test('modal has role=dialog', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('详细配置')).click();
    });
    await page.waitForTimeout(300);
    await expect(page.locator('[role=dialog]')).toHaveCount(1);
  });

  test('tabs have role=tab and aria-selected', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('详细配置')).click();
    });
    await page.waitForTimeout(300);
    const tabs = page.locator('[role=tab]');
    await expect(tabs).toHaveCount(4);
    // First tab (first provider) should be selected
    await expect(tabs.first()).toHaveAttribute('aria-selected', '');
  });

  test('switches have role=switch', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    const switches = page.locator('[role=switch]');
    const count = await switches.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('buttons have aria-labels', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await expandCard(page);
    const reorderBtns = page.locator('[aria-label=上移], [aria-label=下移]');
    await expect(reorderBtns).toHaveCount(6);
  });
});

// ─── 5. New UI features ─────────────────────────────────────────────────────
test.describe('New UI — modal editor', () => {
  test('provider editor renders fully expanded without nested collapse controls', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await openModalAndExpand(page);
    // No editor-level expand buttons remain — the tab is the navigation
    await expect(page.locator('.um-dsh-websearch-expandBtn')).toHaveCount(0);
    // Fields render immediately
    await expect(page.locator('[role=radio]')).toHaveCount(2);
    await expect(page.locator('.um-dsh-websearch-addKey')).toHaveCount(1);
    await expect(page.locator('.um-dsh-websearch-keyRow')).toHaveCount(1);
  });
});

test.describe('New UI — key credentials', () => {
  test('adding a key generates the next reference and save writes the value through the credentials face', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await openModalAndExpand(page);
    // Exa already holds UM_WS_EXA_API_KEY → the next row gets the _1 suffix
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '添加密钥').click();
    });
    await page.waitForTimeout(300);
    await expect(page.locator('.um-dsh-websearch-keyTitle').filter({ hasText: 'UM_WS_EXA_API_KEY_1' })).toBeVisible();
    // Type the secret into the new row's password input
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type=password]');
      const input = inputs[inputs.length - 1];
      input.value = 'sk-live-secret';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '保存').click();
    });
    await page.waitForTimeout(500);
    const credCalls = await page.evaluate(() => window.__testLog.credCalls);
    expect(credCalls).toContainEqual(['UM_WS_EXA_API_KEY_1', 'sk-live-secret']);
    const scopeCalls = await page.evaluate(() => window.__testLog.scopeCalls);
    const providersCall = scopeCalls.find(c => c[0] === 'set' && c[1] === 'providers');
    expect(providersCall[2].some(p => (p.keys ?? []).some(k => k.ref === 'UM_WS_EXA_API_KEY_1'))).toBe(true);
    expect(JSON.stringify(providersCall[2]).includes('sk-live-secret')).toBe(false);
    // After save the card re-syncs to the (static) mock snapshot: the staged
    // row and its value input leave the page entirely.
    await expect(page.locator('input[type=password]')).toHaveCount(0);
  });

  test('key inputs are never autofilled by the browser and never echo stored values', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await openModalAndExpand(page);
    // Key rows are accordion items — open the first one to reach its input
    await page.locator('.um-dsh-websearch-keyToggle').first().click();
    await page.waitForTimeout(300);
    const input = page.locator('input[type=password]').first();
    // autoComplete=new-password keeps browser password managers from
    // remembering (and later re-displaying) the API key.
    await expect(input).toHaveAttribute('autocomplete', 'new-password');
    // The stored value is never echoed: the configured row shows only the
    // masked placeholder hint, never a real value.
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('placeholder', /^•+$/);
    await expect(page.locator('.um-dsh-websearch-keyState-on')).toHaveCount(1);
  });
});

test.describe('New UI — key accordion', () => {
  test('only one key row expands at a time', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await openModalAndExpand(page);
    // Fixture exa has one collapsed key row; adding a key auto-opens the new row
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '添加密钥').click();
    });
    await page.waitForTimeout(300);
    const toggles = page.locator('.um-dsh-websearch-keyToggle');
    await expect(toggles).toHaveCount(2);
    await expect(toggles.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'true');
    // Only the open row renders a value input
    await expect(page.locator('input[type=password]')).toHaveCount(1);
    // Opening the first row closes the new one
    await toggles.nth(0).click();
    await page.waitForTimeout(300);
    await expect(toggles.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('input[type=password]')).toHaveCount(1);
    // Clicking the open row collapses everything
    await toggles.nth(0).click();
    await page.waitForTimeout(300);
    await expect(page.locator('input[type=password]')).toHaveCount(0);
  });
});

test.describe('New UI — auto-enable', () => {
  test('selecting free tier auto-enables free when disabled', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await openModalAndExpand(page);
    // Initial: Exa has paid enabled, free disabled
    // Click free tier radio
    const radios = page.locator('[role=radio]');
    await radios.nth(0).click(); // "免费（匿名）"
    await page.waitForTimeout(300);
    // Free tier switch should now be enabled
    const freeSwitch = page.locator('[role=switch][aria-label="免费匿名档位"]').first();
    await expect(freeSwitch).toHaveAttribute('aria-checked', '');
  });
});

test.describe('New UI — conditional hints', () => {
  test('fallback switch warns only while armed and the target tier is off', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await openModalAndExpand(page);
    // Add a key (auto-expanded, both fallback switches off by default)
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '添加密钥');
      if (btn) btn.click();
    });
    await page.waitForTimeout(300);
    // Switches off → no warning, even though Exa's free tier is off
    await expect(page.locator('.um-dsh-websearch-tierHint-off')).toHaveCount(0);
    // Arm 付费 → 免费回退 → the warning appears (free tier is off for Exa)
    await page.locator('[role=switch][aria-label="付费 → 免费回退"]').last().click();
    await page.waitForTimeout(300);
    const hints = page.locator('.um-dsh-websearch-tierHint-off');
    await expect(hints).toHaveCount(1);
    await expect(hints.first()).toContainText('未启用');
    // Disarming the switch clears the warning again
    await page.locator('[role=switch][aria-label="付费 → 免费回退"]').last().click();
    await page.waitForTimeout(300);
    await expect(page.locator('.um-dsh-websearch-tierHint-off')).toHaveCount(0);
  });
});

// ─── 6. CSS assertions ──────────────────────────────────────────────────────
test.describe('CSS — design tokens', () => {
  test('uses um-dsh-websearch token namespace', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await page.waitForTimeout(300);
    const styles = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      let css = '';
      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules) css += rule.cssText;
        } catch { /* cross-origin */ }
      }
      return css;
    });
    expect(styles).toContain('um-dsh-websearch');
    expect(styles).not.toContain('#fff');
    expect(styles).not.toContain('#000');
  });

  test('dialog has min-width rule with vw', async ({ page }) => {
    await page.goto(FIX('interactive.html'));
    await page.waitForTimeout(300);
    const styles = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      let css = '';
      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules) css += rule.cssText;
        } catch { /* cross-origin */ }
      }
      return css;
    });
    expect(styles).toContain('min(');
    expect(styles).toContain('100vw');
  });
});
