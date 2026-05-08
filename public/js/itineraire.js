/**
 * itineraire.js — Carte galactique & calcul d'itinéraire
 * ES module — remplace le script inline de itineraire_backup_20260419.html
 */
import { initAuthUI } from '/js/shared/auth-ui.js';
import { getActiveTableId, fetchWithTable, isMJ } from '/js/shared/table-selector.js';
import { createPoller } from '/js/shared/poller.js';
import { createDeferredCommitQueue } from '/js/shared/deferred-commit.js';

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
let campaignDateState = null; // { date: 'XXYY.ZZ', year: 50429 } loaded from API

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

  // Tables personnalisées + assignations (API si table active)
  if (tableId) {
    try {
      const [ctRes, paRes] = await Promise.all([
        fetchWithTable('/api/perils/tables', { credentials: 'include' }),
        fetchWithTable('/api/perils/assignments', { credentials: 'include' }),
      ]);
      if (ctRes.ok) customTables = (await ctRes.json()).data || [];
      if (paRes.ok) perilAssignments = (await paRes.json()).data || { systems: {}, quadrants: {} };
    } catch { /* keep empty defaults */ }
  }

  // Load factions from API (falls back to localStorage)
  try {
    const fr = await fetch('/api/factions', { credentials: 'include' });
    if (fr.ok) { const fj = await fr.json(); factions = fj.data || []; }
    else { factions = JSON.parse(localStorage.getItem('factions') || '[]'); }
  } catch { try { factions = JSON.parse(localStorage.getItem('factions') || '[]'); } catch { factions = []; } }

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
    peril_list_id: sys.peril_list_id || '',
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
  const ipEl = document.getElementById('p-ip-spd');
  const hsEl = document.getElementById('p-hs-spd');
  const auEl = document.getElementById('p-hs-auto');
  if (ipEl) ipEl.value = p.ipSpd;
  if (hsEl) hsEl.value = p.hsSpd;
  if (auEl) auEl.value = p.hsAuto;
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
    loadParamsToForm();
    refreshCarte();
    if (currentTripLegs) renderTrip(currentTripLegs, window.innerWidth < 768);
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
  for (let r = 40; r >= 1; r--) {
    const d = document.createElement('div');
    d.className = 'row-header';
    d.textContent = r;
    rowLeg.appendChild(d);
  }

  // Grille
  carte.innerHTML = '';
  for (let row = 40; row >= 1; row--) {
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
    cell.classList.remove('has-system', 'selected-dep', 'selected-arr', 'selected-eta', 'path', 'ship-pos', 'active-ship-pos');
    if (donnees[coord]?.length) cell.classList.add('has-system');
  });

  // Mark ship positions
  ships.forEach(s => {
    if (!s.position?.quadrant) return;
    const cell = document.querySelector(`.quad[data-coord="${s.position.quadrant}"]`);
    if (!cell) return;
    if (activeShip && String(s.id) === String(activeShip.id)) {
      cell.classList.add('active-ship-pos');
    } else {
      cell.classList.add('ship-pos');
    }
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
  const isDesktop = window.innerWidth >= 768;
  zoom = isDesktop
    ? r.width / 820
    : Math.min(r.width / 820, r.height / 820, 1);
  panX = (r.width - 820 * zoom) / 2; panY = (r.height - 820 * zoom) / 2;
  applyT();
}

/** Pan the map to put a quadrant coordinate in the center of the viewport */
function centerOnCoord(quadrantCoord) {
  const xy = coordXY(quadrantCoord);
  if (!xy || xy.x < 0) return;
  const z = document.getElementById('carte-zone');
  if (!z) return;
  const r = z.getBoundingClientRect();
  // Each cell is 20px; legend offset = 20px
  const cellX = 20 + xy.x * 20 + 10; // center of cell
  const cellY = 20 + xy.y * 20 + 10;
  panX = r.width / 2 - cellX * zoom;
  panY = r.height / 2 - cellY * zoom;
  applyT();
}

// ── BOTTOM SHEET ──────────────────────────────────────────────────────────
function onCellClick(coord) {
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
  if (isMJ()) {
    const sysLink = document.createElement('a');
    sysLink.href = `/univers.html?quadrant=${encodeURIComponent(coord)}&new=1#systems`;
    sysLink.target = '_blank';
    sysLink.rel = 'noopener';
    sysLink.textContent = '+ Système';
    sysLink.style.cssText = 'padding:3px 9px;font-size:0.75rem;background:var(--gold);color:#111;border-radius:4px;font-weight:bold;text-decoration:none;line-height:1.6';
    qbContainer.appendChild(sysLink);
  }
  renderBSTripState();
  const content = document.getElementById('bottom-sheet-content');
  content.innerHTML = '';
  // HS peril picker (MJ only)
  if (isMJ()) {
    const hsRow = document.createElement('div');
    hsRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--bg3)';
    const hsTid = perilAssignments.quadrants[coord] || '';
    hsRow.innerHTML = `<span style="font-size:0.78rem;color:#aaa;white-space:nowrap">⚠️ Périls HS :</span>${_perilTableSelect('hyperspatial', coord, hsTid)}`;
    content.appendChild(hsRow);
  }
  if (systems.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:16px 20px;text-align:center;color:#888;font-style:italic;display:flex;flex-direction:column;align-items:center;gap:10px';
    empty.innerHTML = '<span>Quadrant vide.</span>'
      + (isMJ() ? `<a href="/univers.html?quadrant=${encodeURIComponent(coord)}&new=1#systems" target="_blank" rel="noopener" style="font-style:normal;padding:5px 14px;background:var(--gold);color:#111;border-radius:4px;font-size:0.8rem;font-weight:bold;text-decoration:none">➕ Créer un système</a>` : '');
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
  // Retour à la vue quadrant quand on clique un nouveau quadrant
  document.getElementById('dp-detail-section').style.display = 'none';
  document.getElementById('dp-default-state').style.display = 'none';
  document.getElementById('dp-quad-section').style.display = 'block';
  switchDesktopTab('carte');
  const qp = JSON.stringify({ quadrant: coord, systemNom: null, astroNom: null, orbit: 0 });
  const addQBtn = `<button onclick='APP.add(${JSON.stringify(qp)})' class="btn-point btn-eta" style="padding:2px 8px;font-size:0.7rem">+&nbsp;Quadrant</button>`
    + (isMJ() ? `<a href="/univers.html?quadrant=${encodeURIComponent(coord)}&new=1#systems" target="_blank" rel="noopener" style="padding:2px 8px;font-size:0.7rem;background:var(--gold);color:#111;border-radius:4px;font-weight:bold;text-decoration:none;line-height:1.8">+&nbsp;Système</a>` : '');
  let h = `<div style="display:flex;justify-content:space-between;align-items:center;gap:4px;margin-bottom:6px"><strong style="color:var(--gold)">${coord}</strong><div style="display:flex;gap:4px">${addQBtn}</div></div>`;
  if (isMJ()) {
    const _hsTid = perilAssignments.quadrants[coord] || '';
    h += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--border)"><span style="font-size:0.72rem;color:#aaa;white-space:nowrap">⚠️ HS :</span>${_perilTableSelect('hyperspatial', coord, _hsTid)}</div>`;
  }
  if (!systems.length) {
    const createLink = isMJ() ? `<a href="/univers.html?quadrant=${encodeURIComponent(coord)}&new=1#systems" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;padding:4px 12px;background:var(--gold);color:#111;border-radius:4px;font-size:0.78rem;font-weight:bold;text-decoration:none">➕ Créer un système</a>` : '';
    el.innerHTML = h + `<span style="color:#888;font-size:0.8rem">Quadrant vide</span>` + createLink;
    return;
  }
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

function switchDesktopTab(tab) {
  document.querySelectorAll('.dp-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.dp-tab-pane').forEach(p => {
    const isActive = p.id === `dp-tab-${tab}`;
    p.classList.toggle('active', isActive);
    p.style.display = isActive ? '' : 'none';
  });
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
  add(j) {
    const wasEmpty = tripState.points.length === 0;
    tripState.points.push(JSON.parse(j));
    refreshAll();
    if (wasEmpty && window.innerWidth >= 768) switchDesktopTab('itineraire');
  }
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
  // Persist via API
  const tableId = getActiveTableId();
  if (tableId) {
    fetchWithTable('/api/perils/assignments', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assign_type: type, key, peril_table_id: val || '' })
    }).catch(console.error);
  }
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
    h += `<div style="margin-top:12px;text-align:center"><a href="/univers.html?quadrant=${encodeURIComponent(coord)}${sys._id ? `&sysid=${sys._id}` : ''}#systems" target="_blank" style="display:inline-block;padding:8px 20px;background:var(--primary);color:white;border-radius:4px;font-size:0.85rem;text-decoration:none">✏️ Éditer dans Univers</a></div>`;
  } else {
    h += `<div style="margin-top:12px;text-align:center;font-size:0.75rem;color:#888">🔒 Lecture seule — seul le MJ peut modifier les systèmes</div>`;
  }
  if (window.innerWidth >= 768) {
    document.getElementById('dp-detail-title').textContent = `${coord} — ${sys.nom}`;
    document.getElementById('dp-detail-content').innerHTML = h;
    document.getElementById('dp-default-state').style.display = 'none';
    document.getElementById('dp-quad-section').style.display = 'none';
    document.getElementById('dp-detail-section').style.display = 'block';
    switchDesktopTab('carte');
  } else {
    document.getElementById('modal-detail-title').textContent = `${coord} — ${sys.nom}`;
    document.getElementById('detail-content').innerHTML = h;
    openModal('modal-detail');
  }
}
window.showDetail = showSystemDetail;

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

