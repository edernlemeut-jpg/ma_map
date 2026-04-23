/**
 * rejoindre.js — Invite landing page.
 * Reads ?code= from URL, authenticates if needed, then auto-joins the table.
 */
import { getCurrentUser } from './shared/auth-ui.js';
import { setActiveTable } from './shared/table-selector.js';

const statusEl = document.getElementById('join-status');
const errorEl = document.getElementById('join-error');
const actionsEl = document.getElementById('join-actions');

function showError(msg) {
  statusEl.classList.add('hidden');
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
  actionsEl.classList.remove('hidden');
  // Replace dashboard link with a home link for error state
  actionsEl.innerHTML = `
    <a href="/" class="block w-full py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium transition-colors">
      Retour à l'accueil
    </a>`;
}

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

async function init() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');

  if (!code) {
    showError('Lien d\'invitation invalide (code manquant).');
    return;
  }

  // Verify authentication
  const user = await checkAuth();
  if (!user) {
    // Redirect to login with redirect back here
    const redirect = encodeURIComponent(`/rejoindre?code=${code}`);
    window.location.href = `/login.html?redirect=${redirect}`;
    return;
  }

  statusEl.textContent = 'Connexion à la table en cours…';

  try {
    const res = await fetch('/api/game_tables/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ invite_code: code })
    });
    const json = await res.json();

    if (!res.ok) {
      // 409 = already a member — treat as success
      if (res.status === 409) {
        statusEl.textContent = 'Vous êtes déjà membre de cette table.';
        // Try to find and set the table as active via the tables list
        await activateTableByCode(code);
        return;
      }
      showError(json.error?.message || `Erreur ${res.status}`);
      return;
    }

    // Set the joined table as active
    const tableId = json.data?.id || json.data?.table_id;
    const role = json.data?.role || 'joueur';
    if (tableId) {
      setActiveTable(tableId, role);
    }

    statusEl.textContent = `Bienvenue ! Vous avez rejoint la table.`;
    actionsEl.classList.remove('hidden');
    // Redirect after short delay
    setTimeout(() => { window.location.href = '/'; }, 1500);

  } catch {
    showError('Erreur réseau. Veuillez réessayer.');
  }
}

async function activateTableByCode(code) {
  try {
    const res = await fetch('/api/game_tables', { credentials: 'include' });
    const json = await res.json();
    // Find the table matching the code or just use the first one
    // Since we don't have the code in the list, redirect to dashboard to let user pick
    actionsEl.classList.remove('hidden');
    setTimeout(() => { window.location.href = '/'; }, 1500);
  } catch {
    actionsEl.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', init);
