# Domaine métier

> Partie de la [documentation technique EVALUD](../../DOCUMENTATION.md).

**Sommaire**

1. [Concepts clés](#1-concepts-clés)
2. [Glossaire métier](#2-glossaire-métier)

---

## 1. Concepts clés

### Les 4 situations temporelles

| Code | Nom | Description |
|------|-----|-------------|
| `init` | Initiale | État de départ avant toute action |
| `ref` | Référence | Ce qui se passerait sans l'action (année de référence) |
| `prev` | Prévisionnelle | Résultats attendus après mise en œuvre |
| `expost` | Ex-post | Résultats réellement mesurés |

> **Calcul du gain** : le gain d'une action = différence entre `ref` et `expost`.

**La référence est rattachée à une année de projection.** Une situation de référence n'existe pas dans l'absolu : c'est « ce qui se passerait sans l'action *en telle année* ». Elle est donc toujours associée à une année prévisionnelle ou ex-post précise, et porte la même année (`year_ref = year_prev` ou `year_ref = year_expost`). Une action projetée sur plusieurs années a autant de références que d'années de projection ; seule la situation initiale est unique (`year_init`). Conséquence technique : un fichier Excel par année de projection, voir [Intégration Excel / SharePoint §1](03-excel-sharepoint.md#1-organisation-sharepoint).

### Indicateurs primordiaux (`is_primordial`)

Marqués `is_primordial: true`, ce sont les indicateurs clés dont le remplissage est requis pour qu'une action soit considérée complétée. Un filtre de l'interface permet de n'afficher que ceux-ci.

### Identifiant Excel (`excel_indicator_id`)

Chaque indicateur a un identifiant unique qui le relie à une variable dans les feuilles SharePoint. C'est **la clé de jonction** entre la base de données et les fichiers Excel. Exemples : `TypeVehicule`, `NbVehicules`, `GES_init`.

> **IDs cachés** (jamais affichés dans l'UI, exclus de la complétion) : `'AnneeRempl'`, `'AnRef'`, `'ActionsAutres'`, `'ActionsCharte'`.

### Onboarding d'une collectivité

Une collectivité est « onboardée » quand `collectivity.basedata_onboarded = true` (données de base) **et** `collectivity.parc_types_onboarded = true` (parc types). Tant que l'onboarding n'est pas complet, les graphiques du tableau de bord sont verrouillés.

### Propriété d'une action (`owner`)

- `collectivity` : l'action appartient à une collectivité (cas le plus courant).
- `economic_actor` : l'action appartient à un acteur économique privé.

Les requêtes et les droits sont scopés en conséquence.

### Actions config : « Données de base » et « Parc types »

Certaines données ne dépendent pas d'une action mais du territoire : la population, le SIREN, la surface, et surtout le **parc de véhicules** (répartition par motorisation, âge, type). Elles sont portées par deux actions spéciales de `type: 'config'`, créées automatiquement à la première action d'une collectivité : **« Données de base »** et **« Parc types »**. Leurs indicateurs n'ont pas de `linked_action_id`. Elles s'affichent dans `/general-data`, jamais dans la liste des actions.

**Règle d'unicité.** Il existe une seule action « Parc types » et une seule « Données de base » par collectivité (et une paire distincte par acteur économique rattaché, voir `owner`). Chacune porte **une seule valeur par indicateur, par situation et par année** : le parc types de la situation initiale 2024 est le même pour toutes les actions de la collectivité dont l'année initiale est 2024. Il n'y a donc pas de parc types « de l'action A » ou « de l'action B ».

**Années couvertes.** Les valeurs config existent pour chaque couple (situation, année) utilisé par au moins une action régulière de la collectivité. Elles sont créées à la création d'une action ou à l'ajout d'une année prévisionnelle / ex-post, uniquement si le couple n'existe pas encore ; sinon la valeur existante est réutilisée telle quelle. Quand plus aucune action n'utilise un couple, les valeurs config correspondantes sont supprimées.

**Côté Excel, la donnée est dupliquée.** Il n'y a pas de fichier Excel « Parc types » : chaque fichier d'action (un par action et par année) contient sa propre copie des cellules de données de base et de parc types, car les formules du master en dépendent. Deux conséquences :

- à la création d'un fichier d'action, les valeurs config déjà saisies sont recopiées dedans ;
- à chaque modification d'une valeur config dans `/general-data`, elle est propagée à **tous** les fichiers d'action de la collectivité concernés par la même situation et la même année.

La base MongoDB reste la source de vérité unique ; les fichiers Excel n'en sont que des copies synchronisées. Le mécanisme de recopie et de propagation est décrit dans la partie [Intégration Excel / SharePoint §5](03-excel-sharepoint.md#5-workflow--création-daction-post-action) (étapes D et E) et [§6](03-excel-sharepoint.md#6-workflow--mise-à-jour-dun-indicatorvalue-put-indicator_valueid) (étape A).

**Onboarding.** Une collectivité est considérée onboardée quand toutes les valeurs visibles de ses deux actions config sont renseignées (`basedata_onboarded`, `parc_types_onboarded`).

---

## 2. Glossaire métier

| Terme | Définition |
|-------|------------|
| **EVALUD** | Plateforme web de suivi d'impact environnemental du programme InTerLUD+. |
| **InTerLUD+** | Programme national d'accompagnement à la décarbonation de la logistique urbaine. |
| **EPCI** | Établissement Public de Coopération Intercommunale — regroupement de communes (ici « collectivité »). |
| **Logistique urbaine** | Ensemble des flux de marchandises en ville (livraisons, dernier kilomètre). |
| **GES** | Gaz à Effet de Serre, exprimés en équivalent CO₂ (tCO₂eq). |
| **NOx** | Oxydes d'azote, polluants atmosphériques issus de la combustion. |
| **PM** | Particules fines (Particulate Matter), polluant atmosphérique. |
| **Action** | Mesure environnementale concrète mise en œuvre (ex. flotte de véhicules électriques). |
| **Indicateur** | Variable mesurable rattachée à une action (ex. nombre de véhicules, GES émis). |
| **Situation initiale (init)** | État de départ avant toute action. |
| **Situation de référence (ref)** | Scénario sans l'action, base de comparaison. |
| **Situation prévisionnelle (prev)** | Résultats attendus après mise en œuvre. |
| **Situation ex-post (expost)** | Résultats réellement mesurés après mise en œuvre. |
| **Gain** | Différence entre la situation de référence et la situation ex-post. |
| **Onboarding** | Processus de renseignement initial des données de base d'une collectivité. |
| **Acteur économique** | Entreprise ou organisation privée participant au programme. |

---

[← Application frontend](04-frontend.md) · [Sommaire](../../DOCUMENTATION.md)