/** Retourne la liste ordonnée de coordonnées quadrant traversées (Bresenham) */
function getQuadrantPath(a, b) {
  const ca = coordXY(a), cb = coordXY(b);
  const path = [];
  let x = ca.x, y = ca.y;
  const dx = Math.abs(cb.x - ca.x), dy = Math.abs(cb.y - ca.y);
  const sx = ca.x < cb.x ? 1 : -1, sy = ca.y < cb.y ? 1 : -1;
  let err = dx - dy;
  while (true) {
    path.push(`${LETTRES[x]}-${y + 1}`);
    if (x === cb.x && y === cb.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return path;
}

/** Génère les dailyData d'un leg HS en résolvant le quadrant position par jour */
function genHSDayData(days, hsSpd, path, skill) {
  return Array.from({ length: days }, (_, i) => {
    // Position parcourue au début du jour i (en PC)
    const pcCovered = i * hsSpd;
    // Index dans path : 1 quadrant = 1000 PC
    const qi = Math.min(Math.floor(pcCovered / 1000), path.length - 1);
    const quadrant = path[qi];
    const tid = perilAssignments.quadrants[quadrant] || null;
    const tbl = tid ? customTables.find(t => t.id === tid) : null;
    const r = getPeril('hyperspatial', skill, tbl);
    return { day: i + 1, peril: r.peril, baseIndex: r.baseIndex, surf: 0, conso: 0, _quadrant: quadrant, _tableId: tid };
  });
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
      const destPos = { quadrant: cur.quadrant, systemNom: cur.systemNom, astroNom: 'Limite de Saut' };
      legs.push({ name: `Départ de ${cur.systemNom}`, type: 'interplanetaire', from: cur.astroNom, to: `Limite — ${cur.systemNom}`, distance: dist, unit: 'US', days, spd: p.ipSpd, skill: 0, _tableId: tbl?.id || null, _destPosition: destPos, dailyData: genDayData('interplanetaire', days, 0, tbl) });
    }
    if (cur.quadrant !== nxt.quadrant) {
      const dist = calcHSDist(cur.quadrant, nxt.quadrant);
      const days = Math.max(1, Math.ceil(dist / p.hsSpd));
      const qPath = getQuadrantPath(cur.quadrant, nxt.quadrant);
      const dailyData = genHSDayData(days, p.hsSpd, qPath, 0);
      const destPosHS = { quadrant: nxt.quadrant, systemNom: nxt.systemNom || null, astroNom: nxt.systemNom ? 'Limite de Saut' : null };
      legs.push({ name: `Saut ${cur.quadrant} → ${nxt.quadrant}`, type: 'hyperspatial', from: `Q.${cur.quadrant}`, to: `Q.${nxt.quadrant}`, distance: dist, unit: 'PC', days, spd: p.hsSpd, skill: 0, _tableId: null, _quadrantPath: qPath, _destPosition: destPosHS, dailyData });
    }
    if (nxt.astroNom && nxt.astroNom !== 'Limite de Saut' && nxtSys) {
      const jl = parseFloat(nxtSys.soleil?.distanceSaut) || 0;
      const dist = Math.abs(jl - nxt.orbit);
      const days = Math.max(1, Math.ceil(dist / p.ipSpd));
      const tbl = getTableForLeg('interplanetaire', nxt.quadrant, nxt.systemNom);
      const destPosArr = { quadrant: nxt.quadrant, systemNom: nxt.systemNom, astroNom: nxt.astroNom };
      legs.push({ name: `Arrivée à ${nxt.systemNom}`, type: 'interplanetaire', from: `Limite — ${nxt.systemNom}`, to: nxt.astroNom, distance: dist, unit: 'US', days, spd: p.ipSpd, skill: 0, _tableId: tbl?.id || null, _destPosition: destPosArr, dailyData: genDayData('interplanetaire', days, 0, tbl) });
    }
  }
  return { legs, autonomy: p.hsAuto, points };
}

