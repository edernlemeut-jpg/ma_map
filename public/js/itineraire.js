/**
 * itineraire.js — Carte galactique & calcul d'itinéraire
 * ES module — remplace le script inline de itineraire_backup_20260419.html
 */
import { initAuthUI } from '/js/shared/auth-ui.js';
import { getActiveTableId, fetchWithTable, isMJ } from '/js/shared/table-selector.js';

// ── LETTRES (grille 40×40 lettres grecques) ──────────────────────────────
const LETTRES = ["Α","Β","Γ","Δ","Ε","Ζ","Η","Θ","Ι","Κ","Λ","Μ","Ν","Ξ","Ο","Π","Ρ","Σ","Τ","Υ","Φ","Χ","Ψ","Ω","Α′","Β′","Γ′","Δ′","Ε′","Ζ′","Η′","Θ′","Ι′","Κ′","Λ′","Μ′","Ν′","Ξ′","Ο′","Π′"];

// ── ÉTAT GLOBAL ─────────────────────────────────────────────────────────
let donnees = {};          // { "Κ-8": [{nom, faction, corpsCelestes, soleil, ...}] }
let perilsData = {};
let PERILS_DEFAULT = {};
let tripState = { points: [] };
let currentTripLegs = null;
let customTables = [];
let perilAssignments = { systems: {}, quadrants: {} };
let factions = [];
let activeShip = null;     // ship object from API
let ships = [];
let shipModels = [];
let isDragging = false;

// Pan/zoom
let zoom = 1, panX = 0, panY = 0;
let panning = false, pinching = false;
let panSX = 0, panSY = 0;
let _dsX = 0, _dsY = 0;
let pinchD0 = 0, pinchZ0 = 1;

// ── CHARGEMENT DES DONNÉES ───────────────────────────────────────────────
async function loadData() {
  const tableId = getActiveTableId();

  // Toujours charger les périls (fichier statique public)
  try {
    const pr = await fetch('/api/perils-default');
    if (pr.ok) {
      PERILS_DEFAULT = await pr.json();
      // Essayer admin overrides locaux
      try {
        const a = localStorage.getItem('perilsDataAdmin');
        if (a) perilsData = JSON.parse(a);
        else perilsData = JSON.parse(JSON.stringify(PERILS_DEFAULT));
      } catch { perilsData = JSON.parse(JSON.stringify(PERILS_DEFAULT)); }
    }
  } catch (e) { console.error('perils_data.json:', e); }

  // Tables personnalisées + assignations (localStorage)
  try { customTables = JSON.parse(localStorage.getItem('customPerilTables') || '[]'); } catch { customTables = []; }
  try { perilAssignments = JSON.parse(localStorage.getItem('perilAssignments') || '{"systems":{},"quadrants":{}}'); } catch { perilAssignments = { systems: {}, quadrants: {} }; }
  try { factions = JSON.parse(localStorage.getItem('factions') || '[]'); } catch { factions = []; }

  if (!tableId) return; // Pas de table → carte vide

  // Charger systèmes + vaisseaux + modèles + vaisseau actif en parallèle
  try {
    const [sysRes, shipsRes, modelsRes, activeRes] = await Promise.all([
      fetchWithTable('/api/systems', { credentials: 'include' }),
      fetchWithTable('/api/ships', { credentials: 'include' }),
      fetchWithTable('/api/ship-models', { credentials: 'include' }),
      fetchWithTable('/api/ships/active', { credentials: 'include' }),
    ]);

    if (sysRes.ok) {
      const systems = (await sysRes.json()).data || [];
      donnees = {};
      for (const sys of systems) {
        if (!sys.quadrant) continue;
        if (!donnees[sys.quadrant]) donnees[sys.quadrant] = [];
        // Normaliser snake_case → camelCase pour la compatibilité backup
        donnees[sys.quadrant].push(mapSystem(sys));
      }
    }

    if (shipsRes.ok) ships = (await shipsRes.json()).data || [];
    if (modelsRes.ok) shipModels = (await modelsRes.json()).data || [];

    if (activeRes.ok) {
      const { activeShipId } = (await activeRes.json()).data || {};
      activeShip = ships.find(s => String(s.id) === String(activeShipId)) || null;
    }
  } catch (e) { console.error('API load error:', e); }

  // Params depuis localStorage si aucun vaisseau actif
  loadParamsFromStorage();
}

/** Normalize API system object to match backup format */
function mapSystem(sys) {
  let soleil = null;
  if (sys.soleil_json) {
    try { soleil = typeof sys.soleil_json === 'string' ? JSON.parse(sys.soleil_json) : sys.soleil_json; } catch {}
  }
  let corpsCelestes = [];
  if (sys.corps_celestes_json) {
    try { corpsCelestes = typeof sys.corps_celestes_json === 'string' ? JSON.parse(sys.corps_celestes_json) : sys.corps_celestes_json; } catch {}
  }
  return {
    nom: sys.nom || '',
    faction: sys.faction || '',
    isFrontiere: !!sys.is_frontiere,
    gouvernement: sys.gouvernement || '',
    route: sys.route || '',
    description: sys.description || '',
    patrouilles: sys.patrouilles_json ? (typeof sys.patrouilles_json === 'string' ? JSON.parse(sys.patrouilles_json) : sys.patrouilles_json) : [],
    soleil: soleil || {},
    corpsCelestes,
    _id: sys.id,
  };
}

// ── VAISSEAU ─────────────────────────────────────────────────────────────
function getActiveModel() {
  if (!activeShip) return null;
  return shipModels.find(m => String(m.id) === String(activeShip.model_id)) || null;
}

function getParams() {
  const model = getActiveModel();
  if (model) {
    return {
      ipSpd: Number(model.vitesse_croisiere) || 100,
      hsSpd: Number(model.vitesse_hyperspatiale) || 1000,
      hsAuto: Number(model.autonomie) || 10000,
    };
  }
  // Fallback localStorage
  try {
    const p = JSON.parse(localStorage.getItem('tripParams') || '{}');
    return { ipSpd: p.ipSpd || 100, hsSpd: p.hsSpd || 1000, hsAuto: p.hsAuto || 10000 };
  } catch { return { ipSpd: 100, hsSpd: 1000, hsAuto: 10000 }; }
}

function saveParams(p) {
  localStorage.setItem('tripParams', JSON.stringify(p));
}

function loadParamsFromStorage() {
  // Pré-remplir les inputs params depuis le vaisseau actif ou localStorage
  const p = getParams();
  const ipEl = document.getElementById('p-ip-spd');
  const hsEl = document.getElementById('p-hs-spd');
  const auEl = document.getElementById('p-hs-auto');
  if (ipEl) ipEl.value = p.ipSpd;
  if (hsEl) hsEl.value = p.hsSpd;
  if (auEl) auEl.value = p.hsAuto;
}

function loadParamsToForm() {
  const p = getParams();
  document.getElementById('p-ip-spd').value = p.ipSpd;
  document.getElementById('p-hs-spd').value = p.hsSpd;
  document.getElementById('p-hs-auto').value = p.hsAuto;
  // Afficher info vaisseau si actif
  const info = document.getElementById('params-ship-info');
  if (info) {
    if (activeShip) {
      const m = getActiveModel();
      info.textContent = `Vaisseau actif : ${activeShip.name || activeShip.nom}${m ? ` (${m.nom})` : ''}`;
      info.style.display = 'block';
    } else {
      info.style.display = 'none';
    }
  }
}

async function setActiveShip(shipId) {
  const tableId = getActiveTableId();
  if (!tableId) return;
  await fetchWithTable('/api/ships/active', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipId: shipId || null }),
  });
  activeShip = ships.find(s => String(s.id) === String(shipId)) || null;
}

function populateShipSelect() {
  const sel = document.getElementById('ship-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">🚀 Vaisseau...</option>';
  ships.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name || s.nom || `#${s.id}`;
    if (activeShip && String(s.id) === String(activeShip.id)) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', async () => {
    await setActiveShip(sel.value || null);
    // Mettre à jour les params affichés
    if (document.getElementById('p-ip-spd')) loadParamsToForm();
  });
}

// ── CARTE ─────────────────────────────────────────────────────────────────
function applyT() {
  const w = document.getElementById('carte-wrapper');
  if (w) w.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
}

function initCarte() {
  const colLeg = document.getElementById('col-legende');
  const rowLeg = document.getElementById('row-legende');
  const carte = document.getElementById('carte');
  if (!colLeg || !rowLeg || !carte) return;

  // Légende colonnes
  colLeg.innerHTML = '<div class="col-header"></div>';
  LETTRES.forEach(l => {
    const d = document.createElement('div');
    d.className = 'col-header';
    d.textContent = l;
    colLeg.appendChild(d);
  });

  // Légende rangées
  rowLeg.innerHTML = '';
  for (let r = 1; r <= 40; r++) {
    const d = document.createElement('div');
    d.className = 'row-header';
    d.textContent = r;
    rowLeg.appendChild(d);
  }

  // Grille
  carte.innerHTML = '';
  for (let row = 1; row <= 40; row++) {
    for (let col = 0; col < 40; col++) {
      const coord = `${LETTRES[col]}-${row}`;
      const cell = document.createElement('div');
      cell.className = 'quad';
      cell.dataset.coord = coord;
      cell.title = coord;
      cell.addEventListener('click', () => onCellClick(coord));
      carte.appendChild(cell);
    }
  }
  refreshCarte();
}

function refreshCarte() {
  document.querySelectorAll('.quad').forEach(cell => {
    const coord = cell.dataset.coord;
    cell.classList.remove('has-system', 'selected-dep', 'selected-arr', 'selected-eta', 'path');
    if (donnees[coord]?.length) cell.classList.add('has-system');
  });

  const pts = tripState.points;
  if (pts.length > 0) {
    const depCell = document.querySelector(`.quad[data-coord="${pts[0].quadrant}"]`);
    if (depCell) depCell.classList.add('selected-dep');
    if (pts.length > 1) {
      const arrCell = document.querySelector(`.quad[data-coord="${pts[pts.length-1].quadrant}"]`);
      if (arrCell) arrCell.classList.add('selected-arr');
    }
    pts.slice(1, pts.length - 1).forEach(p => {
      const c = document.querySelector(`.quad[data-coord="${p.quadrant}"]`);
      if (c) c.classList.add('selected-eta');
    });
    // Chemin Bresenham
    for (let i = 0; i < pts.length - 1; i++) {
      markPath(pts[i].quadrant, pts[i+1].quadrant);
    }
  }
}

function coordXY(coord) {
  const p = coord.split('-');
  const letter = coord.slice(0, coord.lastIndexOf('-'));
  const num = parseInt(coord.slice(coord.lastIndexOf('-') + 1), 10);
  return { x: LETTRES.indexOf(letter), y: num - 1 };
}

