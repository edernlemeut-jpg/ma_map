/**
 * admin.js â€” Panneau d'administration (utilisateurs + campagnes + modÃ¨les vaisseaux)
 */
import { initAuthUI, getCurrentUser, logout } from './shared/auth-ui.js';
import { loadTableContext } from './shared/header.js';

// â”€â”€ Auth guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function init() {
  await initAuthUI();
  loadTableContext(); // don't await — runs in background to populate header
  const user = getCurrentUser();
  if (!user || !user.is_admin) {
    document.getElementById('access-denied').classList.remove('hidden');
    return;
  }
  document.getElementById('admin-panel').classList.remove('hidden');
  setupTabs();
  loadUsers();
  bindAddUser();
}

// â”€â”€ Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setupTabs() {
  const tabBtns = document.querySelectorAll('.admin-tab-btn');
  const tabPanels = document.querySelectorAll('.admin-tab-panel');

  function activateTab(name) {
    tabBtns.forEach(b => {
      const active = b.dataset.tab === name;
      b.className = `admin-tab-btn px-4 py-3 text-sm font-medium rounded-t-lg min-h-[44px] transition-colors ${active ? 'bg-gray-700 text-blue-400 border-t border-x border-gray-600' : 'text-gray-400 hover:text-gray-200'}`;
    });
    tabPanels.forEach(p => p.classList.add('hidden'));
    document.getElementById(`tab-${name}`).classList.remove('hidden');

    if (name === 'users') loadUsers();
    else if (name === 'tables') loadTables();
    else if (name === 'factions') loadFactions();
    else if (name === 'perils') loadAdminPerils();
    else if (name === 'quadrants') loadAdminQuadrants();
    else if (name === 'systems') loadAdminSystems();
    else if (name === 'shipmodels') loadShipModels();
  }

  tabBtns.forEach(b => b.addEventListener('click', () => activateTab(b.dataset.tab)));
  activateTab('users');
}

// â”€â”€ API helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`/api/admin${path}`, opts);
  const json = await r.json();
  if (!r.ok) throw new Error(json.error?.message || json.message || `Erreur ${r.status}`);
  return json.data;
}

// â”€â”€ Users tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// -- Users tab --
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

// Sort state
let usersSort = { col: 'username', dir: 'asc' };
let usersData = [];

async function loadUsers() {
  document.getElementById('users-loading').classList.remove('hidden');
  document.getElementById('users-table').classList.add('hidden');
  try {
    usersData = await api('GET', '/users');
    renderUsers();
    bindSortHeaders();
  } catch (e) {
    document.getElementById('users-loading').textContent = `Erreur : ${e.message}`;
  }
}

function sortUsers(data, col, dir) {
  return [...data].sort((a, b) => {
    let va = a[col] ?? '';
    let vb = b[col] ?? '';
    if (col === 'tables_count' || col === 'is_admin') {
      va = Number(va); vb = Number(vb);
    } else {
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function renderUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';
  const me = getCurrentUser();

  // Update sort icons on column headers
  document.querySelectorAll('#users-table thead [data-sort]').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.sort === usersSort.col) {
      icon.textContent = usersSort.dir === 'asc' ? ' ↑' : ' ↓';
      th.classList.add('text-blue-400');
      th.classList.remove('text-gray-400');
    } else {
      icon.textContent = '';
      th.classList.remove('text-blue-400');
      th.classList.add('text-gray-400');
    }
  });

  const sorted = sortUsers(usersData, usersSort.col, usersSort.dir);
  sorted.forEach(u => {
    const row = document.createElement('tr');
    row.className = 'border-b border-gray-800 hover:bg-gray-800/50';
    row.innerHTML = `
      <td class="py-2 pr-4 font-mono text-sm">${esc(u.username)}</td>
      <td class="py-2 pr-4">${esc(u.display_name || '—')}</td>
      <td class="py-2 pr-4 text-gray-400">${u.tables_count}</td>
      <td class="py-2 pr-4">${u.is_admin ? '<span class="text-yellow-400 text-xs">🛡️ Admin</span>' : '<span class="text-gray-500 text-xs">Joueur</span>'}</td>
      <td class="py-2 pr-4 text-gray-400 text-xs">${fmtDate(u.created_at)}</td>
      <td class="py-2">
        <div class="flex gap-2">
          <button data-edit-user="${u.id}" class="text-xs text-blue-400 hover:text-blue-300" title="Modifier">✏️</button>
          ${u.id !== me.id ? `<button data-del-user="${u.id}" class="text-xs text-red-400 hover:text-red-300" title="Supprimer">🗑️</button>` : ''}
        </div>
      </td>`;
    row.querySelector('[data-edit-user]').addEventListener('click', () => openEditUser(u));
    const delBtn = row.querySelector('[data-del-user]');
    if (delBtn) delBtn.addEventListener('click', () => deleteUser(u.id, u.display_name || u.username));
    tbody.appendChild(row);
  });
  document.getElementById('users-loading').classList.add('hidden');
  document.getElementById('users-table').classList.remove('hidden');
}

function bindSortHeaders() {
  document.querySelectorAll('#users-table thead [data-sort]').forEach(th => {
    const fresh = th.cloneNode(true);
    th.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      const col = fresh.dataset.sort;
      if (usersSort.col === col) {
        usersSort.dir = usersSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        usersSort.col = col;
        usersSort.dir = 'asc';
      }
      renderUsers();
      bindSortHeaders();
    });
  });
}

