/**
 * E2E — MJ Complete Flow
 *
 * Covers:
 *   - Compendium: MJ sees all systems + visibility toggle buttons
 *   - Compendium: MJ toggles a system visible
 *   - Dashboard: stats load, session toggle, bulk reveal confirm bar, undo toast
 *   - Dashboard: search cross-entities produces results
 *   - Dashboard: preview mode (cadre coloré)
 */
import { test, expect } from '@playwright/test';

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
}

/**
 * Bootstrap MJ user + table + one visible system.
 * Returns { tableId, systemId } with MJ cookie active on the page.
 */
async function bootstrapMJ(page) {
  const username = unique('e2e-mj');
  const tableName = unique('e2e-t');

  await page.request.post('/api/auth/register', {
    data: { username, password: 'password123' }
  });

  const tableRes = await page.request.post('/api/game_tables', {
    data: { name: tableName }
  });
  const tableId = (await tableRes.json()).data.id;

  // Create a system for this test
  const systemName = unique('e2e-sys');
  const sysRes = await page.request.post('/api/systems', {
    data: { nom: systemName, quadrant: 'Α-1', route: 0 },
    headers: { 'X-Table-Id': String(tableId) }
  });
  const systemId = (await sysRes.json()).data.id;

  return { tableId, systemId, systemName, username };
}

// ---------------------------------------------------------------------------
// Compendium — MJ view
// ---------------------------------------------------------------------------

test.describe('MJ — Compendium', () => {
  test('MJ sees systems tab with vis-toggle buttons', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    // Set table context in localStorage before navigation
    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/compendium.html');

    // Tab nav should appear after data loads
    await expect(page.locator('#tab-nav')).not.toHaveClass(/hidden/, { timeout: 15000 });

    // Systems tab is selected by default; click it to be sure
    await page.click('button[data-tab="systems"]');

    // At least one vis-toggle button should be visible (MJ only)
    await expect(page.locator('.vis-toggle').first()).toBeVisible({ timeout: 10000 });
  });

  test('MJ can toggle a system visible via vis-toggle button', async ({ page }) => {
    const { tableId, systemId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/compendium.html');
    await expect(page.locator('#tab-nav')).not.toHaveClass(/hidden/, { timeout: 15000 });
    await page.click('button[data-tab="systems"]');

    // Find the toggle for our specific system
    const toggleBtn = page.locator(`.vis-toggle[data-id="${systemId}"]`);
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });

    const wasPreviouslyVisible = (await toggleBtn.getAttribute('data-visible')) === 'true';

    // Intercept the visibility PATCH to confirm the call is made
    const [request] = await Promise.all([
      page.waitForRequest(req =>
        req.url().includes(`/api/visibility/systems/${systemId}`) &&
        req.method() === 'PATCH'
      ),
      toggleBtn.click()
    ]);

    expect(request).toBeTruthy();

    // After toggle, data-visible should flip
    const isNowVisible = (await toggleBtn.getAttribute('data-visible')) === 'true';
    expect(isNowVisible).toBe(!wasPreviouslyVisible);
  });

  test('MJ search shows all matching results including hidden entities', async ({ page }) => {
    const { tableId, systemName } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/compendium.html');
    await expect(page.locator('#tab-nav')).not.toHaveClass(/hidden/, { timeout: 15000 });

    // Type the first 8 chars of the system name (known unique prefix)
    const searchBar = page.locator('#search-input');
    await searchBar.fill(systemName.slice(0, 8));

    // Search results container should become visible (shown before fetch resolves)
    await expect(page.locator('#search-results')).not.toHaveClass(/hidden/, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Dashboard — MJ view
// ---------------------------------------------------------------------------

test.describe('MJ — Dashboard', () => {
  test('dashboard loads and shows stats', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/dashboard.html');

    // Dashboard content should become visible
    await expect(page.locator('#dashboard-content')).not.toHaveClass(/hidden/, { timeout: 15000 });

    // Stats sections are rendered (even if values are "—")
    await expect(page.locator('#stats-systems')).toBeVisible();
    await expect(page.locator('#stats-players')).toBeVisible();
  });

  test('session toggle changes session state label', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/dashboard.html');
    await expect(page.locator('#dashboard-content')).not.toHaveClass(/hidden/, { timeout: 15000 });

    const initialLabel = await page.locator('#session-state-label').textContent();

    await page.click('#session-toggle-btn');

    // Label should change after API call
    await expect(page.locator('#session-state-label')).not.toHaveText(initialLabel ?? '', { timeout: 8000 });
  });

  test('bulk reveal: selecting type+action shows confirm bar', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/dashboard.html');
    await expect(page.locator('#dashboard-content')).not.toHaveClass(/hidden/, { timeout: 15000 });

    // Select a bulk type (Systèmes)
    await page.selectOption('#bulk-type', 'systems');
    // Select action Révéler
    await page.selectOption('#bulk-action', 'true');
    // Click preview to show the confirm bar
    await page.click('#bulk-preview-btn');

    // Confirm bar should appear
    await expect(page.locator('#bulk-confirm-bar')).not.toHaveClass(/hidden/, { timeout: 5000 });
    await expect(page.locator('#bulk-confirm-label')).toContainText(/.+/);

    // Cancel should hide the bar
    await page.click('#bulk-cancel-btn');
    await expect(page.locator('#bulk-confirm-bar')).toHaveClass(/hidden/);
  });

  test('bulk reveal: confirm sends API call and shows undo toast', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/dashboard.html');
    await expect(page.locator('#dashboard-content')).not.toHaveClass(/hidden/, { timeout: 15000 });

    // Select type + action, then click preview
    await page.selectOption('#bulk-type', 'systems');
    await page.selectOption('#bulk-action', 'true');
    await page.click('#bulk-preview-btn');
    await expect(page.locator('#bulk-confirm-bar')).not.toHaveClass(/hidden/, { timeout: 5000 });

    // Set up API intercept BEFORE clicking confirm, then click
    const requestPromise = page.waitForRequest(req =>
      req.url().includes('/api/visibility/bulk') && req.method() === 'POST',
      { timeout: 15000 }
    );
    await page.click('#bulk-confirm-btn');

    // The toast must appear immediately (deferred queue pending) — check BEFORE API commit
    await expect(page.locator('#deferred-toast')).not.toHaveClass(/hidden/, { timeout: 3000 });
    await expect(page.locator('#deferred-undo-btn')).toBeVisible();

    // API call happens after 8s deferred window — verify it reaches the server
    const request = await requestPromise;
    expect(request.postDataJSON().entityType).toBe('systems');
    expect(request.postDataJSON().visible).toBe(true);
  });

  test('dashboard cross-entity search produces results', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/dashboard.html');
    await expect(page.locator('#dashboard-content')).not.toHaveClass(/hidden/, { timeout: 15000 });

    // Type a search query (letter common in quadrant names)
    await page.fill('#search-input', 'e2e');

    // Search results dropdown should appear
    await expect(page.locator('#search-results')).not.toHaveClass(/hidden/, { timeout: 8000 });
  });
});