function markPath(a, b) {
  const ca = coordXY(a), cb = coordXY(b);
  let x = ca.x, y = ca.y, dx = Math.abs(cb.x - ca.x), dy = Math.abs(cb.y - ca.y);
  const sx = ca.x < cb.x ? 1 : -1, sy = ca.y < cb.y ? 1 : -1;
  let err = dx - dy;
  while (true) {
    const coord = `${LETTRES[x]}-${y + 1}`;
    const cell = document.querySelector(`.quad[data-coord="${coord}"]`);
    if (cell && !cell.classList.contains('selected-dep') && !cell.classList.contains('selected-arr') && !cell.classList.contains('selected-eta')) {
      cell.classList.add('path');
    }
    if (x === cb.x && y === cb.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

// ── PAN/ZOOM ─────────────────────────────────────────────────────────────
function initPanZoom() {
  const z = document.getElementById('carte-zone');
  z.addEventListener('mousedown', e => {
    panning = true; isDragging = false;
    _dsX = e.clientX; _dsY = e.clientY;
    panSX = e.clientX - panX; panSY = e.clientY - panY;
    z.classList.add('grabbing');
  });
  window.addEventListener('mousemove', e => {
    if (!panning) return;
    if (!isDragging && (Math.abs(e.clientX - _dsX) > 4 || Math.abs(e.clientY - _dsY) > 4)) isDragging = true;
    panX = e.clientX - panSX; panY = e.clientY - panSY; applyT();
  });
  window.addEventListener('mouseup', () => { panning = false; z.classList.remove('grabbing'); });
  z.addEventListener('wheel', e => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.1 : 0.91;
    const r = z.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const nz = Math.min(Math.max(zoom * f, 0.25), 6);
    panX = mx - (mx - panX) * (nz / zoom); panY = my - (my - panY) * (nz / zoom);
    zoom = nz; applyT();
  }, { passive: false });
  z.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      pinching = true;
      pinchD0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchZ0 = zoom;
    } else if (e.touches.length === 1) {
      panning = true; panSX = e.touches[0].clientX - panX; panSY = e.touches[0].clientY - panY;
    }
  }, { passive: true });
  z.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 2 && pinching) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const r = z.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      const nz = Math.min(Math.max(pinchZ0 * (d / pinchD0), 0.25), 6);
      panX = mx - (mx - panX) * (nz / zoom); panY = my - (my - panY) * (nz / zoom);
      zoom = nz; applyT();
    } else if (e.touches.length === 1 && panning) {
      panX = e.touches[0].clientX - panSX; panY = e.touches[0].clientY - panSY; applyT();
    }
  }, { passive: false });
  z.addEventListener('touchend', () => { panning = false; pinching = false; });
}

function centerMap() {
  const z = document.getElementById('carte-zone'), r = z.getBoundingClientRect();
  zoom = Math.min(r.width / 820, r.height / 820, 1);
  panX = (r.width - 820 * zoom) / 2; panY = (r.height - 820 * zoom) / 2;
  applyT();
}

// ── BOTTOM SHEET ──────────────────────────────────────────────────────────
function onCellClick(coord) {
  if (_pickingQuadrant) {
    if (_editCoord === '__new__') finishPickQuadrant(coord);
    else { _pickingQuadrant = false; document.getElementById('carte-zone').classList.remove('picking'); relocateSystem(coord); openModal('modal-edit-system'); }
    return;
  }
  const systems = donnees[coord] || [];
  const sheet = document.getElementById('bottom-sheet');
  document.getElementById('bs-title-text').textContent = `Quadrant ${coord}`;
  const qbContainer = document.getElementById('bs-quad-btns');
  qbContainer.innerHTML = '';
  const qp = { quadrant: coord, systemNom: null, astroNom: null, orbit: 0 };
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-point btn-eta';
  addBtn.style.cssText = 'padding:3px 9px;font-size:0.75rem';
  addBtn.textContent = '+ Quadrant';
  addBtn.addEventListener('click', () => { tripState.points.push({ ...qp }); refreshAll(); });
  qbContainer.appendChild(addBtn);
  renderBSTripState();
  const content = document.getElementById('bottom-sheet-content');
  content.innerHTML = '';
  // HS peril picker
  const hsRow = document.createElement('div');
  hsRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--bg3)';
  const hsTid = perilAssignments.quadrants[coord] || '';
  hsRow.innerHTML = `<span style="font-size:0.78rem;color:#aaa;white-space:nowrap">⚠️ Périls HS :</span>${_perilTableSelect('hyperspatial', coord, hsTid)}`;
  content.appendChild(hsRow);
  if (systems.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:20px;text-align:center;color:#888;font-style:italic';
    empty.textContent = 'Quadrant vide.';
    content.appendChild(empty);
  } else {
    systems.forEach((sys, si) => {
      const sd = document.createElement('div');
      sd.style.cssText = 'margin-bottom:10px;border:1px solid var(--border);border-radius:6px;overflow:hidden';
      const hdr = document.createElement('div');
      hdr.style.cssText = 'background:var(--bg3);padding:7px 12px;font-weight:bold;color:var(--gold);font-size:0.88rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center';
      hdr.innerHTML = `<span>${sys.nom || '?'}</span><span style="color:#888;font-weight:normal;font-size:0.76rem">${_factionLabel(sys.faction)} <span style="color:var(--primary)">ℹ</span></span>`;
      hdr.addEventListener('click', () => showSystemDetail(coord, si));
      sd.appendChild(hdr);
      getAstres(sys).forEach(a => {
        const pt = { quadrant: coord, systemNom: sys.nom, astroNom: a.label, orbit: a.orbit };
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 12px;border-top:1px solid var(--border)';
        row.innerHTML = `<span style="font-size:0.85rem">${a.label}</span>`;
        const b = document.createElement('button');
        b.className = 'btn-point btn-eta';
        b.style.cssText = 'padding:3px 9px;font-size:0.75rem';
        b.textContent = '+';
        b.addEventListener('click', () => { tripState.points.push({ ...pt }); refreshAll(); });
        row.appendChild(b);
        sd.appendChild(row);
      });
      content.appendChild(sd);
    });
  }
  sheet.classList.add('open');
  document.getElementById('fab-calculer').classList.add('sheet-open');
  updateDesktopQuadInfo(coord, systems);
}

function getAstres(sys) {
  const list = [];
  if (sys.soleil?.nom) list.push({ label: `☀ ${sys.soleil.nom}`, orbit: 0 });
  (sys.corpsCelestes || []).forEach(p => { if (p.orbite) list.push({ label: p.nom, orbit: parseFloat(p.orbite) || 0 }); });
  if (sys.soleil?.distanceSaut) list.push({ label: 'Limite de Saut', orbit: parseFloat(sys.soleil.distanceSaut) || 0 });
  return list;
}

function updateDesktopQuadInfo(coord, systems) {
  const el = document.getElementById('dp-quad-info');
  if (!el) return;
  const qp = JSON.stringify({ quadrant: coord, systemNom: null, astroNom: null, orbit: 0 });
  const addQBtn = `<button onclick='APP.add(${JSON.stringify(qp)})' class="btn-point btn-eta" style="padding:2px 8px;font-size:0.7rem">+</button>`;
  let h = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><strong style="color:var(--gold)">${coord}</strong>${addQBtn}</div>`;
  const _hsTid = perilAssignments.quadrants[coord] || '';
  h += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--border)"><span style="font-size:0.72rem;color:#aaa;white-space:nowrap">⚠️ HS :</span>${_perilTableSelect('hyperspatial', coord, _hsTid)}</div>`;
  if (!systems.length) { el.innerHTML = h + `<span style="color:#888;font-size:0.8rem">Quadrant vide</span>`; return; }
  systems.forEach((sys, si) => {
    h += `<div style="margin-top:5px"><span style="font-weight:bold;cursor:pointer;text-decoration:underline dotted" onclick="showDetail('${coord}',${si})">${sys.nom}</span> <span style="color:#888;font-size:0.78rem">${_factionLabel(sys.faction)}</span>`;
    getAstres(sys).forEach(a => {
      const pj = JSON.stringify({ quadrant: coord, systemNom: sys.nom, astroNom: a.label, orbit: a.orbit });
      h += `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:3px;padding-top:3px;border-top:1px solid var(--border)">
        <span style="font-size:0.8rem">${a.label}</span>
        <button onclick='APP.add(${JSON.stringify(pj)})' class="btn-point btn-eta" style="padding:2px 8px;font-size:0.7rem">+</button></div>`;
    });
    h += `</div>`;
  });
  el.innerHTML = h;
}

function refreshAll() {
  refreshCarte();
  updateDesktopPointsList();
  renderBSTripState();
}

function updateDesktopPointsList() {
  const el = document.getElementById('dp-points');
  const btn = document.getElementById('btn-calc-desktop');
  if (!el) return;
  const pts = tripState.points, n = pts.length;
  const lbl = p => p.astroNom ? `${p.astroNom} (${p.quadrant})` : p.quadrant;
  const roleColor = i => i === 0 ? 'var(--danger)' : i === n - 1 ? 'var(--success)' : 'var(--warning)';
  const roleName = i => i === 0 ? 'Dép' : i === n - 1 ? 'Arr' : `Étp ${i}`;
  if (!n) { el.innerHTML = '<span style="color:#888">Aucun point.</span>'; btn.style.display = ''; return; }
  el.innerHTML = pts.map((p, i) => `
    <div class="pt-row">
      <span class="pt-role" style="color:${roleColor(i)}">${roleName(i)}</span>
      <span class="pt-label">${lbl(p)}</span>
      <button class="pt-move" onclick="movePt(${i},-1)" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>▲</button>
      <button class="pt-move" onclick="movePt(${i},1)" ${i === n - 1 ? 'disabled style="opacity:.3"' : ''}>▼</button>
      <button class="pt-del" onclick="removePt(${i})">✕</button>
    </div>`).join('');
  btn.style.display = '';
}

window.APP = {
  add(j) { tripState.points.push(JSON.parse(j)); refreshAll(); }
};
window.removePt = function(idx) { tripState.points.splice(+idx, 1); refreshAll(); };
window.movePt = function(idx, dir) {
  const pts = tripState.points, ni = +idx + dir;
  if (ni < 0 || ni >= pts.length) return;
  [pts[+idx], pts[ni]] = [pts[ni], pts[+idx]];
  refreshAll();
};

function renderBSTripState() {
  const el = document.getElementById('bs-trip-state');
  if (!el) return;
  const pts = tripState.points, n = pts.length;
  if (!n) { el.innerHTML = ''; return; }
  const lbl = p => p.astroNom ? `${p.astroNom} (${p.quadrant})` : p.quadrant;
  const roleColor = i => i === 0 ? 'var(--danger)' : i === n - 1 ? 'var(--success)' : 'var(--warning)';
  const roleName = i => i === 0 ? 'Dép' : i === n - 1 ? 'Arr' : `Étp ${i}`;
  const items = pts.map((p, i) => `
    <span style="display:inline-flex;align-items:center;gap:3px;background:var(--bg3);border-radius:4px;padding:2px 5px">
      <span style="color:${roleColor(i)};font-size:0.7rem;font-weight:bold">${roleName(i)}</span>
      <span style="font-size:0.78rem">${lbl(p)}</span>
      <button onclick="movePt(${i},-1)" style="background:none;border:none;color:#666;cursor:pointer;padding:0 1px;font-size:0.7rem" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
      <button onclick="movePt(${i},1)" style="background:none;border:none;color:#666;cursor:pointer;padding:0 1px;font-size:0.7rem" ${i === n - 1 ? 'disabled' : ''}>&#9660;</button>
      <button onclick="removePt(${i})" style="background:none;border:none;color:#888;cursor:pointer;padding:0 2px;font-size:0.8rem">✕</button>
    </span>`);
  el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:6px 12px;border-bottom:1px solid var(--border)">${items.join('')}</div>`;
}

function _perilTableSelect(type, assignKey, currentTableId) {
  const tables = customTables.filter(t => t.type === type);
  let h = `<select onchange="_perilAssign('${type}','${escH(assignKey)}',this.value)" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:3px;font-size:0.78rem;max-width:200px">`;
  h += `<option value="">Défaut</option>`;
  tables.forEach(t => { h += `<option value="${t.id}"${currentTableId === t.id ? ' selected' : ''}>${escH(t.name)}</option>`; });
  h += `</select>`;
  return h;
}
window._perilAssign = function(type, key, val) {
  if (type === 'interplanetaire') { if (val) perilAssignments.systems[key] = val; else delete perilAssignments.systems[key]; }
  else { if (val) perilAssignments.quadrants[key] = val; else delete perilAssignments.quadrants[key]; }
  saveAssignments();
};