// -- Users: add / edit / delete --
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bindAddUser() {
  document.getElementById('btn-add-user').addEventListener('click', () => {
    document.getElementById('add-user-form').classList.toggle('hidden');
  });
  document.getElementById('cancel-add-user').addEventListener('click', () => {
    document.getElementById('add-user-form').classList.add('hidden');
    document.getElementById('add-user-error').textContent = '';
    ['new-username', 'new-display-name', 'new-password'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('new-is-admin').checked = false;
  });
  document.getElementById('save-new-user').addEventListener('click', async () => {
    const errEl = document.getElementById('add-user-error');
    errEl.textContent = '';
    const payload = {
      username: document.getElementById('new-username').value.trim(),
      display_name: document.getElementById('new-display-name').value.trim(),
      password: document.getElementById('new-password').value,
      is_admin: document.getElementById('new-is-admin').checked,
    };
    try {
      await api('POST', '/users', payload);
      document.getElementById('add-user-form').classList.add('hidden');
      ['new-username', 'new-display-name', 'new-password'].forEach(id => {
        document.getElementById(id).value = '';
      });
      document.getElementById('new-is-admin').checked = false;
      await loadUsers();
    } catch (e) {
      errEl.textContent = e.message;
    }
  });
}

function openEditUser(u) {
  document.getElementById('edit-user-id').value = u.id;
  document.getElementById('edit-display-name').value = u.display_name || '';
  document.getElementById('edit-username').value = u.username;
  document.getElementById('edit-password').value = '';
  document.getElementById('edit-is-admin').checked = !!u.is_admin;
  document.getElementById('edit-user-error').textContent = '';
  document.getElementById('edit-user-error').classList.add('hidden');

  const modal = document.getElementById('edit-user-modal');
  modal.classList.remove('hidden');

  const saveBtn = document.getElementById('save-edit-user').cloneNode(true);
  document.getElementById('save-edit-user').replaceWith(saveBtn);
  const cancelBtn = document.getElementById('cancel-edit-user').cloneNode(true);
  document.getElementById('cancel-edit-user').replaceWith(cancelBtn);

  cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
  saveBtn.addEventListener('click', async () => {
    const errEl = document.getElementById('edit-user-error');
    errEl.classList.add('hidden');
    const id = document.getElementById('edit-user-id').value;
    const payload = {
      display_name: document.getElementById('edit-display-name').value.trim(),
      username: document.getElementById('edit-username').value.trim(),
      is_admin: document.getElementById('edit-is-admin').checked,
    };
    const pwd = document.getElementById('edit-password').value;
    if (pwd) payload.password = pwd;
    try {
      await api('PATCH', `/users/${id}`, payload);
      modal.classList.add('hidden');
      await loadUsers();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  });
}

async function deleteUser(id, displayName) {
  if (!confirm(`Supprimer le compte « ${displayName} » ? Cette action est irréversible.`)) return;
  try {
    await api('DELETE', `/users/${id}`);
    await loadUsers();
  } catch (e) {
    alert(`Erreur : ${e.message}`);
  }
}

// -- Tables tab --
async function loadTables() {
  document.getElementById('tables-loading').classList.remove('hidden');
  document.getElementById('tables-table').classList.add('hidden');
  try {
    tablesData = await api('GET', '/tables');
    renderTables();
    bindSortHeadersTables();
  } catch (e) {
    document.getElementById('tables-loading').textContent = `Erreur : ${e.message}`;
  }
}

// Sort state for tables
let tablesSort = { col: 'name', dir: 'asc' };
let tablesData = [];

function renderTables() {
  const tbody = document.getElementById('tables-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Update sort icons on column headers
  document.querySelectorAll('#tables-table thead [data-sort]').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.sort === tablesSort.col) {
      icon.textContent = tablesSort.dir === 'asc' ? ' ↑' : ' ↓';
      th.classList.add('text-blue-400');
      th.classList.remove('text-gray-400');
    } else {
      icon.textContent = '';
      th.classList.remove('text-blue-400');
      th.classList.add('text-gray-400');
    }
  });

  const sorted = [...tablesData].sort((a, b) => {
    let va = a[tablesSort.col] ?? '';
    let vb = b[tablesSort.col] ?? '';
    if (tablesSort.col === 'members_count') { va = Number(va); vb = Number(vb); }
    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return tablesSort.dir === 'asc' ? -1 : 1;
    if (va > vb) return tablesSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  sorted.forEach(t => {
    const row = document.createElement('tr');
    row.className = 'border-b border-gray-800 hover:bg-gray-800/50';
    row.innerHTML = `
      <td class="py-2 pr-4 font-medium">${esc(t.name)}</td>
      <td class="py-2 pr-4 text-gray-300 text-sm">${esc(t.mj_display_name || t.mj_username)}</td>
      <td class="py-2 pr-4 text-gray-400 text-sm">${t.members_count}</td>
      <td class="py-2 pr-4 text-gray-400 text-xs">${fmtDate(t.created_at)}</td>
      <td class="py-2">
        <button data-del-table="${t.id}" data-table-name="${esc(t.name)}"
          class="text-xs text-red-400 hover:text-red-300" title="Supprimer">🗑️</button>
      </td>`;
    row.querySelector('[data-del-table]').addEventListener('click', () => deleteTable(t.id, t.name));
    tbody.appendChild(row);
  });

  document.getElementById('tables-loading').classList.add('hidden');
  document.getElementById('tables-table').classList.remove('hidden');
}

function bindSortHeadersTables() {
  document.querySelectorAll('#tables-table thead [data-sort]').forEach(th => {
    const fresh = th.cloneNode(true);
    th.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      const col = fresh.dataset.sort;
      if (tablesSort.col === col) {
        tablesSort.dir = tablesSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        tablesSort.col = col;
        tablesSort.dir = 'asc';
      }
      renderTables();
      bindSortHeadersTables();
    });
  });
}

async function deleteTable(id, name) {
  if (!confirm(`Supprimer la campagne « ${name} » et toutes ses données ? Cette action est irréversible.`)) return;
  try {
    await api('DELETE', `/tables/${id}`);
    await loadTables();
  } catch (e) {
    alert(`Erreur : ${e.message}`);
  }
}

// -- Ship models tab --
async function loadShipModels() {
  document.getElementById('shipmodels-loading').classList.remove('hidden');
  document.getElementById('shipmodels-list').classList.add('hidden');
  try {
    const r = await fetch('/api/ship-models', { credentials: 'include' });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error?.message || `Erreur ${r.status}`);
    renderShipModels(json.data);
  } catch (e) {
    document.getElementById('shipmodels-loading').textContent = `Erreur : ${e.message}`;
  }
}

