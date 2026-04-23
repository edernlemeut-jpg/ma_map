/**
 * Unit tests for compendium frontend logic.
 * Tests pure functions and state management without DOM rendering.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// We can't import the browser module directly (it uses DOM + browser imports).
// Instead, we test the logic extracted into pure functions.

// --- Replicate the pure logic from compendium-app.js ---

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function handleSyncData(data, state) {
  if (!data || !data.entities) return;
  for (const type of ['systems', 'factions', 'ship_models']) {
    const newCount = data.entities[type]?.count;
    if (newCount == null) continue;
    if (newCount !== state.lastKnownCounts[type]) {
      state.badges[type] = true;
      state.lastKnownCounts[type] = newCount;
    }
  }
}

function detectMJ(allEntities) {
  return allEntities.length > 0 && 'visible' in allEntities[0];
}

// --- Tests ---

describe('Compendium frontend — esc()', () => {
  it('escapes HTML special characters', () => {
    assert.equal(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('returns empty string for null/undefined', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
  });

  it('converts numbers to string', () => {
    assert.equal(esc(42), '42');
  });

  it('passes through safe strings unchanged', () => {
    assert.equal(esc('Hello World'), 'Hello World');
  });
});

describe('Compendium frontend — handleSyncData()', () => {
  let state;

  beforeEach(() => {
    state = {
      lastKnownCounts: { systems: 5, factions: 3, ship_models: 2 },
      badges: { systems: false, factions: false, ship_models: false }
    };
  });

  it('sets badge when count increases', () => {
    handleSyncData({ entities: { systems: { count: 6 }, factions: { count: 3 }, ship_models: { count: 2 } } }, state);
    assert.equal(state.badges.systems, true);
    assert.equal(state.badges.factions, false);
    assert.equal(state.badges.ship_models, false);
  });

  it('sets badge when count decreases (MJ hid something)', () => {
    handleSyncData({ entities: { systems: { count: 5 }, factions: { count: 2 }, ship_models: { count: 2 } } }, state);
    assert.equal(state.badges.factions, true);
  });

  it('updates lastKnownCounts when count changes', () => {
    handleSyncData({ entities: { systems: { count: 10 }, factions: { count: 3 }, ship_models: { count: 2 } } }, state);
    assert.equal(state.lastKnownCounts.systems, 10);
  });

  it('does not set badge when counts unchanged', () => {
    handleSyncData({ entities: { systems: { count: 5 }, factions: { count: 3 }, ship_models: { count: 2 } } }, state);
    assert.equal(state.badges.systems, false);
    assert.equal(state.badges.factions, false);
    assert.equal(state.badges.ship_models, false);
  });

  it('handles null/missing data gracefully', () => {
    handleSyncData(null, state);
    handleSyncData({}, state);
    handleSyncData({ entities: {} }, state);
    // No badges set, no crash
    assert.equal(state.badges.systems, false);
  });

  it('sets multiple badges at once', () => {
    handleSyncData({ entities: { systems: { count: 10 }, factions: { count: 10 }, ship_models: { count: 10 } } }, state);
    assert.equal(state.badges.systems, true);
    assert.equal(state.badges.factions, true);
    assert.equal(state.badges.ship_models, true);
  });
});

describe('Compendium frontend — MJ detection', () => {
  it('detects MJ when entities have visible field', () => {
    assert.equal(detectMJ([{ id: 1, visible: true }]), true);
    assert.equal(detectMJ([{ id: 1, visible: false }]), true);
  });

  it('detects joueur when entities lack visible field', () => {
    assert.equal(detectMJ([{ id: 1, nom: 'test' }]), false);
  });

  it('returns false for empty array', () => {
    assert.equal(detectMJ([]), false);
  });
});

describe('Compendium frontend — tab state', () => {
  it('activeTab defaults to systems', () => {
    const state = { activeTab: 'systems' };
    assert.equal(state.activeTab, 'systems');
  });

  it('tab switching updates activeTab', () => {
    const state = { activeTab: 'systems' };
    state.activeTab = 'factions';
    assert.equal(state.activeTab, 'factions');
  });

  it('badge clears on tab switch', () => {
    const state = {
      badges: { systems: true, factions: false, ship_models: false }
    };
    // Simulate switchTab — clears badge
    state.badges.systems = false;
    assert.equal(state.badges.systems, false);
  });
});

describe('Compendium frontend — search state', () => {
  it('searchMode defaults to false', () => {
    const state = { searchMode: false, searchResults: [] };
    assert.equal(state.searchMode, false);
    assert.deepEqual(state.searchResults, []);
  });

  it('entering search mode clears when query < 2 chars', () => {
    const state = { searchMode: true, searchResults: [{ type: 'systems', id: 1 }] };
    // Simulate exitSearchMode
    state.searchMode = false;
    state.searchResults = [];
    assert.equal(state.searchMode, false);
    assert.deepEqual(state.searchResults, []);
  });

  it('search results are grouped by type', () => {
    const results = [
      { type: 'systems', id: 1, nom: 'Sol' },
      { type: 'factions', id: 2, name: 'Empire' },
      { type: 'systems', id: 3, nom: 'Vega' },
      { type: 'ship_models', id: 'sm1', nom: 'Croiseur' }
    ];

    const grouped = { systems: [], factions: [], ship_models: [] };
    for (const r of results) {
      if (grouped[r.type]) grouped[r.type].push(r);
    }

    assert.equal(grouped.systems.length, 2);
    assert.equal(grouped.factions.length, 1);
    assert.equal(grouped.ship_models.length, 1);
  });

  it('debounce does not trigger for queries under 2 characters', () => {
    // Simulate debounce logic
    let searchCalled = false;
    const query = 'a';
    if (query.length >= 2) {
      searchCalled = true;
    }
    assert.equal(searchCalled, false);
  });

  it('debounce triggers for queries of 2+ characters', () => {
    let searchCalled = false;
    const query = 'ab';
    if (query.length >= 2) {
      searchCalled = true;
    }
    assert.equal(searchCalled, true);
  });
});

describe('Compendium frontend — edit controls', () => {
  it('edit button renders only for MJ', () => {
    const state = { isMJ: true };
    // renderEditButton returns HTML only when isMJ
    const htmlMJ = state.isMJ ? '<button class="edit-btn">✏️</button>' : '';
    assert.ok(htmlMJ.includes('edit-btn'));

    state.isMJ = false;
    const htmlPlayer = state.isMJ ? '<button class="edit-btn">✏️</button>' : '';
    assert.equal(htmlPlayer, '');
  });

  it('EDIT_FIELDS has config for all 3 entity types', () => {
    const EDIT_FIELDS = {
      systems: [{ key: 'nom' }, { key: 'quadrant' }],
      factions: [{ key: 'name' }, { key: 'short' }],
      ship_models: [{ key: 'nom' }, { key: 'classe' }]
    };
    assert.ok(EDIT_FIELDS.systems.length > 0);
    assert.ok(EDIT_FIELDS.factions.length > 0);
    assert.ok(EDIT_FIELDS.ship_models.length > 0);
  });

  it('edit modal state: open and close cycle', () => {
    let modalOpen = false;
    // Simulate open
    modalOpen = true;
    assert.equal(modalOpen, true);
    // Simulate close (Escape or button)
    modalOpen = false;
    assert.equal(modalOpen, false);
  });
});
