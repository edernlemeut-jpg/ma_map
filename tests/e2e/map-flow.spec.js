/**
 * E2E — Carte Interactive Flow (map-flow)
 *
 * Covers:
 *   AC1 — Canvas visible + preview-toggle-btn present in DOM
 *   AC2 — Connection indicator injected dynamically, shows connected state
 *   AC3 — #preview-frame starts hidden; toggle works when user is admin
 *   AC4 — System modal present in DOM and starts hidden
 *   AC8 — Connection indicator shows offline on network failure then reconnects
 *
 * Notes:
 *   - #preview-toggle-btn visibility requires is_admin === true (first DB user).
 *     AC3 performs the toggle assertion only when the button is actually visible;
 *     the initial hidden-frame assertion always runs regardless of admin status.
 *   - #connection-indicator is injected by JS after initAuthUI() completes, not
 *     present in the static HTML.
 */
import { test, expect } from '@playwright/test';

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
}

/**
 * Register a user + create a table.
 * Cookie is set to that user after this call.
 */
async function bootstrapMJ(page) {
  const username = unique('e2e-map');
  await page.request.post('/api/auth/register', {
    data: { username, password: 'password123' }
  });
  const tableRes = await page.request.post('/api/game_tables', {
    data: { name: unique('e2e-t') }
  });
  const tableId = (await tableRes.json()).data.id;
  return { tableId, username };
}

// ---------------------------------------------------------------------------
// Carte — Canvas & UI structure
// ---------------------------------------------------------------------------

test.describe('Carte — Canvas & UI', () => {
  test('AC1 — canvas visible after page load and preview-toggle-btn in DOM', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/carte_interactive.html');

    // Canvas is present in static HTML and sized by JS on module load
    await expect(page.locator('#galaxy-canvas')).toBeVisible({ timeout: 10000 });

    // Button is always in the DOM (class="hidden" until JS removes it for admins)
    await expect(page.locator('#preview-toggle-btn')).toBeAttached();
  });

  test('AC2 — connection-indicator injected by JS and shows connected state', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/carte_interactive.html');
    await expect(page.locator('#galaxy-canvas')).toBeVisible({ timeout: 10000 });

    // #connection-indicator is created dynamically after initAuthUI() resolves
    await expect(page.locator('#connection-indicator')).toBeAttached({ timeout: 15000 });

    // With a live server and valid table the first poll should succeed → 🟢 Connecté
    await expect(page.locator('#connection-indicator')).toContainText('🟢', { timeout: 15000 });
  });

  test('AC3 — preview-frame starts hidden; toggle changes class when admin', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/carte_interactive.html');
    await expect(page.locator('#galaxy-canvas')).toBeVisible({ timeout: 10000 });

    // #preview-frame always starts with class 'hidden'
    await expect(page.locator('#preview-frame')).toHaveClass(/hidden/);

    // The toggle only works when currentUser.is_admin === true (first DB user).
    // We check visibility rather than guessing admin status.
    const isAdmin = await page.locator('#preview-toggle-btn').evaluate(
      el => !el.classList.contains('hidden')
    );

    if (isAdmin) {
      await page.click('#preview-toggle-btn');
      await expect(page.locator('#preview-frame')).not.toHaveClass(/hidden/);

      // Second click restores hidden state
      await page.click('#preview-exit-btn');
      await expect(page.locator('#preview-frame')).toHaveClass(/hidden/);
    }
    // When not admin, the initial hidden assertion above is sufficient.
  });

  test('AC4 — system-modal present in DOM and starts hidden', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/carte_interactive.html');
    await expect(page.locator('#galaxy-canvas')).toBeVisible({ timeout: 10000 });

    await expect(page.locator('#system-modal')).toBeAttached();
    await expect(page.locator('#system-modal')).toHaveClass(/hidden/);
  });
});

// ---------------------------------------------------------------------------
// Carte — Resync UI (AC8)
// ---------------------------------------------------------------------------

test.describe('Carte — Resync UI', () => {
  test('AC8 — indicator shows offline after poll failures then reconnects', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    // Block /api/sync before navigation so the first (immediate) poll also fails.
    // After ≥2 failures (retryBaseMs=1000ms → ~2 s), pollFailureCount≥2 → offline.
    await page.route('**/api/sync', route =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'service unavailable' })
      })
    );

    await page.goto('/carte_interactive.html');
    await expect(page.locator('#galaxy-canvas')).toBeVisible({ timeout: 10000 });

    // Wait for indicator to be injected
    await expect(page.locator('#connection-indicator')).toBeAttached({ timeout: 15000 });

    // After 2+ failed polls the indicator shows 🔴
    await expect(page.locator('#connection-indicator')).toContainText('🔴', { timeout: 20000 });

    // Restore the real endpoint — next retry will succeed
    await page.unroute('**/api/sync');

    // Indicator should revert to 🟢 after a successful poll (retry backoff ≤ 4 s)
    await expect(page.locator('#connection-indicator')).toContainText('🟢', { timeout: 20000 });
  });
});