function renderShipModelCard(m) {
  let armement = [];
  try { armement = JSON.parse(m.armement_json || '[]'); } catch {}

  const statRow = (label, val) => val != null && val !== '' && val !== 0
    ? `<tr><td class="text-right text-gray-400 pr-3 py-0.5 text-xs">${label} :</td><td class="text-gray-100 text-xs font-medium">${esc(String(val))}</td></tr>`
    : '';

  const coqueTotal = Number(m.coque) || 10;
  const boxesPerSystem = Math.max(2, Math.ceil(coqueTotal / 4));
  const systemLabels = ['I', 'L', 'G', 'D ?'];
  const hullBoxes = systemLabels.map(lbl =>
    `<tr><td class="text-gray-400 pr-2 text-xs font-mono">${lbl} :</td><td class="text-xs">${Array(boxesPerSystem).fill('<span class="inline-block w-3 h-3 border border-gray-500 rounded-sm mr-0.5"></span>').join('')}</td></tr>`
  ).join('');

  const cardId = `model-body-${esc(m.id)}`;

  return `
    <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden mb-3 hover:border-gray-500 transition-colors">
      <div class="flex items-center bg-gray-900 border-b border-gray-700 px-4 py-2 gap-3 cursor-pointer model-card-header" data-body="${cardId}">
        <span class="text-gray-500 text-xs model-card-arrow">▶</span>
        <span class="text-white font-bold tracking-widest uppercase text-sm flex-1">${esc(m.nom)}</span>
        ${m.classe ? `<span class="text-gray-500 text-xs hidden sm:inline">${esc(m.classe)}</span>` : ''}
        ${m.origine ? `<span class="text-gray-600 text-xs hidden sm:inline">· ${esc(m.origine)}</span>` : ''}
        <div class="flex gap-1.5">
          <button data-edit-model="${esc(m.id)}" class="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-900/30" title="Modifier">✏️</button>
          <button data-del-model="${esc(m.id)}" data-model-nom="${esc(m.nom)}" class="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/30" title="Supprimer">🗑️</button>
        </div>
      </div>
      <div id="${cardId}" class="flex hidden">
        <div class="flex-shrink-0 bg-gray-900 flex items-center justify-center overflow-hidden" style="width:100px;height:100px">
          ${m.image
            ? `<img src="${esc(m.image)}" alt="${esc(m.nom)}" class="max-w-full max-h-full w-auto h-auto object-contain" loading="lazy">`
            : `<span class="text-5xl select-none">🚀</span>`}
        </div>
        <div class="flex-1 p-4 overflow-auto">
          <table class="w-full border-collapse text-sm mb-3">
            <tbody>
              ${statRow('Classe', m.classe ? `${m.classe}${m.tonnage ? ` (${m.tonnage} t` : ''}${m.longueur ? `/${m.longueur} m` : ''}${m.tonnage || m.longueur ? ')' : ''}` : '')}
              ${statRow('Manœuvrabilité', m.manoeuvrabilite || '—')}
              ${statRow('Vitesse tactique', m.vitesse_tactique ? `${m.vitesse_tactique} K/t` : null)}
              ${statRow('Vitesse de croisière', m.vitesse_croisiere ? `${m.vitesse_croisiere} US/h (${m.vitesse_croisiere * 24} US/j)` : null)}
              ${statRow('Vitesse hyperspatiale', m.vitesse_hyperspatiale ? `${m.vitesse_hyperspatiale} PC/j` : null)}
              ${statRow('Autonomie', m.autonomie ? `${m.autonomie} PC` : null)}
              ${statRow('Blindage', m.blindage)}
              ${statRow('Coque', m.coque)}
            </tbody>
          </table>
          <table class="w-full border-collapse text-sm mb-3 border-t border-gray-700 pt-2">
            <tbody>${hullBoxes}</tbody>
          </table>
          ${m.senseurs_k || m.senseurs ? `
          <table class="w-full border-collapse text-sm mb-3 border-t border-gray-700">
            <tbody>${statRow('Senseurs', m.senseurs_k ? `${m.senseurs_k}${m.senseurs_us ? ` (${m.senseurs_us})` : ''}` : m.senseurs)}</tbody>
          </table>` : ''}
          ${armement.length ? `
          <div class="border-t border-gray-700 pt-2 mb-3">
            <p class="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Armement :</p>
            ${armement.map(a => `<p class="text-xs text-gray-200 ml-2">» ${esc(a.position || '')} : ${esc(a.nom || '')}${a.tourelle ? ' (tourelle)' : ''} ${a.degats ? `(${a.degats}/${a.mode_tir || ''}/${a.portee || ''}/${a.canonnier || ''})` : ''}</p>`).join('')}
          </div>` : ''}
          <table class="w-full border-collapse text-sm border-t border-gray-700">
            <tbody>
              ${statRow('Équipage', m.equipage)}
              ${statRow('Passagers', m.passagers)}
              ${statRow('Soute', m.soute ? `${m.soute} t` : null)}
              ${statRow('Prix', m.prix ? `${m.prix} ¢` : null)}
              ${statRow('Origine', m.origine)}
            </tbody>
          </table>
          ${m.description ? `<p class="mt-3 text-xs text-gray-400 border-t border-gray-700 pt-2">${esc(m.description)}</p>` : ''}
        </div>
      </div>
    </div>`;
}

function renderShipModels(models) {
  const container = document.getElementById('shipmodels-list');
  container.innerHTML = '';
  if (!models.length) {
    container.innerHTML = '<p class="text-gray-500 text-sm py-6 text-center">Aucun modèle de vaisseau global.</p>';
  } else {
    models.forEach(m => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderShipModelCard(m);
      const el = wrapper.firstElementChild;
      el.querySelector('[data-edit-model]')?.addEventListener('click', (e) => { e.stopPropagation(); openModelModal(m); });
      el.querySelector('[data-del-model]')?.addEventListener('click', (e) => { e.stopPropagation(); deleteShipModel(m.id, m.nom); });
      // Collapse toggle
      el.querySelector('.model-card-header')?.addEventListener('click', (e) => {
        if (e.target.closest('[data-edit-model],[data-del-model]')) return;
        const bodyId = el.querySelector('.model-card-header').dataset.body;
        const body = document.getElementById(bodyId);
        const arrow = el.querySelector('.model-card-arrow');
        if (!body) return;
        const nowHidden = body.classList.toggle('hidden');
        if (arrow) arrow.textContent = nowHidden ? '▶' : '▼';
      });
      container.appendChild(el);
    });
  }
  document.getElementById('shipmodels-loading').classList.add('hidden');
  document.getElementById('btn-add-model')?.addEventListener('click', () => openModelModal(null));
  container.classList.remove('hidden');
}

async function deleteShipModel(id, nom) {
  if (!confirm(`Supprimer le modèle « ${nom} » ? Cette action est irréversible.`)) return;
  try {
    const r = await fetch(`/api/ship-models/${id}`, { method: 'DELETE', credentials: 'include' });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error?.message || `Erreur ${r.status}`);
    await loadShipModels();
  } catch (e) {
    alert(`Erreur : ${e.message}`);
  }
}

