# API

> Partie de la [documentation technique EVALUD](../../DOCUMENTATION.md).

**Sommaire**

1. [Authentification](#1-authentification)
2. [Modèles de données](#2-modèles-de-données)
3. [Routes et contrôleurs](#3-routes-et-contrôleurs)
4. [Services externes](#4-services-externes)
5. [Logique métier](#5-logique-métier)
6. [Codes d'erreur](#6-codes-derreur)
7. [Permissions et droits](#7-permissions-et-droits)

---

## 1. Authentification

### Stratégies Passport.js (`api/src/services/passport.js`)

Deux stratégies JWT sont enregistrées :

| Stratégie | Cible | Usage |
|-----------|-------|-------|
| `user` | role `user` ou `economic_actor` | `passport.authenticate('user', { session: false })` |
| `admin` | role `admin` | `passport.authenticate('admin', { session: false })` |

**Extraction du token** : header `Authorization: JWT <token>` (priorité) ou cookie `jwt` (fallback), lus via `getToken(req)`.

### Token JWT

- Type : JWT signé avec `SECRET`.
- Payload : `{ _id: user._id }`.
- **Expiration : `1y`** (`JWT_MAX_AGE` dans [controllers/user.js](../../api/src/controllers/user.js)).

### Flux d'authentification

**Flow signin** ([controllers/user.js](../../api/src/controllers/user.js)) :

1. `POST /user/signin` avec `{ email, password }`
2. Lookup user → comparaison bcrypt (`user.comparePassword`, skip en dev)
3. Génération du JWT
4. Pose du cookie `jwt` (httpOnly, secure en prod)
5. Réponse : `{ token, user, userActionRights, collectivity, economicActor }`

**Refresh** : `GET /user/signin_token` régénère un JWT et renvoie l'utilisateur courant + collectivité + droits.

### SSO Joptimiz (OAuth 2.0)

Second mode de connexion, à côté du couple email/mot de passe. Service : [services/joptimiz.js](../../api/src/services/joptimiz.js) ; route : `GET /user/sso/joptimiz` ([controllers/user.js](../../api/src/controllers/user.js)).

1. Le front redirige vers `GET /user/sso/joptimiz` (bouton « Se connecter avec Joptimiz » sur `/auth/signin`).
2. Sans `code` en query : l'API génère un `state` aléatoire, le pose en cookie `joptimiz_state` (httpOnly, 10 min) et redirige vers `{JOPTIMIZ_URL}/oauth/authorize`.
3. Joptimiz rappelle `JOPTIMIZ_REDIRECT_URI` avec `code` + `state`. L'API vérifie que `state` correspond au cookie, puis échange le code (`/oauth/token`) et lit `/oauth/userinfo`.
4. L'utilisateur est retrouvé par email (insensible à la casse) ou **créé** avec `role: 'user'` s'il n'existe pas.
5. JWT classique posé en cookie `jwt`, redirection vers `APP_URL`. En cas d'erreur : redirection vers `{APP_URL}/auth?sso_error=<code>`.

> Par défaut `config.js` pointe sur la préprod Joptimiz. En production, définir `JOPTIMIZ_URL=https://login.joptimiz.green`, `JOPTIMIZ_CLIENT_SECRET` et `JOPTIMIZ_REDIRECT_URI` sur l'URL publique de l'API.

### Gestion des mots de passe

- Hashés avec bcrypt (10 salt rounds) dans le hook `pre('save')` du modèle `User`.
- Méthode `user.comparePassword(plaintext)` disponible sur les instances.

### Invitation et réinitialisation

- **Invitation** : token stocké dans `user.invitation_token` (expiration `invitation_token_expires`). Route `POST /user/invite-accepted` : valide le token, crée/met à jour le compte, connecte l'utilisateur.
- **Reset** : token dans `user.password_reset_token` (expiration `password_reset_expires`). Route `POST /user/forgot_password_reset`.

---

## 2. Modèles de données

Les schémas Mongoose sont dans [api/src/models/](../../api/src/models/) et ont tous `timestamps: true` (`createdAt`, `updatedAt`).

### 2.1 Action — [action.js](../../api/src/models/action.js)

Représente une mesure environnementale mise en œuvre par une collectivité ou un acteur économique.

| Champ | Type | Valeurs / Notes |
|-------|------|-----------------|
| `type` | String (enum) | `custom` \| `reference` \| `global` \| `config` |
| `name` / `description` | String | Nom / description libre |
| `status` | String (enum) | `upcoming` \| `in_progress` \| `blocked` \| `completed` \| `no_status` (défaut) |
| `owner` | String (enum) | `collectivity` (défaut) \| `economic_actor` |
| `collectivity_id` / `collectivity_name` | String | Collectivité propriétaire (+ dénormalisation) |
| `action_collectivity_id` | String | Collectivité pour les actions global/reference |
| `economic_actor_id` / `economic_actor_name` | String | Acteur économique (si `owner = economic_actor`) |
| `action_parent_id` / `action_parent_name` | String | Action parente (null si racine) |
| `instance_number` | Number | Numéro d'instance (défaut 1, max 3) |
| `year_init` / `year_ref` / `year_prev` / `year_expost` | Number | Années des situations |
| `exel_files_prev` | Array | `[{ year_prev, year_ref, excel_file_id }]` — fichiers Excel prév. par année |
| `excel_files_expost` | Array | `[{ year_expost, year_ref, excel_file_id }]` — idem ex-post |
| `excel_worksheetname` | String | Nom de l'onglet Excel associé |
| `priority` | String (enum) | `high` \| `medium` \| `low` |
| `is_subsidized_by_program` | Boolean | Subventionné par le programme (défaut false) |
| `is_draft` | Boolean | Fiche brouillon (défaut false) : exclue du total dans l'Excel d'agrégation via le drapeau « Prise en compte » (voir [§4.4](#44-synchro-excel-différée--servicesexcelsyncjs)) |
| `pilote` / `pilote_description` | String | `epci` \| `acteur_economique` \| `autres` (+ précision) |
| `partners` / `partners_description` | String | idem |
| `budget_costs` / `budget_description` | Number / String | Coût de l'action |
| `financial_aid` / `financial_aid_description` | Number / String | Aide financière |
| `date_start` / `date_end` | Date | Début / fin |
| `blocked_reason` / `step_description` / `related_initiatives` / `comment` | String | — |
| `attached_documents` | Array | `[{ filename, original_name, file_type, mime_type, size, url, uploaded_at }]` |
| `custom_fields` | Array | `[{ name, type ('text'/'number'/'date'), value }]` |
| `completion_init/ref/prev/expost` | Number | % complétion par situation (0–100, défaut 0) |
| `last_modif_by_id/_name/_email` | String | Traçabilité de la dernière modification |
| `last_modif_date` | Date | Défaut `Date.now` |

**Types d'actions** : `global`/`reference` = référentiel national partagé ; `custom` = variante personnalisée d'une action globale par une collectivité ; `config` = données générales (parc de véhicules, données de base) affichées dans `/general-data`.

### 2.2 Indicator — [indicator.js](../../api/src/models/indicator.js)

| Champ | Type | Notes |
|-------|------|-------|
| `name` / `description` | String | — |
| `value_unit` | String | Unité (ex. `tCO2eq`, `kWh`, `%`) |
| `value_type` | String (enum) | `number` \| `text` \| `radio` \| `checkbox` |
| `excel_indicator_id` | String | **Clé de référence Excel** — identifiant de la variable (colonne E) |
| `value_possibilities` | Array | Options pour radio/checkbox |
| `value_default` | Object | `{ init, ref, prev, expost }` |
| `indicator_category_id/_name` | String | Catégorie principale |
| `indicator_sub_category_id/_name` | String | Sous-catégorie |
| `linked_action_id/_name` | String | Action parente de rattachement |
| `is_primordial` | Boolean | Indicateur clé pour la complétion (défaut false) |
| `presence_in_excel` | Object | `{ init, ref, prev, expost }: bool` |
| `excel_line_number` | Object | `{ init, ref, prev, expost }: number` |
| `display_condition` | Object | Condition d'affichage par situation (voir [Intégration Excel / SharePoint §11](03-excel-sharepoint.md#11-conditions-daffichage--évaluation-récursive)) |

Opérateurs supportés dans `display_condition.conditions[].type` : `equals`, `contains`, `greaterThan`, `lessThan`, `greaterOrEqual`, `lessOrEqual`, `notEmpty`, `isEmpty`.

### 2.3 IndicatorValue — [indicator_value.js](../../api/src/models/indicator_value.js)

Valeur réellement saisie pour un indicateur × action × situation × année.

| Champ | Type | Notes |
|-------|------|-------|
| `action_id` / `action_name` | String | — |
| `collectivity_id` / `_name` | String | — |
| `owner` | String (enum) | `collectivity` (défaut) \| `economic_actor` |
| `indicator_value_collectivity_id` | String | Collectivité de référence pour les droits |
| `economic_actor_id` / `_name` | String | — |
| `indicator_id` / `indicator_name` | String | — |
| `indicator_type` | String (enum) | `number` \| `text` \| `radio` \| `checkbox` |
| `indicator_value_possibilities` | Array | Options copiées depuis l'indicateur |
| `indicator_category_id/_name` / `indicator_sub_category_id/_name` | String | — |
| `indicator_value_unit` | String | — |
| `indicator_excel_id` | String | Copie de `excel_indicator_id` |
| `is_primordial` | Boolean | — |
| `excel_line_number` | Number | Ligne Excel pour cette situation |
| `display_condition` | Object | Copie de la condition de l'indicateur parent |
| `situation` | String (enum) | `init` \| `ref` \| `prev` \| `expost` |
| `year` | Number | Année de cette valeur |
| `value_source` | String | `manual` \| `import_excel` \| `default_value` \| `synchronization` \| `restore` |
| `comment` | String | — |
| `value` | Object | `{ text, number, radio, checkbox: [] }` |
| `value_default` | Object | `{ text, number, radio, checkbox: [] }` |

**Index MongoDB (6 index d'optimisation)** :

1. `{ indicator_id: 1, situation: 1 }`
2. `{ collectivity_id: 1, situation: 1 }`
3. `{ action_id: 1, situation: 1, year: 1 }`
4. `{ action_id: 1, excel_line_number: 1 }`
5. `{ owner: 1, action_id: 1 }`
6. `{ collectivity_id: 1, indicator_excel_id: 1, situation: 1, year: 1 }`

### 2.4 User — [user.js](../../api/src/models/user.js)

| Champ | Type | Notes |
|-------|------|-------|
| `name` | String | Prénom + nom |
| `email` | String | Unique, requis |
| `password` | String | Hashé bcrypt |
| `role` | String (enum) | `user` (défaut) \| `admin` \| `economic_actor` |
| `status` | String (enum) | `active` (défaut) \| `inactive` |
| `collectivities` | Array | `[{ id, name, role, status ('pending'/'approved'/'rejected') }]` |
| `economic_actor_id` / `_name` | String | Rempli si `role = economic_actor` |
| `invitation_token` / `_expires` / `_sent_at` / `_accepted_at` | — | Cycle de vie de l'invitation |
| `password_reset_token` / `_expires` | — | Réinitialisation |
| `last_login_at` | Date | Mis à jour à chaque connexion |
| `notifications_email` / `notifications_push` | Boolean | Défaut true |

> Un utilisateur peut appartenir à **plusieurs collectivités**, avec un rôle et un statut distincts pour chacune.

### 2.5 Collectivity — [collectivity.js](../../api/src/models/collectivity.js)

Communauté territoriale française (EPCI).

| Champ | Type | Notes |
|-------|------|-------|
| `name` | String | Unique |
| `description` / `department` | String | — |
| `population` / `area` / `year` | Number | Population, surface (km²), année de référence |
| `siren` | Number | Identifiant SIREN officiel |
| `basedata_onboarded` | Boolean | Données de base renseignées (défaut false) |
| `parc_types_onboarded` | Boolean | Parc types renseigné (défaut false) |
| `sharepoint_folder_id` | String | Dossier SharePoint des fichiers Excel |
| `aggregation_excel_file_id` | String | Fichier Excel d'agrégation de la collectivité (voir [Intégration Excel / SharePoint §1](03-excel-sharepoint.md#1-organisation-sharepoint)) |

### 2.6 EconomicActor — [economic_actor.js](../../api/src/models/economic_actor.js)

| Champ | Type | Notes |
|-------|------|-------|
| `name` | String | Requis |
| `description` | String | — |
| `collectivities` | Array | `[{ id, name, joined_at, aggregation_excel_file_id, basedata_onboarded, parc_types_onboarded }]` |

> Un acteur économique peut être rattaché à plusieurs collectivités ; l'historique des rattachements est conservé.

### 2.7 UserActionRight — [user_action_right.js](../../api/src/models/user_action_right.js)

| Champ | Type | Notes |
|-------|------|-------|
| `user_id` / `user_name` | String | — |
| `collectivity_id` / `_name` | String | — |
| `action_id` / `action_name` | String | — |
| `description` | String | Note libre |
| `can_read` | Boolean | Défaut true |
| `can_write` | Boolean | Défaut false |

> **Règle** : `can_write = true` implique nécessairement `can_read = true`.

### 2.8 Log — [log.js](../../api/src/models/log.js)

Journal d'audit de toutes les modifications.

| Champ | Type | Notes |
|-------|------|-------|
| `model_name` / `name` / `field` | String | Modèle, entité et champ modifiés |
| `operation` | String (enum) | `add` \| `update` \| `delete` \| `duplicate` \| `add_previsionnel` \| `add_expost` \| `remove_previsionnel` \| `remove_expost` |
| `new_value` / `previous_value` | Object | `{ string, array: [], number: 0, date, boolean: false }` |
| `type_value` | String | Type de la valeur |
| `date` | Date | Défaut `Date.now` |
| `source` | String (enum) | `manual` \| `import_excel` \| `default_value` \| `synchronization` \| `restore` |
| `user_*` / `indicator_*` / `collectivity_*` / `action_*` / `economic_actor_*` | String | Contexte dénormalisé |

### 2.9 Notification — [notification.js](../../api/src/models/notification.js)

| Champ | Type | Notes |
|-------|------|-------|
| `message` | String | Texte |
| `user_id` / `_name` / `_email` | String | Destinataire |
| `redirect` | String | URL de redirection (optionnel) |
| `read_at` | Date | `null` si non lue |

### 2.10 IndicatorCategory — [indicator_category.js](../../api/src/models/indicator_category.js)

| Champ | Type | Notes |
|-------|------|-------|
| `name` / `description` | String | — |
| `type` | String (enum) | `principal` \| `sub` |
| `principal_category_id` / `_name` | String | Rempli si `type = sub` |

---

## 3. Routes et contrôleurs

Format de toutes les réponses : `{ ok: true/false, data: ..., code: "ERROR_CODE" }`. Auth notée : 🔓 public · 👤 `authenticate('user')` (user ou economic_actor) · 🛡️ `authenticate('admin')` · 👤🛡️ user **ou** admin.

### `/user` — [controllers/user.js](../../api/src/controllers/user.js)

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| POST | `/signin` | 🔓 | Connexion email/password, retourne token + user |
| POST | `/signup` | 🔓 | Inscription + connexion automatique |
| POST | `/logout` | 🔓 | Clear cookie JWT |
| GET | `/sso/joptimiz` | 🔓 | Connexion via Joptimiz (redirection OAuth puis callback, voir [§1](#1-authentification)) |
| GET | `/signin_token` | 👤🛡️ | Vérifie le token, retourne user + collectivité + droits |
| POST | `/forgot_password` | 🔓 | Envoie l'email de réinitialisation |
| POST | `/forgot_password_reset` | 🔓 | Réinitialise le mot de passe via token |
| POST | `/reset_password` | 👤 | Change le mot de passe de l'utilisateur connecté (vérifie l'ancien mot de passe) |
| POST | `/reset_password/:id` | 👤🛡️ | Change le mot de passe d'un utilisateur (un `user` ne peut cibler que lui-même) |
| GET | `/:id` | 👤🛡️ | Détail utilisateur |
| POST | `/search` | 👤🛡️ | Recherche (search, sort, pagination) |
| POST | `/` | 🛡️ | Création utilisateur |
| PUT | `/:id` / `/` | 👤🛡️ | Met à jour un utilisateur / l'utilisateur courant |
| DELETE | `/:id` | 🛡️ | Supprime |
| POST | `/invite` | 👤🛡️ | Invite à une collectivité (envoi Brevo) |
| POST | `/send-invite/:id` | 🛡️ | Renvoi invitation |
| POST | `/check-invitation-token` | 🔓 | Validation du token |
| POST | `/invite-accepted` | 🔓 | Accepte l'invitation + définit le mot de passe |
| POST | `/request-collectivity-access` | 👤 | Demande d'accès à une collectivité (`collectivityId`) : ajoute l'entrée `collectivities[]` en `status: 'pending'`, notifie les admins de la collectivité (notification + email Brevo). L'approbation se fait ensuite par `PUT /user/:id` sur le statut de l'entrée. |

### `/action` — [controllers/action.js](../../api/src/controllers/action.js)

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| GET | `/:id` | 👤🛡️ | Récupère une action |
| POST | `/search` | 👤🛡️ | Recherche filtrée (type, statut, collectivité, budget…) |
| POST | `/` | 👤🛡️ | Crée une action (copie depuis l'action globale + Excel) |
| PUT | `/:id` | 👤🛡️ | Met à jour + log + recalcul de complétion |
| DELETE | `/:id` | 👤🛡️ | Supprime l'action, ses valeurs et ses fichiers Excel |
| POST | `/add_year_previsionnel` | 👤🛡️ | Ajoute une année prévisionnelle |
| POST | `/add_year_expost` | 👤🛡️ | Ajoute une année ex-post |
| POST | `/remove_year_previsionnel` / `/remove_year_expost` | 👤🛡️ | Retire une année |

### `/indicator` — [controllers/indicator.js](../../api/src/controllers/indicator.js)

CRUD (`GET /:id`, `POST /search`, `POST /`, `PUT /:id`, `DELETE /:id`). Le `PUT` propage les modifications aux `IndicatorValue` liés et crée un log. Création/suppression réservées 🛡️.

### `/indicator_value` — [controllers/indicator_value.js](../../api/src/controllers/indicator_value.js)

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| POST | `/stats` | 👤🛡️ | Taux de complétion par situation / année |
| POST | `/search` | 👤🛡️ | Recherche (action, situation, année, collectivité) |
| GET | `/:id` | 👤🛡️ | Récupère une valeur (possibilités et noms dynamiques résolus) |
| POST | `/` | 👤🛡️ | Crée une valeur + sync Excel + agrégation + log |
| PUT | `/:id` | 👤🛡️ | Met à jour + sync Excel + agrégation + log |
| DELETE | `/:id` | 👤🛡️ | Supprime + cleanup Excel |
| POST | `/condition_values` | 👤🛡️ | Valeurs des indicateurs référencés en conditions |
| POST | `/check-general-data-completion` | 👤🛡️ | Complétion des actions config d'une collectivité, groupée par action liée |
| GET | `/sync_status/:action_id` | 👤🛡️ | `{ pending }` : la synchro Excel différée de l'action est-elle encore en attente (voir [§4.4](#44-synchro-excel-différée--servicesexcelsyncjs)) |
| POST | `/export_indicator_values_excel` | 👤🛡️ | Exporte la feuille de saisie en Excel |
| POST | `/importIndicatorValues` | 👤🛡️ | Importe des valeurs depuis un fichier Excel |

### `/collectivity` — [controllers/collectivity.js](../../api/src/controllers/collectivity.js)

CRUD (`GET /:id`, `POST /search` avec count d'actions, `POST /` 🛡️ + dossier SharePoint + Excel d'agrégation, `PUT /:id`, `DELETE /:id` 🛡️). La demande d'adhésion d'un utilisateur et son approbation ne passent pas par ce contrôleur mais par `/user` (voir `POST /user/request-collectivity-access` ci-dessus).

### `/economic_actor` — [controllers/economic_actor.js](../../api/src/controllers/economic_actor.js)

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| POST | `/` | 🛡️ | Crée un acteur économique |
| POST | `/search` | 👤🛡️ | Recherche |
| GET | `/:id` | 👤🛡️ | Récupère |
| PUT | `/:id` | 👤🛡️ | Met à jour |
| PUT | `/:id/add_collectivity` | 👤🛡️ | Rattache à une collectivité + Excel d'agrégation |
| DELETE | `/:id` | 🛡️ | Suppression cascade (actions + IVs) |

### `/excel` — [controllers/excel.js](../../api/src/controllers/excel.js)

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| POST | `/home_aggregation` | 👤🛡️ | Agrégation du tableau de bord d'accueil (gains globaux + contribution par action) d'une collectivité ou d'un acteur économique |
| POST | `/action_aggregation` | 👤🛡️ | Agrégation des indicateurs d'une action |
| POST | `/parent_action_aggregation` | 👤🛡️ | Agrégation de toutes les instances d'une action |
| POST | `/compare_actions` | 👤🛡️ | Comparaison de deux actions |
| POST | `/export` | 👤🛡️ | Renvoie `{ downloadUrl, fileName }` pour télécharger n'importe quel fichier SharePoint par `fileId` (fichier d'action ou d'agrégation) |

### `/indicator_category` — [controllers/indicator_category.js](../../api/src/controllers/indicator_category.js)

CRUD (`GET /:id`, `POST /search`, `POST /`, `PUT /:id`, `DELETE /:id`), 👤🛡️.

### `/contact` — [controllers/contact.js](../../api/src/controllers/contact.js)

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| POST | `/` | 🔓 | Formulaire de contact (`name`, `email`, `subject`, `message`) : envoie un email via Brevo au destinataire codé en dur `CONTACT_RECIPIENT`, avec `replyTo` sur l'expéditeur |

### `/dashboard`, `/log`, `/user_action_right`, `/notification`

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| POST | `/dashboard/synthese` | 👤🛡️ | Counts des actions par statut pour une collectivité (`collectivity_id`) |
| GET | `/dashboard/collectivities` | 🛡️ | Vue de suivi admin : toutes les collectivités avec leurs actions (statut, complétion par situation, dernière modification). Alimente `/admin/suivi`. |
| POST | `/log/search` | 👤🛡️ | Journal d'audit filtré (`model_name`, `action_id`, `field`, `operation`) |
| GET/PUT/POST/DELETE | `/log/:id` · `/log/` | 👤🛡️ | CRUD générique sur les logs (les logs sont en pratique créés par les autres contrôleurs, pas via cette route) |
| POST | `/user_action_right/` · `/search` | 👤🛡️ | Crée / recherche un droit |
| PUT/DELETE | `/user_action_right/:id` | 👤🛡️ | Met à jour / supprime un droit |
| POST | `/notification/search` | 👤🛡️ | Notifications de l'utilisateur connecté |
| PUT | `/notification/:id` | 👤🛡️ | Marque comme lu (`read_at = now`) |
| GET/POST/DELETE | `/notification/:id` · `/notification/` | 👤🛡️ | Lecture, création et suppression d'une notification |

---

## 4. Services externes

### 4.1 Brevo (Email) — [services/brevo.js](../../api/src/services/brevo.js)

Base `https://api.brevo.com/v3`, auth via header `api-key: BREVO_KEY`. Sert aux invitations, emails de réinitialisation et notifications par email (si `user.notifications_email = true`).

Fonctions : `sendEmail(...)`, `sendTemplate(templateId, ...)`, `createContact`/`updateContact`/`deleteContact`, `sync(user)`/`unsync(user)`, `getEmailsList`, `getEmailContent`, `downloadAttachment`. Liste cible : prod = list 9, dev = list 11.

### 4.2 Microsoft Graph (SharePoint / Excel) — [services/microsoftGraph.js](../../api/src/services/microsoftGraph.js)

Service central pour toute interaction avec SharePoint et les fichiers Excel des collectivités. Détaillé au [partie Intégration Excel / SharePoint](03-excel-sharepoint.md).

```
TENANT_ID, CLIENT_ID, CLIENT_SECRET   → Auth Azure AD (client credentials, lus via process.env)
sharePointSiteName        = 'selegobv'
masterExcelFileId         → fichier maître action (constante en tête du fichier)
aggregationTemplateFileId → template Excel d'agrégation collectivité (idem)
```

> 📁 **Fichiers Excel de référence** : tous les classeurs (masters, templates, dossiers des collectivités) sont sur le SharePoint [Documents partagés](https://selegobv.sharepoint.com/Documents%20partages/Forms/AllItems.aspx). La dernière version du master s'y trouve directement ; l'ID utilisé par l'application est la constante correspondante en tête de `microsoftGraph.js`. Le master change souvent (une version toutes les deux à trois semaines en 2026) : ne pas recopier d'ID dans la doc, toujours se référer au code.

**Mapping des onglets Excel par situation** :

| Situation | Nom de l'onglet |
|-----------|-----------------|
| `init` | `Remplissage - Sit. Init.` |
| `ref` | `Remplissage - Sit. Ref.` |
| `prev` | `Remplissage - Sit. Prev.` |
| `expost` | `Remplissage - Sit. Expost` |

**Fonctions principales** :

| Fonction | Description |
|----------|-------------|
| `getAccessToken()` | OAuth2 client credentials, token caché (tampon 2 min) |
| `getSiteId()` | ID du site SharePoint, mis en cache |
| `graphFetch(endpoint, options)` | Wrapper avec retry (max 3, backoff expo., codes 429/5xx) |
| `getCachedSession(fileId)` / `graphFetchWithSession(fileId, endpoint, options)` | Sessions workbook persistantes mises en cache par fichier (voir [Intégration Excel / SharePoint §3](03-excel-sharepoint.md#3-microsoft-graph--auth-cache-et-résilience)) |
| `calculateWorkbook(fileId)` | Force le recalcul des formules du classeur |
| `updateExcelCellByIndicatorId(...)` | Met à jour une cellule via l'ID indicateur (colonne E → F) |
| `updateExcelCellsBatch(...)` | Mise à jour batch d'une plage contiguë |
| `createFolder(...)` | Crée un dossier SharePoint (comportement `rename` si doublon) |
| `duplicateExcelFile(...)` | Duplique le fichier maître (polling max 20 tentatives) |
| `exportExcelFile(fileId)` | Retourne `{ downloadUrl, fileName }` |
| `exportExcelFileWithSpecificSheets(...)` | Télécharge puis supprime les onglets non demandés |
| `importSheetsToExcelFile(...)` | Import depuis un fichier Excel uploadé vers SharePoint |
| `clearWorksheetValues(fileId, situation)` | Efface la colonne F d'un onglet |
| `readExcelDefaultValues(fileId, situation)` | Lit les valeurs par défaut (colonne H) |

### 4.3 Sentry — [services/sentry.js](../../api/src/services/sentry.js)

Tracking d'erreurs en production (`SENTRY_DSN`). Le contexte utilisateur (id, username, email) est enrichi à chaque authentification réussie. `initSentry(app)`, `setupErrorHandler(app)`, `capture(err)`.

### 4.4 Synchro Excel différée — [services/excelSync.js](../../api/src/services/excelSync.js)

Depuis octobre 2026, `PUT /indicator_value/:id` n'attend plus SharePoint. Les écritures sont **accumulées en mémoire puis écrites en une passe** (debounce), pour ne pas rejouer tout le pipeline (cellule + recalcul + agrégation) à chaque champ modifié.

| Export | Rôle |
|--------|------|
| `enqueueCellUpdate({ fileId, situation, excelIndicatorId, value, unit })` | Enregistre une cellule à écrire (colonne F). Une nouvelle valeur pour le même indicateur/fichier/situation écrase celle en attente. |
| `enqueueAggregation({ actionId, situation, year })` | Enregistre une propagation vers le fichier d'agrégation, dédupliquée par action/situation/année. |
| `isSyncPending(actionId)` | `true` tant que le dashboard de l'action ne reflète pas les dernières modifs (exposé par `GET /indicator_value/sync_status/:action_id`). |
| `writeDraftFlag(action)` | Écrit VRAI/FAUX dans la cellule « Prise en compte » de l'instance dans `1. Données d'entrée` (FAUX si `is_draft`). Écriture directe, sans debounce. |
| `warmSessionsForAction(action)` | Ouvre en avance (à l'ouverture de l'action, `GET /action/:id`) les sessions workbook des fichiers de l'action et du fichier d'agrégation. |

**Déclenchement du flush** : `DEBOUNCE_MS = 1000` après la dernière modif, plafonné à `MAX_WAIT_MS = 30000` depuis la première modif en attente. Les flushs sont **chaînés** (jamais deux en parallèle, les fichiers pouvant être partagés).

**Ordre d'un flush** :

1. Cellules : un `updateExcelCellsBatch` par couple (fichier, situation), fichiers en parallèle.
2. Défauts : `refreshDefaultsAfterSync` sur chaque fichier écrit (voir [§4.5](#45-relecture-des-défauts--servicesexceldefaultsjs)).
3. Agrégations : `writeAggregationTargets` lit la feuille `Agrégation` de chaque fichier source (après recalcul) et écrit les cibles dans `1. Données d'entrée` du fichier d'agrégation, en **un seul PATCH** sur la plage min→max de la colonne de l'instance (I/J/K), les cellules intermédiaires étant relues et réécrites à l'identique via `formulas`.

### 4.5 Relecture des défauts — [services/excelDefaults.js](../../api/src/services/excelDefaults.js)

`refreshDefaultsAfterSync(fileId, { dryRun, writtenSituations })`. Certaines formules de la colonne H (répartitions, produits, SUMIFS, chaînes de défauts) ne peuvent pas être suivies en temps réel par l'app : une fois les saisies écrites dans le fichier de la collectivité, Excel les recalcule et l'app relit H.

Pour chaque `IndicatorValue` de l'action du fichier :
- `value_default` est mis à jour (une cellule en erreur `#REF!`/`#N/A` conserve l'ancien défaut).
- `value` n'est modifiée que pour les indicateurs **non primordiaux** dont la valeur est vide ou égale à l'ancien défaut (jamais touchée par l'utilisateur) ; ces valeurs sont réécrites en colonne F.
- Plusieurs passes jusqu'à stabilité (`MAX_PASSES = 3`), car une valeur réécrite en F peut faire bouger d'autres H.
- `writtenSituations` limite la relecture aux situations impactées (`init` alimente tout, `ref` alimente prév et ex-post, etc.). Omis à la création d'action : toutes les situations.
- Périmètre : l'action du fichier uniquement, jamais les actions config.

Appelée par le flush d'`excelSync` et, directement, à la création d'action et à l'ajout d'année prév./ex-post.

### 4.6 Joptimiz (SSO) — [services/joptimiz.js](../../api/src/services/joptimiz.js)

Client OAuth 2.0 minimal : `getAuthorizationUrl(state)`, `exchangeCode(code)`, `getUserInfo(accessToken)`. Flux détaillé au [§1](#1-authentification).

---

## 5. Logique métier

> Cette section donne la vue d'ensemble. Le détail des workflows Excel/SharePoint (création d'action, sync, agrégation, import/export) est au [partie Intégration Excel / SharePoint](03-excel-sharepoint.md).

### 5.1 Calcul de complétion — [utils/completion.js](../../api/src/utils/completion.js)

`computeActionCompletion(actionId)` calcule et met à jour `completion_init/ref/prev/expost` :

1. Charge l'action et ses `IndicatorValue` (retour immédiat si aucune valeur).
2. Construit la map des valeurs conditionnelles (pour évaluer les `display_condition`).
3. Construit les `yearMappings` depuis les actions non-config.
4. Pour chaque situation : filtre les valeurs, exclut les IDs cachés `['AnneeRempl', 'AnRef', 'ActionsAutres', 'ActionsCharte']`, évalue l'affichage (`shouldDisplayIndicator`), compte les valeurs renseignées (`isIndicatorValueFilled`), calcule `round((renseignées / affichées) * 100)`.
5. Met à jour `action.completion_*`. Si toutes les valeurs visibles sont renseignées → `status = 'completed'`.

> Appelée à chaque `PUT /indicator_value/:id` et à chaque import Excel.

### 5.2 Conditions d'affichage des indicateurs

Un indicateur peut n'être affiché que si une ou plusieurs conditions sont remplies sur d'autres indicateurs. Détail de l'évaluation récursive au [Intégration Excel / SharePoint §11](03-excel-sharepoint.md#11-conditions-daffichage--évaluation-récursive).

```json
{
  "init": {
    "operator": "AND",
    "conditions": [
      { "type": "equals", "excel_indicator_id": "TypeVehicule",
        "excel_indicator_situation": "init", "value": "Electrique", "negate": false }
    ]
  }
}
```

| Type | Comportement |
|------|--------------|
| `equals` | Égalité stricte (tableaux : tri puis comparaison JSON) |
| `contains` | Tableau ou texte : `.includes()` |
| `greaterThan` / `lessThan` | Comparaison numérique `>` / `<` |
| `greaterOrEqual` / `lessOrEqual` | `>=` / `<=` |
| `notEmpty` / `isEmpty` | Valeur (non) nulle / vide / tableau (non) vide |

`negate: true` inverse le résultat. `excel_indicator_situation` lit la valeur dans une autre situation. `operator` global : `AND` / `OR`. **Évaluation transitive** avec anti-boucle (`visited` Set).

### 5.3 Helpers, codes d'erreur, constantes

- [utils/indicators.js](../../api/src/utils/indicators.js) : `HIDDEN_IDS`, `buildYearMappings`, `shouldDisplayIndicator`.
- [utils/errorCodes.js](../../api/src/utils/errorCodes.js) : codes métier FR (voir [§6](#6-codes-derreur)).
- [utils/index.js](../../api/src/utils/index.js) : `uploadToS3FromBuffer(...)`, `validatePassword(...)`.
- [utils/constants.js](../../api/src/utils/constants.js) : `BREVO_TEMPLATES`.

---

## 6. Codes d'erreur

Retournés sous la forme `{ ok: false, code: 'ERROR_CODE' }` avec un status HTTP approprié.

| Code | Message français |
|------|------------------|
| `EMAIL_AND_PASSWORD_REQUIRED` | Email et mot de passe requis |
| `EMAIL_OR_PASSWORD_INVALID` | Mot de passe ou email incorrect |
| `USER_NOT_EXISTS` / `USER_NOT_FOUND` | Utilisateur non trouvé |
| `USER_ALREADY_REGISTERED` | Cette adresse e-mail est déjà enregistrée |
| `EMAIL_ALREADY_EXIST` | Cette adresse e-mail existe déjà |
| `PASSWORDS_NOT_MATCH` / `..._DO_NOT_MATCH` | Les mots de passe ne correspondent pas |
| `PASSWORD_INVALID` / `PASSWORD_NOT_VALIDATED` | Mot de passe invalide |
| `PASSWORD_TOKEN_EXPIRED_OR_INVALID` | Token de mot de passe expiré ou invalide |
| `INVITATION_TOKEN_EXPIRED` | Token d'invitation expiré |
| `UNAUTHORIZED` | Non autorisé |
| `FORBIDDEN` | Accès refusé |
| `NOT_FOUND` | Ressource non trouvée |
| `INVALID_BODY` | Corps de la requête invalide |
| `SERVER_ERROR` | Une erreur est survenue |
| `COLLECTIVITY_ALREADY_EXISTS` | Collectivité déjà existante |
| `INDICATOR_ALREADY_EXISTS` | Indicateur déjà existant |
| `ALREADY_MEMBER` | Cet utilisateur est déjà membre de la collectivité |
| `ALREADY_REQUESTED` | Demande déjà effectuée |
| `MAX_INSTANCES_REACHED` | Nombre maximum d'instances atteint |
| `YEAR_PREV_ALREADY_EXISTS` | Année prévisionnelle déjà existante |
| `YEAR_EXPOST_ALREADY_EXISTS` | Année ex-post déjà existante |

---

## 7. Permissions et droits

Le contrôle d'accès s'articule sur quatre niveaux.

**1. Rôle global (`user.role`)**

| Rôle | Accès |
|------|-------|
| `user` | Données de ses collectivités approuvées uniquement |
| `economic_actor` | Données de son entité (actions économiques) uniquement |
| `admin` | Accès total, toutes collectivités, endpoints admin |

**2. Rôle dans une collectivité (`user.collectivities[].role`)**

| Rôle | Pouvoirs |
|------|----------|
| `user` | Lire et saisir selon les droits d'action accordés |
| `admin` | Tous les droits + gestion des membres + invitations |

**3. Statut dans une collectivité (`user.collectivities[].status`)**

| Statut | Accès |
|--------|-------|
| `pending` | En attente, aucun accès aux données |
| `approved` | Accès accordé |
| `rejected` | Refusé, aucun accès |

**4. Droits par action (`UserActionRight`)** — niveau le plus granulaire. `can_read: true` → peut voir l'action ; `can_write: true` → peut modifier (implique `can_read`). Un utilisateur sans droit sur une action ne la voit pas.

> Les administrateurs globaux ne sont pas soumis aux droits par action.

**Stratégies Passport dans les routes** :

```javascript
// Utilisateurs et acteurs économiques
router.get('/:id', passport.authenticate('user', { session: false }), handler)

// Admins uniquement
router.post('/', passport.authenticate('admin', { session: false }), handler)
```

---

[← Architecture et démarrage](01-architecture-et-demarrage.md) · [Sommaire](../../DOCUMENTATION.md) · [Intégration Excel / SharePoint →](03-excel-sharepoint.md)
