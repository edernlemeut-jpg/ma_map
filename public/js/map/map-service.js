/**
 * Load systems from API
 */
export async function loadSystems() {
  try {
    const res = await fetch('/api/compendium/systems', {
      credentials: 'include'
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    console.error('Failed to load systems');
    return [];
  }
}

/**
 * Load quadrants from API
 */
export async function loadQuadrants() {
  try {
    const res = await fetch('/api/compendium/quadrants', {
      credentials: 'include'
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    console.error('Failed to load quadrants');
    return [];
  }
}

/**
 * Parse quadrant name in Greek-letter grid format to [colIndex, rowIndex]
 * Format: "Κ-8" → [9, 32], "Α′-29" → [24, 11]
 * Uses the same 40-letter Greek array as itineraire.js
 */
const _LETTRES_MA = ["Α","Β","Γ","Δ","Ε","Ζ","Η","Θ","Ι","Κ","Λ","Μ","Ν","Ξ","Ο","Π","Ρ","Σ","Τ","Υ","Φ","Χ","Ψ","Ω","Α′","Β′","Γ′","Δ′","Ε′","Ζ′","Η′","Θ′","Ι′","Κ′","Λ′","Μ′","Ν′","Ξ′","Ο′","Π′"];

export function parseQuadrantCoords(quadrantName) {
  const dashIdx = quadrantName.lastIndexOf('-');
  if (dashIdx === -1) return [0, 0];
  const letter = quadrantName.slice(0, dashIdx);
  const number = parseInt(quadrantName.slice(dashIdx + 1), 10);
  const colIndex = _LETTRES_MA.indexOf(letter);
  if (colIndex === -1) return [0, 0];
  return [colIndex, 40 - number];
}

/**
 * Position system within its quadrant (pseudo-random, deterministic)
 * Based on system ID hash
 */
export function getSystemPosition(system, quadrantPos, cellSize = 200) {
  // Hash the system name to deterministic offset within cell
  let hash = 0;
  for (let i = 0; i < system.nom.length; i++) {
    hash = ((hash << 5) - hash) + system.nom.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit int
  }
  
  const randomOffset = Math.abs(hash) % 100;
  const angle = (randomOffset / 100) * Math.PI * 2;
  const radius = 30 + (randomOffset % 40);
  
  const quadrantX = quadrantPos[0] * cellSize + cellSize / 2;
  const quadrantY = quadrantPos[1] * cellSize + cellSize / 2;
  
  return {
    x: quadrantX + Math.cos(angle) * radius,
    y: quadrantY + Math.sin(angle) * radius
  };
}

/**
 * Get color for faction
 */
export function getFactionColor(faction) {
  if (!faction) return '#666666';
  
  const colors = {
    'Empire': '#ef4444',
    'Alliance': '#3b82f6',
    'Corporations': '#eab308',
    'Indépendant': '#10b981',
    'Pirate': '#8b5cf6',
    'Xenos': '#ec4899'
  };
  
  return colors[faction] || '#9ca3af';
}

/**
 * Validate system fields before save
 */
export function validateSystemUpdate(system) {
  const errors = [];
  
  if (!system.nom || system.nom.trim() === '') {
    errors.push('Le nom du système est requis');
  }
  
  if (system.nom && system.nom.length > 255) {
    errors.push('Le nom ne peut pas dépasser 255 caractères');
  }
  
  if (system.gouvernement && system.gouvernement.length > 255) {
    errors.push('Le gouvernement ne peut pas dépasser 255 caractères');
  }
  
  if (system.route && system.route.length > 255) {
    errors.push('La route ne peut pas dépasser 255 caractères');
  }
  
  if (system.description && system.description.length > 2000) {
    errors.push('La description ne peut pas dépasser 2000 caractères');
  }
  
  return errors;
}

/**
 * Save system update via API
 */
export async function saveSystemUpdate(systemId, updates) {
  try {
    const res = await fetch(`/api/compendium/systems/${systemId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: 'Erreur lors de la sauvegarde' } }));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    
    const json = await res.json();
    return { success: true, system: json.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get all factions for validation
 */
export async function loadFactions() {
  try {
    const res = await fetch('/api/compendium/factions', {
      credentials: 'include'
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []).map(f => f.name);
  } catch {
    return [];
  }
}

/**
 * Determine connection indicator state from polling metrics.
 */
export function getConnectionState({ lastPollTime, pollFailureCount, syncing = false, now = Date.now() }) {
  const ageMs = now - lastPollTime;
  const isOffline = pollFailureCount >= 2 || ageMs > 15000;
  const isFresh = ageMs < 5000;
  if (isOffline) return 'offline';
  if (syncing) return 'syncing';
  if (!isFresh) return 'syncing';
  return 'connected';
}

/**
 * Run a full systems refresh when a sync version jump is detected.
 * Retries with exponential backoff (1s, 2s, 4s...) up to maxDelayMs.
 */
export async function handleVersionJump(currentVersion, newVersion, refreshFn, options = {}) {
  const {
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    maxAttempts = 6,
    sleepFn = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    onRetry = () => {},
    onFailure = () => {}
  } = options;

  if (!Number.isInteger(currentVersion) || !Number.isInteger(newVersion) || newVersion - currentVersion <= 1) {
    return { jumped: false, refreshed: false, version: currentVersion, systems: null, attempts: 0 };
  }

  if (typeof refreshFn !== 'function') {
    throw new Error('handleVersionJump requires a refresh function');
  }

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const systems = await refreshFn();
      return { jumped: true, refreshed: true, version: newVersion, systems, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      const delayMs = Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
      onRetry({ attempt, delayMs, error: err });
      await sleepFn(delayMs);
    }
  }

  onFailure(lastError);
  throw lastError;
}