// ── RENDU RÉSULTAT ────────────────────────────────────────────────────────
function summaryHTML(trip) {
  let days = 0, pc = 0, us = 0, conso = 0;
  trip.legs.forEach(l => {
    const sm = l.type === 'hyperspatial' ? 100 : 1;
    let cum = 0;
    for (const d of l.dailyData) {
      cum += l.spd + (d.surf || 0) * sm;
      days++;
      if (l.type === 'hyperspatial') conso += l.spd - (d.conso || 0);
      if (cum >= l.distance) break;
    }
    l.unit === 'PC' ? pc += l.distance : us += l.distance;
  });
  const over = conso > trip.autonomy;
  return `<strong>${days} jour${days > 1 ? 's' : ''}</strong> · ${Math.round(pc).toLocaleString()} PC · ${us.toFixed(0)} US<br>Conso: <strong>${Math.round(conso).toLocaleString()} / ${trip.autonomy.toLocaleString()} PC</strong>${over ? ' <span style="color:var(--danger)">⚠ Autonomie dépassée!</span>' : ''}`;
}

function legsHTML(legs, pfx) {
  return legs.map((leg, li) => {
    const isHS = leg.type === 'hyperspatial';
    const surfMult = isHS ? 100 : 1;
    let rows = ''; let cum = 0; let effectiveDays = 0; let arrived = false;
    leg.dailyData.forEach((d, di) => {
      if (arrived) return;
      const cumBefore = cum;
      cum += leg.spd + (d.surf || 0) * surfMult;
      effectiveDays++;
      const done = cum >= leg.distance;
      if (done) arrived = true;
      // Quadrant dynamique basé sur la distance cumulée réelle au début du jour
      let quadrant = d._quadrant || '';
      if (isHS && leg._quadrantPath) {
        const qi = Math.min(Math.floor(cumBefore / 1000), leg._quadrantPath.length - 1);
        quadrant = leg._quadrantPath[qi] || '';
      }
      const qCell = isHS ? `<td style="font-size:0.7rem;color:#aaa">${quadrant}</td>` : '';
      rows += `<tr>
        <td>${d.day}</td>
        ${qCell}
        ${isMJ() ? `<td><span class="peril-link" data-li="${li}" data-di="${di}" data-pfx="${pfx}">${d.peril.nom}</span></td>` : ''}
        <td><input type="number" id="${pfx}-s-${li}-${di}" value="${d.surf}" step="1" style="width:52px"></td>
        ${isHS ? `<td><input type="number" id="${pfx}-c-${li}-${di}" value="${d.conso}" step="100"></td><td>${(leg.spd - d.conso).toLocaleString()}</td>` : ''}
        <td style="font-size:0.72rem">${Math.min(cum, leg.distance).toFixed(0)}/${leg.distance.toFixed(0)}</td>
        <td>${done ? '<span class="status-done">Arr.</span>' : '<span class="status-ok">→</span>'}</td>
      </tr>`;
    });
    return `<div class="result-leg" id="${pfx}-leg-${li}">
      <div class="result-leg-header" onclick="toggleLeg(this)">
        <div><h3>${leg.name}</h3><div class="leg-info">${leg.from} → ${leg.to} · ${effectiveDays}j · ${leg.distance.toFixed(0)} ${leg.unit}</div></div>
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
          <thead><tr><th>J</th>${isHS ? '<th>Quad.</th>' : ''}${isMJ() ? '<th>Péril</th>' : ''}<th>Surf${isHS ? ' (×100&nbsp;PC)' : ' (US)'}</th>${isHS ? '<th>◁Conso</th><th>PC/j</th>' : ''}<th>Dist</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${activeShip && isMJ() ? `<div style="text-align:right;margin-top:8px"><button class="save-pos-btn" data-li="${li}" title="Enregistrer la position du vaisseau après cette étape">📍 Enregistrer Position</button></div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function attachPerilEvents(container, legs) {
  container.querySelectorAll('.peril-link').forEach(lk => {
    lk.addEventListener('click', () => showPeril(legs[+lk.dataset.li].dailyData[+lk.dataset.di].peril));
  });
  container.querySelectorAll('.save-pos-btn').forEach(btn => {
    btn.addEventListener('click', () => saveShipPos(legs[+btn.dataset.li], btn));
  });
}

function showPeril(peril) {
  const d = peril.data || {};
  let h = `<h2>${peril.nom}</h2>`;
  // texteAmbiance (new) or description (old compat)
  const ambiance = d.texteAmbiance !== undefined ? d.texteAmbiance : d.description;
  if (ambiance) h += `<p class="desc">${escH(ambiance)}</p>`;
  const stats = [];
  if (d.mobile) stats.push('📡 Mobile');
  if (d.senseurs) stats.push(`Senseurs: ${d.senseurs}`);
  if (d.sciencesStellaires) stats.push(`Sc.Stellaires: ${d.sciencesStellaires}`);
  if (stats.length) h += `<div class="pstats">${stats.join(' · ')}</div>`;
  // description (new name) or definition (old compat)
  const desc = d.description !== undefined && d.texteAmbiance !== undefined ? d.description : d.definition;
  if (desc) h += `<div class="psection"><div class="psection-title">Description</div><p>${escH(desc)}</p></div>`;
  // Protocole — array of {role, action} or legacy string
  if (Array.isArray(d.protocole) && d.protocole.length) {
    h += `<div class="psection"><div class="psection-title">Protocole</div><ol class="protocole-list">`;
    for (const p of d.protocole) {
      h += `<li>${p.role ? `<strong>${escH(p.role)}</strong> — ` : ''}${escH(p.action)}</li>`;
    }
    h += `</ol></div>`;
  } else if (typeof d.protocole === 'string' && d.protocole) {
    h += `<div class="psection"><div class="psection-title">Protocole</div><p>${escH(d.protocole)}</p></div>`;
  }
  // Résultat — array of {seuil, effet} or legacy string
  if (Array.isArray(d.resultat) && d.resultat.length) {
    h += `<div class="psection"><div class="psection-title">Résultat</div><table class="resultat-table">`;
    for (const r of d.resultat) {
      h += `<tr><td class="seuil-cell">${escH(r.seuil)}</td><td>${escH(r.effet)}</td></tr>`;
    }
    h += `</table></div>`;
  } else if (typeof d.resultat === 'string' && d.resultat) {
    h += `<div class="psection"><div class="psection-title">Résultat</div><p>${escH(d.resultat)}</p></div>`;
  }
  document.getElementById('peril-content').innerHTML = h;
  openModal('modal-peril');
}

window.toggleLeg = function(hdr) { hdr.closest('.result-leg').classList.toggle('collapsed'); };

async function saveShipPos(leg, btn) {
  if (!activeShip) return;
  const pos = leg._destPosition;
  if (!pos?.quadrant) { alert('Pas de position de destination disponible pour cette étape.'); return; }

  const shipName = activeShip.name || activeShip.nom || activeShip.id;
  const label = [pos.systemNom, pos.astroNom].filter(Boolean).join(' — ') || pos.quadrant;
  if (!confirm(`Enregistrer la position de "${shipName}" à : ${label} (Quadrant ${pos.quadrant}) ?`)) return;

  btn.disabled = true;
  btn.textContent = '⏳…';
  try {
    const r = await fetchWithTable(`/api/ships/${activeShip.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ position_json: JSON.stringify(pos) })
    });
    if (!r.ok) { const j = await r.json(); throw new Error(j?.error?.message || `Erreur ${r.status}`); }
    // Mise à jour locale
    activeShip.position = pos;
    const idx = ships.findIndex(s => String(s.id) === String(activeShip.id));
    if (idx !== -1) ships[idx].position = pos;
    refreshCarte();
    btn.textContent = '✅ Enregistré';
    setTimeout(() => { btn.disabled = false; btn.textContent = '📍 Enregistrer Position'; }, 2000);
  } catch (e) {
    alert('Erreur : ' + e.message);
    btn.disabled = false;
    btn.textContent = '📍 Enregistrer Position';
  }
}

// ── ENREGISTRER TRAJET AU CALENDRIER ────────────────────────────────────────
function galacticDateToIndex(s) {
  const m = s?.match(/^(\d{2})(\d{2})\.(\d{2})$/);
  if (!m) return 0;
  return (+m[1] - 1) * 25 + (+m[2] - 1) * 5 + (+m[3] - 1);
}
function galacticIndexToDate(idx, year) {
  const y = year + Math.floor(idx / 250);
  const i = ((idx % 250) + 250) % 250;
  const mm = Math.floor(i / 25) + 1;
  const ww = Math.floor((i % 25) / 5) + 1;
  const dd = (i % 5) + 1;
  return {
    date: `${String(mm).padStart(2,'0')}${String(ww).padStart(2,'0')}.${String(dd).padStart(2,'0')}`,
    year: y,
  };
}

async function openSaveTrajetModal(trip) {
  // Try to get fresh campaign state
  try {
    const r = await fetchWithTable('/api/calendar/state');
    if (r?.ok) {
      const j = await r.json().catch(() => null);
      campaignDateState = j?.data ?? j ?? campaignDateState;
    }
  } catch { /* use cached */ }

  const pts = tripState.points;
  const from = pts[0]?.systemNom || pts[0]?.astroNom || pts[0]?.quadrant || '?';
  const to = pts[pts.length - 1]?.systemNom || pts[pts.length - 1]?.astroNom || pts[pts.length - 1]?.quadrant || '?';
  const shipName = activeShip?.nom || activeShip?.name || '';

  // Count total effective days from leg dailyData
  let totalDays = 0;
  trip.legs.forEach(leg => {
    let arrived = false, cum = 0;
    const surfMult = leg.type === 'hyperspatial' ? 100 : 1;
    leg.dailyData.forEach(d => {
      if (arrived) return;
      cum += leg.spd + (d.surf || 0) * surfMult;
      totalDays++;
      if (cum >= leg.distance) arrived = true;
    });
  });

  const startDate = campaignDateState?.date || '0101.01';
  const startYear = campaignDateState?.year || 50429;
  const endResult = totalDays > 1
    ? galacticIndexToDate(galacticDateToIndex(startDate) + totalDays - 1, startYear)
    : { date: startDate, year: startYear };

  // Load categories to pre-select "Trajet"
  let categories = [];
  let trajetCatId = '';
  try {
    const r2 = await fetchWithTable('/api/calendar/categories');
    if (r2?.ok) {
      const j2 = await r2.json().catch(() => null);
      categories = j2?.data ?? j2 ?? [];
      const trajetCat = categories.find(c => c.is_system === 1 || c.name === 'Trajet');
      if (trajetCat) trajetCatId = trajetCat.id;
    }
  } catch { /* pass */ }

  const catOptions = categories
    .map(c => `<option value="${c.id}" ${c.id === trajetCatId ? 'selected' : ''}>${c.name}</option>`)
    .join('');

  const defaultTitle = shipName
    ? `${shipName} : ${from} → ${to}`
    : `Trajet : ${from} → ${to}`;

  const container = document.getElementById('save-trajet-content');
  container.innerHTML = `
    <div style="font-size:0.82rem;margin-bottom:10px;color:#aaa">
      📍 ${from} → ${to} &nbsp;·&nbsp; ${totalDays} jour${totalDays > 1 ? 's' : ''}
      &nbsp;·&nbsp; Date départ : <strong>${startDate} An ${startYear}</strong>
      &nbsp;·&nbsp; Fin estimée : <strong>${endResult.date} An ${endResult.year}</strong>
    </div>
    <div style="margin-bottom:8px">
      <label style="font-size:0.78rem;color:#888;display:block;margin-bottom:3px">Titre</label>
      <input id="st-title" type="text" value="${defaultTitle.replace(/"/g,'&quot;')}" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:5px;font-size:0.85rem">
    </div>
    <div style="margin-bottom:8px">
      <label style="font-size:0.78rem;color:#888;display:block;margin-bottom:3px">Catégorie</label>
      <select id="st-cat" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:5px;font-size:0.85rem">
        <option value="">— Aucune —</option>
        ${catOptions}
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div>
        <label style="font-size:0.78rem;color:#888;display:block;margin-bottom:3px">Date début</label>
        <input id="st-date-start" type="text" value="${startDate}" maxlength="7" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 8px;border-radius:5px;font-size:0.82rem;font-family:monospace">
      </div>
      <div>
        <label style="font-size:0.78rem;color:#888;display:block;margin-bottom:3px">Date fin</label>
        <input id="st-date-end" type="text" value="${endResult.date}" maxlength="7" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 8px;border-radius:5px;font-size:0.82rem;font-family:monospace">
      </div>
    </div>
    <div style="margin-bottom:8px">
      <label style="font-size:0.78rem;color:#888;display:block;margin-bottom:3px">Année galactique</label>
      <input id="st-year" type="number" value="${startYear}" min="1" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:5px;font-size:0.85rem">
    </div>
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
      <input id="st-public" type="checkbox" style="width:16px;height:16px" checked>
      <label for="st-public" style="font-size:0.85rem">Visible par les joueurs</label>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="st-cancel" class="btn-action" style="background:var(--bg);border:1px solid var(--border);color:#aaa">Annuler</button>
      <button id="st-save" class="btn-action" style="background:#5b21b6;border:1px solid #7c3aed;color:#fff">📅 Enregistrer</button>
    </div>`;

  document.getElementById('st-cancel').onclick = () => closeModal('modal-save-trajet');
  document.getElementById('st-save').onclick = () => submitSaveTrajet();
  openModal('modal-save-trajet');
}

async function submitSaveTrajet() {
  const title = document.getElementById('st-title').value.trim();
  const catId = document.getElementById('st-cat').value;
  const dateStart = document.getElementById('st-date-start').value.trim();
  const dateEnd = document.getElementById('st-date-end').value.trim();
  const year = parseInt(document.getElementById('st-year').value);
  const isPublic = document.getElementById('st-public').checked;

  if (!title) { alert('Titre requis.'); return; }
  if (!/^\d{4}\.\d{2}$/.test(dateStart)) { alert('Date début invalide (XXYY.ZZ).'); return; }
  if (dateEnd && !/^\d{4}\.\d{2}$/.test(dateEnd)) { alert('Date fin invalide (XXYY.ZZ).'); return; }
  if (isNaN(year) || year < 1) { alert('Année invalide.'); return; }

  const payload = {
    title,
    date_start: dateStart,
    date_end: dateEnd || null,
    galactic_year: year,
    category_id: catId ? Number(catId) : null,
    is_public: isPublic,
  };

  const btn = document.getElementById('st-save');
  btn.disabled = true;
  btn.textContent = '⏳…';

  try {
    const r = await fetchWithTable('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j?.error?.message || `Erreur ${r.status}`);
    }
    closeModal('modal-save-trajet');
    // Confirmation brief
    const saved = document.createElement('div');
    saved.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#5b21b6;color:#fff;padding:10px 18px;border-radius:8px;font-size:0.85rem;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.4)';
    saved.textContent = '✅ Trajet enregistré dans le calendrier';
    document.body.appendChild(saved);
    setTimeout(() => saved.remove(), 3000);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '📅 Enregistrer';
    alert('Erreur : ' + e.message);
  }
}

function readInputs(legs, pfx) {
  legs.forEach((leg, li) => {
    const ski = document.getElementById(`${pfx}-sk-${li}`);
    if (ski) {
      const newSkill = parseInt(ski.value) || 0;
      if (newSkill !== (leg.skill || 0)) {
        leg.skill = newSkill;
        if (leg._quadrantPath) {
          // HS multi-quadrant : chaque jour a sa propre table
          leg.dailyData.forEach(d => {
            const tbl = d._tableId ? customTables.find(t => t.id === d._tableId) : null;
            d.peril = resolvePeril('hyperspatial', d.baseIndex, newSkill, tbl);
          });
        } else {
          const tbl = leg._tableId ? customTables.find(t => t.id === leg._tableId) : null;
          leg.dailyData.forEach(d => { d.peril = resolvePeril(leg.type, d.baseIndex, newSkill, tbl); });
        }
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
    if (!isMob) switchDesktopTab('itineraire');
  }

  // Show "Enregistrer le trajet" buttons for MJ
  const showSave = isMJ() && getActiveTableId();
  ['btn-save-trajet-desktop', 'btn-save-trajet-mobile'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.style.display = showSave ? '' : 'none';
      btn.onclick = () => openSaveTrajetModal(trip);
    }
  });
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


// ── HELPERS UTILITAIRES ──────────────────────────────────────────────────────
function escH(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ── MODALS ────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
window.openModal = openModal;
window.closeModal = closeModal;

function _factionLabel(name, full) {
  if (!name) return '';
  const f = factions.find(x => x.name === name);
  const url = f?.icon_url || f?.icon || null;
  const abbr = f?.short || f?.abbreviation || null;
  if (url) {
    const displayAbbr = abbr || name;
    return '<img src="' + escH(url) + '" alt="' + escH(displayAbbr) + '" title="' + escH(f.name) + '" style="width:20px;height:20px;border-radius:3px;object-fit:contain;vertical-align:middle;flex-shrink:0">'
         + '<span style="vertical-align:middle;margin-left:3px">' + escH(displayAbbr) + '</span>';
  }
  if (abbr && !full) return escH(abbr);
  return escH(name);
}


// ── EVENTS ────────────────────────────────────────────────────────────────
function initEvents() {
  document.getElementById('btn-historique').addEventListener('click', () => { renderHist(); openModal('modal-historique'); });
  document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.modal)));
  document.querySelectorAll('.modal-backdrop').forEach(bd => bd.addEventListener('click', e => { if (e.target === bd) closeModal(bd.id); }));
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
  document.getElementById('dp-detail-back')?.addEventListener('click', () => {
    document.getElementById('dp-detail-section').style.display = 'none';
    document.getElementById('dp-quad-section').style.display = 'block';
  });
  document.querySelectorAll('.dp-tab').forEach(tab => {
    tab.addEventListener('click', () => switchDesktopTab(tab.dataset.tab));
  });
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

// ── FILE OFFLINE (ship-visibility) ───────────────────────────────────────
let _itinerairePollError = false;

function _itineraireQueueKey() {
  const tableId = getActiveTableId();
  return tableId ? `mj-offline-queue:itineraire:${tableId}` : '';
}

function _isTransientCommitError(err) {
  const status = Number(err?.status || 0);
  if (status >= 400 && status < 500) return false;
  if (status >= 500 || status === 429) return true;
  const msg = String(err?.message || '').toLowerCase();
  return err?.name === 'TypeError' || msg.includes('network') || msg.includes('fetch');
}

const _itineraireQueue = createDeferredCommitQueue({
  delayMs: 8000,
  persistenceKey: _itineraireQueueKey(),
  hydrateEntry: (record) => {
    const p = record?.payload;
    if (!p || p.kind !== 'ship-visibility' || !p.shipId || typeof p.visible !== 'boolean') return null;
    return { label: record.label || 'Reveal ship', payload: p, createdAt: record.createdAt, retainCount: record.retainCount || 0 };
  },
  canAttemptCommit: () => !_itinerairePollError,
  retainOnCommitError: (_entry, err) => _itinerairePollError || _isTransientCommitError(err),
  commitFn: async (entry) => {
    const { kind, shipId, visible } = entry.payload || {};
    if (kind === 'ship-visibility') {
      const res = await fetchWithTable(`/api/visibility/ships/${shipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible }),
        credentials: 'include'
      });
      if (!res.ok) {
        const e = new Error(`HTTP ${res.status}`);
        e.status = res.status;
        throw e;
      }
    }
  }
});

