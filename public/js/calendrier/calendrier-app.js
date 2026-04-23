/**
 * calendrier-app.js — Calendrier Galactique Metal Adventures
 *
 * Format date galactique : XXYY.ZZ
 *   XX = mois 01–10, YY = semaine 01–05, ZZ = jour 01–05
 *   25 jours/mois, 250 jours/an
 */
import { initHeader } from '/js/shared/header.js';
import { fetchWithTable } from '/js/shared/table-selector.js';

// ── State ──────────────────────────────────────────────────────────────────────
let state = {
  currentDate: '0101.01',
  currentYear: 50429,
};
let viewYear = 50429;
let viewMonth = 1;
let categories = [];
let events = [];
let isMJ = false;

// ── Date helpers ───────────────────────────────────────────────────────────────
const DATE_RE = /^(\d{2})(\d{2})\.(\d{2})$/;

function parseDate(s) {
  const m = s?.match(DATE_RE);
  if (!m) return null;
  return { month: +m[1], week: +m[2], day: +m[3] };
}

function formatDate(month, week, day) {
  return `${String(month).padStart(2,'0')}${String(week).padStart(2,'0')}.${String(day).padStart(2,'0')}`;
}

function isValidDate(s) {
  const p = parseDate(s);
  return p && p.month >= 1 && p.month <= 10 && p.week >= 1 && p.week <= 5 && p.day >= 1 && p.day <= 5;
}

function dateToIndex(s) {
  const p = parseDate(s);
  if (!p) return -1;
  return (p.month - 1) * 25 + (p.week - 1) * 5 + (p.day - 1);
}

function humanDate(s, year) {
  const p = parseDate(s);
  if (!p) return s;
  return `An ${year}, Mois ${p.month}, S${p.week}, J${p.day}`;
}

/** Get all events that touch a given day cell (date + year).
 * An event starts at date_start and may end at date_end (same year only for now). */