function openModelModal(model) {
  const isNew = !model;
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto';

  const imagePreview = model?.image
    ? `<img id="mm-img-preview" src="${esc(model.image)}" class="mt-2 w-full max-h-40 object-cover rounded" alt="">`
    : `<div id="mm-img-preview" class="hidden mt-2 w-full max-h-40 flex items-center justify-center bg-gray-900 rounded text-4xl">🚀</div>`;

  const field = (id, label, type = 'text', val = '', suffix = '') =>
    `<div><label class="block text-xs text-gray-400 mb-1">${label}</label>
      <div class="flex gap-1">
        <input type="${type}" id="${id}" value="${esc(String(val ?? ''))}"
          class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        ${suffix ? `<span class="self-center text-xs text-gray-500">${suffix}</span>` : ''}
      </div></div>`;
  const textarea = (id, label, val = '') =>
    `<div><label class="block text-xs text-gray-400 mb-1">${label}</label>
      <textarea id="${id}" rows="3" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-y">${esc(String(val ?? ''))}</textarea></div>`;

  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-2xl p-6 shadow-2xl mb-8">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold">${isNew ? '+ Nouveau modèle de vaisseau' : `Modifier : ${esc(model.nom)}`}</h2>
        <button id="mm-close" class="text-gray-400 hover:text-gray-200 text-xl px-2">✕</button>
      </div>
      <p id="mm-error" class="hidden mb-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2"></p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          ${field('mm-nom', 'Nom *', 'text', model?.nom)}
        </div>

        <!-- Image -->
        <div class="md:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Image</label>
          <div class="flex gap-2">
            <input type="text" id="mm-image" value="${esc(model?.image || '')}" placeholder="URL ou laisser vide pour uploader"
              class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
            <label class="cursor-pointer bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-3 py-2 text-sm text-gray-300 transition-colors whitespace-nowrap">
              📁 Choisir
              <input type="file" id="mm-file" accept="image/*" class="hidden">
            </label>
          </div>
          ${imagePreview}
        </div>

        <!-- Identification -->
        ${field('mm-classe', 'Classe', 'text', model?.classe)}
        ${field('mm-origine', 'Origine / Faction', 'text', model?.origine)}
        ${field('mm-tonnage', 'Tonnage', 'text', model?.tonnage, 't')}
        ${field('mm-longueur', 'Longueur', 'text', model?.longueur, 'm')}
        ${field('mm-prix', 'Prix', 'number', model?.prix, '¢')}

        <!-- Vitesses -->
        ${field('mm-v-cro', 'Vitesse croisière', 'number', model?.vitesse_croisiere, 'US/h')}
        ${field('mm-v-hyp', 'Vitesse hyperspatiale', 'number', model?.vitesse_hyperspatiale, 'PC/j')}
        ${field('mm-v-tac', 'Vitesse tactique', 'text', model?.vitesse_tactique, 'K/t')}
        ${field('mm-autonomie', 'Autonomie', 'number', model?.autonomie, 'PC')}
        ${field('mm-manoeuvre', 'Manœuvrabilité', 'text', model?.manoeuvrabilite)}

        <!-- Combat -->
        ${field('mm-blindage', 'Blindage', 'number', model?.blindage)}
        ${field('mm-coque', 'Coque', 'number', model?.coque)}
        ${field('mm-senseurs-k', 'Senseurs (K)', 'text', model?.senseurs_k)}
        ${field('mm-senseurs-us', 'Senseurs (US)', 'text', model?.senseurs_us)}

        <!-- Capacités -->
        ${field('mm-equipage', 'Équipage', 'text', model?.equipage)}
        ${field('mm-passagers', 'Passagers', 'text', model?.passagers)}
        ${field('mm-soute', 'Soute', 'text', model?.soute, 't')}
      </div>

      <!-- Armement JSON (raw) -->
      <div class="mt-4">
        <label class="block text-xs text-gray-400 mb-1">Armement (JSON)</label>
        <textarea id="mm-armement" rows="3" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500 resize-y">${esc(model?.armement_json || '[]')}</textarea>
      </div>

      <!-- Description fields -->
      <div class="mt-4 space-y-3 border-t border-gray-700 pt-4">
        <h3 class="text-sm font-semibold text-gray-300">Descriptions</h3>
        ${textarea('mm-description', 'Description générale', model?.description)}
        ${textarea('mm-history', 'Historique', model?.history)}
        ${textarea('mm-mj-notes', 'Notes MJ (privé)', model?.mj_notes)}
        ${textarea('mm-special', 'Particularités', model?.special_features)}
      </div>

      <div class="flex gap-3 mt-6">
        <button id="mm-save" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors">Enregistrer</button>
        <button id="mm-cancel" class="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 rounded-lg transition-colors">Annuler</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#mm-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#mm-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Image preview on URL change
  const imgInput = overlay.querySelector('#mm-image');
  const imgPreview = overlay.querySelector('#mm-img-preview');
  imgInput.addEventListener('input', () => {
    const url = imgInput.value.trim();
    if (url) {
      imgPreview.src = url;
      imgPreview.classList.remove('hidden');
    } else {
      imgPreview.classList.add('hidden');
    }
  });

  // File upload
  overlay.querySelector('#mm-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: formData });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || 'Erreur upload');
      imgInput.value = json.data.url;
      imgPreview.src = json.data.url;
      imgPreview.classList.remove('hidden');
    } catch (ex) {
      overlay.querySelector('#mm-error').textContent = `Upload : ${ex.message}`;
      overlay.querySelector('#mm-error').classList.remove('hidden');
    }
  });

  overlay.querySelector('#mm-save').addEventListener('click', async () => {
    const errEl = overlay.querySelector('#mm-error');
    errEl.classList.add('hidden');
    const nom = overlay.querySelector('#mm-nom').value.trim();
    if (!nom) { errEl.textContent = 'Le nom est requis'; errEl.classList.remove('hidden'); return; }

    const numOrNull = id => {
      const v = overlay.querySelector(id).value.trim();
      return v === '' ? null : Number(v);
    };
    const strOrBlank = id => overlay.querySelector(id).value.trim();

    const body = {
      nom,
      classe:               strOrBlank('#mm-classe'),
      origine:              strOrBlank('#mm-origine'),
      tonnage:              strOrBlank('#mm-tonnage'),
      longueur:             strOrBlank('#mm-longueur'),
      prix:                 numOrNull('#mm-prix'),
      vitesse_croisiere:    numOrNull('#mm-v-cro'),
      vitesse_hyperspatiale: numOrNull('#mm-v-hyp'),
      vitesse_tactique:     strOrBlank('#mm-v-tac'),
      autonomie:            numOrNull('#mm-autonomie'),
      manoeuvrabilite:      strOrBlank('#mm-manoeuvre'),
      blindage:             numOrNull('#mm-blindage'),
      coque:                numOrNull('#mm-coque'),
      senseurs_k:           strOrBlank('#mm-senseurs-k'),
      senseurs_us:          strOrBlank('#mm-senseurs-us'),
      equipage:             strOrBlank('#mm-equipage'),
      passagers:            strOrBlank('#mm-passagers'),
      soute:                strOrBlank('#mm-soute'),
      image:                strOrBlank('#mm-image'),
      armement_json:        strOrBlank('#mm-armement') || '[]',
      description:          strOrBlank('#mm-description'),
      history:              strOrBlank('#mm-history'),
      mj_notes:             strOrBlank('#mm-mj-notes'),
      special_features:     strOrBlank('#mm-special'),
    };

    // Validate armement JSON
    try { JSON.parse(body.armement_json); }
    catch { errEl.textContent = 'JSON armement invalide'; errEl.classList.remove('hidden'); return; }

    try {
      const url = isNew ? '/api/ship-models' : `/api/ship-models/${model.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const r = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || `Erreur ${r.status}`);
      overlay.remove();
      await loadShipModels();
    } catch (ex) {
      errEl.textContent = ex.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ── Factions tab ──────────────────────────────────────────────────────────────
let factionsData = [];

async function loadFactions() {
  document.getElementById('factions-loading').classList.remove('hidden');
  document.getElementById('factions-list').classList.add('hidden');
  try {
    const r = await fetch('/api/factions', { credentials: 'include' });
    const j = await r.json();
    factionsData = j.data || [];
    renderFactions();
  } catch (e) {
    document.getElementById('factions-loading').textContent = `Erreur : ${e.message}`;
  }
  // bind add button (once)
  const btn = document.getElementById('btn-add-faction');
  btn.onclick = () => openFactionModal(null);
}

function renderFactions() {
  const list = document.getElementById('factions-list');
  list.innerHTML = '';
  if (!factionsData.length) {
    list.innerHTML = '<p class="text-gray-400 text-sm py-4">Aucune faction définie.</p>';
  } else {
    factionsData.forEach(f => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700';
      const img = f.icon_url ? `<img src="${esc(f.icon_url)}" style="width:100px;height:100px" class="rounded object-cover shrink-0">` : `<div style="width:100px;height:100px" class="rounded bg-gray-700 flex items-center justify-center text-xs text-gray-400 shrink-0">${esc(f.short || '?')}</div>`;
      row.innerHTML = `${img}<div class="flex-1"><div class="font-medium text-sm">${esc(f.name)}${f.short ? ` <span class="text-gray-400">(${esc(f.short)})</span>` : ''}</div>${f.description ? `<div class="text-xs text-gray-400">${esc(f.description)}</div>` : ''}</div><div class="flex gap-2"><button class="text-xs text-blue-400 hover:text-blue-300" title="Modifier">✏️</button><button class="text-xs text-red-400 hover:text-red-300" title="Supprimer">🗑️</button></div>`;
      row.querySelector('[title="Modifier"]').addEventListener('click', () => openFactionModal(f));
      row.querySelector('[title="Supprimer"]').addEventListener('click', () => deleteFaction(f.id, f.name));
      list.appendChild(row);
    });
  }
  document.getElementById('factions-loading').classList.add('hidden');
  list.classList.remove('hidden');
}

function openFactionModal(faction) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md">
      <h3 class="text-lg font-semibold mb-4">${faction ? 'Modifier' : 'Nouvelle'} faction</h3>
      <div class="space-y-3">
        <div><label class="block text-xs text-gray-400 mb-1">Nom *</label><input id="fm-name" type="text" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" value="${esc(faction?.name || '')}"></div>
        <div><label class="block text-xs text-gray-400 mb-1">Diminutif</label><input id="fm-short" type="text" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" value="${esc(faction?.short || '')}"></div>
        <div><label class="block text-xs text-gray-400 mb-1">Description</label><textarea id="fm-desc" rows="2" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">${esc(faction?.description || '')}</textarea></div>
        <div><label class="block text-xs text-gray-400 mb-1">URL icône</label><input id="fm-icon" type="text" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" value="${esc(faction?.icon_url || '')}"></div>
      </div>
      <p id="fm-err" class="text-red-400 text-sm mt-2 hidden"></p>
      <div class="flex gap-2 mt-4">
        <button id="fm-save" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm flex-1">Enregistrer</button>
        <button id="fm-cancel" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm">Annuler</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const errEl = overlay.querySelector('#fm-err');
  overlay.querySelector('#fm-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#fm-save').addEventListener('click', async () => {
    const name = overlay.querySelector('#fm-name').value.trim();
    if (!name) { errEl.textContent = 'Le nom est requis'; errEl.classList.remove('hidden'); return; }
    const body = {
      name,
      short: overlay.querySelector('#fm-short').value.trim(),
      description: overlay.querySelector('#fm-desc').value.trim(),
      icon_url: overlay.querySelector('#fm-icon').value.trim(),
    };
    try {
      const url = faction ? `/api/factions/${faction.id}` : '/api/factions';
      const method = faction ? 'PATCH' : 'POST';
      const r = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || `Erreur ${r.status}`);
      overlay.remove();
      loadFactions();
    } catch (e) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
  });
}

async function deleteFaction(id, name) {
  if (!confirm(`Supprimer la faction « ${name} » ? Cette action est irréversible.`)) return;
  try {
    const r = await fetch(`/api/factions/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) { const j = await r.json(); throw new Error(j.error?.message || `Erreur ${r.status}`); }
    loadFactions();
  } catch (e) { alert(e.message); }
}

