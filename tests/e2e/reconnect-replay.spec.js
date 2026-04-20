import { test, expect } from '@playwright/test';

function makeName(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function bootstrapMj(page, prefix) {
  const username = makeName(`${prefix}-mj`);
  const password = 'password123';

  const register = await page.request.post('/api/auth/register', {
    data: { username, password }
  });
  expect(register.ok()).toBeTruthy();

  const tableRes = await page.request.post('/api/game_tables', {
    data: { name: makeName(`${prefix}-table`) }
  });
  expect(tableRes.ok()).toBeTruthy();
  const table = (await tableRes.json()).data;
  return { tableId: String(table.id) };
}

test.describe('Story 6.1b E2E - restore + reconnect replay', () => {
  test('dashboard restores deferred entry and replays on reconnect', async ({ page, context }) => {
    const { tableId } = await bootstrapMj(page, 'dash');

    const bulkCalls = [];
    let syncCalls = 0;

    await context.route('**/api/sync', async (route) => {
      syncCalls += 1;
      if (syncCalls === 1) {
        await route.abort('failed');
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            version: syncCalls,
            timestamp: new Date().toISOString(),
            sessionActive: false,
            entities: {
              systems: { count: 0, revealed: [], hidden: [], updated: [] },
              factions: { count: 0 },
              ship_models: { count: 0 },
              travel_routes: { count: 0, active: null }
            },
            itinerary: { active_route: null, ships: [], perils: [] }
          }
        })
      });
    });

    await context.route('**/api/visibility/bulk', async (route) => {
      const req = route.request();
      bulkCalls.push(req.postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { affected: 1, version: Date.now() } })
      });
    });

    const queueKey = `mj-offline-queue:dashboard:${tableId}`;
    const persisted = {
      version: 1,
      entries: [
        {
          label: 'Replay systems',
          payload: { entityType: 'systems', filter: {}, visible: true },
          createdAt: Date.now(),
          retainCount: 0
        }
      ]
    };

    await page.addInitScript(({ activeTableId, key, value }) => {
      window.localStorage.setItem('active_table_id', activeTableId);
      window.localStorage.setItem(key, JSON.stringify(value));
    }, { activeTableId: tableId, key: queueKey, value: persisted });

    await page.goto('/dashboard.html');

    await expect
      .poll(() => bulkCalls.length, { timeout: 15000 })
      .toBe(1);

    expect(bulkCalls[0]).toMatchObject({ entityType: 'systems', visible: true });
  });

  test('itineraire restores deferred ship visibility and replays on reconnect', async ({ page, context }) => {
    const { tableId } = await bootstrapMj(page, 'iti');

    const createShip = await page.request.post('/api/ships', {
      headers: { 'X-Table-Id': tableId },
      data: {
        name: makeName('ship'),
        model_id: null,
        hull: 5,
        crew: 3,
        cargo_capacity: 2,
        notes: ''
      }
    });
    expect(createShip.ok()).toBeTruthy();
    const shipId = (await createShip.json()).data.id;

    let syncCalls = 0;
    const shipVisibilityCalls = [];

    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    await context.route('**/api/sync', async (route) => {
      syncCalls += 1;
      if (syncCalls === 1) {
        await route.abort('failed');
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            version: syncCalls,
            timestamp: new Date().toISOString(),
            sessionActive: false,
            entities: {
              systems: { count: 0, revealed: [], hidden: [], updated: [] },
              factions: { count: 0 },
              ship_models: { count: 0 },
              travel_routes: { count: 0, active: null }
            },
            itinerary: { active_route: null, ships: [], perils: [] }
          }
        })
      });
    });

    await context.route('**/api/visibility/ships/*', async (route) => {
      const req = route.request();
      shipVisibilityCalls.push({ url: req.url(), body: req.postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { entityType: 'ships', entityId: shipId, visible: true } })
      });
    });

    const queueKey = `mj-offline-queue:itineraire:${tableId}`;
    const persisted = {
      version: 1,
      entries: [
        {
          label: 'Reveal ship',
          payload: { kind: 'ship-visibility', shipId, visible: true },
          createdAt: Date.now(),
          retainCount: 0
        }
      ]
    };

    await page.addInitScript(({ activeTableId, key, value }) => {
      window.localStorage.setItem('active_table_id', activeTableId);
      window.localStorage.setItem(key, JSON.stringify(value));
    }, { activeTableId: tableId, key: queueKey, value: persisted });

    await page.goto('/itineraire.html');

    await expect
      .poll(() => shipVisibilityCalls.length, { timeout: 20000 })
      .toBe(1);

    expect(shipVisibilityCalls[0].body).toMatchObject({ visible: true });
    expect(shipVisibilityCalls[0].url).toContain(`/api/visibility/ships/${shipId}`);
  });
});
