# Intégration Excel / SharePoint

> Partie de la [documentation technique EVALUD](../../DOCUMENTATION.md).

**Sommaire**

1. [Organisation SharePoint](#1-organisation-sharepoint)
2. [Modèle Excel : structure, ranges, constantes](#2-modèle-excel--structure-ranges-constantes)
3. [Microsoft Graph : auth, cache et résilience](#3-microsoft-graph--auth-cache-et-résilience)
4. [Primitives Excel](#4-primitives-excel)
5. [Workflow : création d'action (POST /action/)](#5-workflow--création-daction-post-action)
6. [Workflow : mise à jour d'un IndicatorValue (PUT /indicator_value/:id)](#6-workflow--mise-à-jour-dun-indicatorvalue-put-indicator_valueid)
7. [Workflow : ajout / suppression d'année](#7-workflow--ajout--suppression-dannée)
8. [Workflow : import / export Excel](#8-workflow--import--export-excel)
9. [Endpoints d'agrégation (/excel)](#9-endpoints-dagrégation-excel)
10. [Calcul de complétion (ratio rempli / visible)](#10-calcul-de-complétion-ratio-rempli--visible)
11. [Conditions d'affichage : évaluation récursive](#11-conditions-daffichage--évaluation-récursive)

---

Cette section décrit dans le détail technique ce qui se passe réellement lors des opérations critiques. Toute la mécanique repose sur une **synchronisation bidirectionnelle entre MongoDB et des fichiers Excel hébergés sur SharePoint**, accédés via l'API Microsoft Graph.

> Prérequis de lecture : le modèle des **actions config** (« Données de base », « Parc types »), une valeur par indicateur, situation et année, partagée par toutes les actions de la collectivité mais recopiée dans chaque fichier Excel d'action, est expliqué dans [Domaine métier §1](05-domaine-metier.md#1-concepts-clés). C'est ce qui justifie la recopie à la création d'un fichier (§5) et la propagation à tous les fichiers lors d'une modification (§6).

**Flux résumé** : (1) l'utilisateur saisit une valeur dans l'UI ; (2) `PUT /indicator_value/:id` met à jour la BDD et recalcule la complétion ; (3) les cellules et agrégations à écrire sont mises en file (`excelSync`, [API §4.4](02-api.md#44-synchro-excel-différée--servicesexcelsyncjs)) ; (4) un flush différé (1 s) écrit SharePoint en batch, relit les défauts recalculés ([API §4.5](02-api.md#45-relecture-des-défauts--servicesexceldefaultsjs)) puis met à jour le fichier d'agrégation. Le front interroge `GET /indicator_value/sync_status/:action_id` pour savoir si le dashboard est à jour.

## 1. Organisation SharePoint

Toute la donnée Excel vit sur **un unique site SharePoint** : `selegobv.sharepoint.com`. Le drive est organisé sur deux niveaux : des **templates** au niveau racine, puis **un dossier par collectivité** créé à la volée.

```
selegobv.sharepoint.com (drive racine)
│
├── [Templates au niveau racine — IDs dans les constantes en tête de microsoftGraph.js]
│   ├── masterExcelFileId          → Master action (modèle de chaque fichier d'action)
│   └── aggregationTemplateFileId  → Template d'agrégation collectivité
│
├── {Nom collectivité A}/                    ← un dossier par collectivité
│   ├── {Nom collectivité A} - Aggregation.xlsx
│   │     ↳ fichier d'agrégation (Collectivity.aggregation_excel_file_id)
│   ├── {Nom acteur éco X} - {Nom collectivité A} - Aggregation.xlsx
│   │     ↳ un fichier d'agrégation par acteur économique rattaché
│   │       (EconomicActor.collectivities[].aggregation_excel_file_id)
│   ├── {Action 1}_Prev{year_prev_1}.xlsx        ← un fichier par année prévisionnelle
│   ├── {Action 1}_Expost{year_expost_1}.xlsx   ← un fichier par année ex-post
│   └── {Acteur éco X}_{Action 3}_Prev{...}.xlsx ← actions portées par un acteur éco
│
└── {Nom collectivité B}/ ...
```

**Création des entités SharePoint** :

| Entité Mongo | Quand | Côté SharePoint | Champ qui stocke l'ID |
|--------------|-------|-----------------|----------------------|
| `Collectivity` | Premier `POST /collectivity` ou première création d'action dans la collectivité ([action.js](../../api/src/controllers/action.js)) | Dossier `{name}/` + `{name} - Aggregation.xlsx` dupliqué depuis le template d'agrégation | `sharepoint_folder_id`, `aggregation_excel_file_id` |
| `EconomicActor.collectivities[]` | À chaque `PUT /economic_actor/:id/add_collectivity` ([economic_actor.js](../../api/src/controllers/economic_actor.js)) | `{actor.name} - {collectivity.name} - Aggregation.xlsx` dans le dossier de la collectivité | `EconomicActor.collectivities[].aggregation_excel_file_id` |
| `Action` | Création (`POST /action/`) | 1 fichier `_Prev{year}.xlsx` par année prév. + 1 `_Expost{year}.xlsx` par année ex-post, dupliqués depuis le master (ou depuis le fichier d'une action sœur) | `exel_files_prev[].excel_file_id`, `excel_files_expost[].excel_file_id` |

**Convention de nommage des fichiers d'action** :
- Owner = collectivité : `{action_name}{instanceSuffix}_Prev{year_prev}.xlsx` / `..._Expost{year_expost}.xlsx`
- Owner = acteur économique : `{economic_actor_name}_{action_name}{instanceSuffix}_Prev{...}.xlsx`
- `instanceSuffix` n'apparaît qu'à partir de l'instance 2 (max 3 instances d'un même template d'action par collectivité).

**Pourquoi cette organisation** :
- **Tout dans le dossier de la collectivité** simplifie les permissions SharePoint (un seul dossier à partager) et garantit que les références inter-fichiers (le fichier d'agrégation pointe vers les fichiers d'action) restent valides.
- **Un fichier d'agrégation par acteur économique** évite les fuites de gains entre acteurs co-implantés sur la même collectivité.
- **Un fichier par année de projection** parce que le master ne porte **qu'une seule référence à la fois** : un onglet par situation (`init`, `ref`, `prev`, `expost`), donc une seule année de référence par classeur. Côté métier la référence est rattachée à chaque année prévisionnelle ou ex-post ([Domaine métier §1](05-domaine-metier.md#1-concepts-clés)), et le code force `year_ref = year_prev` dans `exel_files_prev` et `year_ref = year_expost` dans `excel_files_expost`. Chaque année de projection a donc son propre fichier, et chaque fichier embarque **sa propre copie** de la situation initiale, de la référence et des données config (« Données de base », « Parc types »). Une action avec deux années prévisionnelles et une ex-post a trois fichiers contenant trois fois la même situation initiale. C'est ce qui explique qu'une saisie en `init` soit propagée à tous les fichiers de l'action (§6), qu'une saisie en `ref` cible les fichiers dont le `year_ref` correspond, et qu'à la suppression d'une année on vérifie si le `year_ref` est encore utilisé ailleurs avant de supprimer les valeurs `ref` (§7). Effet secondaire utile : une mise à jour ne touche qu'un fichier et limite la charge des appels Graph.
- **Le fichier d'agrégation existe à cause de cet éclatement.** Les résultats d'une action sont dispersés dans autant de classeurs qu'elle a d'années prévisionnelles et ex-post, chaque classeur ne calculant que sa propre année. Pour reconstituer la trajectoire complète d'une action (toutes ses années côte à côte) puis celle de la collectivité (toutes ses actions), il faut recompiler ces résultats au même endroit : c'est le rôle du fichier d'agrégation. Chaque fichier d'action y dépose ses sorties dans `1. Données d'entrée` (§6 C), et les feuilles `Agrégation`, `3. Émissions par action` et `4. Gains par action` font la somme par année et par action (§9). L'app ne recalcule rien elle-même : les formules de gains et de consolidation restent dans les classeurs du programme.
- **Les IDs des templates racine sont des constantes du code** (`masterExcelFileId`, `aggregationTemplateFileId` dans `microsoftGraph.js`). Ils représentent les modèles versionnés du programme InTerLUD+, mis à jour manuellement à chaque nouvelle version du master. La version courante est visible sur le [SharePoint Documents partagés](https://selegobv.sharepoint.com/Documents%20partages/Forms/AllItems.aspx).

**Comment l'app retrouve le bon fichier d'agrégation** ([action.js](../../api/src/controllers/action.js)) :

```javascript
const aggregationFileId = action.owner === 'economic_actor'
  ? (await EconomicActor.findById(action.economic_actor_id))
      ?.collectivities?.find(c => c.id === action.collectivity_id)
      ?.aggregation_excel_file_id
  : (await Collectivity.findById(action.collectivity_id))
      ?.aggregation_excel_file_id;
```

À chaque sync, le backend détermine d'abord **qui possède l'action** (collectivité vs acteur économique), puis cible le fichier d'agrégation correspondant. Une action portée par un acteur économique alimente uniquement le fichier d'agrégation de cet acteur, jamais celui de la collectivité globale.

## 2. Modèle Excel : structure, ranges, constantes

**Worksheets de saisie** (fichiers d'action) — quatre feuilles, une par situation : voir le mapping au [API §4.2](02-api.md#42-microsoft-graph-sharepoint--excel--servicesmicrosoftgraphjs).

**Layout des lignes** dans `usedRange.values` (0-indexé) :

| Index | Colonne | Contenu |
|-------|---------|---------|
| `row[4]` | E | `excel_indicator_id` (clé de jointure DB ↔ Excel) |
| `row[5]` | F | Valeur saisie par l'utilisateur (cible d'écriture) |
| `row[7]` | H | Valeur par défaut, recalculée par les formules Excel |

**Références** ([microsoftGraph.js](../../api/src/services/microsoftGraph.js)) :
- Site SharePoint : `selegobv.sharepoint.com` — classeurs visibles dans [Documents partagés](https://selegobv.sharepoint.com/Documents%20partages/Forms/AllItems.aspx)
- Master fichier action : constante `masterExcelFileId`
- Template Excel d'agrégation collectivité : constante `aggregationTemplateFileId`

**Indicateurs « cachés »** (exclus du calcul de complétion) : `HIDDEN_IDS = ['AnneeRempl', 'AnRef', 'ActionsAutres', 'ActionsCharte']`.

**Fichier d'agrégation collectivité** — feuilles et ranges :
- `1. Données d'entrée` : cible d'écriture des `IndicatorValue` par les actions.
- `Agrégation` : lue par `POST /excel/home_aggregation` sur le range `B7:K39` (gains globaux) et `C40:H300` (contribution par action).
- `4. Gains par action` et `3. Émissions par action` : lues par `POST /excel/action_aggregation`.

Tables de mapping pour l'agrégation par action ([excel.js](../../api/src/controllers/excel.js)) :

```javascript
ACTION_GAINS_RANGES     = { B2: { dataStartRow: 19 }, C1: { dataStartRow: 15 }, ... }
ACTION_EMISSIONS_RANGES = { B2: { dataStartRow: 21 }, ... }
INSTANCE_COL_OFFSET     = { 1: 36, 2: 68, 3: 100 }   // colonnes AK / BQ / CW selon instance
INSTANCE_EMISSION_COL   = { GES: 0, PM: 5, NOx: 10, HC: 15, CO: 20, Nrj: 25 }
EMISSION_TYPES          = ['GES', 'PM', 'NOx', 'HC', 'CO', 'Nrj']
```

## 3. Microsoft Graph : auth, cache et résilience

**OAuth2 client credentials** :
- Endpoint : `POST https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token`
- Grant `client_credentials`, scope `https://graph.microsoft.com/.default`.
- Variables d'env : `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`.
- **Cache** : `_cachedToken` + `_tokenExpiresAt`. Renouvellement quand `Date.now() >= _tokenExpiresAt`. Durée prise = `expires_in − 120s`.
- Le **Site ID** SharePoint est caché dans `_cachedSiteId` après le premier appel.

**Sessions workbook persistantes** (`createWorkbookSession` / `getCachedSession` / `graphFetchWithSession`) :
- Sans session, chaque appel Graph force SharePoint à recharger le classeur à froid (~6 s mesurés, contre ~0,3 s sous session), et une lecture peut tomber sur un état pas encore recalculé.
- Une session `persistChanges: true` est donc gardée **par fichier** dans un cache mémoire (`MAX_CACHED_SESSIONS = 30`), maintenue en vie par un ping toutes les 4 min (SharePoint expire après ~5 min d'inactivité) et fermée après 30 min sans usage.
- `graphFetchWithSession` rejoue l'appel une fois avec une session neuve si l'ancienne est invalidée ; les écritures étant des valeurs absolues, le rejeu est sans danger. Si la création de session échoue, l'appel part sans session (lent mais fonctionnel).
- Les sessions sont **pré-chauffées** à l'ouverture d'une action (`warmSessionsForAction`, [API §4.4](02-api.md#44-synchro-excel-différée--servicesexcelsyncjs)).

**`graphFetch(endpoint, options)`** — wrapper avec retry exponentiel :
- Codes retryables : `429, 500, 502, 503, 504` + corps contenant `"We're sorry"`.
- Max 3 tentatives, délai `2000 * 2^attempt` ms (2s → 4s → 8s). Header `Retry-After` respecté.
- Codes attendus : `200` (JSON), `202` (async, réponse brute), `204` (`null`).
- Headers systématiques : `Authorization: Bearer <token>`, `Content-Type: application/json`.

## 4. Primitives Excel

**`updateExcelCellByIndicatorId(fileId, excelIndicatorId, value, situation, unit)`** — écriture d'une cellule unique :
1. `GET .../worksheets/{WORKSHEETS[situation]}/usedRange` → `values`.
2. Cherche `row[4] === excelIndicatorId` (trim). Si non trouvé → `throw`.
3. Ligne absolue : `startRow` (parsé depuis `usedRange.address`) + `rowIndex`.
4. Transforme la valeur : `unit === '%'` et numérique → `value / 100` ; array → `join(', ')`.
5. `PATCH .../range(address='F{rowNumber}')` avec `{ values: [[cellValue]] }`.

**`updateExcelCellsBatch(fileId, updates, situation)`** — écritures multiples en un seul PATCH :
1. Récupère `usedRange` une seule fois, construit `indicatorRowMap: Map<id, rowIndex>`.
2. Filtre les updates absents de la feuille.
3. Calcule le **range continu minimal** `[minRowIndex .. maxRowIndex]`.
4. Vecteur de valeurs : nouvelle si présente dans le batch, sinon valeur existante `row[5]` (préservation) ou `''`.
5. `PATCH .../range(address='F{...}:F{...}')` — **un seul appel**.

**`readExcelDefaultValues(fileId, situation)`** — lit la colonne H : pour chaque ligne avec `row[4]` non vide, stocke `row[7]` dans `Map<id, defaultValue>`.

**`clearWorksheetValues(fileId, situation)`** — vide la colonne F (même logique que le batch avec un vecteur de chaînes vides).

**`duplicateExcelFile(newFileName, targetFolderId, sourceFileId)`** :
1. `POST /drive/items/{sourceFileId}/copy` → `202 Accepted` (asynchrone).
2. **Polling** : attend 2s puis boucle jusqu'à 20× (délai 1s), interroge `children?$filter=name eq '{escapedName}'`.
3. Retourne `newFileId` dès trouvé, sinon timeout (~22s max).

**`createFolder(folderName, parentFolderId?)`** : `POST .../children` avec `{ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }`.

**`exportExcelFile(fileId)`** : `GET /drive/items/{fileId}?select=@microsoft.graph.downloadUrl,name` → `{ downloadUrl, fileName }`.

**`exportExcelFileWithSpecificSheets(fileId, sheetsToKeep)`** : télécharge, charge via ExcelJS, supprime les feuilles non listées, retourne un buffer.

**`importSheetsToExcelFile(targetFileId, buffer, sheets)`** :
1. Charge le buffer source (ExcelJS).
2. Construit `importedDataBySituation[situation] = Map<id, value>` (skip l'en-tête).
3. Récupère le `usedRange` de chaque worksheet cible.
4. Croise `row[4]` avec les clés importées → liste d'updates.
5. Range continu minimal + `PATCH` unique sur `F{min}:F{max}` par situation.
6. Retourne `[{ excel_indicator_id, value, situation }]` pour usage en aval (sync DB).

## 5. Workflow : création d'action (`POST /action/`)

Endpoint le plus complexe du backend ([controllers/action.js](../../api/src/controllers/action.js)). Décomposition :

**A. Validation & setup** — body requis : `name`, `action_parent_id`, `year_init`, `year_prev` (+ `year_expost` optionnel). Si la collectivité n'a pas de dossier SharePoint → `createFolder` + sauvegarde `sharepoint_folder_id`. Si pas de fichier d'agrégation → `duplicateExcelFile` depuis le template `aggregationTemplateFileId`. Calcul de `instance_number` (incrémente jusqu'à un slot libre, max 3, sinon `MAX_INSTANCES_REACHED`).

**B. Duplication des fichiers Excel d'action** — recherche d'une action « sœur » (même parent, même collectivité) déjà dotée d'un `exel_files_prev` (source pour conserver les données init/ref déjà saisies) ; sinon source = master. Le fichier Prev est nettoyé via `clearWorksheetValues(fileId, 'expost')`, et vice-versa. Les cellules des indicateurs liés au parent sont vidées.

**C. Création du document Action** :

```javascript
Action.create({
  ...req.body,
  instance_number,
  excel_worksheetname: parentAction.excel_worksheetname,
  exel_files_prev:    [{ year_prev, year_ref, excel_file_id }],
  excel_files_expost: hasExpost ? [{ year_expost, year_ref, excel_file_id }] : [],
  last_modif_by_*:    user data
})
```

**D. Actions config** — « Données de base » et « Parc types » : cherchées au niveau collectivité, créées si absentes. Conteneurs des indicateurs **sans `linked_action_id`** (données partagées entre toutes les actions).

**E. Création en masse des IndicatorValue config** — récupère les `Indicator` sans `linked_action_id` ; pour chaque `(situation, year)` applicable, crée l'IV avec `value = value_default` si absent ; `insertMany` en bulk ; récupère les valeurs déjà saisies par d'autres actions config (continuité) ; `updateExcelCellsBatch` par couple `(situation, fileId)`.

**F. Création en masse des IndicatorValue spécifiques** — `Indicator` avec `linked_action_id === parentAction._id` ; `value` initialisée au default **uniquement** pour les indicateurs **non primordiaux** (les primordiaux doivent être saisis explicitement) ; écriture Excel batch des non-primordiaux.

**G. Indicateurs spéciaux dans « Données de base »** :
- `ActionsCharte` vs `ActionsAutres` : selon `action.started_before_interlud`, append `excel_worksheetname` à la liste cochée (checkbox), écrit en Excel pour `init` sur tous les fichiers.
- `AnneeRempl` / `AnRef` : pour chaque entrée prev/expost, écrit l'année dans la cellule correspondante (updates en parallèle).
- `NomTerr` / `SIRENTerr` / `SupTerr` : copie depuis `Collectivity.name`, `siren`, `area` vers `init` (+ expost si applicable).

**H. Re-lecture et correction des defaults** — Excel recalcule la colonne H après écriture des années/infos collectivité. `refreshDefaultsAfterSync` ([API §4.5](02-api.md#45-relecture-des-défauts--servicesexceldefaultsjs)) est appelé sur chaque fichier créé (prév. et, le cas échéant, ex-post) : relecture de H, mise à jour de `value_default`, réécriture des valeurs non primordiales jamais saisies.

**I. Finalisation** — `computeActionCompletion` sur l'action principale + les deux actions config ; création d'un `Log` `operation: 'add'`.

> **Durée** : opération longue par nature (copie des classeurs et recalcul côté SharePoint), jusqu'à 120 secondes. L'interface affiche la progression étape par étape.

## 6. Workflow : mise à jour d'un IndicatorValue (`PUT /indicator_value/:id`)

[controllers/indicator_value.js](../../api/src/controllers/indicator_value.js). La logique de sync diffère selon que l'action est régulière ou de type config.

> Depuis octobre 2026, les étapes A à C ci-dessous ne sont plus exécutées dans la requête : le contrôleur détermine les fichiers cibles puis appelle `enqueueCellUpdate` / `enqueueAggregation` ([API §4.4](02-api.md#44-synchro-excel-différée--servicesexcelsyncjs)). L'écriture réelle a lieu au flush différé. Les règles de ciblage restent celles décrites ici.

**A. Sync Excel — action de type `config`** — la valeur est propagée à **tous les fichiers Excel des actions régulières** concernés :

| Situation | Actions ciblées | Fichier Excel ciblé |
|-----------|-----------------|---------------------|
| `init` | actions avec `year_init === year` | tous leurs `exel_files_prev` + `excel_files_expost` |
| `ref` | actions avec une entrée `year_ref === year` | l'entrée matching dans prev ou expost |
| `prev` | actions avec entrée `year_prev === year` | l'entrée matching dans `exel_files_prev` |
| `expost` | actions avec entrée `year_expost === year` | l'entrée matching dans `excel_files_expost` |

Pour chaque match → `enqueueCellUpdate({ fileId, situation, excelIndicatorId, value, unit })`.

**B. Sync Excel — action régulière** :
- `init` → écrit dans **tous** ses fichiers prev ET expost
- `ref` → tous les fichiers avec `year_ref === year`
- `prev` → uniquement l'entrée `exel_files_prev` dont `year_prev === year`
- `expost` → uniquement l'entrée `excel_files_expost` dont `year_expost === year`

**C. Sync vers l'Excel d'agrégation collectivité** (actions non-config) :
1. `enqueueAggregation({ actionId, situation, year })` dans le contrôleur.
2. Au flush, `buildAggregationTargets(action, situation, year)` ([excelSync.js](../../api/src/services/excelSync.js)) — liste des fichiers sources à lire et la cible d'agrégation (`init` → tous les couples ; `ref` → fichiers où `year_ref === year` ; `prev`/`expost` → fichier unique).
3. `writeAggregationTargets(action, targets)` — recalcule et lit la feuille `Agrégation` de chaque source (colonnes par type d'émission GES/PM/NOx/HC/CO/Nrj), mappe vers `1. Données d'entrée` du fichier d'agrégation (IDs en colonne D, format `{worksheet}-{émission}-{situation}-{année}`), puis un seul `PATCH` sur la plage min→max de la colonne de l'instance.

**D. Cross-action sync** — cherche les autres IV avec même `(indicator_id, situation, year, owner)`. Scope : action non-config → restreint à la même action ; config → toutes les actions. Pour chaque IV avec valeur différente : log `synchronization` + `updateMany(..., { $set: { value: newValue } })`.

**E. Onboarding** (`updateOnboardingStatus`, actions config) — charge les IV non-hidden, build `conditionValuesMap` + `yearMappings`, applique `shouldDisplayIndicator` puis `isIndicatorValueFilled`. Si **tous** les IV visibles sont remplis → flag `basedata_onboarded` ou `parc_types_onboarded = true` + `Action.status = 'completed'`.

**F. Logs** : un log par modification avec `source: 'manual'` ou `'import_excel'`.

## 7. Workflow : ajout / suppression d'année

**`POST /action/add_year_previsionnel`** :
1. Validation + check que `year_prev` n'existe pas déjà dans `exel_files_prev`.
2. Duplication Excel : source = premier fichier prev existant (ou master en fallback), nettoyage de la feuille `expost` et des cellules héritées du parent.
3. Push `{ year_prev, year_ref, excel_file_id }` dans `action.exel_files_prev`.
4. Création des IV config pour `(prev, year_prev)` et `(ref, year_ref)` si absents.
5. Mise à jour `AnneeRempl` / `AnRef` côté DB.
6. Écriture Excel des IV config existantes dans le nouveau fichier (continuité).
7. Création des IV principales pour `(prev, year_prev)` et `(ref, year_ref)` (non-primordiaux écrits en batch).
8. Écriture explicite des années dans le fichier.
9. `refreshDefaultsAfterSync` sur le nouveau fichier (cf. [API §4.5](02-api.md#45-relecture-des-défauts--servicesexceldefaultsjs)).
10. `computeActionCompletion`.

**`POST /action/add_year_expost`** : structure identique mais cible `excel_files_expost`, vide la feuille `prev`, fallback source = autre fichier expost sinon un fichier prev.

**`POST /action/remove_year_previsionnel` / `remove_year_expost`** :
1. Supprime le fichier Excel SharePoint (`DELETE /drive/items/{fileId}`).
2. Nettoie le fichier d'agrégation : supprime les rows matching `{worksheetname}-*-{situationLabel}-{year}`.
3. Retire l'entrée de `exel_files_prev` / `excel_files_expost`.
4. Si le `year_ref` retiré n'est plus utilisé → supprime aussi les IV `ref` correspondants + cleanup agrégation.
5. Cleanup orphelins : supprime les IV config sans action régulière correspondante.
6. `computeActionCompletion`.

## 8. Workflow : import / export Excel

**`POST /indicator_value/export_indicator_values_excel`** :
1. Query MongoDB sur `(action_id, situation?, year?)`.
2. Build `conditionValuesMap` + `yearMappings` pour filtrer via `shouldDisplayIndicator`.
3. Pour chaque situation, crée une feuille ExcelJS avec colonnes `category`, `sub_category`, `title`, `description`, `excel_id`, `value`, `possibilities`, `default`, `unit`, `type`.
4. Stream le buffer (`Content-Type: ...spreadsheetml.sheet`).

**`POST /indicator_value/importIndicatorValues`** :
1. Body : `fileBase64`, `collectivity`, `action_id`.
2. **Extraction** : workbook chargé depuis base64, lecture `row[4]` (id) et `row[5]` (value) → `extractedData[]`.
3. **Sync SharePoint** : collecte tous les `fileIds` concernés (prev + expost + fichiers config), lance en parallèle `importSheetsToExcelFile`.
4. **Matching DB** : charge les `Indicator` par `excel_indicator_id` et les `IndicatorValue` par `(indicator_id, situation, year?)`, Maps de lookup O(1).
5. **Conversion par type** : `number` → `parseFloat` (÷100 si `unit === '%'`) ; `checkbox` → `split(/[,;.]/).map(trim)` ; `radio`/`text` → `trim`.
6. **Bulk DB** : `bulkWrite` d'`updateOne` avec `$set: { value, value_source: 'import_excel' }` + un log par changement.
7. Update métadonnées action + `computeActionCompletion`.
8. Sync cross-action (cf. [§6](#6-workflow--mise-à-jour-dun-indicatorvalue-put-indicator_valueid) D) + propagation vers les autres fichiers.
9. Si action config → `updateOnboardingStatus`.

## 9. Endpoints d'agrégation (`/excel`)

**`POST /excel/home_aggregation`** — alimente le tableau de bord d'accueil ; regroupe les deux lectures ci-dessous (anciennes routes `global-gains` et `action-contribution`). Pour un `economic_actor`, cible le fichier d'agrégation de l'acteur pour la collectivité demandée.

*Gains globaux* — lit `Agrégation!B7:K39`. Détecte dynamiquement la colonne « année » (regex `/^\d{4}$/`), les colonnes « évolution relative » et « cumulée ». Slices : lignes 6-12 (gains prévisionnels), 16-22 (gains réels), 26-32 (écarts). Pour chaque indicateur (GES/PM/HC/NOx/CO/Nrj) renvoie :

```js
{ label, unit, evolutionRelativePrev, evolutionRelativeReel,
  evolutionCumuleePrev, evolutionCumuleeReel,
  yearlyPrev: [{ year, value }], yearlyReel: [{ year, value }] }
```

Calcule en plus `avancementTrajectoire = (ecartExpostRef / ecartPrevRef) * 100`.

*Contribution par action* — lit `Agrégation!C40:H300`, worksheets `['B2','B3','B4','C1'..'C7','C9']`. Pour chaque ligne matching, lit GES prev/réel 4 lignes plus loin ; classifie `type = (ges <= 0) ? 'gain' : 'degradation'` ; trie par `|GES|` décroissant.

**`POST /excel/action_aggregation`** — dashboard d'une action : lit `4. Gains par action` et `3. Émissions par action`. Colonne ciblée = `INSTANCE_COL_OFFSET[instance_number] + INSTANCE_EMISSION_COL[type]`. Calcule les écarts `init→ref`, `prev→ref`, `expost→ref`, `expost→prev`. Score d'atteinte = `(real / objective) * 100` (capped à 100/type) ; score final = moyenne des 6 types.

**`POST /excel/parent_action_aggregation`** — agrège tous les enfants d'une action parent.

**`POST /excel/compare_actions`** — construit des « bars » années (init, refs dédupliqués, prev, expost) avec interpolation linéaire des années manquantes ; renvoie une structure de graphique comparatif multi-action.

## 10. Calcul de complétion (ratio rempli / visible)

[utils/completion.js](../../api/src/utils/completion.js).

`isIndicatorValueFilled(iv)` : `checkbox` → `Array.isArray(val) && val.length > 0` ; autres → `val !== null && val !== undefined && val !== ''`.

`computeActionCompletion(actionId)` :
1. Charge IV + Action.
2. Construit `conditionValuesMap` (y compris dépendances transitives) et `yearMappings`.
3. Pour chaque situation : filtre les IV, exclut `HIDDEN_IDS`, garde celles où `shouldDisplayIndicator` est `true`, calcule `completion_{situation} = round((nbRemplis / total) * 100)` (0 si `total === 0`).
4. Si tous remplis ET total > 0 sur toutes les situations → `status = 'completed'`.
5. `bulkWrite` unique sur l'action.

## 11. Conditions d'affichage : évaluation récursive

[utils/indicators.js](../../api/src/utils/indicators.js).

`buildYearMappings(regularActions)` résout « pour cette situation/année, quelles années matcher dans les autres situations » :

```javascript
{
  'init_{year_init}':     { year_init: [...], year_ref: [...], year_prev: [...], year_expost: [...] },
  'ref_{year_ref}':       { ... },
  'prev_{year_prev}':     { ... },
  'expost_{year_expost}': { ... }
}
```

Les valeurs sont dédupliquées via `Set` puis converties en `Array`.

`shouldDisplayIndicator(iv, yearMappings, conditionValuesMap, visited)` :
1. Pas de `display_condition` → `true`.
2. Marque `iv._id` dans `visited` (détection de cycle).
3. Pour chaque condition : `targetSituation` = `condition.excel_indicator_situation` ou la situation courante ; `possibleYears` = `yearMappings['{iv.situation}_{iv.year}'][targetSituation]` ; cherche la source IV via clé `'{excel_indicator_id}_{situation}_{year}'`. Si la source est elle-même sous condition → appel récursif (anti-cycle). Évalue le test selon `condition.type` (cf. [API §5.2](02-api.md#52-conditions-daffichage-des-indicateurs)), applique `negate`.
4. Combine via `display_condition.operator` (`AND` / `OR`).

---

[← API](02-api.md) · [Sommaire](../../DOCUMENTATION.md) · [Application frontend →](04-frontend.md)