// ── Admin Périls tab ──────────────────────────────────────────────────────────
let adminPerilsData = [];

async function loadAdminPerils() {
  const loading = document.getElementById('perils-loading');
  const list = document.getElementById('perils-list');
  const editor = document.getElementById('perils-editor');
  loading.classList.remove('hidden'); list.classList.add('hidden'); editor.classList.add('hidden');
  try {
    const r = await fetch('/api/perils/admin-templates', { credentials: 'include' });
    const j = await r.json();
    adminPerilsData = j.data || [];
    renderAdminPerilsList();
  } catch (e) { loading.textContent = `Erreur : ${e.message}`; }
  document.getElementById('btn-add-peril-ip').onclick = () => createAdminPerilTable('interplanetaire');
  document.getElementById('btn-add-peril-hs').onclick = () => createAdminPerilTable('hyperspatial');
}

async function createAdminPerilTable(type) {
  const name = prompt(`Nom de la nouvelle table ${type === 'interplanetaire' ? 'IP' : 'HS'} :`);
  if (!name?.trim()) return;
  try {
    const r = await fetch('/api/perils/admin-templates', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), type, categories: [] })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || `Erreur ${r.status}`);
    adminPerilsData.push(j.data);
    renderAdminPerilsList();
    openAdminPerilEditor(j.data.id);
  } catch (e) { alert(e.message); }
}

function renderAdminPerilsList() {
  const list = document.getElementById('perils-list');
  list.innerHTML = '';
  if (!adminPerilsData.length) {
    list.innerHTML = '<p class="text-gray-400 text-sm py-4">Aucun modèle de périls défini.</p>';
  } else {
    adminPerilsData.forEach(t => {
      const isIP = t.type === 'interplanetaire';
      const row = document.createElement('div');
      row.className = 'flex items-center gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700';
      row.innerHTML = `<span class="text-xs font-bold px-2 py-1 rounded ${isIP ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'}">${isIP ? 'IP' : 'HS'}</span><div class="flex-1 font-medium text-sm">${esc(t.name)}</div><div class="text-xs text-gray-400">${(t.categories || []).length} catégorie(s)</div><div class="flex gap-2"><button class="text-xs text-blue-400 hover:text-blue-300" title="Éditer">✏️</button><button class="text-xs text-yellow-400 hover:text-yellow-300" title="Dupliquer">⧉</button><button class="text-xs text-red-400 hover:text-red-300" title="Supprimer">🗑️</button></div>`;
      row.querySelector('[title="Éditer"]').addEventListener('click', () => openAdminPerilEditor(t.id));
      row.querySelector('[title="Dupliquer"]').addEventListener('click', () => duplicateAdminPerilTable(t.id));
      row.querySelector('[title="Supprimer"]').addEventListener('click', () => deleteAdminPerilTable(t.id, t.name));
      list.appendChild(row);
    });
  }
  document.getElementById('perils-loading').classList.add('hidden');
  list.classList.remove('hidden');
}

