// Tests des titres dynamiques (colonne C du master) : parseur du script scrap + résolveur API.
// Lancer : npm test (aucune connexion MongoDB nécessaire, IndicatorValue.find est simulé en mémoire).
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const IndicatorValue = require('../src/models/indicator_value');
const { resolveDynamicNames } = require('../src/utils/indicators');
const { parseNameFormula } = require('../script/scrap_indicator_excel');

// ---------- Parseur ----------
const INIT = 'Remplissage - Sit. Init.';
const rowMaps = new Map([
  ['init', new Map([[1345, 'RepModCatRep1'], [1348, 'RepModCatRep2'], [1419, 'ELUChoixCatTypePL'], [23, 'FretRoutCat1Nom'], [1712, 'EComInitChoixAutoVSPerso']])],
  ['ref', new Map([[1079, 'RepMobEvolKmCat1'], [1418, 'EComRéfRempNbColis'], [1422, 'EComRéf%PR']])],
  ['prev', new Map([[2065, 'RepModCat1VersCyclo']])],
  ['expost', new Map([[1721, 'ELUExCatTypePLFretAppro']])],
]);
// Mini-classeur : `${situation}|${colonne}${ligne}` → { value, formula }
const cells = new Map([
  // C2 ref : R1079 = 'Init'!F1345
  ['ref|R1079', { value: 0, formula: `='${INIT}'!$F$1345` }],
  ['ref|R1081', { value: 0, formula: `='${INIT}'!$F$1348` }],
  // prev : S2065 = 'Init'!F1345
  ['prev|S2065', { value: 0, formula: `='${INIT}'!$F$1345` }],
  // expost : S1721 = 'Init'!S1419, init S1419 = F1419 (chaîne à 2 niveaux)
  ['expost|S1721', { value: 0, formula: `='${INIT}'!$S$1419` }],
  ['init|S1419', { value: 0, formula: '=F1419' }],
  ['init|S1423', { value: 0, formula: '=$S$1419' }],
  // Auxiliaires constantes (Parcs types, textes fixes)
  ['init|S23', { value: "VUL Electrique (Crit'Air E)", formula: `=INDEX('Parcs types'!$D$12:$D$56, '${INIT}'!R23 )` }],
  ['init|U1712', { value: 'situation initiale', formula: 'situation initiale' }],
  ['init|T1730', { value: 'à domicile', formula: 'à domicile' }],
  ['init|S1730', { value: "VUL Diesel (Crit'Air 2)", formula: `=INDEX('Parcs types'!$D$12:$D$56, R1730)` }],
  ['ref|R1416', { value: 'situation de référence', formula: 'situation de référence' }],
  ['init|S1358', { value: 'Automoteurs < 400 tonnes', formula: `='Parcs types'!C68` }],
  // Boucle
  ['ref|S9001', { value: 0, formula: '=S9002' }],
  ['ref|S9002', { value: 0, formula: '=S9001' }],
  // Auxiliaire pointant vers une ligne F sans identifiant
  ['ref|R9003', { value: 0, formula: `='${INIT}'!$F$9999` }],
  // Cellule vide
  ['ref|R9004', { value: '', formula: '' }],
]);
const getCell = (sit, row, col) => cells.get(`${sit}|${col}${row}`) || null;
const parse = (formula, situation) => parseNameFormula(formula, situation, rowMaps.get(situation), rowMaps, getCell);

