/**
 * entity-links.js — Composant réutilisable pour afficher et gérer les entités liées.
 *
 * Usage :
 *   renderEntityLinksSection(container, 'system', systemId, canEdit, onNavigate?)
 */
import { fetchWithTable } from '/js/shared/table-selector.js';

/** Labels et icônes par type d'entité */
const ENTITY_LABELS = {
  system:    { label: 'Système',      icon: '🌌' },
  faction:   { label: 'Faction',      icon: '🏴' },
  ship:      { label: 'Vaisseau',     icon: '🚀' },
  named_npc: { label: 'PNJ',          icon: '👤' },
  character: { label: 'Personnage',   icon: '🧑' },
  event:     { label: 'Événement',    icon: '⚡' },
};

/** Échappement XSS — obligatoire pour tout innerHTML */
function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

/**
 * Render the entity-links section into `container`.
 *
 * @param {HTMLElement} container   - Élément DOM cible
 * @param {string}      sourceType  - Type de l'entité source (ex : 'system')
 * @param {number}      sourceId    - ID de l'entité source
 * @param {boolean}     canEdit     - MJ → true ; joueur → false
 * @param {Function}    [onNavigate] - Callback optionnel (targetType, targetId) pour naviguer
 */
export async function renderEntityLinksSection(container, sourceType, sourceId, canEdit, onNavigate) {
  container.innerHTML = '<p class="text-xs text-gray-500 italic mt-1">Chargement des entités liées…</p>';

  let links = [];
  try {
    const res = await fetchWithTable(
      `/api/entity-links?source_type=${encodeURIComponent(sourceType)}&source_id=${encodeURIComponent(sourceId)}`
    );
    const payload = await res.json();
    links = Array.isArray(payload.data) ? payload.data : [];
  } catch {
    container.innerHTML = '<p class="text-xs text-red-400 italic mt-1">Erreur lors du chargement des entités liées.</p>';
    return;
  }

  renderLinks(container, sourceType, sourceId, links, canEdit, onNavigate);
}

/* ── Internal render ─────────────────────────────────────────────────────────── */