async function duplicateAdminPerilTable(id) {
  try {
    const r = await fetch(`/api/perils/admin-templates/${id}/duplicate`, { method: 'POST', credentials: 'include' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || `Erreur ${r.status}`);
    adminPerilsData.push(j.data);
    renderAdminPerilsList();
  } catch (e) { alert(e.message); }
}

function openAdminPerilEditor(tableId) {
  const editor = document.getElementById('perils-editor');
  const list = document.getElementById('perils-list');
  const t = adminPerilsData.find(x => x.id === tableId);
  if (!t) return;
  list.classList.add('hidden');
  document.getElementById('btn-add-peril-ip').classList.add('hidden');
  document.getElementById('btn-add-peril-hs').classList.add('hidden');
  editor.classList.remove('hidden');
  renderAdminPerilEditorContent(t, editor);
}

function renderAdminPerilEditorContent(t, editor) {
  const escA = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cats = t.categories || [];
  let h = `<div class="flex items-center gap-3 mb-4"><button id="pe-back" class="text-blue-400 hover:text-blue-300 text-sm">← Retour</button><input class="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm flex-1" value="${escA(t.name)}" id="pe-name"><span class="text-xs px-2 py-1 rounded ${t.type === 'interplanetaire' ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'}">${t.type === 'interplanetaire' ? 'IP' : 'HS'}</span></div>`;
  cats.forEach((cat, ci) => {
    h += `<details class="bg-gray-800 rounded-lg border border-gray-700 mb-2 p-3" open><summary class="cursor-pointer font-medium text-sm">${escA(cat.nom)} <span class="text-gray-400">(${cat.seuilMin}–${cat.seuilMax})</span></summary><div class="mt-3 space-y-2">`;
    (cat.perils || []).forEach((p, pi) => {
      const d = p.data || {};
      h += `<details class="bg-gray-750 rounded border border-gray-600 p-2"><summary class="cursor-pointer text-sm flex justify-between"><span>${escA(p.nom)}</span><span class="text-gray-400 text-xs">${p.seuilMin}–${p.seuilMax}</span></summary><div class="mt-2 space-y-2 text-sm">`;
      h += `<div><label class="text-xs text-gray-400">Nom</label><input data-ci="${ci}" data-pi="${pi}" data-f="nom" class="pe-field w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs" value="${escA(p.nom)}"></div>`;
      h += `<div><label class="text-xs text-gray-400">Description</label><textarea data-ci="${ci}" data-pi="${pi}" data-f="desc" class="pe-field w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs h-16">${escA(d.description || '')}</textarea></div>`;
      h += `<div class="flex gap-2"><div class="flex-1"><label class="text-xs text-gray-400">Seuil min</label><input type="number" data-ci="${ci}" data-pi="${pi}" data-f="seuilMin" class="pe-field w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs" value="${p.seuilMin}"></div><div class="flex-1"><label class="text-xs text-gray-400">Seuil max</label><input type="number" data-ci="${ci}" data-pi="${pi}" data-f="seuilMax" class="pe-field w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs" value="${p.seuilMax}"></div></div>`;
      h += `<button data-del-peril="${ci}-${pi}" class="text-xs text-red-400 hover:text-red-300">Supprimer ce péril</button></div></details>`;
    });
    h += `<button data-add-peril="${ci}" class="mt-1 text-xs text-blue-400 hover:text-blue-300">+ Ajouter un péril</button></div></details>`;
  });
  h += `<button id="pe-add-cat" class="mt-2 text-sm text-yellow-400 hover:text-yellow-300 w-full py-2 border border-dashed border-gray-600 rounded-lg">+ Ajouter une catégorie</button>`;
  editor.innerHTML = h;

  // Back
  editor.querySelector('#pe-back').addEventListener('click', () => {
    document.getElementById('perils-list').classList.remove('hidden');
    document.getElementById('btn-add-peril-ip').classList.remove('hidden');
    document.getElementById('btn-add-peril-hs').classList.remove('hidden');
    editor.classList.add('hidden');
  });

  // Rename on blur
  editor.querySelector('#pe-name').addEventListener('change', async (e) => {
    const newName = e.target.value.trim();
    if (!newName || newName === t.name) return;
    await patchAdminPeril(t.id, { name: newName });
    t.name = newName;
    renderAdminPerilsList();
  });

  // Field changes (debounced save)
  let saveTimer;
  editor.querySelectorAll('.pe-field').forEach(inp => {
    inp.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveAdminPerilEditorState(t, editor), 800);
    });
  });

  // Del peril
  editor.querySelectorAll('[data-del-peril]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [ci, pi] = btn.dataset.delPeril.split('-').map(Number);
      if (!confirm('Supprimer ce péril ?')) return;
      t.categories[ci].perils.splice(pi, 1);
      patchAdminPeril(t.id, { categories: t.categories });
      renderAdminPerilEditorContent(t, editor);
    });
  });

  // Add peril
  editor.querySelectorAll('[data-add-peril]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ci = Number(btn.dataset.addPeril);
      const perils = t.categories[ci].perils || [];
      const mx = perils.length ? Math.max(...perils.map(p => p.seuilMax)) : 1;
      perils.push({ seuilMin: mx + 1, seuilMax: mx + 1, nom: 'Nouveau péril', data: { description: '', mobile: false, senseurs: 0, sciencesStellaires: 0, definition: '', protocole: '', resultat: '' } });
      t.categories[ci].perils = perils;
      patchAdminPeril(t.id, { categories: t.categories });
      renderAdminPerilEditorContent(t, editor);
    });
  });

  // Add category
  editor.querySelector('#pe-add-cat').addEventListener('click', () => {
    const mx = t.categories.length ? Math.max(...t.categories.map(c => c.seuilMax)) : 1;
    t.categories.push({ seuilMin: mx + 1, seuilMax: mx + 1, nom: 'Nouvelle catégorie', perils: [] });
    patchAdminPeril(t.id, { categories: t.categories });
    renderAdminPerilEditorContent(t, editor);
  });
}

function saveAdminPerilEditorState(t, editor) {
  editor.querySelectorAll('.pe-field').forEach(inp => {
    const ci = Number(inp.dataset.ci);
    const pi = Number(inp.dataset.pi);
    const f = inp.dataset.f;
    const peril = t.categories[ci]?.perils?.[pi];
    if (!peril) return;
    if (f === 'nom') peril.nom = inp.value;
    else if (f === 'desc') { if (!peril.data) peril.data = {}; peril.data.description = inp.value; }
    else if (f === 'seuilMin') peril.seuilMin = +inp.value;
    else if (f === 'seuilMax') peril.seuilMax = +inp.value;
  });
  patchAdminPeril(t.id, { categories: t.categories });
}

async function patchAdminPeril(id, body) {
  try {
    await fetch(`/api/perils/admin-templates/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) { console.error(e); }
}

async function deleteAdminPerilTable(id, name) {
  if (!confirm(`Supprimer le modèle « ${name} » ? Il sera retiré de toutes les futures campagnes.`)) return;
  try {
    const r = await fetch(`/api/perils/admin-templates/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) { const j = await r.json(); throw new Error(j.error?.message || `Erreur ${r.status}`); }
    adminPerilsData = adminPerilsData.filter(t => t.id !== id);
    renderAdminPerilsList();
  } catch (e) { alert(e.message); }
}