describe('parseNameFormula', () => {
  test('C2 ref : titre & auxiliaire R → valeur init de la catégorie représentative 1', () => {
    assert.deepEqual(parse(`="Pourcentage d'évolution des km parcourus totaux pour la première catégorie représentative : " & R1079`, 'ref'), {
      template: "Pourcentage d'évolution des km parcourus totaux pour la première catégorie représentative : {0}",
      sources: [{ excel_indicator_id: 'RepModCatRep1', situation: 'init' }],
    });
  });
  test('prev : marqueur au milieu du texte, sans espaces autour des &', () => {
    assert.deepEqual(parse(`="Pour la première catégorie de véhicule routier ["&S2065&"], quel est le pourcentage de report modal ?"`, 'prev'), {
      template: 'Pour la première catégorie de véhicule routier [{0}], quel est le pourcentage de report modal ?',
      sources: [{ excel_indicator_id: 'RepModCatRep1', situation: 'init' }],
    });
  });
  test('expost : chaîne à deux niveaux S → Init!S → Init!F', () => {
    assert.deepEqual(parse(`="Quel est le tonnage acheminé en " & S1721 & " ?"`, 'expost'), {
      template: 'Quel est le tonnage acheminé en {0} ?',
      sources: [{ excel_indicator_id: 'ELUChoixCatTypePL', situation: 'init' }],
    });
  });
  test('init : chaîne même feuille $S$ → F', () => {
    assert.deepEqual(parse(`="Fret en " & S1423 & " ?"`, 'init'), { template: 'Fret en {0} ?', sources: [{ excel_indicator_id: 'ELUChoixCatTypePL', situation: 'init' }] });
  });
  test('référence directe à F même feuille', () => {
    assert.deepEqual(parse(`="Catégorie : " & F1345`, 'init'), { template: 'Catégorie : {0}', sources: [{ excel_indicator_id: 'RepModCatRep1', situation: 'init' }] });
  });
  test('espace après = et guillemets doublés', () => {
    assert.deepEqual(parse(`= "Dit ""bonjour"" à " & R1079`, 'ref'), { template: 'Dit "bonjour" à {0}', sources: [{ excel_indicator_id: 'RepModCatRep1', situation: 'init' }] });
  });
  test('deux sources dans un même titre', () => {
    assert.deepEqual(parse(`="De " & R1079 & " vers " & R1081`, 'ref'), {
      template: 'De {0} vers {1}',
      sources: [
        { excel_indicator_id: 'RepModCatRep1', situation: 'init' },
        { excel_indicator_id: 'RepModCatRep2', situation: 'init' },
      ],
    });
  });
  test('mélange constante figée + source', () => {
    assert.deepEqual(parse(`="En "&$U$1712&", catégorie " & F1345 & " ?"`, 'init'), { template: 'En situation initiale, catégorie {0} ?', sources: [{ excel_indicator_id: 'RepModCatRep1', situation: 'init' }] });
  });
  test('auxiliaire INDEX Parcs types (constante) → statique', () => {
    assert.equal(parse(`="Nom de la catégorie de véhicules [ " & S23 & " ]"`, 'init'), null);
  });
  test('titre tout-constantes à trois cellules → statique', () => {
    assert.equal(parse(`="En "&$U$1712&", quelle est la distance d'une livraison "&$T1730&" en "&$S1730& " ?"`, 'init'), null);
  });
  test("auxiliaire ='Parcs types'!C68 → statique", () => {
    assert.equal(parse(`="Flux de la catégorie " & S1358`, 'init'), null);
  });
  test('produit F*F (colis × part point-retrait) → source avec factor_source', () => {
    assert.deepEqual(parse(`="Sur les "&$F$1418*$F$1422&" colis livrés "&$R$1416&", quelle part ?"`, 'ref'), {
      template: 'Sur les {0} colis livrés situation de référence, quelle part ?',
      sources: [{ excel_indicator_id: 'EComRéfRempNbColis', situation: 'ref', factor_source: { excel_indicator_id: 'EComRéf%PR', situation: 'ref' } }],
    });
  });
  test('produit via auxiliaire et inter-feuille', () => {
    assert.deepEqual(parse(`="N = " & R1079 * '${INIT}'!F1348`, 'ref'), {
      template: 'N = {0}',
      sources: [{ excel_indicator_id: 'RepModCatRep1', situation: 'init', factor_source: { excel_indicator_id: 'RepModCatRep2', situation: 'init' } }],
    });
  });
  test('produit dont un opérande n’est pas une saisie → statique', () => {
    assert.equal(parse(`="N = " & F1418 * R1416`, 'ref'), null);
    assert.equal(parse(`="N = " & F1418 * F9999`, 'ref'), null);
    assert.equal(parse(`="N = " & F1418 * 2`, 'ref'), null);
  });
  test('SUM inter-feuille → non reconnu, statique', () => {
    assert.equal(parse(`="Vous avez renseigné " & SUM('C4'!$N$235:$N$279) & " livraisons."`, 'ref'), null);
  });
  test('ligne source sans identifiant → statique', () => {
    assert.equal(parse(`="Titre " & R9003`, 'ref'), null);
    assert.equal(parse(`="Titre " & F9999`, 'ref'), null);
  });
  test('boucle entre auxiliaires → statique, pas de récursion infinie', () => {
    assert.equal(parse(`="Titre " & S9001`, 'ref'), null);
  });
  test('cellule vide sans formule → figée en chaîne vide, aucune source → statique', () => {
    assert.equal(parse(`="Titre " & R9004`, 'ref'), null);
  });
  test('cellule inconnue → statique', () => {
    assert.equal(parse(`="Titre " & Z1`, 'ref'), null);
  });
  test('littéral, vide, guillemet non fermé → statique', () => {
    assert.equal(parse('Titre fixe', 'ref'), null);
    assert.equal(parse('', 'ref'), null);
    assert.equal(parse(undefined, 'ref'), null);
    assert.equal(parse(`="Titre & R1079`, 'ref'), null);
  });
});