function renderLinks(container, sourceType, sourceId, links, canEdit, onNavigate) {
  const listHtml = links.length === 0
    ? '<p class="text-xs text-gray-500 italic">Aucune entité liée.</p>'
    : `<ul class="space-y-1 mt-2">${links.map(l => renderLinkRow(l, canEdit, !!onNavigate)).join('')}</ul>`;

  const addFormHtml = canEdit ? `
    <div id="el-add-form" class="hidden mt-3 border border-gray-700 rounded-lg p-3 space-y-2 bg-gray-900/60">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Type cible</label>
          <select id="el-target-type" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200">
            ${Object.entries(ENTITY_LABELS).map(([k, v]) =>
              `<option value="${esc(k)}">${esc(v.icon)} ${esc(v.label)}</option>`
            ).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">ID cible</label>
          <input id="el-target-id" type="number" min="1" placeholder="ID"
            class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200">
        </div>
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Type de relation <span class="text-gray-600">(optionnel)</span></label>
        <input id="el-relation-type" type="text" maxlength="80" placeholder="ex : alliés, ennemis…"
          class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200">
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Note <span class="text-gray-600">(optionnel)</span></label>
        <textarea id="el-notes" rows="2" placeholder="Contexte…"
          class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 resize-none"></textarea>
      </div>
      <div id="el-error" class="text-xs text-red-400 hidden"></div>
      <div class="flex gap-2 justify-end">
        <button id="el-cancel-btn"
          class="text-sm text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded hover:bg-gray-700 transition-colors">
          Annuler
        </button>
        <button id="el-save-btn"
          class="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors">
          Enregistrer
        </button>
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="flex items-center justify-between mb-1">
      <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Entités liées</span>
      ${canEdit ? `<button id="el-add-btn" class="text-xs text-blue-400 hover:text-blue-300 transition-colors">＋ Ajouter</button>` : ''}
    </div>
    ${listHtml}
    ${addFormHtml}`;

  // ── Supprimer un lien ────────────────────────────────────────────────────────
  container.querySelectorAll('[data-el-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.elDelete);
      btn.disabled = true;
      try {
        const res = await fetchWithTable(`/api/entity-links/${id}`, { method: 'DELETE' });
        if (res.status === 204) {
          const row = container.querySelector(`[data-el-id="${id}"]`);
          row?.remove();
          const ul = container.querySelector('ul');
          if (ul && !ul.querySelector('[data-el-id]')) {
            ul.replaceWith(Object.assign(document.createElement('p'), {
              className: 'text-xs text-gray-500 italic',
              textContent: 'Aucune entité liée.',
            }));
          }
          // Update local links array and re-render isn't needed — DOM patching is sufficient
        } else {
          btn.disabled = false;
        }
      } catch {
        btn.disabled = false;
      }
    });
  });

  // ── Navigation sur clic ───────────────────────────────────────────────────────
  if (onNavigate) {
    container.querySelectorAll('[data-el-nav]').forEach(el => {
      el.addEventListener('click', () => {
        const targetType = el.dataset.elNavType;
        const targetId   = Number(el.dataset.elNav);
        onNavigate(targetType, targetId);
      });
    });
  }

  if (!canEdit) return;

  // ── Formulaire ajout ─────────────────────────────────────────────────────────
  const addBtn    = container.querySelector('#el-add-btn');
  const addForm   = container.querySelector('#el-add-form');
  const cancelBtn = container.querySelector('#el-cancel-btn');
  const saveBtn   = container.querySelector('#el-save-btn');
  const errEl     = container.querySelector('#el-error');

  addBtn?.addEventListener('click', () => {
    addForm.classList.toggle('hidden');
    if (!addForm.classList.contains('hidden')) addBtn.textContent = '✕ Fermer';
    else addBtn.textContent = '＋ Ajouter';
  });

  cancelBtn?.addEventListener('click', () => {
    addForm.classList.add('hidden');
    addBtn.textContent = '＋ Ajouter';
  });

  saveBtn?.addEventListener('click', async () => {
    const targetType     = container.querySelector('#el-target-type').value;
    const targetIdRaw    = container.querySelector('#el-target-id').value;
    const relationType   = container.querySelector('#el-relation-type').value.trim() || null;
    const notes          = container.querySelector('#el-notes').value.trim() || null;
    const targetId       = Number(targetIdRaw);

    if (!targetId || targetId <= 0) {
      errEl.textContent = 'L\'ID cible doit être un nombre positif.';
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');
    saveBtn.disabled = true;

    try {
      const res = await fetchWithTable('/api/entity-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: sourceType, source_id: sourceId, target_type: targetType, target_id: targetId, relation_type: relationType, notes }),
      });

      if (res.ok) {
        const payload = await res.json();
        links.push(payload.data);
        // Re-render the whole section to show the new link
        renderLinks(container, sourceType, sourceId, links, canEdit, onNavigate);
      } else {
        const payload = await res.json().catch(() => ({}));
        errEl.textContent = payload?.error?.message || 'Erreur lors de la création du lien.';
        errEl.classList.remove('hidden');
        saveBtn.disabled = false;
      }
    } catch {
      errEl.textContent = 'Erreur réseau.';
      errEl.classList.remove('hidden');
      saveBtn.disabled = false;
    }
  });
}

/* ── Render helpers ──────────────────────────────────────────────────────────── */

function renderLinkRow(link, canEdit, navigable) {
  const meta = ENTITY_LABELS[link.target_type] || { label: link.target_type, icon: '🔗' };
  const badge = `<span class="inline-flex items-center gap-1 bg-gray-700 px-1.5 py-0.5 rounded text-xs">${esc(meta.icon)} ${esc(meta.label)}</span>`;
  const idLabel = `<span class="text-sm text-gray-300">ID ${esc(String(link.target_id))}</span>`;
  const relation = link.relation_type ? `<span class="text-xs text-gray-500 ml-1">— ${esc(link.relation_type)}</span>` : '';
  const hiddenBadge = link.target_hidden
    ? `<span class="text-xs text-amber-500 ml-1" title="Cette entité est cachée aux joueurs">🔒 (caché)</span>`
    : '';

  const mainAttrs = navigable && !link.target_hidden
    ? `role="button" tabindex="0" data-el-nav="${link.target_id}" data-el-nav-type="${esc(link.target_type)}" class="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer hover:text-blue-300 transition-colors rounded"`
    : `class="flex items-center gap-1.5 flex-1 min-w-0"`;

  const deleteBtn = canEdit
    ? `<button data-el-delete="${link.id}" class="ml-2 text-xs text-red-400 hover:text-red-300 transition-colors flex-shrink-0" title="Supprimer ce lien">✕</button>`
    : '';

  const notesHtml = link.notes
    ? `<p class="text-xs text-gray-500 italic ml-5 mt-0.5">${esc(link.notes)}</p>`
    : '';

  return `
    <li data-el-id="${link.id}" class="py-1.5 border-b border-gray-700/40 last:border-0">
      <div class="flex items-center gap-1.5">
        <div ${mainAttrs}>${badge}${idLabel}${relation}${hiddenBadge}</div>
        ${deleteBtn}
      </div>
      ${notesHtml}
    </li>`;
}