// ── Admin Quadrants tab ───────────────────────────────────────────────────────
let adminQuadrantsData = [];
let quadrantPerilsForPicker = [];
let allQuadrantNames = [];

async function loadAdminQuadrants() {
  document.getElementById('quadrants-loading').classList.remove('hidden');
  document.getElementById('quadrants-list').classList.add('hidden');
  try {
    const [qr, pr, nr] = await Promise.all([
      fetch('/api/perils/admin-quadrants', { credentials: 'include' }),
      fetch('/api/perils/admin-templates', { credentials: 'include' }),
      fetch('/api/perils/quadrant-names', { credentials: 'include' }),
    ]);
    const qj = await qr.json(); const pj = await pr.json(); const nj = await nr.json();
    adminQuadrantsData = qj.data || [];
    quadrantPerilsForPicker = (pj.data || []).filter(t => t.type === 'hyperspatial');
    allQuadrantNames = nj.data || [];
    renderAdminQuadrants();
  } catch (e) {
    document.getElementById('quadrants-loading').textContent = `Erreur : ${e.message}`;
  }
}

const QUAD_COLS = ["Α","Β","Γ","Δ","Ε","Ζ","Η","Θ","Ι","Κ","Λ","Μ","Ν","Ξ","Ο","Π","Ρ","Σ","Τ","Υ","Φ","Χ","Ψ","Ω","Α′","Β′","Γ′","Δ′","Ε′","Ζ′","Η′","Θ′","Ι′","Κ′","Λ′","Μ′","Ν′","Ξ′","Ο′","Π′"];

function renderAdminQuadrants() {
  const list = document.getElementById('quadrants-list');
  list.innerHTML = '';

  const quadrantMap = {};
  adminQuadrantsData.forEach(q => { quadrantMap[q.quadrant] = q.peril_list_id; });

  if (!quadrantPerilsForPicker.length) {
    list.innerHTML = '<p class="text-gray-400 text-sm py-4">Aucun modèle HS défini. Créez d\'abord des tables HS dans l\'onglet Périls.</p>';
    document.getElementById('quadrants-loading').classList.add('hidden');
    list.classList.remove('hidden');
    return;
  }

  const options = `<option value="">— aucune —</option>` + quadrantPerilsForPicker.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');

  // ── "Tout remplir" toolbar ──────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.className = 'flex items-center gap-3 mb-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700';
  toolbar.innerHTML = `
    <span class="text-sm text-gray-300 shrink-0">Remplir tous les quadrants :</span>
    <select id="fill-all-sel" class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm">${options}</select>
    <button id="fill-all-btn" class="shrink-0 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm font-medium">Tout appliquer</button>
    <button id="fill-all-clear" class="shrink-0 px-3 py-1.5 bg-red-900 hover:bg-red-800 text-white rounded text-sm">Tout effacer</button>
  `;
  list.appendChild(toolbar);

  toolbar.querySelector('#fill-all-btn').addEventListener('click', async () => {
    const selId = toolbar.querySelector('#fill-all-sel').value;
    if (!selId) { alert('Sélectionnez un modèle HS.'); return; }
    const name = quadrantPerilsForPicker.find(t => t.id === selId)?.name || selId;
    if (!confirm(`Appliquer « ${name} » aux 1600 quadrants ? Les assignations existantes seront remplacées.`)) return;
    try {
      const r = await fetch('/api/perils/admin-quadrants/fill-all', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ peril_list_id: selId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || `Erreur ${r.status}`);
      await loadAdminQuadrants();
    } catch (e) { alert(e.message); }
  });

  toolbar.querySelector('#fill-all-clear').addEventListener('click', async () => {
    if (!confirm('Effacer toutes les assignations de quadrants ?')) return;
    try {
      const r = await fetch('/api/perils/admin-quadrants/fill-all', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ peril_list_id: null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || `Erreur ${r.status}`);
      await loadAdminQuadrants();
    } catch (e) { alert(e.message); }
  });

  // ── Column tab grid ─────────────────────────────────────────────────────────
  function buildColPanel(col) {
    const wrap = document.createElement('div');
    wrap.className = 'grid grid-cols-1 sm:grid-cols-2 gap-1 mt-3';
    for (let row = 1; row <= 40; row++) {
      const q = `${col}-${row}`;
      const cur = quadrantMap[q] || '';
      const cell = document.createElement('div');
      cell.className = `flex items-center gap-2 px-2 py-1 rounded border ${cur ? 'bg-gray-800 border-blue-800' : 'bg-gray-800/50 border-gray-700'}`;
      cell.innerHTML = `<span class="text-yellow-400 text-xs font-bold w-16 shrink-0">${esc(q)}</span><select class="flex-1 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs">${options}</select>`;
      const sel = cell.querySelector('select');
      sel.value = cur;
      sel.addEventListener('change', async () => {
        await patchAdminQuadrant(q, sel.value);
        cell.className = `flex items-center gap-2 px-2 py-1 rounded border ${sel.value ? 'bg-gray-800 border-blue-800' : 'bg-gray-800/50 border-gray-700'}`;
      });
      wrap.appendChild(cell);
    }
    return wrap;
  }

  const wrapper = document.createElement('div');

  // Navigation row: [◀] [clipped tab bar, translate-based] [▶]
  const navRow = document.createElement('div');
  navRow.className = 'flex items-center gap-1 border-b border-gray-700 pb-1';
  const prevArrow = document.createElement('button');
  prevArrow.innerHTML = '&#8249;';
  prevArrow.className = 'shrink-0 w-7 h-8 flex items-center justify-center text-xl text-gray-400 hover:text-white rounded hover:bg-gray-700';
  const tabScroller = document.createElement('div');
  tabScroller.style.cssText = 'flex:1; min-width:0; overflow:hidden;';
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex; gap:4px; transition:transform 0.2s ease; will-change:transform;';
  tabScroller.appendChild(tabBar);
  const nextArrow = document.createElement('button');
  nextArrow.innerHTML = '&#8250;';
  nextArrow.className = 'shrink-0 w-7 h-8 flex items-center justify-center text-xl text-gray-400 hover:text-white rounded hover:bg-gray-700';
  navRow.appendChild(prevArrow);
  navRow.appendChild(tabScroller);
  navRow.appendChild(nextArrow);
  let tabOffset = 0;
  function getMaxOffset() { return Math.max(0, tabBar.scrollWidth - tabScroller.clientWidth); }
  function applyOffset(offset) {
    tabOffset = Math.max(0, Math.min(getMaxOffset(), offset));
    tabBar.style.transform = `translateX(-${tabOffset}px)`;
    prevArrow.style.opacity = tabOffset <= 0 ? '0.3' : '1';
    nextArrow.style.opacity = tabOffset >= getMaxOffset() ? '0.3' : '1';
  }
  prevArrow.addEventListener('click', () => applyOffset(tabOffset - 200));
  nextArrow.addEventListener('click', () => applyOffset(tabOffset + 200));
  const panels = [];
  QUAD_COLS.forEach((col, i) => {
    const btn = document.createElement('button');
    btn.textContent = col;
    btn.className = `shrink-0 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${i === 0 ? 'bg-gray-700 text-blue-400 border-t border-x border-gray-600' : 'text-gray-400 hover:text-gray-200'}`;
    tabBar.appendChild(btn);
    const panel = document.createElement('div');
    if (i !== 0) panel.classList.add('hidden');
    panels.push(panel);
    btn.addEventListener('click', () => {
      tabBar.querySelectorAll('button').forEach((b, j) => {
        b.className = `shrink-0 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${j === i ? 'bg-gray-700 text-blue-400 border-t border-x border-gray-600' : 'text-gray-400 hover:text-gray-200'}`;
      });
      panels.forEach((p, j) => p.classList.toggle('hidden', j !== i));
      if (!panel.hasChildNodes()) panel.appendChild(buildColPanel(col));
      // Center the selected tab in the visible area
      applyOffset(btn.offsetLeft - tabScroller.clientWidth / 2 + btn.clientWidth / 2);
    });
  });
  panels[0].appendChild(buildColPanel(QUAD_COLS[0]));
  wrapper.appendChild(navRow);
  panels.forEach(p => wrapper.appendChild(p));
  // Init arrows after layout
  requestAnimationFrame(() => applyOffset(0));
  list.appendChild(wrapper);
  document.getElementById('quadrants-loading').classList.add('hidden');
  list.classList.remove('hidden');
}