// ---------- Résolveur ----------
const baseIV = { collectivity_id: 'coll1', collectivity_name: 'Coll 1', owner: 'collectivity', year: 2024 };
const makeIV = (over) => new IndicatorValue({ ...baseIV, indicator_type: 'number', ...over });
const C2_TITLE = "Pourcentage d'évolution des km parcourus totaux pour la première catégorie représentative : ";
const C2_SOURCE = { template: `${C2_TITLE}{0}`, sources: [{ excel_indicator_id: 'RepModCatRep1', situation: 'init' }] };
const makeRef = (over) => makeIV({ action_id: 'a1', indicator_excel_id: 'RepMobEvolKmCat1', situation: 'ref', indicator_name: `${C2_TITLE}0`, indicator_name_source: C2_SOURCE, ...over });

let store = [];
const originalFind = IndicatorValue.find;
const matches = (doc, query) => Object.entries(query).every(([k, v]) => (v && typeof v === 'object' && '$in' in v ? v.$in.includes(doc[k]) : doc[k] === v));

describe('resolveDynamicNames', () => {
  beforeEach(() => {
    store = [];
    IndicatorValue.find = async (query) => store.filter((d) => matches(d, query));
  });
  afterEach(() => {
    IndicatorValue.find = originalFind;
  });

  test('C2 : catégorie choisie en init affichée dans le titre ref', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'RepModCatRep1', situation: 'init', indicator_type: 'radio', value: { radio: "VUL Diesel (Crit'Air 2)" } }));
    const ref = makeRef();
    await resolveDynamicNames([ref]);
    assert.equal(ref.indicator_name, `${C2_TITLE}VUL Diesel (Crit'Air 2)`);
  });

  test('catégorie non choisie → marqueur vide, pas de 0', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'RepModCatRep1', situation: 'init', indicator_type: 'radio', value: { radio: null } }));
    const ref = makeRef();
    await resolveDynamicNames([ref]);
    assert.equal(ref.indicator_name, C2_TITLE.trim()); // trim du schéma : pas d'espace final
  });

  test('IV source introuvable → titre statique conservé', async () => {
    const ref = makeRef();
    await resolveDynamicNames([ref]);
    assert.equal(ref.indicator_name, `${C2_TITLE}0`);
  });

  test('sans indicator_name_source → titre inchangé', async () => {
    const ref = makeRef({ indicator_name_source: undefined });
    await resolveDynamicNames([ref]);
    assert.equal(ref.indicator_name, `${C2_TITLE}0`);
  });

  test('source nombre et source checkbox (jointe par virgule)', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'Nb', situation: 'init', value: { number: 1000 } }));
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'Cats', situation: 'init', indicator_type: 'checkbox', value: { checkbox: ['A', 'B'] } }));
    const iv = makeIV({ action_id: 'a1', indicator_excel_id: 'X', situation: 'ref', indicator_name: 'x', indicator_name_source: { template: 'Sur {0} colis en {1}', sources: [{ excel_indicator_id: 'Nb', situation: 'init' }, { excel_indicator_id: 'Cats', situation: 'init' }] } });
    await resolveDynamicNames([iv]);
    assert.equal(iv.indicator_name, 'Sur 1000 colis en A, B');
  });

  test('une des sources introuvable → titre inchangé', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'Nb', situation: 'init', value: { number: 1000 } }));
    const iv = makeIV({ action_id: 'a1', indicator_excel_id: 'X', situation: 'ref', indicator_name: 'x', indicator_name_source: { template: 'Sur {0} colis en {1}', sources: [{ excel_indicator_id: 'Nb', situation: 'init' }, { excel_indicator_id: 'Absent', situation: 'init' }] } });
    await resolveDynamicNames([iv]);
    assert.equal(iv.indicator_name, 'x');
  });

  test('changement de catégorie en init → nouveau fetch reflète la nouvelle valeur', async () => {
    const src = makeIV({ action_id: 'a1', indicator_excel_id: 'RepModCatRep1', situation: 'init', indicator_type: 'radio', value: { radio: 'A' } });
    store.push(src);
    const ref = makeRef();
    await resolveDynamicNames([ref]);
    assert.equal(ref.indicator_name, `${C2_TITLE}A`);
    src.value.radio = 'B';
    await resolveDynamicNames([ref]);
    assert.equal(ref.indicator_name, `${C2_TITLE}B`);
  });

  test('produit : 10 000 colis × 36 % = 3600 (EComRéf)', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'EComRéfRempNbColis', situation: 'ref', value: { number: 10000 } }));
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'EComRéf%PR', situation: 'ref', value: { number: 36 }, indicator_value_unit: '%' }));
    const iv = makeIV({ action_id: 'a1', indicator_excel_id: 'EComRéfRemplCat1LivPR%colis', situation: 'ref', indicator_name: 'Sur les 0 colis', indicator_name_source: { template: 'Sur les {0} colis livrés aux points-retraits', sources: [{ excel_indicator_id: 'EComRéfRempNbColis', situation: 'ref', factor_source: { excel_indicator_id: 'EComRéf%PR', situation: 'ref' } }] } });
    await resolveDynamicNames([iv]);
    assert.equal(iv.indicator_name, 'Sur les 3600 colis livrés aux points-retraits');
  });

  test('produit : opérande non saisi → marqueur vide ; facteur introuvable → titre inchangé', async () => {
    const source = { excel_indicator_id: 'EComRéfRempNbColis', situation: 'ref', factor_source: { excel_indicator_id: 'EComRéf%PR', situation: 'ref' } };
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'EComRéfRempNbColis', situation: 'ref', value: { number: 10000 } }));
    const noFactor = makeIV({ action_id: 'a1', indicator_excel_id: 'X', situation: 'ref', indicator_name: 'Sur les 0 colis', indicator_name_source: { template: 'Sur les {0} colis', sources: [source] } });
    await resolveDynamicNames([noFactor]);
    assert.equal(noFactor.indicator_name, 'Sur les 0 colis');
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'EComRéf%PR', situation: 'ref', value: { number: null }, indicator_value_unit: '%' }));
    const emptyFactor = makeIV({ action_id: 'a1', indicator_excel_id: 'X', situation: 'ref', indicator_name: 'Sur les 0 colis', indicator_name_source: { template: 'Sur les {0} colis', sources: [source] } });
    await resolveDynamicNames([emptyFactor]);
    assert.equal(emptyFactor.indicator_name, 'Sur les  colis');
  });

  test('produit sans unité % : 12 × 2,5 = 30', async () => {
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'A', situation: 'ref', value: { number: 12 } }));
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'B', situation: 'ref', value: { number: 2.5 } }));
    const iv = makeIV({ action_id: 'a1', indicator_excel_id: 'X', situation: 'ref', indicator_name: 'x', indicator_name_source: { template: '{0} unités', sources: [{ excel_indicator_id: 'A', situation: 'ref', factor_source: { excel_indicator_id: 'B', situation: 'ref' } }] } });
    await resolveDynamicNames([iv]);
    assert.equal(iv.indicator_name, '30 unités');
  });

  test('préfère l’IV source de la même action', async () => {
    store.push(makeIV({ action_id: 'other', indicator_excel_id: 'RepModCatRep1', situation: 'init', indicator_type: 'radio', value: { radio: 'Autre' } }));
    store.push(makeIV({ action_id: 'a1', indicator_excel_id: 'RepModCatRep1', situation: 'init', indicator_type: 'radio', value: { radio: 'Mienne' } }));
    const ref = makeRef();
    await resolveDynamicNames([ref]);
    assert.equal(ref.indicator_name, `${C2_TITLE}Mienne`);
  });

  test('isolation par collectivité et acteur économique', async () => {
    store.push(makeIV({ action_id: 'a1', collectivity_id: 'coll2', indicator_excel_id: 'RepModCatRep1', situation: 'init', indicator_type: 'radio', value: { radio: 'Coll2' } }));
    store.push(makeIV({ action_id: 'a1', owner: 'economic_actor', economic_actor_id: 'ea1', indicator_excel_id: 'RepModCatRep1', situation: 'init', indicator_type: 'radio', value: { radio: 'EA' } }));
    const ref = makeRef();
    const refEA = makeRef({ owner: 'economic_actor', economic_actor_id: 'ea1' });
    await resolveDynamicNames([ref, refEA]);
    assert.equal(ref.indicator_name, `${C2_TITLE}0`);
    assert.equal(refEA.indicator_name, `${C2_TITLE}EA`);
  });
});