function eventsForDay(dateStr, year) {
  const idx = dateToIndex(dateStr);
  return events.filter(ev => {
    if (ev.galactic_year !== year) return false;
    const start = dateToIndex(ev.date_start);
    const end = ev.date_end ? dateToIndex(ev.date_end) : start;
    return idx >= start && idx <= end;
  });
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetchWithTable(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Erreur ${res.status}`);
  return json.data ?? json;
}

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  const user = await initHeader();

  const loading = document.getElementById('loading');
  const content = document.getElementById('cal-content');

  // No user or no table — show message
  if (!user) {
    loading.textContent = 'Veuillez vous connecter et rejoindre une table pour accéder au calendrier.';
    return;
  }

  // Detect MJ from header
  const roleEl = document.getElementById('header-table-role');
  isMJ = roleEl?.textContent?.includes('MJ') === true;

  try {
    // Load calendar state + categories + events in parallel
    const [calState, cats] = await Promise.all([
      apiFetch('/api/calendar/state'),
      apiFetch('/api/calendar/categories'),
    ]);

    state = { currentDate: calState.date || '0101.01', currentYear: calState.year || 50429 };
    categories = cats;

    // Set initial view to current campaign month/year
    const parsed = parseDate(state.currentDate);
    viewMonth = parsed ? parsed.month : 1;
    viewYear = state.currentYear;

    events = await apiFetch(`/api/calendar/events?year=${viewYear}`);

    loading.classList.add('hidden');
    content.classList.remove('hidden');

    setupMJControls();
    render();
  } catch (e) {
    loading.textContent = `Erreur : ${e.message}`;
  }
}

// ── MJ controls setup ──────────────────────────────────────────────────────────
function setupMJControls() {
  const mjPanel = document.getElementById('mj-date-form');
  if (isMJ) mjPanel.classList.remove('hidden');

  // Nav buttons
  document.getElementById('btn-prev-month').addEventListener('click', () => navigateMonth(-1));
  document.getElementById('btn-next-month').addEventListener('click', () => navigateMonth(1));
  document.getElementById('btn-prev-year').addEventListener('click', () => navigateYear(-1));
  document.getElementById('btn-next-year').addEventListener('click', () => navigateYear(1));

  if (!isMJ) return;

  // Fill current date inputs
  const inputDate = document.getElementById('input-campaign-date');
  const inputYear = document.getElementById('input-campaign-year');
  inputDate.value = state.currentDate;
  inputYear.value = state.currentYear;

  // Set date button
  document.getElementById('btn-set-date').addEventListener('click', async () => {
    const d = inputDate.value.trim();
    const y = parseInt(inputYear.value);
    if (!isValidDate(d) || !Number.isInteger(y) || y < 1) {
      alert('Date invalide. Utilisez le format XXYY.ZZ (ex: 0301.04) et une année positive.');
      return;
    }
    try {
      const res = await apiFetch('/api/calendar/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: d, year: y }),
      });
      state = { currentDate: res.date, currentYear: res.year };
      // Update header campaign date badge
      updateHeaderDate(state.currentDate, state.currentYear);
      alert(`Date de campagne mise à jour : ${humanDate(state.currentDate, state.currentYear)}`);
      render();
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  });

  // Manage categories
  document.getElementById('btn-manage-cats').addEventListener('click', openCatModal);

  // Add event
  document.getElementById('btn-add-event').addEventListener('click', () => openEventModal(null, null));
}

function updateHeaderDate(date, year) {
  const badge = document.getElementById('header-campaign-date');
  if (!badge) return;
  badge.textContent = `📅 ${date} — An ${year}`;
  badge.classList.remove('hidden');
}

// ── Navigation ────────────────────────────────────────────────────────────────
async function navigateMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 1) { viewMonth = 10; viewYear--; }
  if (viewMonth > 10) { viewMonth = 1; viewYear++; }
  await reloadEventsIfNeeded();
  render();
}

async function navigateYear(delta) {
  viewYear += delta;
  viewMonth = delta > 0 ? 1 : 10;
  await reloadEventsIfNeeded();
  render();
}

let _loadedYear = null;
async function reloadEventsIfNeeded() {
  if (_loadedYear === viewYear) return;
  try {
    events = await apiFetch(`/api/calendar/events?year=${viewYear}`);
    _loadedYear = viewYear;
  } catch { /* keep old events */ }
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const title = document.getElementById('cal-title');
  const grid = document.getElementById('cal-grid');
  const listWrap = document.getElementById('events-list-wrap');
  const list = document.getElementById('events-list');

  const MONTH_NAMES = ['','Ier','IIe','IIIe','IVe','Ve','VIe','VIIe','VIIIe','IXe','Xe'];
  title.textContent = `An ${viewYear} — Mois ${MONTH_NAMES[viewMonth] || viewMonth}`;

  const todayIdx = dateToIndex(state.currentDate);
  const todayYear = state.currentYear;

  grid.innerHTML = '';

  for (let week = 1; week <= 5; week++) {
    for (let day = 1; day <= 5; day++) {
      const dateStr = formatDate(viewMonth, week, day);
      const idx = dateToIndex(dateStr);
      const isToday = viewYear === todayYear && idx === todayIdx;
      const dayEvs = eventsForDay(dateStr, viewYear);
      const isPast = viewYear < todayYear || (viewYear === todayYear && idx < todayIdx);

      const cell = document.createElement('div');
      cell.className = [
        'min-h-[72px] rounded-lg border p-1.5 cursor-pointer transition-colors group',
        isToday
          ? 'border-yellow-400 bg-yellow-400/10'
          : isPast
            ? 'border-gray-700 bg-gray-800/50 opacity-70 hover:opacity-100 hover:border-gray-600'
            : 'border-gray-700 bg-gray-800 hover:border-gray-500',
      ].join(' ');

      // Day label
      const label = document.createElement('div');
      label.className = `text-xs font-mono mb-1 ${isToday ? 'text-yellow-300 font-bold' : 'text-gray-500'}`;
      label.textContent = dateStr;
      cell.appendChild(label);

      // Event pills
      dayEvs.slice(0, 3).forEach(ev => {
        const pill = document.createElement('div');
        const color = ev.category_color || '#6b7280';
        pill.className = 'text-white text-[0.6rem] font-medium rounded px-1 py-0.5 truncate mb-0.5 leading-tight';
        pill.style.backgroundColor = color + 'cc';
        pill.style.borderLeft = `2px solid ${color}`;
        pill.title = ev.title;
        const vis = !ev.is_public ? ' 🔒' : '';
        pill.textContent = ev.title + vis;
        cell.appendChild(pill);
      });
      if (dayEvs.length > 3) {
        const more = document.createElement('div');
        more.className = 'text-[0.6rem] text-gray-400';
        more.textContent = `+${dayEvs.length - 3}`;
        cell.appendChild(more);
      }

      cell.addEventListener('click', () => openDayModal(dateStr, viewYear, dayEvs));
      grid.appendChild(cell);
    }
  }

  // Events list for this month
  const monthEvs = events.filter(ev => {
    const p = parseDate(ev.date_start);
    return p && p.month === viewMonth;
  });
  if (monthEvs.length > 0) {
    listWrap.classList.remove('hidden');
    list.innerHTML = monthEvs.map(ev => renderEventRow(ev)).join('');
    attachEventRowListeners(list);
  } else {
    listWrap.classList.add('hidden');
  }
}

function renderEventRow(ev) {
  const color = ev.category_color || '#6b7280';
  const vis = ev.is_public ? '' : '<span class="text-gray-500 text-xs ml-1" title="Masqué aux joueurs">🔒</span>';
  const range = ev.date_end && ev.date_end !== ev.date_start
    ? `${ev.date_start} → ${ev.date_end}`
    : ev.date_start;
  const catBadge = ev.category_name
    ? `<span class="text-xs rounded px-1.5 py-0.5 font-medium" style="background:${color}33;color:${color};border:1px solid ${color}55">${ev.category_name}</span>`
    : '';
  const mjBtns = isMJ
    ? `<div class="flex gap-1 mt-2">
         <button class="ev-edit text-xs bg-blue-800/60 hover:bg-blue-700 text-blue-200 px-2 py-1 rounded transition-colors" data-id="${ev.id}">Modifier</button>
         <button class="ev-toggle text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors" data-id="${ev.id}" data-public="${ev.is_public}">
           ${ev.is_public ? '🔒 Masquer' : '👁️ Montrer'}
         </button>
         <button class="ev-del text-xs bg-red-900/50 hover:bg-red-800 text-red-300 px-2 py-1 rounded transition-colors" data-id="${ev.id}">Supprimer</button>
       </div>`
    : '';
  return `<div class="border border-gray-700 rounded-lg p-3 bg-gray-800/50">
    <div class="flex items-start gap-2">
      <div class="w-1 rounded-full flex-shrink-0 mt-1 self-stretch" style="background:${color}"></div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium text-sm text-gray-200">${escHtml(ev.title)}</span>
          ${vis}
          ${catBadge}
        </div>
        <div class="text-xs text-gray-400 font-mono mt-0.5">${range} · An ${ev.galactic_year}</div>
        ${ev.description ? `<div class="text-xs text-gray-400 mt-1 line-clamp-2">${escHtml(ev.description)}</div>` : ''}
        ${mjBtns}
      </div>
    </div>
  </div>`;
}

function attachEventRowListeners(container) {
  container.querySelectorAll('.ev-edit').forEach(btn =>
    btn.addEventListener('click', () => openEventModal(events.find(e => e.id === btn.dataset.id), null)));
  container.querySelectorAll('.ev-toggle').forEach(btn =>
    btn.addEventListener('click', () => toggleEventVisibility(btn.dataset.id, btn.dataset.public === '1')));
  container.querySelectorAll('.ev-del').forEach(btn =>
    btn.addEventListener('click', () => deleteEvent(btn.dataset.id)));
}

// ── Day modal ─────────────────────────────────────────────────────────────────
function openDayModal(dateStr, year, dayEvs) {
  const body = document.getElementById('modal-body');
  const p = parseDate(dateStr);
  const isToday = year === state.currentYear && dateToIndex(dateStr) === dateToIndex(state.currentDate);

  let h = `<h2 class="text-base font-semibold text-gray-200 mb-1">${dateStr} · An ${year}</h2>`;
  if (isToday) h += `<div class="text-xs text-yellow-400 mb-3">📍 Date actuelle de campagne</div>`;
  else h += `<div class="mb-3"></div>`;

  if (dayEvs.length === 0) {
    h += `<p class="text-sm text-gray-400">Aucun événement ce jour.</p>`;
  } else {
    h += dayEvs.map(ev => renderEventRow(ev)).join('');
  }

  if (isMJ) {
    h += `<div class="mt-4 border-t border-gray-700 pt-4 flex gap-2 flex-wrap">
      <button id="day-add-ev" class="text-sm bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded transition-colors">＋ Ajouter un événement</button>
      <button id="day-set-date" class="text-sm bg-yellow-700/60 hover:bg-yellow-700 text-yellow-200 px-3 py-1.5 rounded transition-colors">📅 Définir comme date actuelle</button>
    </div>`;
  }

  body.innerHTML = h;
  attachEventRowListeners(body);

  if (isMJ) {
    document.getElementById('day-add-ev')?.addEventListener('click', () => { closeModal(); openEventModal(null, dateStr); });
    document.getElementById('day-set-date')?.addEventListener('click', async () => {
      try {
        const res = await apiFetch('/api/calendar/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateStr, year }),
        });
        state = { currentDate: res.date, currentYear: res.year };
        document.getElementById('input-campaign-date').value = state.currentDate;
        document.getElementById('input-campaign-year').value = state.currentYear;
        updateHeaderDate(state.currentDate, state.currentYear);
        closeModal();
        render();
      } catch (e) { alert('Erreur : ' + e.message); }
    });
  }

  openModal();
}

// ── Event create/edit modal ────────────────────────────────────────────────────
function openEventModal(ev, prefillDate) {
  const body = document.getElementById('modal-body');
  const catOptions = categories
    .map(c => `<option value="${c.id}" ${ev?.category_id === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`)
    .join('');

  const defaultDateStart = prefillDate || ev?.date_start || state.currentDate;
  const defaultYear = ev?.galactic_year || state.currentYear;

  body.innerHTML = `
    <h2 class="text-base font-semibold text-gray-200 mb-4">${ev ? 'Modifier l\'événement' : 'Nouvel événement'}</h2>
    <div class="space-y-3">
      <div>
        <label class="block text-xs text-gray-400 mb-1">Titre *</label>
        <input id="ev-title" type="text" value="${escAttr(ev?.title || '')}" placeholder="Titre de l'événement"
               class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Date début (XXYY.ZZ) *</label>
          <input id="ev-date-start" type="text" maxlength="7" value="${escAttr(defaultDateStart)}" placeholder="0101.01"
                 class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Date fin (optionnel)</label>
          <input id="ev-date-end" type="text" maxlength="7" value="${escAttr(ev?.date_end || '')}" placeholder="0101.01"
                 class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:border-blue-500">
        </div>
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Année galactique *</label>
        <input id="ev-year" type="number" min="1" value="${defaultYear}"
               class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Catégorie</label>
        <select id="ev-cat" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
          <option value="">— Aucune —</option>
          ${catOptions}
        </select>
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Description</label>
        <textarea id="ev-desc" rows="3" placeholder="Description optionnelle…"
                  class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-none">${escHtml(ev?.description || '')}</textarea>
      </div>
      <div class="flex items-center gap-2">
        <input id="ev-public" type="checkbox" ${(!ev || ev.is_public) ? 'checked' : ''}
               class="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500">
        <label for="ev-public" class="text-sm text-gray-300">Visible par les joueurs</label>
      </div>
    </div>
    <div class="mt-5 flex gap-2 justify-end">
      <button id="ev-cancel" class="text-sm text-gray-400 hover:text-gray-200 px-3 py-2 rounded transition-colors">Annuler</button>
      <button id="ev-save" class="text-sm bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors">${ev ? 'Enregistrer' : 'Créer'}</button>
    </div>`;

  document.getElementById('ev-cancel').addEventListener('click', closeModal);
  document.getElementById('ev-save').addEventListener('click', () => saveEvent(ev?.id || null));
  openModal();
}

async function saveEvent(existingId) {
  const title    = document.getElementById('ev-title').value.trim();
  const dateStart = document.getElementById('ev-date-start').value.trim();
  const dateEnd  = document.getElementById('ev-date-end').value.trim();
  const year     = parseInt(document.getElementById('ev-year').value);
  const catId    = document.getElementById('ev-cat').value;
  const desc     = document.getElementById('ev-desc').value.trim();
  const isPublic = document.getElementById('ev-public').checked;

  if (!title) { alert('Le titre est requis.'); return; }
  if (!isValidDate(dateStart)) { alert('Date début invalide. Utilisez le format XXYY.ZZ.'); return; }
  if (dateEnd && !isValidDate(dateEnd)) { alert('Date fin invalide. Utilisez le format XXYY.ZZ.'); return; }
  if (!Number.isInteger(year) || year < 1) { alert('Année invalide.'); return; }

  const payload = { title, date_start: dateStart, date_end: dateEnd || null, galactic_year: year,
                    category_id: catId ? Number(catId) : null, description: desc || null, is_public: isPublic };

  try {
    if (existingId) {
      const updated = await apiFetch(`/api/calendar/events/${existingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const idx = events.findIndex(e => e.id === existingId);
      if (idx !== -1) events[idx] = updated;
    } else {
      const created = await apiFetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      events.push(created);
    }
    closeModal();
    render();
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
}

async function toggleEventVisibility(id, currentlyPublic) {
  try {
    const updated = await apiFetch(`/api/calendar/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: !currentlyPublic }),
    });
    const idx = events.findIndex(e => e.id === id);
    if (idx !== -1) events[idx] = updated;
    render();
  } catch (e) { alert('Erreur : ' + e.message); }
}

async function deleteEvent(id) {
  if (!confirm('Supprimer cet événement ?')) return;
  try {
    await apiFetch(`/api/calendar/events/${id}`, { method: 'DELETE' });
    events = events.filter(e => e.id !== id);
    render();
  } catch (e) { alert('Erreur : ' + e.message); }
}

// ── Categories modal ───────────────────────────────────────────────────────────
function openCatModal() {
  renderCatModal();
  document.getElementById('cat-modal-overlay').classList.remove('hidden');
  document.getElementById('cat-modal-close').onclick = () =>
    document.getElementById('cat-modal-overlay').classList.add('hidden');
}

function renderCatModal() {
  const body = document.getElementById('cat-modal-body');
  const rows = categories.map(c => `
    <div class="flex items-center gap-2 py-2 border-b border-gray-700 last:border-0">
      <div class="w-4 h-4 rounded-full flex-shrink-0" style="background:${c.color}"></div>
      <span class="text-sm text-gray-200 flex-1">${escHtml(c.name)}</span>
      ${c.is_system ? '<span class="text-[0.6rem] text-gray-500 uppercase tracking-wide">système</span>' : ''}
      ${!c.is_system ? `<button class="cat-del text-xs text-red-400 hover:text-red-300 transition-colors" data-id="${c.id}">✕</button>` : ''}
    </div>`).join('');

  body.innerHTML = `
    <h2 class="text-base font-semibold text-gray-200 mb-4">🏷️ Catégories d'événements</h2>
    <div class="mb-4">${rows || '<p class="text-sm text-gray-500">Aucune catégorie.</p>'}</div>
    <div class="border-t border-gray-700 pt-4">
      <h3 class="text-sm font-medium text-gray-300 mb-3">Nouvelle catégorie</h3>
      <div class="flex gap-2">
        <input id="new-cat-name" type="text" placeholder="Nom" maxlength="40"
               class="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        <input id="new-cat-color" type="color" value="#6b7280"
               class="w-10 h-10 rounded border border-gray-600 bg-gray-700 cursor-pointer p-0.5">
        <button id="add-cat-btn" class="text-sm bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded transition-colors whitespace-nowrap">Ajouter</button>
      </div>
    </div>`;

  body.querySelectorAll('.cat-del').forEach(btn =>
    btn.addEventListener('click', () => deleteCategory(Number(btn.dataset.id))));
  document.getElementById('add-cat-btn').addEventListener('click', addCategory);
}

async function addCategory() {
  const name = document.getElementById('new-cat-name').value.trim();
  const color = document.getElementById('new-cat-color').value;
  if (!name) { alert('Nom requis.'); return; }
  try {
    const cat = await apiFetch('/api/calendar/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    categories.push(cat);
    renderCatModal();
  } catch (e) { alert('Erreur : ' + e.message); }
}

async function deleteCategory(id) {
  if (!confirm('Supprimer cette catégorie ? Les événements associés perdront leur catégorie.')) return;
  try {
    await apiFetch(`/api/calendar/categories/${id}`, { method: 'DELETE' });
    categories = categories.filter(c => c.id !== id);
    renderCatModal();
    // Re-render calendar since colors may have changed
    events.forEach(ev => { if (ev.category_id === id) { ev.category_id = null; ev.category_color = null; ev.category_name = null; } });
    render();
  } catch (e) { alert('Erreur : ' + e.message); }
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
});

// ── Utils ─────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s ?? '').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
init();