async function patchAdminQuadrant(quadrant, perilListId) {
  try {
    const r = await fetch('/api/perils/admin-quadrants', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quadrant, peril_list_id: perilListId })
    });
    if (!r.ok) { const j = await r.json(); throw new Error(j.error?.message || `Erreur ${r.status}`); }
    // Update local cache without full reload
    const idx = adminQuadrantsData.findIndex(x => x.quadrant === quadrant);
    if (perilListId) {
      if (idx >= 0) adminQuadrantsData[idx].peril_list_id = perilListId;
      else adminQuadrantsData.push({ quadrant, peril_list_id: perilListId });
    } else {
      if (idx >= 0) adminQuadrantsData.splice(idx, 1);
    }
  } catch (e) { alert(e.message); }
}

// ── Admin Systèmes tab ────────────────────────────────────────────────────────
let adminSystemsData = [];

async function loadAdminSystems() {
  document.getElementById('systems-loading').classList.remove('hidden');
  document.getElementById('systems-list').classList.add('hidden');
  try {
    const r = await fetch('/api/admin/systems', { credentials: 'include' });
    const j = await r.json();
    adminSystemsData = j.data || [];
    renderAdminSystems();
  } catch (e) {
    document.getElementById('systems-loading').textContent = `Erreur : ${e.message}`;
  }
  document.getElementById('btn-add-system').onclick = () => openAdminSystemModal(null);
}

function renderAdminSystems() {
  const list = document.getElementById('systems-list');
  list.innerHTML = '';
  // Group by quadrant
  const byQuadrant = {};
  adminSystemsData.forEach(s => {
    if (!byQuadrant[s.quadrant]) byQuadrant[s.quadrant] = [];
    byQuadrant[s.quadrant].push(s);
  });
  const quadrants = Object.keys(byQuadrant).sort();
  if (!quadrants.length) {
    list.innerHTML = '<p class="text-gray-400 text-sm py-4">Aucun système défini.</p>';
  } else {
    quadrants.forEach(q => {
      const section = document.createElement('div');
      section.className = 'mb-4';
      section.innerHTML = `<h4 class="text-sm font-bold text-yellow-400 mb-2">${esc(q)}</h4>`;
      byQuadrant[q].forEach(s => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-3 p-2 bg-gray-800 rounded border border-gray-700 mb-1 ml-4';
        row.innerHTML = `<div class="flex-1 text-sm">${esc(s.nom)}${s.faction ? ` <span class="text-gray-400 text-xs">${esc(s.faction)}</span>` : ''}</div><button class="text-xs text-blue-400 hover:text-blue-300" title="Modifier">✏️</button><button class="text-xs text-red-400 hover:text-red-300" title="Supprimer">🗑️</button>`;
        row.querySelector('[title="Modifier"]').addEventListener('click', () => openAdminSystemModal(s));
        row.querySelector('[title="Supprimer"]').addEventListener('click', () => deleteAdminSystem(s.id, s.nom));
        section.appendChild(row);
      });
      list.appendChild(section);
    });
  }
  document.getElementById('systems-loading').classList.add('hidden');
  list.classList.remove('hidden');
}

function openAdminSystemModal(sys) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md">
      <h3 class="text-lg font-semibold mb-4">${sys ? 'Modifier' : 'Nouveau'} système</h3>
      <div class="space-y-3">
        <div><label class="block text-xs text-gray-400 mb-1">Quadrant *</label><input id="sm-quadrant" type="text" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" value="${esc(sys?.quadrant || '')}"></div>
        <div><label class="block text-xs text-gray-400 mb-1">Nom *</label><input id="sm-nom" type="text" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" value="${esc(sys?.nom || '')}"></div>
        <div><label class="block text-xs text-gray-400 mb-1">Faction</label><input id="sm-faction" type="text" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" value="${esc(sys?.faction || '')}"></div>
        <div><label class="block text-xs text-gray-400 mb-1">Description</label><textarea id="sm-desc" rows="2" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">${esc(sys?.description || '')}</textarea></div>
      </div>
      <p id="sm-err" class="text-red-400 text-sm mt-2 hidden"></p>
      <div class="flex gap-2 mt-4">
        <button id="sm-save" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm flex-1">Enregistrer</button>
        <button id="sm-cancel" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm">Annuler</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const errEl = overlay.querySelector('#sm-err');
  overlay.querySelector('#sm-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#sm-save').addEventListener('click', async () => {
    const quadrant = overlay.querySelector('#sm-quadrant').value.trim();
    const nom = overlay.querySelector('#sm-nom').value.trim();
    if (!quadrant || !nom) { errEl.textContent = 'Quadrant et nom requis'; errEl.classList.remove('hidden'); return; }
    const body = { quadrant, nom, faction: overlay.querySelector('#sm-faction').value.trim(), description: overlay.querySelector('#sm-desc').value.trim() };
    try {
      const url = sys ? `/api/admin/systems/${sys.id}` : '/api/admin/systems';
      const r = await fetch(url, { method: sys ? 'PATCH' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || `Erreur ${r.status}`);
      overlay.remove();
      loadAdminSystems();
    } catch (e) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
  });
}

async function deleteAdminSystem(id, nom) {
  if (!confirm(`Supprimer le système « ${nom} » ?`)) return;
  try {
    const r = await fetch(`/api/admin/systems/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) { const j = await r.json(); throw new Error(j.error?.message || `Erreur ${r.status}`); }
    loadAdminSystems();
  } catch (e) { alert(e.message); }
}

document.addEventListener('DOMContentLoaded', init);
