/**
 * api.js — Client API partagé par toutes les pages du site.
 * Gère l'authentification, la sélection de table, et les appels CRUD.
 * 
 * Usage dans une page HTML:
 *   <script src="/js/api.js"></script>
 *   <script>
 *     const data = await MA.init();  // Login + sélection table + charge toutes les données
 *     // data = { quadrants, factions, shipModels, ships, activeShipId, perilsData, ... }
 *   </script>
 */
const MA = (() => {
  let _user = null;
  let _tableId = null;
  let _tableName = null;

  // ── HTTP helpers ──
  async function _fetch(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (res.status === 401) {
      _user = null;
      throw new Error('Non authentifié');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
    return json;
  }

  const GET = url => _fetch(url);
  const POST = (url, body) => _fetch(url, { method: 'POST', body });
  const PUT = (url, body) => _fetch(url, { method: 'PUT', body });
  const DEL = url => _fetch(url, { method: 'DELETE' });

  // ── Auth ──
  async function login(username, password) {
    const r = await POST('/api/auth/login', { username, password });
    _user = r.user;
    return _user;
  }

  async function register(username, password, displayName, role) {
    const r = await POST('/api/auth/register', { username, password, displayName, role });
    _user = r.user;
    return _user;
  }

  async function logout() {
    await POST('/api/auth/logout');
    _user = null;
    _tableId = null;
  }

  async function getMe() {
    try {
      const r = await GET('/api/auth/me');
      _user = r.user;
      return _user;
    } catch { _user = null; return null; }
  }

  function user() { return _user; }
  function isMJ() { return _user?.role === 'mj'; }
  function tableId() { return _tableId; }

  // ── Table selection ──
  async function listTables() { return GET('/api/tables'); }

  async function createTable(name) {
    const r = await POST('/api/tables', { name });
    return r;
  }

  function selectTable(id, name) {
    _tableId = id;
    _tableName = name || '';
    localStorage.setItem('ma_lastTableId', id);
  }

  // ── Bulk load ──
  async function loadAll() {
    if (!_tableId) throw new Error('Aucune table sélectionnée');
    return GET(`/api/data/t/${_tableId}/all`);
  }

  // ── Systems ──
  async function saveSystemsForQuadrant(coord, systemsArray) {
    return PUT(`/api/data/systems/${coord}`, { systems: systemsArray });
  }

  async function addSystem(coord, system) {
    return POST(`/api/data/systems/${coord}`, system);
  }

  async function updateSystem(coord, nom, system) {
    return PUT(`/api/data/systems/${encodeURIComponent(coord)}/${encodeURIComponent(nom)}`, system);
  }

  async function deleteSystem(coord, nom) {
    return DEL(`/api/data/systems/${encodeURIComponent(coord)}/${encodeURIComponent(nom)}`);
  }

  // ── Factions ──
  async function saveFaction(faction) {
    return POST('/api/data/factions', faction);
  }

  async function updateFaction(name, data) {
    return PUT(`/api/data/factions/${encodeURIComponent(name)}`, data);
  }

  async function deleteFaction(name) {
    return DEL(`/api/data/factions/${encodeURIComponent(name)}`);
  }

  // ── Ship models ──
  async function saveShipModel(model) {
    if (model.id) {
      try { return await PUT(`/api/data/ship-models/${model.id}`, model); }
      catch { return POST('/api/data/ship-models', model); }
    }
    return POST('/api/data/ship-models', model);
  }

  async function deleteShipModel(id) {
    return DEL(`/api/data/ship-models/${id}`);
  }

  // ── Ships (per table) ──
  async function saveShip(ship) {
    if (!_tableId) throw new Error('Aucune table');
    try { return await PUT(`/api/data/t/${_tableId}/ships/${ship.id}`, ship); }
    catch { return POST(`/api/data/t/${_tableId}/ships`, ship); }
  }

  async function deleteShip(id) {
    return DEL(`/api/data/t/${_tableId}/ships/${id}`);
  }

  async function setActiveShip(shipId) {
    return PUT(`/api/data/t/${_tableId}/active-ship`, { shipId });
  }

  // ── Perils ──
  async function savePerilAssignment(type, key, perilTableId) {
    return PUT(`/api/data/t/${_tableId}/peril-assignments`, { type, key, perilTableId });
  }

  async function saveCustomPerilTable(table) {
    return POST(`/api/data/t/${_tableId}/peril-tables`, table);
  }

  async function deleteCustomPerilTable(id) {
    return DEL(`/api/data/t/${_tableId}/peril-tables/${id}`);
  }

  // ── History ──
  async function saveTrip(tripData) {
    return POST(`/api/data/t/${_tableId}/history`, tripData);
  }

  async function deleteTrip(id) {
    return DEL(`/api/data/t/${_tableId}/history/${id}`);
  }

  // ── Table management ──
  async function getTableDetails() {
    return GET(`/api/tables/${_tableId}`);
  }

  async function updateTable(data) {
    return PUT(`/api/tables/${_tableId}`, data);
  }

  async function addMember(username) {
    return POST(`/api/tables/${_tableId}/members`, { username });
  }

  async function removeMember(userId) {
    return DEL(`/api/tables/${_tableId}/members/${userId}`);
  }

  // ── Visibility ──
  async function getVisibility() {
    return GET(`/api/tables/${_tableId}/visibility`);
  }

  async function setVisibility(rules) {
    return PUT(`/api/tables/${_tableId}/visibility`, { rules });
  }

  // ── Backup ──
  async function backupFull() {
    const r = await GET('/api/backup/full');
    _downloadJSON(r, `ma-backup-full-${Date.now()}.json`);
  }

  async function backupTable() {
    const r = await GET(`/api/backup/table/${_tableId}`);
    _downloadJSON(r, `ma-backup-table-${_tableName || _tableId}-${Date.now()}.json`);
  }

  async function restoreFull(jsonData) {
    return POST('/api/backup/restore-full', jsonData);
  }

  async function restoreTable(jsonData) {
    return POST(`/api/backup/restore-table/${_tableId}`, jsonData);
  }

  async function resetTable() {
    return POST(`/api/backup/reset-table/${_tableId}`);
  }

  function _downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Init: login check + table selection ──
  // Retourne un objet { user, tableId } ou null si pas connecté
  async function init() {
    _user = await getMe();
    if (!_user) return null;
    // Restaurer la dernière table
    const lastId = localStorage.getItem('ma_lastTableId');
    if (lastId) {
      _tableId = parseInt(lastId);
      _tableName = '';
    }
    return { user: _user, tableId: _tableId };
  }

  // ── Migration: envoie les données localStorage vers le serveur ──
  async function migrateFromLocalStorage() {
    if (!_tableId || !isMJ()) throw new Error('Table requise + droits MJ');

    // Quadrants
    const qRaw = localStorage.getItem('quadrantsMA');
    if (qRaw) {
      const donnees = JSON.parse(qRaw);
      for (const [coord, systems] of Object.entries(donnees)) {
        if (Array.isArray(systems) && systems.length) {
          await PUT(`/api/data/systems/${coord}`, { systems });
        }
      }
    }

    // Factions
    const fRaw = localStorage.getItem('factions');
    if (fRaw) {
      const factions = JSON.parse(fRaw);
      for (const f of factions) await POST('/api/data/factions', f).catch(() => {});
    }

    // Ship models
    const smRaw = localStorage.getItem('shipModels');
    if (smRaw) {
      const models = JSON.parse(smRaw);
      for (const m of models) await POST('/api/data/ship-models', m).catch(() => {});
    }

    // Ships
    const scRaw = localStorage.getItem('shipCatalog');
    if (scRaw) {
      const ships = JSON.parse(scRaw);
      for (const s of ships) await POST(`/api/data/t/${_tableId}/ships`, s).catch(() => {});
    }

    // Active ship
    const asId = localStorage.getItem('activeShipId');
    if (asId) await setActiveShip(asId).catch(() => {});

    // Custom peril tables
    const ctRaw = localStorage.getItem('customPerilTables');
    if (ctRaw) {
      const tables = JSON.parse(ctRaw);
      for (const t of tables) await POST(`/api/data/t/${_tableId}/peril-tables`, t).catch(() => {});
    }

    // Peril assignments
    const paRaw = localStorage.getItem('perilAssignments');
    if (paRaw) {
      const pa = JSON.parse(paRaw);
      for (const [key, val] of Object.entries(pa.systems || {})) {
        await PUT(`/api/data/t/${_tableId}/peril-assignments`, { type: 'system', key, perilTableId: val }).catch(() => {});
      }
      for (const [key, val] of Object.entries(pa.quadrants || {})) {
        await PUT(`/api/data/t/${_tableId}/peril-assignments`, { type: 'quadrant', key, perilTableId: val }).catch(() => {});
      }
    }

    // History
    const hRaw = localStorage.getItem('itineraireHistorique');
    if (hRaw) {
      const history = JSON.parse(hRaw);
      for (const h of history) await POST(`/api/data/t/${_tableId}/history`, h).catch(() => {});
    }

    return { ok: true, message: 'Migration terminée' };
  }

  return {
    // Auth
    login, register, logout, getMe, user, isMJ, init,
    // Tables
    listTables, createTable, selectTable, tableId,
    getTableDetails, updateTable, addMember, removeMember,
    // Bulk
    loadAll,
    // Systems
    saveSystemsForQuadrant, addSystem, updateSystem, deleteSystem,
    // Factions
    saveFaction, updateFaction, deleteFaction,
    // Ship models
    saveShipModel, deleteShipModel,
    // Ships
    saveShip, deleteShip, setActiveShip,
    // Perils
    savePerilAssignment, saveCustomPerilTable, deleteCustomPerilTable,
    // History
    saveTrip, deleteTrip,
    // Visibility
    getVisibility, setVisibility,
    // Backup
    backupFull, backupTable, restoreFull, restoreTable, resetTable,
    // Migration
    migrateFromLocalStorage
  };
})();