// ── INIT ──────────────────────────────────────────────────────────────────
async function init() {
  // Auth check (non-bloquant pour cette page publique)
  try { await initAuthUI(); } catch {}

  // Campaign date (non-bloquant — affichée en entête si table active)
  try {
    const calRes = await fetchWithTable('/api/calendar/state');
    if (calRes?.ok) {
      const calJson = await calRes.json().catch(() => null);
      campaignDateState = calJson?.data ?? calJson ?? null;
      const badge = document.getElementById('header-campaign-date');
      if (badge && campaignDateState?.date) {
        badge.textContent = `📅 ${campaignDateState.date} — An ${campaignDateState.year}`;
        badge.classList.remove('hidden');
        badge.style.display = '';
      }
    }
  } catch { /* silent */ }

  await loadData();

  // Restaurer la file d'entrées différées persistées (ex : visibilité vaisseau hors-ligne)
  _itineraireQueue.restorePersisted();

  // Poller — reconnexion → rejouer la file
  createPoller({
    enableErrorBackoff: true,
    retryBaseMs: 1000,
    retryMaxMs: 30000,
    onError: () => { _itinerairePollError = true; },
    onReconnect: async () => {
      _itinerairePollError = false;
      if (_itineraireQueue.pendingCount() > 0) {
        await _itineraireQueue.drainNow({ stopOnError: true, reason: 'reconnect' });
      }
    },
    onData: () => { _itinerairePollError = false; }
  }).start();

  populateShipSelect();
  initCarte();
  initPanZoom();
  initEvents();
  updateDesktopPointsList();
  // Center on active ship position, or default center
  if (activeShip?.position?.quadrant) {
    centerOnCoord(activeShip.position.quadrant);
  } else {
    centerMap();
  }
  // Onglet Carte actif par défaut + hint vaisseau dans l'état vide
  switchDesktopTab('carte');
  const hint = document.getElementById('dp-ship-hint');
  if (hint && activeShip) {
    const pos = activeShip.position?.quadrant;
    hint.textContent = `🚀 ${activeShip.name || activeShip.nom}${pos ? ` · ${pos}` : ''}`;
    hint.style.display = 'block';
  }
}

// Importing poller.js (top-level await) makes this module async, so DOMContentLoaded
// may have already fired by the time the module body executes. Guard against this.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