function _perilTableSummary(tableId, type) {
  let cats;
  if (!tableId) { cats = (perilsData[type] || {}).categories || []; }
  else { const t = customTables.find(t => t.id === tableId); cats = t ? t.categories : (perilsData[type] || {}).categories || []; }
  if (!cats.length) return '<div style="color:#888;font-size:0.78rem;font-style:italic">Aucun péril défini.</div>';
  let h = '';
  cats.forEach(cat => {
    h += `<div style="margin-top:6px"><div style="font-size:0.78rem;font-weight:bold;color:var(--gold);margin-bottom:2px">${escH(cat.nom)} <span style="color:#888;font-weight:normal">(${cat.seuilMin}–${cat.seuilMax})</span></div>`;
    (cat.perils || []).forEach(p => {
      h += `<div style="display:flex;align-items:baseline;gap:6px;padding:2px 0 2px 8px;font-size:0.75rem;border-bottom:1px solid var(--border)"><span style="color:#888;min-width:32px">${p.seuilMin}–${p.seuilMax}</span><span style="color:var(--text)">${escH(p.nom)}</span></div>`;
    });
    h += `</div>`;
  });
  return h;
}

function showSystemDetail(coord, si) {
  const sys = (donnees[coord] || [])[si];
  if (!sys) return;
  const jl = parseFloat(sys.soleil?.distanceSaut) || 0;
  function section(title, body, open = true) {
    return `<div class="detail-section${open ? '' : ' collapsed'}">
      <div class="detail-section-hdr" onclick="this.closest('.detail-section').classList.toggle('collapsed')">
        <h3>${title}</h3><span class="d-caret">▼</span>
      </div><div class="detail-section-body">${body}</div></div>`;
  }
  let h = `<div style="margin-bottom:14px">`;
  h += `<h2 style="color:var(--gold);margin:0 0 4px;font-size:1.05rem">${sys.nom || 'Système'}</h2>`;
  if (sys.faction) h += `<div style="color:#aaa;font-size:0.82rem">${_factionLabel(sys.faction, true)}${sys.isFrontiere ? ` · <span style="color:var(--warning)">Frontière</span>` : ''}</div>`;
  const meta = [];
  if (sys.route) meta.push(`🛤 Route : ${sys.route}`);
  if (sys.gouvernement) meta.push(`⚖ ${sys.gouvernement}`);
  if (meta.length) h += `<div style="color:#aaa;font-size:0.78rem;margin-top:3px">${meta.join(' ')}</div>`;
  h += `</div>`;
  if (sys.description) h += section('📋 Description', `<p class="detail-desc">${sys.description}</p>`);
  if (sys.soleil) {
    let sb = `<div class="detail-stats">`;
    const sf = { Classe: sys.soleil.classe, 'Diamètre (K)': sys.soleil.diametre, 'Dist. saut (US)': sys.soleil.distanceSaut };
    for (const [k, v] of Object.entries(sf)) if (v) sb += `<div class="detail-stat"><strong>${k} :</strong> ${v}</div>`;
    sb += `</div>`;
    if (sys.soleil.description) sb += `<p class="detail-desc">${sys.soleil.description}</p>`;
    if (sys.soleil.activiteSolaire?.length) { sb += `<div style="margin-top:6px;font-size:0.8rem;font-weight:bold;color:#bbb">Activité solaire</div><ul class="detail-list">`; sys.soleil.activiteSolaire.forEach(a => sb += `<li>Dist. ${a.distance} : ${a.consequence}</li>`); sb += `</ul>`; }
    h += section(`☀ ${sys.soleil.nom || 'Étoile'}`, sb);
  }
  (sys.corpsCelestes || []).forEach(p => {
    const orb = parseFloat(p.orbite) || 0;
    const ds = jl > 0 ? (jl - orb).toFixed(0) + ' US' : '—';
    let pb = '';
    const badges = [];
    if (p.atmosphere) badges.push(`<span class="detail-badge badge-atmos">${p.atmosphere}</span>`);
    if (p.gravite) badges.push(`<span class="detail-badge badge-grav">G ${p.gravite}</span>`);
    if (p.securite) badges.push(`<span class="detail-badge badge-sec">Séc ${p.securite}</span>`);
    if (p.commerce) badges.push(`<span class="detail-badge badge-com">Com ${p.commerce}</span>`);
    if (badges.length) pb += `<div style="margin-bottom:8px">${badges.join('')}</div>`;
    pb += `<div class="detail-stats">`;
    const pf = { 'Orbite (US)': p.orbite, 'Dist. saut': ds, Classe: p.classe, 'Diamètre (K)': p.diametre, Technologie: p.techno, Population: p.population };
    for (const [k, v] of Object.entries(pf)) if (v !== undefined && v !== null && v !== '') pb += `<div class="detail-stat"><strong>${k} :</strong> ${v}</div>`;
    pb += `</div>`;
    if (p.description) pb += `<p class="detail-desc">${p.description}</p>`;
    if (p.astroports?.length) pb += `<div style="margin-top:7px;font-size:0.8rem">🚀 <strong>Astroports :</strong> ${p.astroports.map(a => `${a.nom || ''}${a.type ? ` (${a.type})` : ''}`).join(', ')}</div>`;
    if (p.lieux?.length) { pb += `<div style="margin-top:7px"><div style="font-size:0.8rem;font-weight:bold;color:#bbb;margin-bottom:3px">📍 Lieux</div><ul class="detail-list">`; p.lieux.forEach(l => pb += `<li><strong>${l.nom || ''}:</strong> ${l.description || ''}</li>`); pb += `</ul></div>`; }
    const mc = [p.marchandiseA && `A: ${p.marchandiseA}`, p.marchandiseB && `B: ${p.marchandiseB}`, p.marchandiseC && `C: ${p.marchandiseC}`, p.illegal && `⛔ ${p.illegal}`].filter(Boolean);
    if (mc.length) pb += `<div class="detail-merch">🛒 Marchandises : ${mc.join(' · ')}</div>`;
    h += section(`🪐 ${p.nom || 'Astre'}`, pb, false);
  });
  const _ipKey = `${coord}/${sys.nom}`;
  const _ipTid = perilAssignments.systems[_ipKey] || '';
  let _ipBody = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:0.78rem;color:#aaa">Table :</span>${_perilTableSelect('interplanetaire', _ipKey, _ipTid)}</div>`;
  _ipBody += _perilTableSummary(_ipTid, 'interplanetaire');
  h += section('⚠️ Périls Interplanétaires', _ipBody, false);
  if (isMJ()) {
    h += `<div style="margin-top:12px;text-align:center"><button style="padding:8px 20px;background:var(--primary);color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.85rem" onclick="closeModal('modal-detail');openEditSystem('${coord}',${si})">✏️ Éditer ce système</button></div>`;
  } else {
    h += `<div style="margin-top:12px;text-align:center;font-size:0.75rem;color:#888">🔒 Lecture seule — seul le MJ peut modifier les systèmes</div>`;
  }
  document.getElementById('modal-detail-title').textContent = `${coord} — ${sys.nom}`;
  document.getElementById('detail-content').innerHTML = h;
  openModal('modal-detail');
}
window.showDetail = showSystemDetail;
window.openEditSystem = openEditSystem;
window.renderEditSystem = renderEditSystem;

// ── CALCUL ────────────────────────────────────────────────────────────────
function roll2D6() { return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1; }

function getFlatList(type, tblOverride) {
  const pd = tblOverride || perilsData[type];
  if (!pd?.categories?.length) return [];
  const fl = [];
  const sc = [...pd.categories].sort((a, b) => a.seuilMin - b.seuilMin);
  for (const cat of sc) { const sp = [...(cat.perils || [])].sort((a, b) => a.seuilMin - b.seuilMin); for (const p of sp) fl.push(p); }
  return fl;
}

function getPeril(type, surplusSuccesses = 0, tblOverride) {
  const flatList = getFlatList(type, tblOverride);
  if (!flatList.length) return { peril: { nom: 'Calme plat', data: { description: 'Aucun événement.' } }, baseIndex: 0 };
  const pd = tblOverride || perilsData[type];
  const catRoll = roll2D6();
  const cat = pd.categories.find(c => catRoll >= c.seuilMin && catRoll <= c.seuilMax);
  if (!cat?.perils?.length) return { peril: flatList[0], baseIndex: 0 };
  const modRoll = roll2D6();
  const sp = [...cat.perils].sort((a, b) => a.seuilMin - b.seuilMin);
  const rolled = sp.find(p => modRoll >= p.seuilMin && modRoll <= p.seuilMax) || sp[sp.length - 1];
  let baseIndex = flatList.findIndex(p => p === rolled);
  if (baseIndex === -1) baseIndex = flatList.findIndex(p => p.nom === rolled.nom);
  if (baseIndex === -1) baseIndex = flatList.length - 1;
  const finalIndex = Math.max(0, Math.min(baseIndex - surplusSuccesses, flatList.length - 1));
  return { peril: flatList[finalIndex], baseIndex };
}

function resolvePeril(type, baseIndex, skill, tblOverride) {
  const flatList = getFlatList(type, tblOverride);
  if (!flatList.length) return { nom: 'Calme plat', data: { description: 'Aucun événement.' } };
  const finalIndex = Math.max(0, Math.min(baseIndex - skill, flatList.length - 1));
  return flatList[finalIndex];
}

function genDayData(type, days, skill, tblOverride) {
  return Array.from({ length: days }, (_, i) => {
    const r = getPeril(type, skill, tblOverride);
    return { day: i + 1, peril: r.peril, baseIndex: r.baseIndex, surf: 0, conso: 0 };
  });
}

function getTableForLeg(type, quadrant, systemNom) {
  if (type === 'interplanetaire' && systemNom) {
    const tid = perilAssignments.systems[`${quadrant}/${systemNom}`];
    if (tid) { const t = customTables.find(t => t.id === tid); if (t) return t; }
  }
  if (type === 'hyperspatial' && quadrant) {
    const tid = perilAssignments.quadrants[quadrant];
    if (tid) { const t = customTables.find(t => t.id === tid); if (t) return t; }
  }
  return null;
}

function findPerilByNom(nom) {
  for (const type of ['interplanetaire', 'hyperspatial']) {
    for (const cat of (perilsData[type]?.categories || [])) {
      const p = (cat.perils || []).find(p => p.nom === nom);
      if (p) return p;
    }
  }
  return { nom, data: { description: '' } };
}

function calcHSDist(a, b) {
  const ca = coordXY(a), cb = coordXY(b);
  return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y)) * 1000;
}

