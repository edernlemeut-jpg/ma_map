import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHealthTemplate,
  computeEnergyXMax,
  getHealthState,
  setHealthCase,
} from '../../src/services/health-service.js';

describe('computeHealthTemplate', () => {
  it('valeurs normales : car=4, sf=3, niveaux=3 → 3 niveaux × 7 cases vide', () => {
    const result = computeHealthTemplate({ car: 4, sf: 3, niveaux: 3 });
    assert.equal(result.niveaux.length, 3);
    for (const niveau of result.niveaux) {
      assert.equal(niveau.cases.length, 7);
      for (const c of niveau.cases) {
        assert.equal(c.etat, 'vide');
      }
    }
  });

  it('valeurs min : car=1, sf=1, niveaux=1 → 1 niveau × 2 cases', () => {
    const result = computeHealthTemplate({ car: 1, sf: 1, niveaux: 1 });
    assert.equal(result.niveaux.length, 1);
    assert.equal(result.niveaux[0].cases.length, 2);
    assert.equal(result.niveaux[0].cases[0].etat, 'vide');
  });

  it('valeurs max : car=6, sf=5, niveaux=4 → 4 niveaux × 11 cases', () => {
    const result = computeHealthTemplate({ car: 6, sf: 5, niveaux: 4 });
    assert.equal(result.niveaux.length, 4);
    for (const niveau of result.niveaux) {
      assert.equal(niveau.cases.length, 11);
    }
  });

  it('niveaux non fourni : default 3', () => {
    const result = computeHealthTemplate({ car: 3, sf: 2 });
    assert.equal(result.niveaux.length, 3);
    assert.equal(result.niveaux[0].cases.length, 5);
  });

  it('chaque niveau a ses propres cases indépendantes (pas de référence partagée)', () => {
    const result = computeHealthTemplate({ car: 2, sf: 2, niveaux: 2 });
    result.niveaux[0].cases[0].etat = 'cochee';
    assert.equal(result.niveaux[1].cases[0].etat, 'vide');
  });
});

describe('computeEnergyXMax', () => {
  it('per=3, int=2 → 5', () => {
    assert.equal(computeEnergyXMax({ per: 3, int: 2 }), 5);
  });

  it('per=0, int=0 → 0', () => {
    assert.equal(computeEnergyXMax({ per: 0, int: 0 }), 0);
  });

  it('per=5, int=5 → 10', () => {
    assert.equal(computeEnergyXMax({ per: 5, int: 5 }), 10);
  });
});

describe('getHealthState', () => {
  it('retourne le template parsé depuis un JSON valide', () => {
    const tpl = computeHealthTemplate({ car: 3, sf: 2, niveaux: 2 });
    const json = JSON.stringify(tpl);
    const result = getHealthState(json);
    assert.deepEqual(result, tpl);
  });

  it('retourne null si santeJson est null', () => {
    assert.equal(getHealthState(null), null);
  });

  it('retourne null si JSON invalide', () => {
    assert.equal(getHealthState('{invalide}'), null);
  });
});

describe('setHealthCase', () => {
  function fresh() {
    return JSON.stringify(computeHealthTemplate({ car: 4, sf: 3, niveaux: 3 }));
  }

  it('coche une case valide → ok:true, JSON mis à jour', () => {
    const r = setHealthCase(fresh(), 0, 0, 'cochée');
    assert.equal(r.ok, true);
    const state = JSON.parse(r.updated);
    assert.equal(state.niveaux[0].cases[0].etat, 'cochée');
  });

  it('noircit une case → etat=noircie dans le JSON retourné', () => {
    const r = setHealthCase(fresh(), 1, 3, 'noircie');
    assert.equal(r.ok, true);
    const state = JSON.parse(r.updated);
    assert.equal(state.niveaux[1].cases[3].etat, 'noircie');
  });

  it('remet à vide → etat=vide', () => {
    let j = fresh();
    j = setHealthCase(j, 0, 0, 'cochée').updated;
    const r = setHealthCase(j, 0, 0, 'vide');
    assert.equal(r.ok, true);
    const state = JSON.parse(r.updated);
    assert.equal(state.niveaux[0].cases[0].etat, 'vide');
  });

  it('état invalide → ok:false avec message explicite', () => {
    const r = setHealthCase(fresh(), 0, 0, 'blessé');
    assert.equal(r.ok, false);
    assert.match(r.error, /État invalide/);
  });

  it('niveau hors-limites → ok:false', () => {
    const r = setHealthCase(fresh(), 99, 0, 'cochée');
    assert.equal(r.ok, false);
    assert.match(r.error, /introuvable/);
  });

  it('case hors-limites → ok:false', () => {
    const r = setHealthCase(fresh(), 0, 99, 'cochée');
    assert.equal(r.ok, false);
    assert.match(r.error, /introuvable/);
  });

  it('santeJson null → ok:false', () => {
    const r = setHealthCase(null, 0, 0, 'cochee');
    assert.equal(r.ok, false);
    assert.match(r.error, /invalide/);
  });
});
