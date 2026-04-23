/**
 * E2E — Itinéraire Flow (itinerary-flow)
 *
 * Covers:
 *   AC5 — Itinerary page accessible to a logged-in MJ
 *   AC6 — #ship-select contains an option matching a created ship
 *   AC7 — Route calculation between two quadrants produces a result
 *
 * Notes:
 *   - The map grid uses Greek letter coordinates (Α-1, Β-1, …).
 *     AC7 reads coords directly from the rendered .quad cells via page.evaluate()
 *     to avoid hardcoding Unicode characters.
 *   - window.APP.add() is the same function called internally by .btn-dep/.btn-eta
 *     click handlers. Using it programmatically is the reliable desktop headless
 *     alternative to clicking canvas grid cells.
 *   - #btn-calc-desktop starts with style="display:none" and becomes visible once
 *     at least one waypoint is added (updateDesktopPointsList resets the inline style).
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
  const username = unique('e2e-itin');
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
// Itinéraire — MJ access & page structure
// ---------------------------------------------------------------------------

test.describe('Itinéraire — MJ access', () => {
  test('AC5 — itinerary page loads with carte, ship-select and header', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/itineraire.html');

    await expect(page.locator('#carte')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#ship-select')).toBeAttached();
    await expect(page.locator('#app-header')).toBeVisible();

    // Should not redirect to /login.html
    await expect(page).not.toHaveURL(/login/);
  });

  test('AC6 — ship-select contains option for a ship created via API', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    // Create a ship on the table
    const shipName = unique('e2e-ship');
    const shipRes = await page.request.post('/api/ships', {
      data: { name: shipName },
      headers: { 'X-Table-Id': String(tableId) }
    });
    expect(shipRes.ok()).toBeTruthy();
    const shipId = (await shipRes.json()).data.id;

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/itineraire.html');

    // Wait for the grid to be populated — signals that init() has completed
    // and populateShipSelect() has been called.
    await page.waitForSelector('#carte .quad', { timeout: 15000 });

    // The select should have an <option value="{shipId}">
    await expect(
      page.locator(`#ship-select option[value="${shipId}"]`)
    ).toBeAttached({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Itinéraire — Route calculation
// ---------------------------------------------------------------------------

test.describe('Itinéraire — Route calculation', () => {
  test('AC7 — route calculated between two map quadrants', async ({ page }) => {
    const { tableId } = await bootstrapMJ(page);

    await page.addInitScript(({ tid }) => {
      window.localStorage.setItem('active_table_id', String(tid));
      window.localStorage.setItem('active_table_role', 'mj');
    }, { tid: tableId });

    await page.goto('/itineraire.html');

    // Wait for the full grid to render (signals initCarte() + window.APP are ready)
    await page.waitForSelector('#carte .quad', { timeout: 15000 });

    // Add two waypoints via window.APP.add() — same code path as the .btn-dep/.btn-eta
    // click handlers. We read quadrant coords from the DOM to avoid hardcoding
    // Unicode Greek letters (Α-1 … Π′-40).
    await page.evaluate(() => {
      const cells = document.querySelectorAll('#carte .quad[data-coord]');
      if (cells.length < 2) throw new Error('Grid not ready: no cells found');
      const depCoord = cells[0].dataset.coord;
      const arrCoord = cells[cells.length - 1].dataset.coord;
      window.APP.add(JSON.stringify({ quadrant: depCoord, systemNom: null, astroNom: null, orbit: 0 }));
      window.APP.add(JSON.stringify({ quadrant: arrCoord, systemNom: null, astroNom: null, orbit: 0 }));
    });

    // #btn-calc-desktop loses its inline display:none once points exist
    await expect(page.locator('#btn-calc-desktop')).toBeVisible({ timeout: 5000 });

    // Trigger route calculation
    await page.click('#btn-calc-desktop');

    // Result section becomes visible (inline display:none is cleared by renderTrip)
    await expect(page.locator('#dp-result-section')).toBeVisible({ timeout: 10000 });

    // Summary must contain text (days · PC · Conso)
    await expect(page.locator('#dp-summary')).not.toBeEmpty({ timeout: 5000 });
  });
});