function calculateTrip() {
  if (tripState.points.length < 2) { alert('Ajoutez au moins 2 points.'); return null; }
  const p = getParams();
  const points = tripState.points;
  const legs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const cur = points[i], nxt = points[i + 1];
    const curSys = (donnees[cur.quadrant] || []).find(s => s.nom === cur.systemNom);
    const nxtSys = (donnees[nxt.quadrant] || []).find(s => s.nom === nxt.systemNom);
    if (cur.astroNom && cur.astroNom !== 'Limite de Saut' && curSys) {
      const jl = parseFloat(curSys.soleil?.distanceSaut) || 0;
      const dist = Math.abs(jl - cur.orbit);
      const days = Math.max(1, Math.ceil(dist / p.ipSpd));
      const tbl = getTableForLeg('interplanetaire', cur.quadrant, cur.systemNom);
      legs.push({ name: `Départ de ${cur.systemNom}`, type: 'interplanetaire', from: cur.astroNom, to: `Limite — ${cur.systemNom}`, distance: dist, unit: 'US', days, spd: p.ipSpd, skill: 0, _tableId: tbl?.id || null, dailyData: genDayData('interplanetaire', days, 0, tbl) });
    }
    if (cur.quadrant !== nxt.quadrant) {
      const dist = calcHSDist(cur.quadrant, nxt.quadrant);
      const days = Math.max(1, Math.ceil(dist / p.hsSpd));
      const tbl = getTableForLeg('hyperspatial', cur.quadrant, null);
      legs.push({ name: `Saut ${cur.quadrant} → ${nxt.quadrant}`, type: 'hyperspatial', from: `Q.${cur.quadrant}`, to: `Q.${nxt.quadrant}`, distance: dist, unit: 'PC', days, spd: p.hsSpd, skill: 0, _tableId: tbl?.id || null, dailyData: genDayData('hyperspatial', days, 0, tbl) });
    }
    if (nxt.astroNom && nxt.astroNom !== 'Limite de Saut' && nxtSys) {
      const jl = parseFloat(nxtSys.soleil?.distanceSaut) || 0;
      const dist = Math.abs(jl - nxt.orbit);
      const days = Math.max(1, Math.ceil(dist / p.ipSpd));
      const tbl = getTableForLeg('interplanetaire', nxt.quadrant, nxt.systemNom);
      legs.push({ name: `Arrivée à ${nxt.systemNom}`, type: 'interplanetaire', from: `Limite — ${nxt.systemNom}`, to: nxt.astroNom, distance: dist, unit: 'US', days, spd: p.ipSpd, skill: 0, _tableId: tbl?.id || null, dailyData: genDayData('interplanetaire', days, 0, tbl) });
    }
  }
  return { legs, autonomy: p.hsAuto, points };
}

// ── RENDU RÉSULTAT ────────────────────────────────────────────────────────
function summaryHTML(trip) {
  let days = 0, pc = 0, us = 0, conso = 0;
  trip.legs.forEach(l => { days += l.days; l.unit === 'PC' ? pc += l.distance : us += l.distance; });
  trip.legs.filter(l => l.type === 'hyperspatial').forEach(l => l.dailyData.forEach(d => conso += l.spd - d.conso));
  const over = conso > trip.autonomy;
  return `<strong>${days} jour${days > 1 ? 's' : ''}</strong> · ${Math.round(pc).toLocaleString()} PC · ${us.toFixed(0)} US<br>Conso: <strong>${Math.round(conso).toLocaleString()} / ${trip.autonomy.toLocaleString()} PC</strong>${over ? ' <span style="color:var(--danger)">⚠ Autonomie dépassée!</span>' : ''}`;
}

