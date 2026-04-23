/**
 * profile.js â€” Gestion du profil utilisateur + campagnes
 */
import { initAuthUI, getCurrentUser, logout } from './shared/auth-ui.js';
import { loadTableContext } from './shared/header.js';

async function init() {
  await initAuthUI();
  loadTableContext(); // runs in background to populate header
  const user = getCurrentUser();
  if (!user) {
    window.location.href = '/login.html?redirect=/profile.html';
    return;
  }
  try {
    const r = await fetch('/api/profile', { credentials: 'include' });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error?.message || `Erreur ${r.status}`);
    renderProfile(json.data);
  } catch (e) {
    document.getElementById('loading').textContent = `Erreur : ${e.message}`;
  }
}

function renderProfile(data) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('profile-content').classList.remove('hidden');

  // Header info
  document.getElementById('profile-display-name').textContent = data.display_name || data.username;
  document.getElementById('profile-username').textContent = `@${data.username}`;
  if (data.is_admin) {
    document.getElementById('profile-admin-badge').classList.remove('hidden');
    document.getElementById('link-admin').classList.remove('hidden');
  }

  // Profile role badge
  const roleBadge = document.getElementById('profile-role-badge');
  if (data.profile_role === 'mj') {
    roleBadge.textContent = '🎲 Maître de Jeu';
    roleBadge.style.cssText = 'background:rgba(200,164,100,.15);color:var(--gold)';
    roleBadge.classList.remove('hidden');
  } else if (data.profile_role === 'joueur') {
    roleBadge.textContent = '🎮 Joueur';
    roleBadge.style.cssText = 'background:rgba(91,192,222,.15);color:var(--primary)';
    roleBadge.classList.remove('hidden');
  }

  // Avatar
  const avatarEl = document.getElementById('avatar-preview');
  function setAvatarPreview(url) {
    avatarEl.innerHTML = url
      ? `<img src="${esc(url)}" alt="avatar" style="width:100px;height:100px;object-fit:cover;border-radius:50%" onerror="this.parentElement.innerHTML='👤'">`
      : '👤';
  }
  if (data.avatar) setAvatarPreview(data.avatar);

  // Pre-fill form
  document.getElementById('field-display-name').value = data.display_name || '';
  document.getElementById('field-avatar').value = data.avatar || '';

  // Live preview on URL input
  document.getElementById('field-avatar').addEventListener('input', e => {
    setAvatarPreview(e.target.value.trim());
  });

  // File upload
  document.getElementById('field-avatar-file').addEventListener('change', async function () {
    const file = this.files[0];
    if (!file) return;
    const errEl2 = document.getElementById('profile-error');
    errEl2.classList.add('hidden');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || 'Erreur upload');
      document.getElementById('field-avatar').value = json.data.url;
      setAvatarPreview(json.data.url);
    } catch (ex) {
      errEl2.textContent = `Upload : ${ex.message}`;
      errEl2.classList.remove('hidden');
    }
  });

  // Submit form
  const form = document.getElementById('profile-form');
  const errEl = document.getElementById('profile-error');
  const okEl = document.getElementById('profile-success');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.classList.add('hidden');
    okEl.classList.add('hidden');
    const body = {};
    const dn = document.getElementById('field-display-name').value.trim();
    if (dn) body.display_name = dn;
    const av = document.getElementById('field-avatar').value.trim();
    body.avatar = av;
    const pwd = document.getElementById('field-password').value;
    const pwd2 = document.getElementById('field-password-confirm').value;
    if (pwd) {
      if (pwd !== pwd2) { showErr('Les mots de passe ne correspondent pas'); return; }
      if (pwd.length < 8) { showErr('Mot de passe trop court (min 8 caractères)'); return; }
      body.password = pwd;
    }

    try {
      const r = await fetch('/api/profile', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await r.json();
      if (!json.ok) { showErr(json.message); return; }
      okEl.classList.remove('hidden');
      document.getElementById('field-password').value = '';
      document.getElementById('field-password-confirm').value = '';
      // Update display
      if (json.data.display_name) document.getElementById('profile-display-name').textContent = json.data.display_name;
    } catch (ex) { showErr(ex.message); }
  });

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }

  // Delete account
  document.getElementById('btn-delete-account').addEventListener('click', () => {
    document.getElementById('confirm-delete-modal').classList.remove('hidden');
  });
  document.getElementById('cancel-delete-btn').addEventListener('click', () => {
    document.getElementById('confirm-delete-modal').classList.add('hidden');
  });
  document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    try {
      const r = await fetch('/api/profile', { method: 'DELETE', credentials: 'include' });
      const json = await r.json();
      if (!json.ok) { alert(json.message); return; }
      logout();
      window.location.href = '/login.html';
    } catch (ex) { alert(ex.message); }
  });

  // Campaigns
  renderCampaigns(data.tables || []);
}

function renderCampaigns(tables) {
  const list = document.getElementById('campaigns-list');
  const none = document.getElementById('no-campaigns');

  if (!tables.length) {
    none.classList.remove('hidden');
    return;
  }
  list.innerHTML = '';
  tables.forEach(t => {
    const isMj = t.role === 'mj';
    const el = document.createElement('div');
    el.className = 'bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-start justify-between gap-3';
    el.innerHTML = `
      <div class="flex-1 min-w-0">
        <p class="font-semibold truncate">${esc(t.name)}</p>
        ${t.description ? `<p class="text-xs text-gray-400 mt-0.5">${esc(t.description)}</p>` : ''}
        <p class="text-xs mt-1 ${isMj ? 'text-yellow-400' : 'text-blue-400'}">${isMj ? '👑 Maître de Jeu' : '🎲 Joueur'}</p>
        ${t.invite_code ? `<p class="text-xs text-gray-500 mt-0.5 font-mono">Code : ${esc(t.invite_code)}</p>` : ''}
      </div>
      <div class="flex flex-col gap-2 items-end flex-shrink-0">
        <button data-join="${t.id}" class="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded transition-colors">Rejoindre</button>
        ${isMj
          ? `<button data-del-table="${t.id}" class="text-xs text-red-400 hover:text-red-300">🗑️ Supprimer</button>`
          : `<button data-leave-table="${t.id}" class="text-xs text-gray-400 hover:text-red-300">Quitter</button>`}
      </div>`;

    el.querySelector('[data-join]').addEventListener('click', () => {
      localStorage.setItem('activeTable', JSON.stringify({ id: t.id, name: t.name, role: t.role }));
      window.location.href = '/univers.html';
    });
    const delBtn = el.querySelector('[data-del-table]');
    if (delBtn) delBtn.addEventListener('click', () => leaveOrDelete(t.id, t.name, true, el));
    const leaveBtn = el.querySelector('[data-leave-table]');
    if (leaveBtn) leaveBtn.addEventListener('click', () => leaveOrDelete(t.id, t.name, false, el));
    list.appendChild(el);
  });
}

async function leaveOrDelete(id, name, isMj, el) {
  const action = isMj ? 'supprimer définitivement' : 'quitter';
  if (!confirm(`Voulez-vous ${action} la campagne "${name}" ?`)) return;
  try {
    const r = await fetch(`/api/profile/tables/${id}`, { method: 'DELETE', credentials: 'include' });
    const json = await r.json();
    if (!json.ok) { alert(json.message); return; }
    el.remove();
  } catch (ex) { alert(ex.message); }
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
