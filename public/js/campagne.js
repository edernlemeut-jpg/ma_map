/**
 * campagne.js — Campaign management page (MJ only).
 * Shows invite link, member list, and kick controls.
 */
import { initAuthUI, getCurrentUser } from './shared/auth-ui.js';
import { loadTableContext } from './shared/header.js';
import { getActiveTableId, fetchWithTable } from './shared/table-selector.js';

let tableId = null;
let inviteCode = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingEl = document.getElementById('loading');
const panelEl = document.getElementById('campaign-panel');
const accessDeniedEl = document.getElementById('access-denied');
const campaignTitleEl = document.getElementById('campaign-title');
const inviteLinkInput = document.getElementById('invite-link-input');
const btnCopy = document.getElementById('btn-copy-invite');
const btnRegen = document.getElementById('btn-regen-invite');
const inviteMsg = document.getElementById('invite-msg');
const membersList = document.getElementById('members-list');
const memberCount = document.getElementById('member-count');

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await initAuthUI();
  const user = getCurrentUser();

  if (!user) {
    window.location.href = `/login.html?redirect=${encodeURIComponent('/campagne.html')}`;
    return;
  }

  tableId = getActiveTableId();
  if (!tableId) {
    loadingEl.classList.add('hidden');
    accessDeniedEl.classList.remove('hidden');
    return;
  }

  // Load table context to populate header
  const table = await loadTableContext();

  if (!table || !table.is_mj) {
    loadingEl.classList.add('hidden');
    accessDeniedEl.classList.remove('hidden');
    return;
  }

  campaignTitleEl.textContent = table.name;

  if (table.invite_code) {
    setInviteLink(table.invite_code);
  } else {
    // Legacy table with no invite code — regenerate one immediately
    try {
      const rr = await fetchWithTable(`/api/game_tables/${tableId}/regenerate-invite`, { method: 'POST' });
      const rj = await rr.json();
      setInviteLink(rj.data?.invite_code || '???');
    } catch {
      setInviteLink('???');
    }
  }

  loadingEl.classList.add('hidden');
  panelEl.classList.remove('hidden');

  bindActions();
  await loadMembers();
}

function setInviteLink(code) {
  inviteCode = code;
  const link = `${location.origin}/rejoindre?code=${code}`;
  inviteLinkInput.value = link;
}

function flashMsg(text, color = 'text-green-400') {
  inviteMsg.textContent = text;
  inviteMsg.className = `text-xs ${color}`;
  inviteMsg.classList.remove('hidden');
  setTimeout(() => inviteMsg.classList.add('hidden'), 3000);
}

function bindActions() {
  // Copy invite link
  btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(inviteLinkInput.value);
      flashMsg('✓ Lien copié dans le presse-papier !');
    } catch {
      inviteLinkInput.select();
      document.execCommand('copy');
      flashMsg('✓ Lien copié !');
    }
  });

  inviteLinkInput.addEventListener('click', () => inviteLinkInput.select());

  // Regenerate invite code
  btnRegen.addEventListener('click', async () => {
    if (!confirm('Générer un nouveau code d\'invitation ? L\'ancien lien ne fonctionnera plus.')) return;
    btnRegen.disabled = true;
    btnRegen.textContent = '…';
    try {
      const res = await fetchWithTable(`/api/game_tables/${tableId}/regenerate-invite`, {
        method: 'POST'
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || `Erreur ${res.status}`);
      setInviteLink(json.data.invite_code);
      flashMsg('✓ Nouveau code généré !');
    } catch (e) {
      flashMsg(`Erreur : ${e.message}`, 'text-red-400');
    } finally {
      btnRegen.disabled = false;
      btnRegen.textContent = 'Régénérer';
    }
  });
}

// ── Members ───────────────────────────────────────────────────────────────────
async function loadMembers() {
  try {
    const res = await fetchWithTable(`/api/game_tables/${tableId}/members`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || `Erreur ${res.status}`);
    renderMembers(json.data);
  } catch (e) {
    membersList.innerHTML = `<p class="text-red-400 text-sm">Erreur : ${e.message}</p>`;
  }
}

function renderMembers(members) {
  memberCount.textContent = `${members.length} membre${members.length > 1 ? 's' : ''}`;

  if (!members.length) {
    membersList.innerHTML = '<p class="text-gray-500 text-sm">Aucun membre.</p>';
    return;
  }

  membersList.innerHTML = members.map(m => `
    <div class="flex items-center justify-between bg-gray-700/50 rounded-lg px-4 py-3" data-user-id="${m.id}">
      <div class="flex items-center gap-3">
        <span class="text-lg">${m.is_mj ? '🎲' : '🎮'}</span>
        <div>
          <span class="font-medium">${escHtml(m.display_name)}</span>
          <span class="text-xs text-gray-400 ml-1">@${escHtml(m.username)}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs px-2 py-0.5 rounded-full ${m.is_mj ? 'bg-yellow-900/50 text-yellow-300' : 'bg-gray-600 text-gray-300'}">
          ${m.is_mj ? 'MJ' : 'Joueur'}
        </span>
        ${m.is_mj ? '' : `
          <button class="btn-kick text-xs px-3 py-1 bg-red-900/50 hover:bg-red-800 text-red-300 rounded transition-colors"
                  data-user-id="${m.id}" data-username="${escHtml(m.display_name)}">
            Exclure
          </button>`}
      </div>
    </div>
  `).join('');

  membersList.querySelectorAll('.btn-kick').forEach(btn => {
    btn.addEventListener('click', () => kickMember(Number(btn.dataset.userId), btn.dataset.username));
  });
}

async function kickMember(userId, username) {
  if (!confirm(`Exclure ${username} de la table ?`)) return;

  try {
    const res = await fetchWithTable(`/api/game_tables/${tableId}/members/${userId}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || `Erreur ${res.status}`);
    // Remove from DOM
    const row = membersList.querySelector(`[data-user-id="${userId}"]`);
    if (row) row.remove();
    // Update count
    const remaining = membersList.querySelectorAll('[data-user-id]').length;
    memberCount.textContent = `${remaining} membre${remaining > 1 ? 's' : ''}`;
  } catch (e) {
    alert(`Erreur : ${e.message}`);
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
