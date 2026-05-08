/**
 * pre-retrofit-snapshots.test.js — Baseline E2E screenshots before MF Pool widget integration
 *
 * Covers: Story 11.1 — AR7 (E2E), protection régression Epic 11
 *
 * Snapshots saved to: tests/snapshots/pre-mf-retrofit/
 *
 * Zones affected by Epic 11 retrofit:
 *   - Dashboard MJ (index.html): a new MF Pool widget will be injected into
 *     #dashboard-content, likely after the session toggle row or in a dedicated card.
 *     Zone to watch: top portion of #dashboard-content (MJ role view).
 *
 *   - Itinéraire (itineraire.html/#mj): the MF widget will appear in the MJ-only
 *     sidebar or as a floating panel. Zone to watch: right/bottom sidebar area.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.resolve(__dirname, '../snapshots/pre-mf-retrofit');

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile',  width: 375,  height: 812 },
];

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
}

/**
 * Bootstrap: register MJ user, create table, set active table in localStorage.
 */
async function bootstrapMJ(page) {
  const username  = unique('snap-mj');
  const tableName = unique('snap-t');

  await page.request.post('/api/auth/register', {
    data: { username, password: 'password123' }
  });

  const tableRes = await page.request.post('/api/game_tables', {
    data: { name: tableName }
  });
  const tableId = (await tableRes.json()).data.id;

  await page.addInitScript(({ tid }) => {
    window.localStorage.setItem('active_table_id', String(tid));
    window.localStorage.setItem('active_table_role', 'mj');
  }, { tid: tableId });

  return { tableId };
}

test.describe('Pre-MF-retrofit snapshots', () => {
  // Ensure snapshot dir exists
  test.beforeAll(() => {
    if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  });

  for (const vp of VIEWPORTS) {
    test(`Dashboard MJ — ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await bootstrapMJ(page);

      await page.goto('/');
      // Wait for dashboard content to be visible (MJ with table)
      await expect(page.locator('#dashboard-content')).not.toHaveClass(/hidden/, { timeout: 15000 });

      const file = path.join(SNAPSHOT_DIR, `dashboard-mj-${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      expect(fs.existsSync(file)).toBe(true);
    });

    test(`Itinéraire — ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await bootstrapMJ(page);

      await page.goto('/itineraire.html');
      // Wait for the page to load meaningfully (map or loading indicator resolves)
      await page.waitForLoadState('networkidle', { timeout: 20000 });

      const file = path.join(SNAPSHOT_DIR, `itineraire-${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      expect(fs.existsSync(file)).toBe(true);
    });
  }
});
