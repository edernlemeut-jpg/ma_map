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

  // Auto-extension : si le sante_json a été créé avec moins de niveaux ou de cases
  // que nécessaire (ex : 3 niveaux au lieu de 4, ou moins de cases que car+sf actuel),
  // on étend en ajoutant des cases "vide".
  const existingCasesLen = state.niveaux[0]?.cases?.length || 1;
  while (state.niveaux.length <= niveauIndex) {
    state.niveaux.push({ cases: Array.from({ length: existingCasesLen }, () => ({ etat: 'vide' })) });
  }
  const niveau = state.niveaux[niveauIndex];
  if (!Array.isArray(niveau.cases)) niveau.cases = [];
  while (niveau.cases.length <= caseIndex) {
    niveau.cases.push({ etat: 'vide' });
  }

  niveau.cases[caseIndex].etat = etat;
  return { ok: true, updated: JSON.stringify(state) };
}
