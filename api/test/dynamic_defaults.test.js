// Tests des défauts dynamiques (colonne H du master) : parseur du script scrap + résolveur API.
// Lancer : npm test (aucune connexion MongoDB nécessaire, IndicatorValue.find est simulé en mémoire).
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const IndicatorValue = require('../src/models/indicator_value');
const { resolveDynamicDefaults } = require('../src/utils/indicators');
const { parseDefaultSourceFormula } = require('../script/scrap_indicator_excel');

// ---------- Parseur ----------
const INIT = 'Remplissage - Sit. Init.';
const REF = 'Remplissage - Sit. Ref.';
const EXPOST = 'Remplissage - Sit. Expost';
const rowMaps = new Map([
  ['init', new Map([[1108, 'ALVitMax'], [1113, 'LogChantCat1ApproDirectDist'], [1114, 'LogChantCat1ApproDirectVol'], [1727, 'EComInitDistUniqLivDir'], [2191, 'EComInitPM'], [1346, 'RepModCatRep1Dist']])],
  ['ref', new Map([[1079, 'RepMobEvolKmCat1'], [1191, 'LogChantCat1ApproDirectDist']])],
  ['expost', new Map([[1112, 'LogChantCat1ApproDirectDist']])],
]);
const parse = (formula, situation, getCellValue = null, unit = null) => parseDefaultSourceFormula(formula, situation, rowMaps.get(situation), rowMaps, getCellValue, unit);

describe('parseDefaultSourceFormula', () => {
  test('référence directe vers la colonne F d’une autre feuille', () => {
    assert.deepEqual(parse(`='${INIT}'!F1108`, 'ref'), { excel_indicator_id: 'ALVitMax', situation: 'init' });
  });
  test('référence absolue $F$', () => {
    assert.deepEqual(parse(`='${INIT}'!$F$1108`, 'expost'), { excel_indicator_id: 'ALVitMax', situation: 'init' });
  });
  test('référence même feuille', () => {
    assert.deepEqual(parse('=F1079', 'ref'), { excel_indicator_id: 'RepMobEvolKmCat1', situation: 'ref' });
  });
  test('coefficient multiplicateur', () => {
    assert.deepEqual(parse(`='${INIT}'!F1727*0.8`, 'ref'), { excel_indicator_id: 'EComInitDistUniqLivDir', situation: 'init', factor: 0.8 });
  });
  test('coefficient 1 ignoré', () => {
    assert.deepEqual(parse(`='${INIT}'!F1727*1`, 'ref'), { excel_indicator_id: 'EComInitDistUniqLivDir', situation: 'init' });
  });
  test('offset positif sur indicateur en % : converti en points (×100)', () => {
    assert.deepEqual(parse(`='${INIT}'!F2191+0.05`, 'ref', null, '%'), { excel_indicator_id: 'EComInitPM', situation: 'init', offset: 5 });
  });
  test('offset négatif sur indicateur en %', () => {
    assert.deepEqual(parse(`='${INIT}'!F2191-0.1`, 'ref', null, '%'), { excel_indicator_id: 'EComInitPM', situation: 'init', offset: -10 });
  });
  test('offset sur indicateur non % : brut', () => {
    assert.deepEqual(parse(`='${INIT}'!F1727+2.5`, 'ref', null, 'km'), { excel_indicator_id: 'EComInitDistUniqLivDir', situation: 'init', offset: 2.5 });
  });
  test('croissance : F × (1 + F évolution)', () => {
    assert.deepEqual(parse(`='${INIT}'!F1346*(1+'${REF}'!F1079)`, 'expost'), {
      excel_indicator_id: 'RepModCatRep1Dist',
      situation: 'init',
      growth_source: { excel_indicator_id: 'RepMobEvolKmCat1', situation: 'ref' },
    });
  });
  test('INDEX avec compteur R lu en valeur (R=1, ×2-1 → première ligne)', () => {
    const getCellValue = (row, col) => (col === 'R' && row === 1112 ? 1 : null);
    assert.deepEqual(parse(`=INDEX('${INIT}'!$F$1113:$F$1202, '${EXPOST}'!R1112*2-1)`, 'expost', getCellValue), { excel_indicator_id: 'LogChantCat1ApproDirectDist', situation: 'init' });
  });
  test('INDEX ×2 sans décalage → deuxième ligne', () => {
    const getCellValue = (row, col) => (col === 'R' ? 1 : null);
    assert.deepEqual(parse(`=INDEX('${INIT}'!$F$1113:$F$1202, R1112*2)`, 'expost', getCellValue), { excel_indicator_id: 'LogChantCat1ApproDirectVol', situation: 'init' });
  });
  test('INDEX hors plage → statique', () => {
    const getCellValue = () => 500;
    assert.equal(parse(`=INDEX('${INIT}'!$F$1113:$F$1202, R1112*2)`, 'expost', getCellValue), null);
  });
  test('INDEX sans valeur R → statique', () => {
    assert.equal(parse(`=INDEX('${INIT}'!$F$1113:$F$1202, R1112*2)`, 'expost', () => ''), null);
  });
  test('référence à la colonne G (liste de choix) → statique', () => {
    assert.equal(parse('=G1108', 'init'), null);
  });
  test('référence à la colonne H (défaut d’un autre indicateur) → statique', () => {
    assert.equal(parse(`='${INIT}'!H1108`, 'ref'), null);
    assert.equal(parse('=$H$1108', 'init'), null);
  });
  test('VLOOKUP Parcs types → statique', () => {
    assert.equal(parse(`=VLOOKUP(G473,'Parcs types'!$C$68:$M$123,7,FALSE)`, 'init'), null);
  });
  test('ligne source sans identifiant → statique', () => {
    assert.equal(parse(`='${INIT}'!F9999`, 'ref'), null);
  });
  test('valeur littérale ou vide → statique', () => {
    assert.equal(parse('50', 'ref'), null);
    assert.equal(parse('', 'ref'), null);
    assert.equal(parse(undefined, 'ref'), null);
  });
});

