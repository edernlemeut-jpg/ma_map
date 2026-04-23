import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ──────────────────────────────────────────────────────────────────────────────
// Minimal DOM stub for test environment (no browser)
// ──────────────────────────────────────────────────────────────────────────────
class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.innerHTML = '';
    this.className = '';
    this.href = '';
    this.children = [];
    this._classes = new Set();
    this._listeners = {};
    this.title = '';
  }
  classList = {
    _el: null,
    add(cls) { this._el._classes.add(cls); this._el.className = [...this._el._classes].join(' '); },
    remove(cls) { this._el._classes.delete(cls); this._el.className = [...this._el._classes].join(' '); },
    contains(cls) { return this._el._classes.has(cls); }
  };
  appendChild(child) { this.children.push(child); }
  addEventListener(evt, fn) {
    if (!this._listeners[evt]) this._listeners[evt] = [];
    this._listeners[evt].push(fn);
  }
  closest() { return null; }
}

function makeEl(tag) {
  const el = new FakeElement(tag);
  el.classList._el = el;
  return el;
}

// ──────────────────────────────────────────────────────────────────────────────
// Extracted pure functions to test (mirrored from dashboard.html logic)
// ──────────────────────────────────────────────────────────────────────────────

const TYPE_META = {
  systems:     { label: 'Système',  icon: '🌟' },
  factions:    { label: 'Faction',  icon: '⚔️' },
  ship_models: { label: 'Vaisseau', icon: '🚀' }
};

function escapeHtml(str) {
  if (str == null) return '';
  // In tests (no real DOM), just return string (no XSS risk here)
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Returns { items: FakeElement[], emptyMsg: string|null }
 * Mirrors the renderSearchResults logic
 */
function renderSearchResultsToContainer(container, results, query) {
  container.innerHTML = '';
  container.children = [];

  const limited = results.slice(0, 20);

  if (limited.length === 0) {
    container.innerHTML = `<p class="px-4 py-3 text-sm text-gray-400">Aucun résultat pour <strong>"${escapeHtml(query)}"</strong></p>`;
  } else {
    for (const item of limited) {
      const meta = TYPE_META[item.type] || { label: item.type, icon: '📄' };
      const name = item.nom || item.name || String(item.id);
      const visIcon = item.visible === true ? '👁️' : item.visible === false ? '🔒' : '';
      const a = makeEl('a');
      a.href = '/compendium.html';
      a.className = 'flex items-center justify-between px-4 py-3 hover:bg-gray-700 transition-colors';
      a.innerHTML = `${meta.icon} ${escapeHtml(name)} ${escapeHtml(meta.label)} ${visIcon}`;
      container.appendChild(a);
    }
  }

  container.classList.remove('hidden');
}

// Debounce function (mirrors dashboard.html)
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('Dashboard Search — unit tests', () => {

  // T3.1 — renderSearchResults with results → items rendered
  it('T3.1 renders result items for each search result', () => {
    const container = makeEl('div');
    const results = [
      { type: 'systems', id: 1, nom: 'Sol', visible: true },
      { type: 'factions', id: 2, name: 'Empire', visible: false }
    ];

    renderSearchResultsToContainer(container, results, 'sol');

    assert.equal(container.children.length, 2, 'should render 2 items');
    assert.ok(container.children[0].innerHTML.includes('Sol'), 'first item should contain system name');
    assert.ok(container.children[1].innerHTML.includes('Empire'), 'second item should contain faction name');
    assert.ok(!container.classList.contains('hidden'), 'container should be visible');
  });

  // T3.2 — renderSearchResults with [] → empty message
  it('T3.2 shows empty message when no results', () => {
    const container = makeEl('div');

    renderSearchResultsToContainer(container, [], 'zzzunknown');

    assert.equal(container.children.length, 0, 'no clickable items');
    assert.ok(container.innerHTML.includes('Aucun résultat'), 'should show empty message');
    assert.ok(container.innerHTML.includes('zzzunknown'), 'empty message should echo the query');
  });

  // T3.3 — max 20 results
  it('T3.3 limits results to 20 even if more are provided', () => {
    const container = makeEl('div');
    const results = Array.from({ length: 35 }, (_, i) => ({
      type: 'systems', id: i, nom: `System ${i}`, visible: true
    }));

    renderSearchResultsToContainer(container, results, 'sys');

    assert.ok(container.children.length <= 20, `should show at most 20 items (got ${container.children.length})`);
    assert.equal(container.children.length, 20, 'should show exactly 20 items');
  });

  // T3.4 — debounce: single call after delay
  it('T3.4 debounce executes function only once after rapid calls', async () => {
    let callCount = 0;
    const debouncedFn = debounce(() => { callCount++; }, 50);

    // Rapid calls
    debouncedFn();
    debouncedFn();
    debouncedFn();

    // Should not be called yet
    assert.equal(callCount, 0, 'should not call immediately');

    // Wait for debounce to fire
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.equal(callCount, 1, 'should call exactly once after debounce period');
  });

  // T3.5 — visibility icons shown correctly
  it('T3.5 visible items show eye icon, hidden items show lock icon', () => {
    const container = makeEl('div');
    const results = [
      { type: 'systems', id: 1, nom: 'Visible', visible: true },
      { type: 'systems', id: 2, nom: 'Hidden', visible: false }
    ];

    renderSearchResultsToContainer(container, results, 'test');

    assert.ok(container.children[0].innerHTML.includes('👁️'), 'visible item should have eye icon');
    assert.ok(container.children[1].innerHTML.includes('🔒'), 'hidden item should have lock icon');
  });

  // T3.6 — type icons rendered correctly
  it('T3.6 type icons are mapped correctly per entity type', () => {
    const container = makeEl('div');
    const results = [
      { type: 'systems',     id: 1, nom: 'Sol',     visible: true },
      { type: 'factions',    id: 2, name: 'Empire', visible: true },
      { type: 'ship_models', id: 3, nom: 'X-Wing',  visible: true }
    ];

    renderSearchResultsToContainer(container, results, 'x');

    assert.ok(container.children[0].innerHTML.includes('🌟'), 'systems should use star icon');
    assert.ok(container.children[1].innerHTML.includes('⚔️'), 'factions should use sword icon');
    assert.ok(container.children[2].innerHTML.includes('🚀'), 'ship_models should use rocket icon');
  });

});
