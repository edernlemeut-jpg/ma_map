---
story_id: 4-2-recherche-cross-entites-rapide
story_title: Recherche cross-entités rapide
epic: epic-4
created: 2026-04-20T13:00:00
status: done
---

# Story 4.2: Recherche cross-entités rapide

## Context

**Epic:** Epic 4 — Dashboard MJ & Visibilité avancée  
**Story Points:** 5 (Medium-low: UI uniquement, l'API `/api/search` existe déjà depuis Story 2.4)  
**Related Stories:** 2.4 (search endpoint + `searchEntities` service), 4.1 (dashboard.html créé)

L'API `GET /api/search?q=X&types=...` existe et renvoie systèmes/factions/vaisseaux avec statut de visibilité pour le MJ. Cette story ajoute uniquement la barre de recherche sur `public/dashboard.html` qui l'utilise.

---

## Acceptance Criteria

### AC1: Barre de recherche présente

**Given** je suis MJ sur le dashboard  
**When** la page est affichée  
**Then** une barre de recherche est visible, accessible d'un tap, avec icône 🔍

### AC2: Résultats en temps réel avec debounce

**Given** je suis MJ sur le dashboard  
**When** je tape ≥ 2 caractères dans la barre de recherche  
**Then** les résultats apparaissent après 300ms de debounce  
**And** chaque résultat affiche : icône type, nom, type en texte, icône visibilité (👁️ / 🔒)

### AC3: État vide

**Given** la recherche retourne 0 résultat  
**When** les résultats s'affichent  
**Then** un message « Aucun résultat pour "X" » est affiché  
**And** si la barre est vidée (< 2 chars), les résultats disparaissent

### AC4: Clic sur résultat

**Given** des résultats sont affichés  
**When** je clique sur un résultat  
**Then** je suis redirigé vers `/compendium.html` (page unique pour systèmes/factions/vaisseaux)

### AC5: Limite 20 résultats

**Given** la recherche retourne > 20 résultats  
**When** les résultats s'affichent  
**Then** au maximum 20 résultats sont affichés

---

## Tasks

### T1: Ajouter barre de recherche dans dashboard.html (10 min)

**File:** `public/dashboard.html`

**Changes:**
- Après le `<h2>` d'en-tête de la section stats (ou en haut du `<main>`), ajouter :
  ```html
  <section>
    <div class="relative">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</span>
      <input id="search-input" type="text"
             class="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-10 py-3 min-h-[44px] text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
             placeholder="Rechercher systèmes, factions, vaisseaux…" autocomplete="off">
      <button id="search-clear" class="hidden absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 min-w-[44px] min-h-[44px] flex items-center justify-center" title="Effacer">✕</button>
    </div>
    <div id="search-results" class="hidden mt-2 bg-gray-800 border border-gray-700 rounded-lg divide-y divide-gray-700 max-h-96 overflow-y-auto"></div>
  </section>
  ```
- La section de recherche apparaît **toujours** (pas conditionnelle au chargement du dashboard)

### T2: Logique JS de recherche (15 min)

**File:** `public/dashboard.html` (bloc `<script type="module">`, ajouter après `loadDashboardData`)

**Changes:**

```javascript
// Debounce helper
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Type labels and icons
const TYPE_META = {
  systems:     { label: 'Système',  icon: '🌟' },
  factions:    { label: 'Faction',  icon: '⚔️' },
  ship_models: { label: 'Vaisseau', icon: '🚀' }
};

function renderSearchResults(results, query) {
  const container = $('search-results');
  container.innerHTML = '';

  const limited = results.slice(0, 20);

  if (limited.length === 0) {
    container.innerHTML = `<p class="px-4 py-3 text-sm text-gray-400">Aucun résultat pour <strong>"${escapeHtml(query)}"</strong></p>`;
  } else {
    for (const item of limited) {
      const meta = TYPE_META[item.type] || { label: item.type, icon: '📄' };
      const name = item.nom || item.name || String(item.id);
      const visIcon = item.visible === true ? '👁️' : item.visible === false ? '🔒' : '';
      const a = document.createElement('a');
      a.href = '/compendium.html';
      a.className = 'flex items-center justify-between px-4 py-3 hover:bg-gray-700 transition-colors';
      a.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="text-lg">${meta.icon}</span>
          <div>
            <p class="text-sm font-medium">${escapeHtml(name)}</p>
            <p class="text-xs text-gray-400">${escapeHtml(meta.label)}</p>
          </div>
        </div>
        <span class="text-base" title="${item.visible ? 'Visible' : 'Caché'}">${visIcon}</span>
      `;
      container.appendChild(a);
    }
  }

  container.classList.remove('hidden');
}

async function performSearch(query) {
  if (query.length < 2) {
    $('search-results').classList.add('hidden');
    $('search-clear').classList.add('hidden');
    return;
  }
  $('search-clear').classList.remove('hidden');

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { credentials: 'include' });
    if (!res.ok) return;
    const { data } = await res.json();
    renderSearchResults(Array.isArray(data) ? data : [], query);
  } catch {
    // Ignore search errors — silent
  }
}

const debouncedSearch = debounce(performSearch, 300);

$('search-input').addEventListener('input', e => {
  debouncedSearch(e.target.value.trim());
});

$('search-clear').addEventListener('click', () => {
  $('search-input').value = '';
  $('search-results').classList.add('hidden');
  $('search-clear').classList.add('hidden');
  $('search-input').focus();
});

// Close results when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('#search-input') && !e.target.closest('#search-results') && !e.target.closest('#search-clear')) {
    $('search-results').classList.add('hidden');
  }
});
```

### T3: Tests frontend (15 min)

**File:** `tests/unit/dashboard-search.test.js` (nouveau fichier)

Tests JS purs (pas d'HTTP), couvrant la logique front :
- T3.1 : `renderSearchResults` avec résultats → items rendus
- T3.2 : `renderSearchResults` avec [] → message "Aucun résultat"
- T3.3 : max 20 résultats affichés si > 20 fournis
- T3.4 : debounce : appel unique après 300ms

---

## Technical Notes

### API existante — rappel du contrat

```
GET /api/search?q=X&types=systems,factions,ship_models
```
- Requiert table sélectionnée (cookie + header `X-Table-Id`)
- Retourne `{ "data": [ { type, id, nom|name, visible, ...fields } ] }`
- `visible` : boolean pour le MJ (présent depuis Story 2.4)
- Plausible deniability : déjà géré côté serveur (joueurs ne voient que leurs entités visibles)
- Maximum résultats : pas de LIMIT SQL côté serveur → gérer les 20 côté frontend

### Pas de nouveau endpoint

Cette story est **100% frontend**. `GET /api/search` suffit.

### Position de la barre dans le HTML

La barre de recherche doit être **dans** le `#dashboard-content` (visible une fois le dashboard chargé) ou **hors** du loading guard. Choisir hors du guard = toujours visible et accessible immédiatement, cohérent avec l'AC "accessible en 1 tap". Recommandé : ajouter dans le `<main>` avant le `#loading`, hors du `#dashboard-content`.

### Leçons des stories précédentes

1. **Tailwind dans `class=""` uniquement** — jamais dans `<style>` inline
2. **`escapeHtml()`** — déjà présente dans `dashboard.html`, ne pas dupliquer, juste appeler
3. **`credentials: 'include'`** sur tous les `fetch()` — le cookie JWT est httpOnly

### Run tests

```bash
node --test tests/unit/dashboard-search.test.js
```
