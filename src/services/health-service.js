/**
 * health-service.js — Logique de santé réutilisable pour PJ et PNJ nommés.
 *
 * Exporté comme module ESM pour usage dans les routes et services.
 * Aucune dépendance DB — logique pure.
 */

/**
 * Compute the health template structure for a character.
 *
 * Règle Metal Adventures :
 *   - niveaux niveaux de santé (défaut 3)
 *   - Chaque niveau contient (CAR + SF) cases, toutes initialement 'vide'
 *
 * @param {{ car: number, sf: number, niveaux?: number }} params
 * @returns {{ niveaux: Array<{ cases: Array<{ etat: 'vide'|'cochee'|'noircie' }> }> }}
 */
export function computeHealthTemplate({ car, sf, niveaux = 3 }) {
  const casesPerLevel = Math.max(1, (Number(car) || 0) + (Number(sf) || 0));
  const emptyCase = () => ({ etat: 'vide' });

  return {
    niveaux: Array.from({ length: Number(niveaux) || 3 }, () => ({
      cases: Array.from({ length: casesPerLevel }, emptyCase),
    })),
  };
}

/**
 * Compute the maximum Énergie X for a mutant character.
 *
 * Règle : PER + INT
 *
 * @param {{ per: number, int: number }} params
 * @returns {number}
 */
export function computeEnergyXMax({ per, int: intel }) {
  return Math.max(0, (Number(per) || 0) + (Number(intel) || 0));
}

/**
 * Get the current health state of a character (derived from sante_json).
 *
 * @param {string|null} santeJson  — serialized health template
 * @returns {{ niveaux: Array }|null}
 */
export function getHealthState(santeJson) {
  if (!santeJson) return null;
  try {
    return JSON.parse(santeJson);
  } catch {
    return null;
  }
}

/**
 * Set the state of a single health case and return the updated template.
 *
 * @param {string|null} santeJson         — current serialized health template
 * @param {number}      niveauIndex       — 0-based level index
 * @param {number}      caseIndex         — 0-based case index within the level
 * @param {'vide'|'cochee'|'noircie'} etat
 * @returns {{ ok: true, updated: string }|{ ok: false, error: string }}
 */
export function setHealthCase(santeJson, niveauIndex, caseIndex, etat) {
  const VALID_ETATS = ['vide', 'cochée', 'noircie'];
  if (!VALID_ETATS.includes(etat)) {
    return { ok: false, error: `État invalide : "${etat}". Valeurs autorisées : ${VALID_ETATS.join(', ')}` };
  }

  const state = getHealthState(santeJson);
  if (!state || !Array.isArray(state.niveaux)) {
    return { ok: false, error: 'sante_json invalide ou absent' };
  }

  const niveau = state.niveaux[niveauIndex];
  if (!niveau) {
    return { ok: false, error: `Niveau d'index ${niveauIndex} introuvable` };
  }
  if (!Array.isArray(niveau.cases) || niveau.cases[caseIndex] === undefined) {
    return { ok: false, error: `Case d'index ${caseIndex} introuvable dans le niveau ${niveauIndex}` };
  }

  niveau.cases[caseIndex].etat = etat;
  return { ok: true, updated: JSON.stringify(state) };
}