function legsHTML(legs, pfx) {
  return legs.map((leg, li) => {
    const isHS = leg.type === 'hyperspatial';
    const surfMult = isHS ? 100 : 1;
    let rows = ''; let cum = 0;
    leg.dailyData.forEach((d, di) => {
      cum += leg.spd + (d.surf || 0) * surfMult;
      const done = cum >= leg.distance;
      rows += `<tr>
        <td>${d.day}</td>
        <td><span class="peril-link" data-li="${li}" data-di="${di}" data-pfx="${pfx}">${d.peril.nom}</span></td>
        <td><input type="number" id="${pfx}-s-${li}-${di}" value="${d.surf}" step="1" style="width:52px"></td>
        ${isHS ? `<td><input type="number" id="${pfx}-c-${li}-${di}" value="${d.conso}" step="100"></td><td>${(leg.spd - d.conso).toLocaleString()}</td>` : ''}
        <td style="font-size:0.72rem">${Math.min(cum, leg.distance).toFixed(0)}/${leg.distance.toFixed(0)}</td>
        <td>${done ? '<span class="status-done">Arr.</span>' : '<span class="status-ok">→</span>'}</td>
      </tr>`;
    });
    return `<div class="result-leg" id="${pfx}-leg-${li}">
      <div class="result-leg-header" onclick="toggleLeg(this)">
        <div><h3>${leg.name}</h3><div class="leg-info">${leg.from} → ${leg.to} · ${leg.days}j · ${leg.distance.toFixed(0)} ${leg.unit}</div></div>
        <div style="display:flex;align-items:center;gap:8px" onclick="event.stopPropagation()">
          <label style="font-size:0.72rem;color:#aaa;display:flex;align-items:center;gap:4px;white-space:nowrap">
            Succ. exc. (${isHS ? 'Saut' : 'Cap'})
            <input type="number" id="${pfx}-sk-${li}" value="${leg.skill || 0}" min="0"
              style="width:38px;padding:2px 4px;background:var(--bg);border:1px solid var(--border);color:var(--text-light);border-radius:3px;font-size:0.8rem">
          </label>
          <span class="caret">▼</span>
        </div>
      </div>
      <div class="result-leg-body">
        <table class="trip-table">
          <thead><tr><th>J</th><th>Péril</th><th>Surf${isHS ? ' (×100&nbsp;PC)' : ' (US)'}</th>${isHS ? '<th>◁Conso</th><th>PC/j</th>' : ''}<th>Dist</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

function attachPerilEvents(container, legs) {
  container.querySelectorAll('.peril-link').forEach(lk => {
    lk.addEventListener('click', () => showPeril(legs[+lk.dataset.li].dailyData[+lk.dataset.di].peril));
  });
}

function showPeril(peril) {
  const d = peril.data || {};
  let h = `<h2>${peril.nom}</h2>`;
  if (d.description) h += `<p class="desc">${d.description}</p>`;
  const stats = [];
  if (d.mobile) stats.push('📡 Mobile');
  if (d.senseurs) stats.push(`Senseurs: ${d.senseurs}`);
  if (d.sciencesStellaires) stats.push(`Sc.Stellaires: ${d.sciencesStellaires}`);
  if (stats.length) h += `<div class="pstats">${stats.join(' · ')}</div>`;
  if (d.definition) h += `<div class="psection"><div class="psection-title">Définition</div><p>${d.definition}</p></div>`;
  if (d.protocole) h += `<div class="psection"><div class="psection-title">Protocole</div><p>${d.protocole}</p></div>`;
  if (d.resultat) h += `<div class="psection"><div class="psection-title">Résultat</div><p>${d.resultat}</p></div>`;
  document.getElementById('peril-content').innerHTML = h;
  openModal('modal-peril');
}

window.toggleLeg = function(hdr) { hdr.closest('.result-leg').classList.toggle('collapsed'); };

function readInputs(legs, pfx) {
  legs.forEach((leg, li) => {
    const ski = document.getElementById(`${pfx}-sk-${li}`);
    if (ski) {
      const newSkill = parseInt(ski.value) || 0;
      if (newSkill !== (leg.skill || 0)) {
        leg.skill = newSkill;
        const tbl = leg._tableId ? customTables.find(t => t.id === leg._tableId) : null;
        leg.dailyData.forEach(d => { d.peril = resolvePeril(leg.type, d.baseIndex, newSkill, tbl); });
      }
    }
    leg.dailyData.forEach((d, di) => {
      const si = document.getElementById(`${pfx}-s-${li}-${di}`);
      if (si) d.surf = parseFloat(si.value) || 0;
      if (leg.type === 'hyperspatial') { const ci = document.getElementById(`${pfx}-c-${li}-${di}`); if (ci) d.conso = parseFloat(ci.value) || 0; }
    });
  });
}

function renderTrip(trip, isMob) {
  if (isMob) {
    const pts = tripState.points, n = pts.length;
    const lbl = p => p.astroNom ? p.astroNom : p.quadrant;
    const badges = [];
    if (n > 0) badges.push(`<span class="point-badge dep">Dép: ${lbl(pts[0])}</span>`);
    pts.slice(1, n - 1).forEach(e => badges.push(`<span class="point-badge eta">Étp: ${lbl(e)}</span>`));
    if (n > 1) badges.push(`<span class="point-badge arr">Arr: ${lbl(pts[n - 1])}</span>`);
    document.getElementById('points-summary').innerHTML = badges.join('');
    document.getElementById('mob-summary').innerHTML = summaryHTML(trip);
    const ml = document.getElementById('mob-legs');
    ml.innerHTML = legsHTML(trip.legs, 'mob');
    attachPerilEvents(ml, trip.legs);
    document.getElementById('result-panel').classList.add('open');
  }
  const ds = document.getElementById('dp-result-section');
  if (ds) {
    ds.style.display = '';
    document.getElementById('dp-summary').innerHTML = summaryHTML(trip);
    const dl = document.getElementById('dp-legs');
    dl.innerHTML = legsHTML(trip.legs, 'dsk');
    attachPerilEvents(dl, trip.legs);
  }
}

function doCalc(isMob) {
  const t = calculateTrip();
  if (!t) return;
  currentTripLegs = t;
  renderTrip(t, isMob);
}

function doUpdate(pfx, isMob) {
  if (!currentTripLegs) return;
  readInputs(currentTripLegs.legs, pfx);
  renderTrip(currentTripLegs, isMob);
}

// ── HISTORIQUE ────────────────────────────────────────────────────────────
function getHist() { try { return JSON.parse(localStorage.getItem('itineraireHistorique') || '[]'); } catch { return []; } }
function setHist(h) { localStorage.setItem('itineraireHistorique', JSON.stringify(h)); }

function saveCurrentTrip() {
  if (!currentTripLegs) { alert("Calculez un itinéraire d'abord."); return; }
  try {
    const name = prompt('Nom:', `${tripState.points[0]?.systemNom || '?'} → ${tripState.points[tripState.points.length - 1]?.systemNom || '?'}`);
    if (!name) return;
    const h = getHist();
    const legsSnapshot = currentTripLegs.legs.map(leg => ({
      name: leg.name, type: leg.type, from: leg.from, to: leg.to,
      distance: leg.distance, unit: leg.unit, days: leg.days, spd: leg.spd, skill: leg.skill || 0, _tableId: leg._tableId || null,
      dailyData: leg.dailyData.map(d => ({ day: d.day, perilNom: d.peril?.nom || 'Inconnu', baseIndex: d.baseIndex != null ? d.baseIndex : 0, surf: d.surf || 0, conso: d.conso || 0 }))
    }));
    h.unshift({ id: Date.now(), name, date: new Date().toLocaleDateString('fr-FR'), points: JSON.parse(JSON.stringify(tripState.points)), autonomy: currentTripLegs.autonomy, legsSnapshot });
    if (h.length > 30) h.pop();
    setHist(h);
    alert('Sauvegardé !');
  } catch (e) { alert('Erreur sauvegarde: ' + e.message); console.error(e); }
}

function renderHist() {
  const h = getHist();
  const el = document.getElementById('hist-list');
  const empty = document.getElementById('hist-empty');
  if (!h.length) { el.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  el.innerHTML = h.map((item, idx) => `
    <div class="historique-item">
      <div class="hinfo"><strong>${item.name}</strong><small>${item.date}</small></div>
      <div class="hactions">
        <button class="btn-hist-load" onclick="HIST.load(${idx})">Charger</button>
        <button class="btn-hist-del" onclick="HIST.del(${idx})">✕</button>
      </div>
    </div>`).join('');
}

window.HIST = {
  load(idx) {
    const h = getHist(); if (!h[idx]) return;
    const entry = h[idx];
    tripState.points = JSON.parse(JSON.stringify(entry.points || []));
    refreshAll();
    closeModal('modal-historique');
    if (entry.legsSnapshot) {
      const tblFor = tid => tid ? customTables.find(t => t.id === tid) : null;
      const legs = entry.legsSnapshot.map(leg => ({
        ...leg,
        dailyData: leg.dailyData.map(d => ({
          day: d.day, baseIndex: d.baseIndex != null ? d.baseIndex : 0,
          peril: d.baseIndex != null ? resolvePeril(leg.type, d.baseIndex, leg.skill || 0, tblFor(leg._tableId)) : findPerilByNom(d.perilNom),
          surf: d.surf || 0, conso: d.conso || 0
        }))
      }));
      currentTripLegs = { legs, autonomy: entry.autonomy || getParams().hsAuto, points: tripState.points };
      renderTrip(currentTripLegs, window.innerWidth < 768);
    }
  },
  del(idx) { const h = getHist(); h.splice(idx, 1); setHist(h); renderHist(); }
};

// ── ADMIN ─────────────────────────────────────────────────────────────────
function saveCustomTables() { localStorage.setItem('customPerilTables', JSON.stringify(customTables)); }
function saveAssignments() { localStorage.setItem('perilAssignments', JSON.stringify(perilAssignments)); }
function escH(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function renderAdminTabs() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    };
  });
  renderPerilsTab();
  renderFactionsTab();
  renderSystemsTab();
  renderQuadrantsTab();
}

function saveFactions() { localStorage.setItem('factions', JSON.stringify(factions)); }
function getFactionsSorted() { return [...factions].sort((a, b) => a.name.localeCompare(b.name)); }

function renderFactionsTab() {
  const el = document.getElementById('tab-factions');
  const sorted = getFactionsSorted();
  let h = '<div style="margin-bottom:8px;font-size:0.78rem;color:#888">Factions (nom, diminutif, icône)</div>';
  if (!sorted.length) h += '<div style="text-align:center;color:#888;padding:16px;font-style:italic">Aucune faction définie.</div>';
  sorted.forEach(f => {
    h += `<div class="faction-item">`;
    if (f.icon) h += `<img src="${f.icon}" alt="">`;
    else h += `<div style="width:32px;height:32px;border-radius:4px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:#666">${escH(f.short || '?')}</div>`;
    h += `<div class="fi-info"><div class="fi-name">${escH(f.name)}${f.short ? ' <span style="color:#888;font-weight:normal">(' + escH(f.short) + ')</span>' : ''}</div>`;
    if (f.description) h += `<div class="fi-desc">${escH(f.description)}</div>`;
    h += `</div><div style="display:flex;gap:4px"><button style="background:none;border:1px solid var(--border);color:var(--primary);border-radius:3px;padding:3px 8px;cursor:pointer;font-size:0.72rem" onclick="ADMIN.editFaction('${f.id}')">✏️</button><button class="se-btn-del" onclick="ADMIN.delFaction('${f.id}')">✕</button></div></div>`;
  });
  h += `<div style="margin-top:10px;text-align:center"><button style="padding:6px 16px;background:var(--primary);color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem" onclick="ADMIN.newFaction()">+ Nouvelle faction</button></div>`;
  el.innerHTML = h;
}

function openFactionModal(faction) {
  document.getElementById('faction-modal-title').textContent = faction ? 'Modifier Faction' : 'Nouvelle Faction';
  document.getElementById('faction-name').value = faction ? faction.name : '';
  document.getElementById('faction-short').value = faction ? faction.short || '' : '';
  document.getElementById('faction-desc').value = faction ? faction.description || '' : '';
  document.getElementById('faction-icon-data').value = faction ? faction.icon || '' : '';
  document.getElementById('faction-edit-id').value = faction ? faction.id : '';
  const prev = document.getElementById('faction-icon-preview');
  if (faction?.icon) { prev.src = faction.icon; prev.style.display = 'block'; } else { prev.style.display = 'none'; }
  document.getElementById('faction-icon-input').value = '';
  openModal('modal-faction');
}

function initFactionModal() {
  document.getElementById('faction-icon-input').addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    if (file.size > 200 * 1024) { alert('Image trop volumineuse (max 200 Ko)'); this.value = ''; return; }
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('faction-icon-data').value = e.target.result;
      const prev = document.getElementById('faction-icon-preview');
      prev.src = e.target.result; prev.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('btn-save-faction').addEventListener('click', () => {
    const name = document.getElementById('faction-name').value.trim();
    if (!name) { alert('Le nom est requis.'); return; }
    const short = document.getElementById('faction-short').value.trim();
    const desc = document.getElementById('faction-desc').value.trim();
    const icon = document.getElementById('faction-icon-data').value;
    const editId = document.getElementById('faction-edit-id').value;
    if (editId) {
      const f = factions.find(x => x.id === editId);
      if (f) { f.name = name; f.short = short; f.description = desc; if (icon) f.icon = icon; }
    } else {
      factions.push({ id: 'fac-' + Date.now(), name, short, description: desc, icon });
    }
    saveFactions(); closeModal('modal-faction'); renderFactionsTab();
    if (_editCoord !== null) renderEditSystem();
  });
}

function renderPerilsTab() {
  const el = document.getElementById('tab-perils');
  let h = '<div class="btn-add-table"><button onclick="ADMIN.dupTable(\'interplanetaire\')">+ Dupliquer IP</button><button onclick="ADMIN.dupTable(\'hyperspatial\')">+ Dupliquer HS</button></div>';
  h += '<div class="admin-table-item"><span class="atname"><strong>Interplanétaire (défaut)</strong></span><span class="attype ip">IP</span><div class="at-actions"><button onclick="ADMIN.editTable(\'default-ip\')">Éditer</button></div></div>';
  h += '<div class="admin-table-item"><span class="atname"><strong>Hyperspatial (défaut)</strong></span><span class="attype hs">HS</span><div class="at-actions"><button onclick="ADMIN.editTable(\'default-hs\')">Éditer</button></div></div>';
  customTables.forEach(t => {
    const isIP = t.type === 'interplanetaire';
    h += `<div class="admin-table-item"><span class="atname">${escH(t.name)}</span><span class="attype ${isIP ? 'ip' : 'hs'}">${isIP ? 'IP' : 'HS'}</span><div class="at-actions"><button onclick="ADMIN.editTable('${t.id}')">Éditer</button><button onclick="ADMIN.dupCustom('${t.id}')">Dup.</button><button class="btn-del" onclick="ADMIN.delTable('${t.id}')">✕</button></div></div>`;
  });
  h += '<div style="margin-top:12px;display:flex;gap:8px;justify-content:center"><button onclick="ADMIN.resetDefaults()" style="padding:5px 12px;background:var(--danger);color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem">Réinit. défaut</button></div>';
  el.innerHTML = h;
}

function renderEditTable(tableId) {
  const el = document.getElementById('tab-perils');
  let tableData, tableName, isDefault = false;
  if (tableId === 'default-ip') { tableData = perilsData.interplanetaire; tableName = 'Interplanétaire (défaut)'; isDefault = true; }
  else if (tableId === 'default-hs') { tableData = perilsData.hyperspatial; tableName = 'Hyperspatial (défaut)'; isDefault = true; }
  else { const t = customTables.find(t => t.id === tableId); if (!t) { renderPerilsTab(); return; } tableData = t; tableName = t.name; }
  const cats = tableData.categories || [];
  let h = '<div class="peril-edit-header"><button onclick="ADMIN.backToList()">← Retour</button>';
  if (!isDefault) h += `<input type="text" value="${escH(tableName)}" onchange="ADMIN.renameTable('${tableId}',this.value)">`;
  else h += `<span style="flex:1;color:var(--gold);font-weight:bold;font-size:0.95rem;padding-left:8px">${tableName}</span>`;
  h += '</div>';
  cats.forEach((cat, ci) => {
    h += `<div class="peril-edit-cat"><div class="peril-edit-cat-hdr" onclick="this.closest('.peril-edit-cat').classList.toggle('open')"><span>${escH(cat.nom)} (${cat.seuilMin}–${cat.seuilMax})</span><span>▼</span></div><div class="peril-edit-cat-body">`;
    (cat.perils || []).forEach((p, pi) => {
      const d = p.data || {};
      h += `<div class="peril-edit-item"><div class="peril-edit-item-hdr" onclick="this.closest('.peril-edit-item').classList.toggle('open')"><span class="pe-nom">${escH(p.nom)}</span><span class="pe-range">${p.seuilMin}–${p.seuilMax}</span></div><div class="peril-edit-fields">`;
      h += `<div class="pe-field"><label>Nom</label><input value="${escH(p.nom)}" onchange="ADMIN.updP('${tableId}',${ci},${pi},'nom',this.value);this.closest('.peril-edit-item').querySelector('.pe-nom').textContent=this.value"></div>`;
      h += `<div class="pe-field"><label>Description</label><textarea onchange="ADMIN.updP('${tableId}',${ci},${pi},'data.description',this.value)">${escH(d.description || '')}</textarea></div>`;
      h += `<div class="pe-field-row"><div class="pe-field"><label>Senseurs</label><input type="number" value="${d.senseurs || 0}" onchange="ADMIN.updP('${tableId}',${ci},${pi},'data.senseurs',+this.value)"></div><div class="pe-field"><label>Sc. Stellaires</label><input type="number" value="${d.sciencesStellaires || 0}" onchange="ADMIN.updP('${tableId}',${ci},${pi},'data.sciencesStellaires',+this.value)"></div><div class="pe-field-check"><label><input type="checkbox" ${d.mobile ? 'checked' : ''} onchange="ADMIN.updP('${tableId}',${ci},${pi},'data.mobile',this.checked)"> Mobile</label></div></div>`;
      h += `<div class="pe-field"><label>Définition</label><textarea onchange="ADMIN.updP('${tableId}',${ci},${pi},'data.definition',this.value)">${escH(d.definition || '')}</textarea></div>`;
      h += `<div class="pe-field"><label>Protocole</label><textarea onchange="ADMIN.updP('${tableId}',${ci},${pi},'data.protocole',this.value)">${escH(d.protocole || '')}</textarea></div>`;
      h += `<div class="pe-field"><label>Résultat</label><textarea onchange="ADMIN.updP('${tableId}',${ci},${pi},'data.resultat',this.value)">${escH(d.resultat || '')}</textarea></div>`;
      h += `<div class="pe-field-row"><div class="pe-field"><label>Seuil min</label><input type="number" value="${p.seuilMin}" onchange="ADMIN.updP('${tableId}',${ci},${pi},'seuilMin',+this.value)"></div><div class="pe-field"><label>Seuil max</label><input type="number" value="${p.seuilMax}" onchange="ADMIN.updP('${tableId}',${ci},${pi},'seuilMax',+this.value)"></div><div style="display:flex;align-items:flex-end"><button onclick="ADMIN.delPeril('${tableId}',${ci},${pi})" style="padding:4px 8px;background:var(--danger);color:white;border:none;border-radius:3px;cursor:pointer;font-size:0.72rem">Suppr.</button></div></div>`;
      h += `</div></div>`;
    });
    h += `<button onclick="ADMIN.addPeril('${tableId}',${ci})" style="display:block;width:100%;padding:5px;border:1px dashed var(--border);background:none;color:var(--primary);border-radius:4px;cursor:pointer;font-size:0.78rem;margin-top:4px">+ Ajouter un péril</button>`;
    h += `</div></div>`;
  });
  if (!isDefault) h += `<button onclick="ADMIN.addCat('${tableId}')" style="display:block;width:100%;padding:8px;border:1px dashed var(--border);background:none;color:var(--gold);border-radius:4px;cursor:pointer;font-size:0.82rem;margin-top:8px">+ Ajouter une catégorie</button>`;
  el.innerHTML = h;
}

function renderSystemsTab() {
  const el = document.getElementById('tab-systemes');
  const tables = customTables.filter(t => t.type === 'interplanetaire');
  let h = '<div style="margin-bottom:8px;font-size:0.78rem;color:#888">Table de périls IP par système</div>';
  const items = [];
  for (const coord in donnees) (donnees[coord] || []).forEach(sys => items.push({ coord, name: sys.nom || '?' }));
  items.sort((a, b) => a.name.localeCompare(b.name));
  if (!items.length) { h += '<div style="text-align:center;color:#888;padding:20px">Aucun système.</div>'; }
  else items.forEach(s => {
    const key = `${s.coord}/${s.name}`;
    const cur = perilAssignments.systems[key] || '';
    h += `<div class="assign-row"><span class="ar-coord">${s.coord}</span><span class="ar-label">${escH(s.name)}</span><button style="background:none;border:1px solid var(--border);color:var(--primary);border-radius:3px;padding:2px 8px;cursor:pointer;font-size:0.72rem" onclick="closeModal('modal-admin');openEditSystem('${s.coord}',${donnees[s.coord].findIndex(x => x.nom === s.name)})">✏️</button><select onchange="ADMIN.assignSys('${escH(key)}',this.value)"><option value="">Défaut</option>${tables.map(t => `<option value="${t.id}"${cur === t.id ? ' selected' : ''}>${escH(t.name)}</option>`).join('')}</select></div>`;
  });
  h += `<div style="margin-top:10px;text-align:center">${isMJ() ? `<button style="padding:6px 16px;background:var(--primary);color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem" onclick="ADMIN.newSystemPrompt()">+ Nouveau système</button>` : `<span style="font-size:0.75rem;color:#888">🔒 Seul le MJ peut ajouter des systèmes</span>`}</div>`;
  el.innerHTML = h;
}

function renderQuadrantsTab() {
  const el = document.getElementById('tab-quadrants');
  const tables = customTables.filter(t => t.type === 'hyperspatial');
  let h = '<div style="margin-bottom:8px;font-size:0.78rem;color:#888">Table de périls HS par quadrant</div>';
  const coords = Object.keys(donnees).filter(k => donnees[k]?.length > 0).sort();
  if (!coords.length) { h += '<div style="text-align:center;color:#888;padding:20px">Aucun quadrant peuplé.</div>'; }
  else coords.forEach(coord => {
    const cur = perilAssignments.quadrants[coord] || '';
    const names = donnees[coord].map(s => s.nom || '?').join(', ');
    h += `<div class="assign-row"><span class="ar-coord" style="width:60px;font-weight:bold;color:var(--gold)">${coord}</span><span class="ar-label" style="font-size:0.78rem;color:#aaa">${escH(names)}</span><select onchange="ADMIN.assignQuad('${coord}',this.value)"><option value="">Défaut</option>${tables.map(t => `<option value="${t.id}"${cur === t.id ? ' selected' : ''}>${escH(t.name)}</option>`).join('')}</select></div>`;
  });
  el.innerHTML = h;
}

function _getAdminCats(tableId) {
  if (tableId === 'default-ip') return perilsData.interplanetaire.categories;
  if (tableId === 'default-hs') return perilsData.hyperspatial.categories;
  const t = customTables.find(t => t.id === tableId); return t ? t.categories : null;
}
function _saveAdminTable(tableId) {
  if (tableId === 'default-ip' || tableId === 'default-hs') localStorage.setItem('perilsDataAdmin', JSON.stringify(perilsData));
  else saveCustomTables();
}

window.ADMIN = {
  dupTable(type) {
    const src = perilsData[type]; if (!src) return;
    const name = prompt('Nom:', `${type === 'interplanetaire' ? 'IP' : 'HS'} — Copie`); if (!name) return;
    customTables.push({ id: 'ct_' + Date.now(), name, type, categories: JSON.parse(JSON.stringify(src.categories)) });
    saveCustomTables(); renderPerilsTab();
  },
  dupCustom(id) {
    const src = customTables.find(t => t.id === id); if (!src) return;
    const name = prompt('Nom:', `${src.name} — Copie`); if (!name) return;
    customTables.push({ id: 'ct_' + Date.now(), name, type: src.type, categories: JSON.parse(JSON.stringify(src.categories)) });
    saveCustomTables(); renderPerilsTab();
  },
  delTable(id) {
    if (!confirm('Supprimer cette table?')) return;
    customTables = customTables.filter(t => t.id !== id);
    for (const k in perilAssignments.systems) if (perilAssignments.systems[k] === id) delete perilAssignments.systems[k];
    for (const k in perilAssignments.quadrants) if (perilAssignments.quadrants[k] === id) delete perilAssignments.quadrants[k];
    saveCustomTables(); saveAssignments(); renderPerilsTab(); renderSystemsTab(); renderQuadrantsTab();
  },
  editTable(id) { renderEditTable(id); },
  backToList() { renderPerilsTab(); },
  renameTable(id, v) { const t = customTables.find(t => t.id === id); if (t) { t.name = v; saveCustomTables(); } },
  updP(tableId, ci, pi, path, value) {
    const cats = _getAdminCats(tableId); if (!cats) return;
    const peril = cats[ci]?.perils?.[pi]; if (!peril) return;
    const parts = path.split('.');
    if (parts.length === 1) peril[parts[0]] = value;
    else if (parts.length === 2) { if (!peril[parts[0]]) peril[parts[0]] = {}; peril[parts[0]][parts[1]] = value; }
    _saveAdminTable(tableId);
  },
  addPeril(tableId, ci) {
    const cats = _getAdminCats(tableId); if (!cats || !cats[ci]) return;
    const perils = cats[ci].perils || [];
    const mx = perils.length ? Math.max(...perils.map(p => p.seuilMax)) : 1;
    perils.push({ seuilMin: mx + 1, seuilMax: mx + 1, nom: 'Nouveau péril', data: { description: '', mobile: false, senseurs: 0, sciencesStellaires: 0, definition: '', protocole: '', resultat: '' } });
    cats[ci].perils = perils; _saveAdminTable(tableId); renderEditTable(tableId);
  },
  delPeril(tableId, ci, pi) {
    if (!confirm('Supprimer ce péril?')) return;
    const cats = _getAdminCats(tableId); if (!cats?.[ci]?.perils) return;
    cats[ci].perils.splice(pi, 1); _saveAdminTable(tableId); renderEditTable(tableId);
  },
  addCat(tableId) {
    const t = customTables.find(t => t.id === tableId); if (!t) return;
    const mx = t.categories.length ? Math.max(...t.categories.map(c => c.seuilMax)) : 1;
    t.categories.push({ seuilMin: mx + 1, seuilMax: mx + 1, nom: 'Nouvelle catégorie', perils: [] });
    saveCustomTables(); renderEditTable(tableId);
  },
  assignSys(key, val) { if (val) perilAssignments.systems[key] = val; else delete perilAssignments.systems[key]; saveAssignments(); },
  assignQuad(coord, val) { if (val) perilAssignments.quadrants[coord] = val; else delete perilAssignments.quadrants[coord]; saveAssignments(); },
  resetDefaults() { if (confirm('Réinitialiser les tables par défaut?')) { localStorage.removeItem('perilsDataAdmin'); perilsData = JSON.parse(JSON.stringify(PERILS_DEFAULT)); renderPerilsTab(); } },
  newSystemPrompt() { closeModal('modal-admin'); newSystem(); },
  newFaction() { openFactionModal(null); },
  editFaction(id) { const f = factions.find(x => x.id === id); if (f) openFactionModal(f); },
  delFaction(id) {
    if (!confirm('Supprimer cette faction?')) return;
    factions = factions.filter(x => x.id !== id);
    saveFactions(); renderFactionsTab();
  }
};

function sysToPayload(sys, coord) {
  return {
    nom: sys.nom || '',
    quadrant: coord,
    faction: sys.faction || '',
    is_frontiere: sys.isFrontiere ? 1 : 0,
    route: sys.route || '',
    gouvernement: sys.gouvernement || '',
    description: sys.description || '',
    soleil_json: JSON.stringify(sys.soleil || {}),
    corps_celestes_json: JSON.stringify(sys.corpsCelestes || []),
    patrouilles_json: JSON.stringify(sys.patrouilles || []),
  };
}

async function sauvegarderDonnees() {
  const s = _sys();
  if (!s) return;
  if (_editCoord === '__new__') {
    alert('Ciblez d\'abord un quadrant sur la carte avant de sauvegarder.');
    return;
  }

  const payload = sysToPayload(s, _editCoord);
  const btn = document.getElementById('btn-save-system');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sauvegarde...'; }

  try {
    let res;
    if (s._id) {
      res = await fetchWithTable(`/api/systems/${s._id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetchWithTable('/api/systems', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    if (res.ok) {
      const data = (await res.json()).data;
      s._id = data.id;
      if (btn) {
        btn.textContent = '✅ Sauvegardé';
        btn.style.background = 'var(--success)';
        setTimeout(() => {
          if (btn) { btn.textContent = '💾 Sauvegarder'; btn.disabled = false; }
        }, 2500);
      }
      // Refresh badge "nouveau" if creation
      const badge = document.getElementById('save-new-badge');
      if (badge) badge.style.display = 'none';
    } else if (res.status === 403) {
      alert('Seul le MJ peut modifier ce système. Demandez-lui de sauvegarder.');
      if (btn) { btn.disabled = false; btn.textContent = '💾 Sauvegarder'; }
    } else {
      let msg = `Erreur ${res.status}`;
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch {}
      alert('Erreur de sauvegarde : ' + msg);
      if (btn) { btn.disabled = false; btn.textContent = '💾 Sauvegarder'; }
    }
  } catch (e) {
    alert('Erreur de connexion : ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Sauvegarder'; }
  }
}
window.sauvegarderDonnees = sauvegarderDonnees;

// ── ÉDITEUR SYSTÈMES ──────────────────────────────────────────────────────
let _editCoord = null, _editSysIdx = -1, _pickingQuadrant = false;
const _openCards = new Set();

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _sel(opts, cur) { return opts.map(o => { const v = typeof o === 'string' ? o : o.v; const l = typeof o === 'string' ? o : o.l; return `<option value="${_esc(v)}"${v === cur ? ' selected' : ''}>${_esc(l)}</option>`; }).join(''); }

function _factionPicker(cur) {
  let h = `<span class="faction-chip ${cur === '' ? 'active' : ''}" onclick="SYSEDIT.hdr('faction','');renderEditSystem()">Aucune</span>`;
  getFactionsSorted().forEach(f => {
    const act = cur === f.name ? 'active' : '';
    const img = f.icon ? `<img src="${f.icon}" alt="">` : '';
    const lbl = f.short || f.name;
    h += `<span class="faction-chip ${act}" onclick="SYSEDIT.hdr('faction','${_esc(f.name)}');renderEditSystem()" title="${_esc(f.name)}">${img}${_esc(lbl)}</span>`;
  });
  h += `<span class="faction-chip" style="border-style:dashed;color:var(--primary)" onclick="openFactionModal(null)">+ Nouvelle</span>`;
  return h;
}

function _factionLabel(name, full) {
  if (!name) return '';
  const f = factions.find(x => x.name === name);
  if (f && f.icon) return `<img src="${f.icon}" alt="${escH(f.name)}" title="${escH(f.name)}" style="width:20px;height:20px;border-radius:3px;object-fit:cover;vertical-align:middle">`;
  if (f && f.short && !full) return escH(f.short);
  return escH(name);
}

const ROUTES = ['', 'Route Galactique (+1d)', 'Route Commerciale', 'Hors des routes (D+1)', 'Mystérieux (TD)'];
const GOUVERNEMENTS = ['', 'Anarchie', 'Aucun', 'Collectivisme', 'Corporatiste', 'Démocratie', 'Dictature', 'Monarchie'];
const ATMOSPHERES = ['Respirable', 'Non respirable', 'Toxique', 'Dangereux'];
const GRAVITES = ['Ecrasante (TD, 1S par heure)', 'Forte (Survie/Technique D+1)', 'Normale', 'Faible (Athlétisme, Acrobatie, Pilotage +1d)', 'Très faible (Dist. x5, Vitesses Véhicules x1.5. Porter : TF)', 'Aucune'];
const TECHNOS = [{ v: 'A', l: 'A (Planète évoluée)' }, { v: 'B', l: 'B (Planète industrielle)' }, { v: 'C', l: 'C (Planète sauvage)' }];
const COMMERCES = ['Carrefour galactique (TF)', 'Carrefour commercial (+1d)', 'Planète normale', 'Planète pauvre (D+1)', 'Planète primitive (TD)'];
const ASTROPORT_TYPES = ['Rudimentaire D+1', 'Standard', 'Première classe +1d'];
const SUN_CLASSES = ['Naine rouge', 'Naine jaune', 'Géante rouge', 'Etoile variable', 'Etoile binaire', 'Autre'];

function openEditSystem(coord, sIdx) {
  if (!isMJ()) { showSystemDetail(coord, sIdx); return; }
  _editCoord = coord; _editSysIdx = sIdx;
  donnees[coord] = donnees[coord] || [];
  if (sIdx === -1) {
    donnees[coord].push({ nom: 'Nouveau Système', faction: '', isFrontiere: false, route: '', gouvernement: '', description: '', patrouilles: [], soleil: { nom: 'Nouvelle Étoile', description: '', diametre: '', distanceSaut: '', classe: '', activiteSolaire: [] }, corpsCelestes: [] });
    _editSysIdx = donnees[coord].length - 1;
  }
  _pickingQuadrant = false; renderEditSystem(); openModal('modal-edit-system');
}

function newSystem() { openEditSystem('__new__', -1); }

function pickQuadrantForNew() {
  closeModal('modal-edit-system'); _pickingQuadrant = true;
  document.getElementById('carte-zone').classList.add('picking');
}

function finishPickQuadrant(coord) {
  _pickingQuadrant = false; document.getElementById('carte-zone').classList.remove('picking');
  const sys = donnees['__new__']?.[_editSysIdx]; if (!sys) return;
  donnees[coord] = donnees[coord] || [];
  donnees[coord].push(sys);
  donnees['__new__'].splice(_editSysIdx, 1);
  if (!donnees['__new__'].length) delete donnees['__new__'];
  _editCoord = coord; _editSysIdx = donnees[coord].length - 1;
  initCarte(); renderEditSystem(); openModal('modal-edit-system');
}

function relocateSystem(newCoord) {
  if (newCoord === _editCoord) return;
  const sys = donnees[_editCoord]?.[_editSysIdx]; if (!sys) return;
  donnees[_editCoord].splice(_editSysIdx, 1);
  if (!donnees[_editCoord].length && _editCoord !== '__new__') delete donnees[_editCoord];
  donnees[newCoord] = donnees[newCoord] || [];
  donnees[newCoord].push(sys);
  _editCoord = newCoord; _editSysIdx = donnees[newCoord].length - 1;
  initCarte(); renderEditSystem();
}

window.pickQuadrantForNew = pickQuadrantForNew;
window.pickQuadrantRelocate = function() { closeModal('modal-edit-system'); _pickingQuadrant = true; document.getElementById('carte-zone').classList.add('picking'); };

function _sys() { return donnees[_editCoord]?.[_editSysIdx]; }

function renderEditSystem() {
  document.querySelectorAll('#edit-sys-content .sys-edit-card[data-cid]').forEach(c => {
    if (!c.classList.contains('collapsed')) _openCards.add(c.dataset.cid); else _openCards.delete(c.dataset.cid);
  });
  const s = _sys(); if (!s) return;
  document.getElementById('edit-sys-title').textContent = `${_editCoord} — ${s.nom || 'Système'}`;
  const el = document.getElementById('edit-sys-content');
  const jl = parseFloat(s.soleil?.distanceSaut) || 0;
  const isNew = _editCoord === '__new__';
  const coordLabel = isNew ? '<span style="color:var(--danger)">Non défini</span>' : _editCoord;
  let h = '';
  h += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 10px;background:var(--bg3);border-radius:4px">
    <span style="font-size:0.82rem;color:#aaa">Quadrant :</span>
    <strong style="color:var(--gold);font-size:0.92rem">${coordLabel}</strong>
    <button style="margin-left:auto;padding:4px 12px;background:var(--primary);color:white;border:none;border-radius:3px;cursor:pointer;font-size:0.78rem" onclick="${isNew ? 'pickQuadrantForNew()' : 'pickQuadrantRelocate()'}">🎯 ${isNew ? 'Cibler sur la carte' : 'Déplacer'}</button>
  </div>`;
  h += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
    <button id="btn-save-system" onclick="sauvegarderDonnees()"
      style="flex:1;padding:9px;background:${s._id ? '#2d6a2d' : '#1a3a5c'};color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:0.88rem;border:1px solid ${s._id ? 'var(--success)' : 'var(--primary)'}">
      💾 ${s._id ? 'Sauvegarder les modifications' : 'Sauvegarder sur le serveur'}
    </button>
    ${!s._id ? `<span id="save-new-badge" style="font-size:0.7rem;color:var(--warning);white-space:nowrap">⚠ Non sauvegardé</span>` : ''}
  </div>`;
  h += `<div class="sys-header-fields">
    <div class="se-field"><label>Nom du système</label><input type="text" value="${_esc(s.nom)}" onchange="SYSEDIT.hdr('nom',this.value);document.getElementById('edit-sys-title').textContent=_editCoord+' — '+this.value"></div>
    <div class="se-field full"><label>Faction</label><div class="faction-picker">${_factionPicker(s.faction || '')}</div></div>
    <div class="se-field"><label>Route</label><select onchange="SYSEDIT.hdr('route',this.value)">${_sel(ROUTES, s.route || '')}</select></div>
    <div class="se-field"><label>Gouvernement</label><select onchange="SYSEDIT.hdr('gouvernement',this.value)">${_sel(GOUVERNEMENTS, s.gouvernement || '')}</select></div>
    <div class="se-field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" ${s.isFrontiere ? 'checked' : ''} onchange="SYSEDIT.hdr('isFrontiere',this.checked)" style="width:auto"> Frontière</label></div>
    <div class="se-field full"><label>Description</label><textarea onchange="SYSEDIT.hdr('description',this.value)">${_esc(s.description)}</textarea></div>
  </div>`;
  h += _cardSun(s.soleil || {});
  (s.corpsCelestes || []).forEach((_, pi) => { h += _cardBody(s.corpsCelestes[pi], `corpsCelestes[${pi}]`, false, jl); });
  h += `<div class="se-actions" style="margin-top:10px">
    <button style="background:var(--primary);color:white" onclick="SYSEDIT.addPlanet()">+ Planète</button>
    <button style="background:var(--danger);color:white" onclick="SYSEDIT.delSystem()">Supprimer système</button>
  </div>`;
  el.innerHTML = h;
}

function _coll(cid) { return _openCards.has(cid) ? '' : 'collapsed'; }

function _cardSun(sun) {
  const isCustom = sun.classe && !SUN_CLASSES.includes(sun.classe);
  const clsSel = SUN_CLASSES.map(c => `<option value="${c}"${(c === 'Autre' && isCustom) || (c === sun.classe) ? 'selected' : ''}>${c}</option>`).join('');
  let actH = '';
  (sun.activiteSolaire || []).forEach((a, i) => {
    actH += `<div class="se-list-row"><input type="text" placeholder="Distance" value="${_esc(a.distance)}" onchange="SYSEDIT.fld('soleil.activiteSolaire[${i}].distance',this.value)"><input type="text" placeholder="Conséquence" value="${_esc(a.consequence)}" onchange="SYSEDIT.fld('soleil.activiteSolaire[${i}].consequence',this.value)"><button class="se-btn-del" onclick="SYSEDIT.delSunAct(${i})">✕</button></div>`;
  });
  return `<div class="sys-edit-card card-sun ${_coll('sun')}" data-cid="sun"><div class="sys-card-hdr" onclick="this.closest('.sys-edit-card').classList.toggle('collapsed')"><h4>☀ ${_esc(sun.nom || 'Étoile')}</h4><span class="se-caret">▼</span></div><div class="sys-card-body"><div class="se-grid">
    <div class="se-field"><label>Nom</label><input type="text" value="${_esc(sun.nom)}" onchange="SYSEDIT.fld('soleil.nom',this.value)"></div>
    <div class="se-field"><label>Classe</label><select onchange="SYSEDIT.sunClass(this)">${clsSel}</select></div>
    <div class="se-field" id="sun-cls-custom" style="display:${isCustom ? 'flex' : 'none'}"><label>Classe perso.</label><input type="text" value="${_esc(isCustom ? sun.classe : '')}" onchange="SYSEDIT.fld('soleil.classe',this.value)"></div>
    <div class="se-field"><label>Diamètre (K)</label><input type="number" value="${sun.diametre || ''}" onchange="SYSEDIT.fld('soleil.diametre',this.value)"></div>
    <div class="se-field"><label>Distance de saut (US)</label><input type="number" value="${sun.distanceSaut || ''}" onchange="SYSEDIT.fld('soleil.distanceSaut',this.value);renderEditSystem()"></div>
    <div class="se-field full"><label>Description</label><textarea onchange="SYSEDIT.fld('soleil.description',this.value)">${_esc(sun.description)}</textarea></div>
    <fieldset class="se-fieldset"><legend>Activité Solaire</legend>${actH}<button class="se-btn-add" onclick="SYSEDIT.addSunAct()">+ Activité</button></fieldset>
  </div></div></div>`;
}

function _cardBody(body, path, isMoon, jl) {
  const orb = parseFloat(body.orbite) || 0;
  const jd = jl > 0 ? (jl - orb).toFixed(2) : 'N/A';
  const showAtmo = body.atmosphere === 'Toxique' || body.atmosphere === 'Dangereux';
  let astH = '';
  (body.astroports || []).forEach((a, i) => { astH += `<div class="se-list-row"><input type="text" placeholder="Nom" value="${_esc(a.nom)}" onchange="SYSEDIT.fld('${path}.astroports[${i}].nom',this.value)"><select onchange="SYSEDIT.fld('${path}.astroports[${i}].type',this.value)">${_sel(ASTROPORT_TYPES, a.type || 'Standard')}</select><button class="se-btn-del" onclick="SYSEDIT.delSub('${path}.astroports',${i})">✕</button></div>`; });
  let lieuxH = '';
  (body.lieux || []).forEach((l, i) => { lieuxH += `<div class="se-list-row" style="flex-wrap:wrap"><input type="text" placeholder="Nom" value="${_esc(l.nom)}" onchange="SYSEDIT.fld('${path}.lieux[${i}].nom',this.value)"><button class="se-btn-del" onclick="SYSEDIT.delSub('${path}.lieux',${i})">✕</button><textarea style="width:100%" placeholder="Description" onchange="SYSEDIT.fld('${path}.lieux[${i}].description',this.value)">${_esc(l.description)}</textarea></div>`; });
  const cls = isMoon ? 'card-moon' : 'card-planet';
  const pathId = path.replace(/\W/g, '');
  return `<div class="sys-edit-card ${cls} ${_coll(path)}" data-cid="${path}"><div class="sys-card-hdr" onclick="this.closest('.sys-edit-card').classList.toggle('collapsed')"><input type="text" value="${_esc(body.nom)}" onclick="event.stopPropagation()" onchange="SYSEDIT.fld('${path}.nom',this.value)"><span class="se-caret">▼</span><button class="se-btn-del" onclick="event.stopPropagation();SYSEDIT.delBody('${path}')" title="Supprimer">✕</button></div><div class="sys-card-body"><div class="se-grid">
    <div class="se-field full"><label>Description</label><textarea onchange="SYSEDIT.fld('${path}.description',this.value)">${_esc(body.description)}</textarea></div>
    <div class="se-field"><label>Atmosphère</label><select onchange="SYSEDIT.atmo(this,'${path}','${pathId}')">${_sel(ATMOSPHERES, body.atmosphere || 'Respirable')}</select></div>
    <div class="se-field" id="atmo-${pathId}" style="display:${showAtmo ? 'flex' : 'none'}"><label>Détail atmo.</label><input type="text" value="${_esc(body.atmosphereDetail)}" onchange="SYSEDIT.fld('${path}.atmosphereDetail',this.value)"></div>
    <div class="se-field"><label>Gravité</label><select onchange="SYSEDIT.fld('${path}.gravite',this.value)">${_sel(GRAVITES, body.gravite || 'Normale')}</select></div>
    <div class="se-field"><label>Technologie</label><select onchange="SYSEDIT.fld('${path}.techno',this.value)">${_sel(TECHNOS, body.techno || 'B')}</select></div>
    <div class="se-field"><label>Gouvernement</label><select onchange="SYSEDIT.fld('${path}.gouvernement',this.value)">${_sel(GOUVERNEMENTS, body.gouvernement || '')}</select></div>
    <div class="se-field"><label>Commerce</label><select onchange="SYSEDIT.fld('${path}.commerce',this.value)">${_sel(COMMERCES, body.commerce || 'Planète normale')}</select></div>
    <div class="se-field"><label>Orbite (US)</label><input type="number" step="0.01" value="${body.orbite || ''}" onchange="SYSEDIT.fld('${path}.orbite',this.value);renderEditSystem()"></div>
    <div class="se-field"><label>Dist. saut (US)</label><input type="text" value="${jd}" disabled></div>
    <div class="se-field"><label>Classe</label><input type="text" value="${_esc(body.classe)}" onchange="SYSEDIT.fld('${path}.classe',this.value)"></div>
    <div class="se-field"><label>Diamètre (K)</label><input type="number" value="${body.diametre || ''}" onchange="SYSEDIT.fld('${path}.diametre',this.value)"></div>
    <div class="se-field"><label>Population</label><input type="number" value="${body.population || ''}" onchange="SYSEDIT.fld('${path}.population',this.value)"></div>
    <div class="se-field"><label>Sécurité (1-20)</label><input type="number" min="1" max="20" value="${body.securite || ''}" onchange="SYSEDIT.fld('${path}.securite',this.value)"></div>
    <fieldset class="se-fieldset"><legend>Astroports</legend>${astH}<button class="se-btn-add" onclick="SYSEDIT.addSub('${path}.astroports',{nom:'',type:'Standard'})">+ Astroport</button></fieldset>
    <fieldset class="se-fieldset"><legend>Lieux</legend>${lieuxH}<button class="se-btn-add" onclick="SYSEDIT.addSub('${path}.lieux',{nom:'',description:''})">+ Lieu</button></fieldset>
    <fieldset class="se-fieldset"><legend>Marchandise</legend><div class="se-grid g3" style="margin-top:0">
      <div class="se-field"><label>A</label><input type="number" step="0.1" value="${body.marchandiseA || ''}" onchange="SYSEDIT.fld('${path}.marchandiseA',this.value)"></div>
      <div class="se-field"><label>B</label><input type="number" step="0.1" value="${body.marchandiseB || ''}" onchange="SYSEDIT.fld('${path}.marchandiseB',this.value)"></div>
      <div class="se-field"><label>C</label><input type="number" step="0.1" value="${body.marchandiseC || ''}" onchange="SYSEDIT.fld('${path}.marchandiseC',this.value)"></div>
      <div class="se-field full"><label>Illégale</label><input type="text" value="${_esc(body.illegal)}" onchange="SYSEDIT.fld('${path}.illegal',this.value)"></div>
    </div></fieldset>
  </div><div class="se-actions"><button style="background:var(--primary);color:white" onclick="SYSEDIT.addMoon('${path}')">+ Lune</button></div></div></div>`;
}

function _resolvePath(obj, path) {
  const parts = path.replace(/\[(\w+)\]/g, '.$1').split('.');
  for (let i = 0; i < parts.length - 1; i++) { if (!obj[parts[i]]) obj[parts[i]] = isNaN(parts[i + 1]) ? {} : []; obj = obj[parts[i]]; }
  return { parent: obj, key: parts[parts.length - 1] };
}

window.SYSEDIT = {
  hdr(k, v) { const s = _sys(); if (!s) return; s[k] = v; },
  fld(path, v) { const s = _sys(); if (!s) return; const r = _resolvePath(s, path); r.parent[r.key] = v; },
  sunClass(sel) { const w = document.getElementById('sun-cls-custom'); if (sel.value === 'Autre') { w.style.display = 'flex'; } else { w.style.display = 'none'; this.fld('soleil.classe', sel.value); } },
  atmo(sel, path, pathId) { const w = document.getElementById('atmo-' + pathId); if (w) w.style.display = (sel.value === 'Toxique' || sel.value === 'Dangereux') ? 'flex' : 'none'; this.fld(path + '.atmosphere', sel.value); },
  addItem(arrPath, obj) { const s = _sys(); if (!s) return; const r = _resolvePath(s, arrPath); if (!Array.isArray(r.parent[r.key])) r.parent[r.key] = []; r.parent[r.key].push(JSON.parse(JSON.stringify(obj))); renderEditSystem(); },
  delItem(arrPath, idx) { const s = _sys(); if (!s) return; const r = _resolvePath(s, arrPath); if (Array.isArray(r.parent[r.key])) r.parent[r.key].splice(idx, 1); renderEditSystem(); },
  addSunAct() { const s = _sys(); if (!s?.soleil) return; if (!s.soleil.activiteSolaire) s.soleil.activiteSolaire = []; s.soleil.activiteSolaire.push({ distance: '', consequence: '' }); renderEditSystem(); },
  delSunAct(i) { const s = _sys(); if (!s?.soleil?.activiteSolaire) return; s.soleil.activiteSolaire.splice(i, 1); renderEditSystem(); },
  addPlanet() { const s = _sys(); if (!s) return; if (!s.corpsCelestes) s.corpsCelestes = []; s.corpsCelestes.push({ nom: 'Nouvelle Planète', description: '', orbite: '', classe: '', diametre: '', atmosphere: 'Respirable', gravite: 'Normale', techno: 'B', gouvernement: '', commerce: 'Planète normale', securite: '', population: '', lunes: [], lieux: [], astroports: [], marchandiseA: '', marchandiseB: '', marchandiseC: '', illegal: '' }); renderEditSystem(); },
  addMoon(bodyPath) { const s = _sys(); if (!s) return; const r = _resolvePath(s, bodyPath); const body = r.parent[r.key]; if (!body) return; if (!body.lunes) body.lunes = []; body.lunes.push({ nom: 'Nouvelle Lune', description: '', lunes: [], lieux: [], astroports: [] }); renderEditSystem(); },
  addSub(arrPath, obj) { const s = _sys(); if (!s) return; const r = _resolvePath(s, arrPath); if (!Array.isArray(r.parent[r.key])) r.parent[r.key] = []; r.parent[r.key].push(JSON.parse(JSON.stringify(obj))); renderEditSystem(); },
  delSub(arrPath, idx) { const s = _sys(); if (!s) return; const r = _resolvePath(s, arrPath); if (Array.isArray(r.parent[r.key])) r.parent[r.key].splice(idx, 1); renderEditSystem(); },
  delBody(path) { if (!confirm('Supprimer cet astre ?')) return; const s = _sys(); if (!s) return; const parts = path.replace(/\[(\w+)\]/g, '.$1').split('.'); if (parts.length < 2) return; let p = s; for (let i = 0; i < parts.length - 2; i++) p = p[parts[i]]; p[parts[parts.length - 2]].splice(+parts[parts.length - 1], 1); renderEditSystem(); },
  delSystem() {
    if (_editCoord === '__new__') {
      donnees['__new__'].splice(_editSysIdx, 1);
      if (!donnees['__new__'].length) delete donnees['__new__'];
      closeModal('modal-edit-system'); return;
    }
    const s = _sys();
    const savedOnServer = !!s?._id;
    const msg = savedOnServer
      ? 'Supprimer ce système localement ? (La copie serveur reste — supprimez-la via le Compendium si nécessaire.)'
      : 'Supprimer ce système ?';
    if (!confirm(msg)) return;
    donnees[_editCoord].splice(_editSysIdx, 1);
    if (!donnees[_editCoord].length) delete donnees[_editCoord];
    closeModal('modal-edit-system'); initCarte();
  }
};

// ── MODALS ────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
window.openModal = openModal;
window.closeModal = closeModal;

// ── EVENTS ────────────────────────────────────────────────────────────────
function initEvents() {
  document.getElementById('btn-params').addEventListener('click', () => { loadParamsToForm(); openModal('modal-params'); });
  document.getElementById('btn-historique').addEventListener('click', () => { renderHist(); openModal('modal-historique'); });
  document.getElementById('btn-admin').addEventListener('click', () => { renderAdminTabs(); openModal('modal-admin'); });
  document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.modal)));
  document.querySelectorAll('.modal-backdrop').forEach(bd => bd.addEventListener('click', e => { if (e.target === bd) closeModal(bd.id); }));
  document.getElementById('btn-save-params').addEventListener('click', () => {
    const p = { ipSpd: +document.getElementById('p-ip-spd').value || 100, hsSpd: +document.getElementById('p-hs-spd').value || 1000, hsAuto: +document.getElementById('p-hs-auto').value || 10000 };
    saveParams(p); closeModal('modal-params');
  });
  document.getElementById('fab-calculer').addEventListener('click', () => doCalc(true));
  const rp = document.getElementById('result-panel');
  document.getElementById('btn-close-result').addEventListener('click', e => { e.stopPropagation(); rp.classList.remove('open', 'minimized'); });
  document.getElementById('btn-minimize-result').addEventListener('click', e => { e.stopPropagation(); rp.classList.toggle('minimized'); });
  rp.addEventListener('click', () => { if (rp.classList.contains('minimized')) rp.classList.remove('minimized'); });
  document.getElementById('btn-update-mobile').addEventListener('click', () => doUpdate('mob', true));
  document.getElementById('btn-save-hist-mobile').addEventListener('click', saveCurrentTrip);
  document.getElementById('btn-calc-desktop').addEventListener('click', () => doCalc(false));
  document.getElementById('btn-update-desktop').addEventListener('click', () => doUpdate('dsk', false));
  document.getElementById('btn-save-hist-desktop').addEventListener('click', saveCurrentTrip);
  document.getElementById('bottom-sheet-handle').addEventListener('click', () => {
    document.getElementById('bottom-sheet').classList.remove('open');
    document.getElementById('fab-calculer').classList.remove('sheet-open');
  });
  document.getElementById('carte-zone').addEventListener('click', e => {
    if (isDragging) return;
    if (!e.target.classList.contains('quad')) {
      document.getElementById('bottom-sheet').classList.remove('open');
      document.getElementById('fab-calculer').classList.remove('sheet-open');
    }
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────
async function init() {
  // Auth check (non-bloquant pour cette page publique)
  try { await initAuthUI(); } catch {}

  await loadData();

  populateShipSelect();
  initCarte();
  initPanZoom();
  initEvents();
  initFactionModal();
  updateDesktopPointsList();
  centerMap();
}

document.addEventListener('DOMContentLoaded', init);