// ---------- Résolveur ----------
const baseIV = { collectivity_id: 'coll1', collectivity_name: 'Coll 1', owner: 'collectivity', year: 2024 };
const makeIV = (over) => new IndicatorValue({ ...baseIV, indicator_type: 'number', ...over });

let store = [];
const originalFind = IndicatorValue.find;
const matches = (doc, query) => Object.entries(query).every(([k, v]) => (v && typeof v === 'object' && '$in' in v ? v.$in.includes(doc[k]) : doc[k] === v));

describe('resolveDynamicDefaults', () => {
  beforeEach(() => {
    store = [];
    IndicatorValue.find = async (query) => store.filter((d) => matches(d, query));
  });
  afterEach(() => {
    IndicatorValue.find = originalFind;
  });

  test('défaut = valeur init saisie (B2 ALVitMax)', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'ALVitMax', situation: 'init', value: { number: 30 } }));
    const ref = makeIV({ action_id: 'a1', indicator_excel_id: 'ALVitMax', situation: 'ref', value_default: { number: 0 }, indicator_value_default_source: { excel_indicator_id: 'ALVitMax', situation: 'init' } });
    await resolveDynamicDefaults([ref]);
    assert.equal(ref.value_default.number, 30);
  });

  test('coefficient : 10 km × 0,8 = 8 km (C9)', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'EComInitDistUniqLivDir', situation: 'init', value: { number: 10 } }));
    const ref = makeIV({ action_id: 'a1', indicator_excel_id: 'EComRéfDistUniqLivDir', situation: 'ref', indicator_value_default_source: { excel_indicator_id: 'EComInitDistUniqLivDir', situation: 'init', factor: 0.8 } });
    await resolveDynamicDefaults([ref]);
    assert.equal(ref.value_default.number, 8);
  });

  test('offset : part modale 40 % + 5 points = 45 % (C9)', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'EComInitPM', situation: 'init', value: { number: 40 }, indicator_value_unit: '%' }));
    const ref = makeIV({ action_id: 'a1', indicator_excel_id: 'EComRéfPM', situation: 'ref', indicator_value_unit: '%', indicator_value_default_source: { excel_indicator_id: 'EComInitPM', situation: 'init', offset: 5 } });
    await resolveDynamicDefaults([ref]);
    assert.equal(ref.value_default.number, 45);
  });

  test('offset négatif : 40 % − 10 points = 30 %', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'EComInitPM', situation: 'init', value: { number: 40 } }));
    const ref = makeIV({ action_id: 'a1', indicator_excel_id: 'EComRéfPM', situation: 'ref', indicator_value_default_source: { excel_indicator_id: 'EComInitPM', situation: 'init', offset: -10 } });
    await resolveDynamicDefaults([ref]);
    assert.equal(ref.value_default.number, 30);
  });

  test('croissance : 1000 km × (1 + 10 %) = 1100 km (C2 expost)', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'RepModCatRep1Dist', situation: 'init', value: { number: 1000 } }));
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'RepMobEvolKmCat1', situation: 'ref', value: { number: 10 }, indicator_value_unit: '%' }));
    const expost = makeIV({ action_id: 'a1', indicator_excel_id: 'RepModCatRep1Dist', situation: 'expost', indicator_value_default_source: { excel_indicator_id: 'RepModCatRep1Dist', situation: 'init', growth_source: { excel_indicator_id: 'RepMobEvolKmCat1', situation: 'ref' } } });
    await resolveDynamicDefaults([expost]);
    assert.equal(expost.value_default.number, 1100);
  });

  test('croissance négative : 1000 × (1 − 25 %) = 750', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'RepModCatRep1Dist', situation: 'init', value: { number: 1000 } }));
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'RepMobEvolKmCat1', situation: 'ref', value: { number: -25 }, indicator_value_unit: '%' }));
    const expost = makeIV({ action_id: 'a1', indicator_excel_id: 'RepModCatRep1Dist', situation: 'expost', indicator_value_default_source: { excel_indicator_id: 'RepModCatRep1Dist', situation: 'init', growth_source: { excel_indicator_id: 'RepMobEvolKmCat1', situation: 'ref' } } });
    await resolveDynamicDefaults([expost]);
    assert.equal(expost.value_default.number, 750);
  });

  test('croissance non saisie → défaut = valeur init (Excel lit 0)', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'RepModCatRep1Dist', situation: 'init', value: { number: 1000 } }));
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'RepMobEvolKmCat1', situation: 'ref', value: { number: null }, indicator_value_unit: '%' }));
    const expost = makeIV({ action_id: 'a1', indicator_excel_id: 'RepModCatRep1Dist', situation: 'expost', indicator_value_default_source: { excel_indicator_id: 'RepModCatRep1Dist', situation: 'init', growth_source: { excel_indicator_id: 'RepMobEvolKmCat1', situation: 'ref' } } });
    await resolveDynamicDefaults([expost]);
    assert.equal(expost.value_default.number, 1000);
  });

  test('source vide → défaut vidé (pas de valeur figée)', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'ALVitMax', situation: 'init', value: { number: null } }));
    const ref = makeIV({ action_id: 'a1', indicator_excel_id: 'ALVitMax', situation: 'ref', value_default: { number: 50 }, indicator_value_default_source: { excel_indicator_id: 'ALVitMax', situation: 'init' } });
    await resolveDynamicDefaults([ref]);
    assert.equal(ref.value_default.number, null);
  });

  test('source introuvable → défaut inchangé', async () => {
    const ref = makeIV({ action_id: 'a1', indicator_excel_id: 'ALVitMax', situation: 'ref', value_default: { number: 50 }, indicator_value_default_source: { excel_indicator_id: 'ALVitMax', situation: 'init' } });
    await resolveDynamicDefaults([ref]);
    assert.equal(ref.value_default.number, 50);
  });

  test('préfère l’IV source de la même action (indicateurs d’action non partagés)', async () => {
    store.push(makeIV({ action_id: 'other', indicator_excel_id: 'ALVitMax', situation: 'init', value: { number: 99 } }));
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'ALVitMax', situation: 'init', value: { number: 30 } }));
    const ref = makeIV({ action_id: 'a1', indicator_excel_id: 'ALVitMax', situation: 'ref', indicator_value_default_source: { excel_indicator_id: 'ALVitMax', situation: 'init' } });
    await resolveDynamicDefaults([ref]);
    assert.equal(ref.value_default.number, 30);
  });

  test('isolation par collectivité et acteur économique', async () => {
    store.push(makeIV({ action_id: 'a1', collectivity_id: 'coll2', indicator_excel_id: 'ALVitMax', situation: 'init', value: { number: 99 } }));
    store.push(makeIV({ action_id: 'a1', owner: 'economic_actor', economic_actor_id: 'ea1', indicator_excel_id: 'ALVitMax', situation: 'init', value: { number: 77 } }));
    const ref = makeIV({ action_id: 'a1', indicator_excel_id: 'ALVitMax', situation: 'ref', value_default: { number: 50 }, indicator_value_default_source: { excel_indicator_id: 'ALVitMax', situation: 'init' } });
    const refEA = makeIV({ action_id: 'a1', owner: 'economic_actor', economic_actor_id: 'ea1', indicator_excel_id: 'ALVitMax', situation: 'ref', indicator_value_default_source: { excel_indicator_id: 'ALVitMax', situation: 'init' } });
    await resolveDynamicDefaults([ref, refEA]);
    assert.equal(ref.value_default.number, 50);
    assert.equal(refEA.value_default.number, 77);
  });

  test('types incompatibles → défaut statique conservé', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'Src', situation: 'init', indicator_type: 'radio', value: { radio: 'Oui' } }));
    const ref = makeIV({ action_id: 'a1', indicator_excel_id: 'Cible', situation: 'ref', value_default: { number: 5 }, indicator_value_default_source: { excel_indicator_id: 'Src', situation: 'init' } });
    await resolveDynamicDefaults([ref]);
    assert.equal(ref.value_default.number, 5);
  });

  test('texte et radio copiés tels quels', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'Src', situation: 'init', indicator_type: 'radio', value: { radio: 'Oui' } }));
    const ref = makeIV({ action_id: 'a1', indicator_excel_id: 'Cible', situation: 'ref', indicator_type: 'radio', indicator_value_default_source: { excel_indicator_id: 'Src', situation: 'init' } });
    await resolveDynamicDefaults([ref]);
    assert.equal(ref.value_default.radio, 'Oui');
  });

  test('IV sans source → ignorée, aucune requête', async () => {
    IndicatorValue.find = async () => { throw new Error('ne doit pas être appelé'); };
    const iv = makeIV({ action_id: 'a1', indicator_excel_id: 'X', situation: 'ref', value_default: { number: 3 } });
    await resolveDynamicDefaults([iv]);
    assert.equal(iv.value_default.number, 3);
  });

  test('le défaut résolu est sérialisé dans la réponse API (toJSON)', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'ALVitMax', situation: 'init', value: { number: 30 } }));
    const ref = makeIV({ action_id: 'a1', indicator_excel_id: 'ALVitMax', situation: 'ref', indicator_value_default_source: { excel_indicator_id: 'ALVitMax', situation: 'init' } });
    await resolveDynamicDefaults([ref]);
    assert.equal(ref.toJSON().value_default.number, 30);
  });
});
