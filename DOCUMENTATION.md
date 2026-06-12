# Documentation technique — EVALUD / InTerLUD+

*Plateforme de suivi d'impact environnemental — logistique urbaine*

Référence technique complète — API · Application · Domaine métier
Document mixte : onboarding développeurs & archivage projet.

**Version 1.1** — Généré le 27 mai 2026

> Conventions de lecture : les noms de fichiers, champs, routes et identifiants sont en `police à chasse fixe`. Les blocs `> ⚠️` signalent un point d'attention ; les blocs `> 🔒` un point de sécurité à traiter. Conventions générales : voir [CLAUDE.md](CLAUDE.md). Application en français, réponses API au format `{ ok, data, code }`.

---

## Table des matières

1. [Vue d'ensemble du système](#1-vue-densemble-du-système)
2. [Architecture du monorepo](#2-architecture-du-monorepo)
3. [API — Configuration et démarrage](#3-api--configuration-et-démarrage)
4. [API — Authentification](#4-api--authentification)
5. [API — Modèles de données](#5-api--modèles-de-données)
6. [API — Routes et contrôleurs](#6-api--routes-et-contrôleurs)
7. [API — Services externes](#7-api--services-externes)
8. [API — Logique métier](#8-api--logique-métier)
9. [API — Codes d'erreur](#9-api--codes-derreur)
10. [App — Architecture frontend](#10-app--architecture-frontend)
11. [App — État global (Zustand)](#11-app--état-global-zustand)
12. [App — Client API](#12-app--client-api)
13. [App — Routing et layouts](#13-app--routing-et-layouts)
14. [App — Utilitaires frontend](#14-app--utilitaires-frontend)
15. [Domaine métier — Concepts clés](#15-domaine-métier--concepts-clés)
16. [Intégration Excel / SharePoint (workflows détaillés)](#16-intégration-excel--sharepoint-workflows-détaillés)
17. [Permissions et droits](#17-permissions-et-droits)
18. [Variables d'environnement](#18-variables-denvironnement)
19. [Conventions de code](#19-conventions-de-code)
20. [Infrastructure et déploiement](#20-infrastructure-et-déploiement)
- [Glossaire métier](#glossaire-métier)

---

## Avant-propos

Ce document constitue la référence technique complète des applications EVALUD / InTerLUD+. Il s'adresse à la fois aux développeurs rejoignant le projet (onboarding) et à l'archivage long terme. Toute question portant sur un concept, un modèle de données, une route d'API, une règle métier ou un comportement de l'application devrait trouver sa réponse ici.

---

## 1. Vue d'ensemble du système

**EVALUD** est une plateforme web de suivi d'impact environnemental pour le programme national **InTerLUD+** (charte logistique urbaine durable). Elle permet à des collectivités territoriales françaises (EPCI) et à des acteurs économiques de saisir des indicateurs sur leurs actions de décarbonation de la logistique urbaine, puis de calculer les gains obtenus en gaz à effet de serre (GES), oxydes d'azote (NOx), particules (PM) et énergie, sur 4 situations temporelles.

### Stack technique

| Couche | Technologie |
|--------|-------------|
| **Backend** (`api/`) | Node.js + Express + MongoDB (Mongoose) |
| **Frontend principal** (`app/`) | React 18 + Vite + Zustand + TailwindCSS + DSFR |
| **Admin** (`admin/`) | React 18 + Vite (interface légère) |
| **Authentification** | JWT via Passport.js |
| **Emails** | Brevo (ex-Sendinblue) |
| **Fichiers** | Stockage compatible S3 |
| **Office** | Microsoft Graph API (SharePoint / Excel) |
| **Monitoring** | Sentry |

### URL de production

| Composant | URL |
|-----------|-----|
| **API** | `https://interlud-api.cleverapps.io` |
| **App** | Déployée sur CleverCloud (sous-domaine `app-staging` pour la staging) |

### Données externes

- **MongoDB** : stockage principal (Mongoose).
- **Microsoft Graph / SharePoint** : fichiers Excel par action, synchronisation bidirectionnelle avec les indicateurs.
- **Brevo** : emails transactionnels (invitations, reset, notifications).
- **AWS S3** (optionnel) : pièces jointes.
- **Sentry** : suivi d'erreurs (production).

---

## 2. Architecture du monorepo

Le projet est organisé en monorepo regroupant quatre dossiers : l'API backend, l'application frontend principale, le dashboard d'administration et un proof of concept inactif.

> 🖼️ **Figure 1** — Schéma d'ensemble du monorepo et des quatre sous-projets (`api/`, `app/`, `admin/`, `POC/`).

### Arborescence détaillée

```
Interlud/
├── api/                  # Backend Node.js/Express (port 8080)
│   └── src/
│       ├── index.js       # Point d'entrée, middlewares, montage des routes
│       ├── config.js      # Variables d'environnement centralisées
│       ├── controllers/   # Routeurs Express (un fichier par ressource)
│       ├── models/        # Schémas Mongoose
│       ├── services/      # mongo, passport, sentry, brevo, microsoftGraph
│       └── utils/         # completion, indicators, errorCodes, constants
│
├── app/                  # Frontend React principal (port 3000)
│   └── src/
│       ├── App.jsx        # Routing principal
│       ├── config.js      # Détection d'environnement + URLs
│       ├── scenes/        # Composants page (miroir des routes)
│       ├── components/    # Composants UI partagés
│       ├── services/      # api.js (HTTP), store.js (Zustand)
│       └── utils/         # indicatorHelpers, constants, index
│
├── admin/                # Dashboard admin React (port 3001)
└── POC/                  # Proof of concept, inactif
```

> ⚠️ Le dossier `admin/` est mentionné pour exhaustivité mais n'est pas documenté en détail ici. Le dossier `POC/` est inactif et ne doit pas être déployé.

---

## 3. API — Configuration et démarrage

### Fichier d'entrée : `api/src/index.js`

Commandes ([api/package.json](api/package.json)) :

```bash
cd api
npm run dev    # nodemon, hot reload
npm start      # production
```

Ordre d'initialisation du serveur :

1. `dotenv.config()` — chargement des variables d'environnement
2. Initialisation de Sentry (production)
3. Connexion MongoDB via [services/mongo](api/src/services/mongo.js)
4. CORS avec `credentials` (whitelist `APP_URL` + URL de prod)
5. `cookieParser()`
6. `bodyParser.json({ limit: '50mb' })`
7. `bodyParser.urlencoded({ extended: true, limit: '50mb' })`
8. Morgan (logging HTTP, format `tiny` en développement)
9. Montage de toutes les routes
10. `passport.initialize()` via [services/passport](api/src/services/passport.js)
11. Handler d'erreur Sentry
12. `app.listen(PORT)`

**Health check** : `GET /` → `{ name: "interlud-api", environment, last_deployed_at }`.

### Centralisation de la configuration : `api/src/config.js`

Toutes les variables d'environnement sont exportées depuis ce fichier unique. **Ne jamais lire `process.env` ailleurs que dans `config.js`.**

| Variable exportée | Type | Valeur par défaut |
|-------------------|------|-------------------|
| `ENVIRONMENT` | String | `development` |
| `PORT` | Number | `8080` |
| `MONGODB_ENDPOINT` | String | — |
| `SECRET` | String | — (clé JWT) |
| `APP_URL` | String | `http://localhost:3000` |
| `SENTRY_DSN` | String | — |
| `S3_ENDPOINT` | String | `''` |
| `S3_ACCESSKEYID` | String | `''` |
| `S3_SECRETACCESSKEY` | String | `''` |
| `BREVO_KEY` | String | — |
| `TENANT_ID` | String | — (Azure AD) |
| `CLIENT_ID` | String | — (Azure App) |
| `CLIENT_SECRET` | String | — (Azure App) |

---

## 4. API — Authentification

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
- **Expiration : `1y`** (`JWT_MAX_AGE` dans [controllers/user.js](api/src/controllers/user.js)).

> 🔒 La durée de validité du token est d'un an. C'est long : en cas de fuite, la fenêtre d'exploitation reste large. Envisager une expiration plus courte assortie d'un mécanisme de rafraîchissement adapté aux besoins de sécurité du programme.

### Flux d'authentification

> 🖼️ **Figure 2** — Échange client / API lors de la connexion et des requêtes authentifiées (signin → JWT → cookie → requêtes `Authorization: JWT <token>`).

**Flow signin** ([controllers/user.js](api/src/controllers/user.js)) :

1. `POST /user/signin` avec `{ email, password }`
2. Lookup user → comparaison bcrypt (`user.comparePassword`, skip en dev)
3. Génération du JWT
4. Pose du cookie `jwt` (httpOnly, secure en prod)
5. Réponse : `{ token, user, userActionRights, collectivity, economicActor }`

**Refresh** : `GET /user/signin_token` régénère un JWT et renvoie l'utilisateur courant + collectivité + droits.

### Gestion des mots de passe

- Hashés avec bcrypt (10 salt rounds) dans le hook `pre('save')` du modèle `User`.
- Méthode `user.comparePassword(plaintext)` disponible sur les instances.

> 🔒 Le modèle `User` définit un mot de passe par défaut `'Interlud2025'`. Tout compte créé sans mot de passe explicite hérite de cette valeur connue. Forcer la définition d'un mot de passe à la première connexion et éviter ce défaut en production.

### Invitation et réinitialisation

- **Invitation** : token stocké dans `user.invitation_token` (expiration `invitation_token_expires`). Route `POST /user/invite-accepted` : valide le token, crée/met à jour le compte, connecte l'utilisateur.
- **Reset** : token dans `user.password_reset_token` (expiration `password_reset_expires`). Route `POST /user/forgot_password_reset`.

---

## 5. API — Modèles de données

Les schémas Mongoose sont dans [api/src/models/](api/src/models/) et ont tous `timestamps: true` (`createdAt`, `updatedAt`).

### 5.1 Action — [action.js](api/src/models/action.js)

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

> ⚠️ **Incohérence de nommage conservée** — le champ prévisionnel s'écrit `exel_files_prev` (un seul « c ») tandis que son équivalent ex-post s'écrit `excel_files_expost` (deux « c »). Cette asymétrie existe dans le code et la base ; toute correction nécessiterait une migration coordonnée code + données.

**Types d'actions** : `global`/`reference` = référentiel national partagé ; `custom` = variante personnalisée d'une action globale par une collectivité ; `config` = données générales (parc de véhicules, données de base) affichées dans `/general-data`.

### 5.2 Indicator — [indicator.js](api/src/models/indicator.js)

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
| `display_condition` | Object | Condition d'affichage par situation (voir §16.11) |

Opérateurs supportés dans `display_condition.conditions[].type` : `equals`, `contains`, `greaterThan`, `lessThan`, `greaterOrEqual`, `lessOrEqual`, `notEmpty`, `isEmpty`.

### 5.3 IndicatorValue — [indicator_value.js](api/src/models/indicator_value.js)

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

### 5.4 User — [user.js](api/src/models/user.js)

| Champ | Type | Notes |
|-------|------|-------|
| `name` | String | Prénom + nom |
| `email` | String | Unique, requis |
| `password` | String | Hashé bcrypt. Défaut `'Interlud2025'` |
| `role` | String (enum) | `user` (défaut) \| `admin` \| `economic_actor` |
| `status` | String (enum) | `active` (défaut) \| `inactive` |
| `collectivities` | Array | `[{ id, name, role, status ('pending'/'approved'/'rejected') }]` |
| `economic_actor_id` / `_name` | String | Rempli si `role = economic_actor` |
| `invitation_token` / `_expires` / `_sent_at` / `_accepted_at` | — | Cycle de vie de l'invitation |
| `password_reset_token` / `_expires` | — | Réinitialisation |
| `last_login_at` | Date | Mis à jour à chaque connexion |
| `notifications_email` / `notifications_push` | Boolean | Défaut true |

> Un utilisateur peut appartenir à **plusieurs collectivités**, avec un rôle et un statut distincts pour chacune.

### 5.5 Collectivity — [collectivity.js](api/src/models/collectivity.js)

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
| `aggregation_excel_file_id` | String | Fichier Excel d'agrégation nationale |

### 5.6 EconomicActor — [economic_actor.js](api/src/models/economic_actor.js)

| Champ | Type | Notes |
|-------|------|-------|
| `name` | String | Requis |
| `description` | String | — |
| `collectivities` | Array | `[{ id, name, joined_at, aggregation_excel_file_id, basedata_onboarded, parc_types_onboarded }]` |

> Un acteur économique peut être rattaché à plusieurs collectivités ; l'historique des rattachements est conservé.

### 5.7 UserActionRight — [user_action_right.js](api/src/models/user_action_right.js)

| Champ | Type | Notes |
|-------|------|-------|
| `user_id` / `user_name` | String | — |
| `collectivity_id` / `_name` | String | — |
| `action_id` / `action_name` | String | — |
| `description` | String | Note libre |
| `can_read` | Boolean | Défaut true |
| `can_write` | Boolean | Défaut false |

> **Règle** : `can_write = true` implique nécessairement `can_read = true`.

### 5.8 Log — [log.js](api/src/models/log.js)

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

### 5.9 Notification — [notification.js](api/src/models/notification.js)

| Champ | Type | Notes |
|-------|------|-------|
| `message` | String | Texte |
| `user_id` / `_name` / `_email` | String | Destinataire |
| `redirect` | String | URL de redirection (optionnel) |
| `read_at` | Date | `null` si non lue |

### 5.10 IndicatorCategory — [indicator_category.js](api/src/models/indicator_category.js)

| Champ | Type | Notes |
|-------|------|-------|
| `name` / `description` | String | — |
| `type` | String (enum) | `principal` \| `sub` |
| `principal_category_id` / `_name` | String | Rempli si `type = sub` |

---

## 6. API — Routes et contrôleurs

Format de toutes les réponses : `{ ok: true/false, data: ..., code: "ERROR_CODE" }`. Auth notée : 🔓 public · 👤 `authenticate('user')` (user ou economic_actor) · 🛡️ `authenticate('admin')` · 👤🛡️ user **ou** admin.

### `/user` — [controllers/user.js](api/src/controllers/user.js)

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| POST | `/signin` | 🔓 | Connexion email/password, retourne token + user |
| POST | `/signup` | 🔓 | Inscription + connexion automatique |
| POST | `/logout` | 🔓 | Clear cookie JWT |
| GET | `/signin_token` | 👤🛡️ | Vérifie le token, retourne user + collectivité + droits |
| POST | `/forgot_password` | 🔓 | Envoie l'email de réinitialisation |
| POST | `/forgot_password_reset` | 🔓 | Réinitialise le mot de passe via token |
| POST | `/reset_password/:id` | 👤 | Change le mot de passe (authentifié) |
| GET | `/:id` | 👤🛡️ | Détail utilisateur |
| POST | `/search` | 👤🛡️ | Recherche (search, sort, pagination) |
| POST | `/` | 🛡️ | Création utilisateur |
| PUT | `/:id` / `/` | 👤🛡️ | Met à jour un utilisateur / l'utilisateur courant |
| DELETE | `/:id` | 🛡️ | Supprime |
| POST | `/invite` | 👤🛡️ | Invite à une collectivité (envoi Brevo) |
| POST | `/send-invite/:id` | 🛡️ | Renvoi invitation |
| POST | `/check-invitation-token` | 🔓 | Validation du token |
| POST | `/invite-accepted` | 🔓 | Accepte l'invitation + définit le mot de passe |
| POST | `/request-collectivity-access` | 👤 | Demande d'accès (notifie les admins) |

### `/action` — [controllers/action.js](api/src/controllers/action.js)

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

### `/indicator` — [controllers/indicator.js](api/src/controllers/indicator.js)

CRUD (`GET /:id`, `POST /search`, `POST /`, `PUT /:id`, `DELETE /:id`). Le `PUT` propage les modifications aux `IndicatorValue` liés et crée un log. Création/suppression réservées 🛡️.

### `/indicator_value` — [controllers/indicator_value.js](api/src/controllers/indicator_value.js)

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| POST | `/stats` | 👤🛡️ | Taux de complétion par situation / année |
| POST | `/search` | 👤🛡️ | Recherche (action, situation, année, collectivité) |
| POST | `/` | 👤🛡️ | Crée une valeur + sync Excel + agrégation + log |
| PUT | `/:id` | 👤🛡️ | Met à jour + sync Excel + agrégation + log |
| DELETE | `/:id` | 👤🛡️ | Supprime + cleanup Excel |
| POST | `/condition_values` | 👤🛡️ | Valeurs des indicateurs référencés en conditions |
| POST | `/export-excel` | 👤🛡️ | Exporte la feuille de saisie en Excel |
| POST | `/import-excel` | 👤🛡️ | Importe des valeurs depuis un fichier Excel |

### `/collectivity` — [controllers/collectivity.js](api/src/controllers/collectivity.js)

CRUD (`GET /:id`, `POST /search` avec count d'actions, `POST /` 🛡️ + dossier SharePoint + Excel d'agrégation, `PUT /:id`, `DELETE /:id` 🛡️). `POST /join` (demande d'accès) et `POST /approve` (approuve un membre, rôle admin de collectivité).

### `/economic_actor` — [controllers/economic_actor.js](api/src/controllers/economic_actor.js)

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| POST | `/` | 🛡️ | Crée un acteur économique |
| POST | `/search` | 👤🛡️ | Recherche |
| GET | `/:id` | 👤🛡️ | Récupère |
| PUT | `/:id` | 👤🛡️ | Met à jour |
| PUT | `/:id/add_collectivity` | 👤🛡️ | Rattache à une collectivité + Excel d'agrégation |
| DELETE | `/:id` | 🛡️ | Suppression cascade (actions + IVs) |

### `/excel` — [controllers/excel.js](api/src/controllers/excel.js)

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| POST | `/global-gains` | 👤🛡️ | Gains globaux GES/énergie d'une collectivité |
| POST | `/action-contribution` | 👤🛡️ | Contribution de chaque action aux gains |
| POST | `/action_aggregation` | 👤🛡️ | Agrégation des indicateurs d'une action |
| POST | `/parent_action_aggregation` | 👤🛡️ | Agrégation de toutes les instances d'une action |
| POST | `/compare_actions` | 👤🛡️ | Comparaison de deux actions |
| POST | `/export` | 👤🛡️ | Export Excel d'agrégation nationale |

### `/dashboard`, `/log`, `/user_action_right`, `/notification`

| Méth. | Route | Auth | Description |
|-------|-------|------|-------------|
| POST | `/dashboard/synthese` | 👤🛡️ | Counts des actions par statut |
| POST | `/log/search` | 👤🛡️ | Journal d'audit filtré (`model_name`, `action_id`, `field`, `operation`) |
| POST | `/user_action_right/` · `/search` | 👤🛡️ | Crée / recherche un droit |
| PUT/DELETE | `/user_action_right/:id` | 👤🛡️ | Met à jour / supprime un droit |
| POST | `/notification/search` | 👤🛡️ | Notifications de l'utilisateur connecté |
| PUT | `/notification/:id` | 👤🛡️ | Marque comme lu (`read_at = now`) |

---

## 7. API — Services externes

### 7.1 Brevo (Email) — [services/brevo.js](api/src/services/brevo.js)

Base `https://api.brevo.com/v3`, auth via header `api-key: BREVO_KEY`. Sert aux invitations, emails de réinitialisation et notifications par email (si `user.notifications_email = true`).

Fonctions : `sendEmail(...)`, `sendTemplate(templateId, ...)`, `createContact`/`updateContact`/`deleteContact`, `sync(user)`/`unsync(user)`, `getEmailsList`, `getEmailContent`, `downloadAttachment`. Liste cible : prod = list 9, dev = list 11.

### 7.2 Microsoft Graph (SharePoint / Excel) — [services/microsoftGraph.js](api/src/services/microsoftGraph.js)

Service central pour toute interaction avec SharePoint et les fichiers Excel des collectivités. Détaillé au §16.

```
TENANT_ID, CLIENT_ID, CLIENT_SECRET   → Auth Azure AD (client credentials)
sharePointSiteName  = 'selegobv'
masterExcelFileId   = '01IBL4ADPW52VMA7PAEVDIZGBCDDPTODA3'   (fichier maître action)
```

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
| `updateExcelCellByIndicatorId(...)` | Met à jour une cellule via l'ID indicateur (colonne E → F) |
| `updateExcelCellsBatch(...)` | Mise à jour batch d'une plage contiguë |
| `createFolder(...)` | Crée un dossier SharePoint (comportement `rename` si doublon) |
| `duplicateExcelFile(...)` | Duplique le fichier maître (polling max 20 tentatives) |
| `exportExcelFile(fileId)` | Retourne `{ downloadUrl, fileName }` |
| `exportExcelFileWithSpecificSheets(...)` | Télécharge puis supprime les onglets non demandés |
| `importSheetsToExcelFile(...)` | Import depuis un fichier Excel uploadé vers SharePoint |
| `clearWorksheetValues(fileId, situation)` | Efface la colonne F d'un onglet |
| `readExcelDefaultValues(fileId, situation)` | Lit les valeurs par défaut (colonne H) |

### 7.3 Sentry — [services/sentry.js](api/src/services/sentry.js)

Tracking d'erreurs en production (`SENTRY_DSN`). Le contexte utilisateur (id, username, email) est enrichi à chaque authentification réussie. `initSentry(app)`, `setupErrorHandler(app)`, `capture(err)`.

---

## 8. API — Logique métier

> Cette section donne la vue d'ensemble. Le détail des workflows Excel/SharePoint (création d'action, sync, agrégation, import/export) est au [§16](#16-intégration-excel--sharepoint-workflows-détaillés).

### 8.1 Calcul de complétion — [utils/completion.js](api/src/utils/completion.js)

`computeActionCompletion(actionId)` calcule et met à jour `completion_init/ref/prev/expost` :

1. Charge l'action et ses `IndicatorValue` (retour immédiat si aucune valeur).
2. Construit la map des valeurs conditionnelles (pour évaluer les `display_condition`).
3. Construit les `yearMappings` depuis les actions non-config.
4. Pour chaque situation : filtre les valeurs, exclut les IDs cachés `['AnneeRempl', 'AnRef', 'ActionsAutres', 'ActionsCharte']`, évalue l'affichage (`shouldDisplayIndicator`), compte les valeurs renseignées (`isIndicatorValueFilled`), calcule `round((renseignées / affichées) * 100)`.
5. Met à jour `action.completion_*`. Si toutes les valeurs visibles sont renseignées → `status = 'completed'`.

> Appelée à chaque `PUT /indicator_value/:id` et à chaque import Excel.

### 8.2 Conditions d'affichage des indicateurs

Un indicateur peut n'être affiché que si une ou plusieurs conditions sont remplies sur d'autres indicateurs. Détail de l'évaluation récursive au [§16.11](#1611-conditions-daffichage--évaluation-récursive).

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

### 8.3 Helpers, codes d'erreur, constantes

- [utils/indicators.js](api/src/utils/indicators.js) : `HIDDEN_IDS`, `buildYearMappings`, `shouldDisplayIndicator`.
- [utils/errorCodes.js](api/src/utils/errorCodes.js) : codes métier FR (voir §9).
- [utils/index.js](api/src/utils/index.js) : `uploadToS3FromBuffer(...)`, `validatePassword(...)`.
- [utils/constants.js](api/src/utils/constants.js) : `BREVO_TEMPLATES`.

---

## 9. API — Codes d'erreur

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

## 10. App — Architecture frontend

Commandes ([app/package.json](app/package.json)) : `npm run dev` (Vite port 3000), `npm run build` (→ `app/build/`), `npm start` (build + Express), `npm run lint`.

**Bootstrap** : [app/src/main.jsx](app/src/main.jsx) (`createRoot`, `startReactDsfr`, passe `Link` de react-router à DSFR) → [app/src/App.jsx](app/src/App.jsx) (router + 3 layouts).

### Structure des dossiers (`app/src/`)

```
app/src/
├── App.jsx              # Routing principal, layouts
├── config.js            # Détection d'env., apiURL, SENTRY_URL
├── scenes/              # Composants page (miroir des routes)
│   ├── auth/  home/  actions/  general-data/
│   └── admin/  collectivity/  settings/  notification/
├── components/          # Layout, header, NavBar, Select, modal, ...
├── services/
│   ├── api.js           # Client HTTP singleton
│   └── store.js         # État global Zustand
└── utils/
    ├── indicatorHelpers.js  # Évaluation des conditions d'affichage
    ├── constants.js         # SITUATION_TYPES
    └── index.js             # formatDateToYYYYMMDD, etc.
```

**Scenes** : `home/` (KPIs GES/énergie, trajectoire, synthèse actions) ; `actions/` (liste, compare, view : dashboard / settings / completion / history) ; `general-data/` (saisie partagée parc types, données de base) ; `admin/` (CRUD entités système).

### Design system

Le frontend utilise `@codegouvfr/react-dsfr` — le système de design officiel de l'État français (DSFR) — complété par TailwindCSS. Palette custom Interlud : `green 500=#2DAC6A` (primary), `teal 400=#56BDB8`, `orange 500=#F59600`, `slate 700=#0A3641`. Fonts : Source Sans Pro, Quicksand. Charts via recharts, notifications via react-hot-toast, i18n via i18next.

### Alias de chemin

L'alias `@/` pointe vers `app/src/` (configuré dans [jsconfig.json](app/jsconfig.json) et [vite.config.js](app/vite.config.js)).

---

## 11. App — État global (Zustand)

Fichier : [app/src/services/store.js](app/src/services/store.js).

```javascript
{
  user: null,            // utilisateur complet (/user/signin_token)
  setUser: (user) => void,

  collectivity: null,    // collectivité sélectionnée
  setCollectivity: (c) => void,

  economicActor: null,   // si user.role === 'economic_actor'
  setEconomicActor: (ea) => void,

  userActionRights: [],  // droits action par action
  setActionRights: (rights) => void,
}
```

> **Persistance** : l'ID de la collectivité sélectionnée est sauvegardé dans `localStorage` sous la clé `selectedCollectivityId`, et rechargé au montage de `UserLayout`. Pas de cache de requêtes : chaque scene fetch ses propres données.

---

## 12. App — Client API

Fichier : [app/src/services/api.js](app/src/services/api.js). Singleton exporté : `const API = new api()`.

**Pattern d'utilisation** :

```javascript
const { ok, data, code } = await api.get('/action/search');
if (!ok) return toast.error(code);
```

| Méthode | Usage |
|---------|-------|
| `api.get(path)` | Requête GET |
| `api.post(path, body)` | Requête POST |
| `api.put(path, body)` | Requête PUT |
| `api.delete(path)` | Requête DELETE |
| `api.postFormData(path, file)` | Upload de fichier multipart |
| `api.download(path, body)` | Téléchargement (retourne la réponse brute) |
| `api.setToken(token)` / `api.removeToken()` | Définit / efface le JWT |

**En-têtes automatiques** : `Content-Type: application/json`, `Authorization: JWT <token>`, `credentials: 'include'`. Fetch natif via `isomorphic-fetch`.

---

## 13. App — Routing et layouts

Fichier : [app/src/App.jsx](app/src/App.jsx).

| Layout | Chemin | Comportement |
|--------|--------|--------------|
| `AuthLayout` | `/auth/*` | Redirige vers `/` si déjà connecté |
| `PublicLayout` | `/conditions`, `/politique`, `/cgu`… | Accessible sans authentification |
| `UserLayout` | Tout le reste | Fetch `/user/signin_token` au montage → redirige vers `/auth` si non authentifié, sinon charge collectivité + acteur économique + droits |

`UserLayout` sélectionne la collectivité dans l'ordre : URL param `collectivityId` > `localStorage.selectedCollectivityId` > première collectivité `approved`.

### Arborescence de routes

```
/auth/signin   /auth/signup   /auth/forgot   /auth/reset   /auth/invite

/                          → Tableau de bord
/actions                   → Liste des actions
/actions/compare           → Comparaison d'actions
/actions/:id/dashboard     → Tableau de bord d'une action
/actions/:id/completion    → Saisie des indicateurs
/actions/:id/settings      → Paramètres de l'action
/actions/:id/history       → Historique des modifications
/general-data              → Données générales (actions config)
/collectivity              → Membres de la collectivité
/collectivity/join         → Rejoindre une collectivité
/collectivity/:userId      → Détail d'un membre
/notifications             → Centre de notifications
/settings                  → Paramètres du compte

/admin/users[/:id]            /admin/collectivity[/:id]
/admin/action[/:id]           /admin/indicator[/:id]
/admin/economic-actors[/:id]  (réservé admin côté API)
```

> Les routes `/admin/*` sont accessibles côté front pour tout utilisateur authentifié — la restriction de rôle est appliquée côté API (stratégie `admin`).

---

## 14. App — Utilitaires frontend

### `indicatorHelpers.js`

Miroir frontend de [api/src/utils/indicators.js](api/src/utils/indicators.js) :

- `isIndicatorValueFilled(iv)` → Boolean. `checkbox` : vrai si tableau non vide ; autres types : vrai si valeur non nulle / non vide.
- `fetchConditionValuesMap(indicatorValues, action)` → `Promise<Map>`. Collecte les `excel_indicator_id` référencés dans les `display_condition`, appelle `POST /indicator_value/condition_values`, résout les dépendances transitives en 2 passes max. Clés : `` `${excel_indicator_id}_${situation}_${year}` ``.
- `shouldDisplayIndicatorFromMap(iv, yearMappings, conditionValuesMap, visited)` → Boolean. Évaluation côté frontend de la même logique que le backend, sans appel API supplémentaire (utilise la Map préconstruite + `Set` anti-boucle).

### `constants.js`

```javascript
SITUATION_TYPES = { INIT: "init", REF: "ref", PREV: "prev", EXPOST: "expost" }
```

### `config.js` — détection d'environnement

À partir de `window.location.href` (pas de `.env`) :

- `localhost` / `127.0.0.1` → `development` → `apiURL = http://localhost:8080`
- `app-staging` dans l'URL → `staging`
- sinon → `production` → `apiURL = https://interlud-api.cleverapps.io`

---

## 15. Domaine métier — Concepts clés

### Les 4 situations temporelles

| Code | Nom | Description |
|------|-----|-------------|
| `init` | Initiale | État de départ avant toute action |
| `ref` | Référence | Ce qui se passerait sans l'action (année de référence) |
| `prev` | Prévisionnelle | Résultats attendus après mise en œuvre |
| `expost` | Ex-post | Résultats réellement mesurés |

> **Calcul du gain** : le gain d'une action = différence entre `ref` et `expost`.

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

### Actions config

Type spécial (`type: 'config'`) pour les données transversales (parc de véhicules, données de base). Ces actions s'affichent dans `/general-data` et non dans la liste des actions.

---

## 16. Intégration Excel / SharePoint (workflows détaillés)

Cette section décrit dans le détail technique ce qui se passe réellement lors des opérations critiques. Toute la mécanique repose sur une **synchronisation bidirectionnelle entre MongoDB et des fichiers Excel hébergés sur SharePoint**, accédés via l'API Microsoft Graph.

> 🖼️ **Figure 3** — Synchronisation d'une valeur saisie : UI → `PUT /indicator_value/:id` → MongoDB → SharePoint (Graph) → recalcul de complétion.

**Flux résumé** : (1) l'utilisateur saisit une valeur dans l'UI ; (2) `PUT /indicator_value/:id` met à jour la BDD ; (3) si `presence_in_excel.{situation} = true`, synchro vers SharePoint via `updateExcelCellByIndicatorId` ou `updateExcelCellsBatch` ; (4) la complétion de l'action est recalculée.

### 16.1 Organisation SharePoint

Toute la donnée Excel vit sur **un unique site SharePoint** : `selegobv.sharepoint.com`. Le drive est organisé sur deux niveaux : des **templates** au niveau racine, puis **un dossier par collectivité** créé à la volée.

```
selegobv.sharepoint.com (drive racine)
│
├── [Templates au niveau racine — IDs en dur dans microsoftGraph.js / controllers]
│   ├── 01IBL4ADPW52VMA7PAEVDIZGBCDDPTODA3   → Master action (modèle de chaque fichier d'action)
│   └── 01IBL4ADOUOXHM475PNZALWXNQOJOSDTIV   → Template d'agrégation collectivité
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
| `Collectivity` | Premier `POST /collectivity` ou première création d'action dans la collectivité ([action.js](api/src/controllers/action.js)) | Dossier `{name}/` + `{name} - Aggregation.xlsx` dupliqué depuis le template d'agrégation | `sharepoint_folder_id`, `aggregation_excel_file_id` |
| `EconomicActor.collectivities[]` | À chaque `PUT /economic_actor/:id/add_collectivity` ([economic_actor.js](api/src/controllers/economic_actor.js)) | `{actor.name} - {collectivity.name} - Aggregation.xlsx` dans le dossier de la collectivité | `EconomicActor.collectivities[].aggregation_excel_file_id` |
| `Action` | Création (`POST /action/`) | 1 fichier `_Prev{year}.xlsx` par année prév. + 1 `_Expost{year}.xlsx` par année ex-post, dupliqués depuis le master (ou depuis le fichier d'une action sœur) | `exel_files_prev[].excel_file_id`, `excel_files_expost[].excel_file_id` |

**Convention de nommage des fichiers d'action** :
- Owner = collectivité : `{action_name}{instanceSuffix}_Prev{year_prev}.xlsx` / `..._Expost{year_expost}.xlsx`
- Owner = acteur économique : `{economic_actor_name}_{action_name}{instanceSuffix}_Prev{...}.xlsx`
- `instanceSuffix` n'apparaît qu'à partir de l'instance 2 (max 3 instances d'un même template d'action par collectivité).

**Pourquoi cette organisation** :
- **Tout dans le dossier de la collectivité** simplifie les permissions SharePoint (un seul dossier à partager) et garantit que les références inter-fichiers (le fichier d'agrégation pointe vers les fichiers d'action) restent valides.
- **Un fichier d'agrégation par acteur économique** évite les fuites de gains entre acteurs co-implantés sur la même collectivité.
- **Un fichier par couple (action, année)** évite de réécrire toute la feuille à chaque mise à jour et limite la charge/latence des appels Graph (Excel recalcule en cascade).
- **Les IDs des templates racine sont en dur** dans le code — ils représentent les modèles versionnés du programme InTerLUD+, mis à jour manuellement par l'équipe métier.

**Comment l'app retrouve le bon fichier d'agrégation** ([action.js](api/src/controllers/action.js)) :

```javascript
const aggregationFileId = action.owner === 'economic_actor'
  ? (await EconomicActor.findById(action.economic_actor_id))
      ?.collectivities?.find(c => c.id === action.collectivity_id)
      ?.aggregation_excel_file_id
  : (await Collectivity.findById(action.collectivity_id))
      ?.aggregation_excel_file_id;
```

À chaque sync, le backend détermine d'abord **qui possède l'action** (collectivité vs acteur économique), puis cible le fichier d'agrégation correspondant. Une action portée par un acteur économique alimente uniquement le fichier d'agrégation de cet acteur, jamais celui de la collectivité globale.

### 16.2 Modèle Excel : structure, ranges, constantes

**Worksheets de saisie** (fichiers d'action) — quatre feuilles, une par situation : voir le mapping au §7.2.

**Layout des lignes** dans `usedRange.values` (0-indexé) :

| Index | Colonne | Contenu |
|-------|---------|---------|
| `row[4]` | E | `excel_indicator_id` (clé de jointure DB ↔ Excel) |
| `row[5]` | F | Valeur saisie par l'utilisateur (cible d'écriture) |
| `row[7]` | H | Valeur par défaut, recalculée par les formules Excel |

**IDs critiques** ([microsoftGraph.js](api/src/services/microsoftGraph.js)) :
- Site SharePoint : `selegobv.sharepoint.com`
- Master fichier action : `01IBL4ADPW52VMA7PAEVDIZGBCDDPTODA3`
- Template Excel d'agrégation collectivité : `01IBL4ADOUOXHM475PNZALWXNQOJOSDTIV`

**Indicateurs « cachés »** (exclus du calcul de complétion) : `HIDDEN_IDS = ['AnneeRempl', 'AnRef', 'ActionsAutres', 'ActionsCharte']`.

**Fichier d'agrégation collectivité** — feuilles et ranges :
- `1. Données d'entrée` : cible d'écriture des `IndicatorValue` par les actions.
- `Agrégation` : lue par `POST /excel/global-gains` sur le range `B7:K39`.
- `4. Gains par action` et `3. Émissions par action` : lues par `POST /excel/action_aggregation`.

Tables de mapping pour l'agrégation par action ([excel.js](api/src/controllers/excel.js)) :

```javascript
ACTION_GAINS_RANGES     = { B2: { dataStartRow: 19 }, C1: { dataStartRow: 15 }, ... }
ACTION_EMISSIONS_RANGES = { B2: { dataStartRow: 21 }, ... }
INSTANCE_COL_OFFSET     = { 1: 36, 2: 68, 3: 100 }   // colonnes AK / BQ / CW selon instance
INSTANCE_EMISSION_COL   = { GES: 0, PM: 5, NOx: 10, HC: 15, CO: 20, Nrj: 25 }
EMISSION_TYPES          = ['GES', 'PM', 'NOx', 'HC', 'CO', 'Nrj']
```

### 16.3 Microsoft Graph : auth, cache et résilience

**OAuth2 client credentials** :
- Endpoint : `POST https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token`
- Grant `client_credentials`, scope `https://graph.microsoft.com/.default`.
- Variables d'env : `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`.
- **Cache** : `_cachedToken` + `_tokenExpiresAt`. Renouvellement quand `Date.now() >= _tokenExpiresAt`. Durée prise = `expires_in − 120s`.
- Le **Site ID** SharePoint est caché dans `_cachedSiteId` après le premier appel.

**`graphFetch(endpoint, options)`** — wrapper avec retry exponentiel :
- Codes retryables : `429, 500, 502, 503, 504` + corps contenant `"We're sorry"`.
- Max 3 tentatives, délai `2000 * 2^attempt` ms (2s → 4s → 8s). Header `Retry-After` respecté.
- Codes attendus : `200` (JSON), `202` (async, réponse brute), `204` (`null`).
- Headers systématiques : `Authorization: Bearer <token>`, `Content-Type: application/json`.

### 16.4 Primitives Excel

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

### 16.5 Workflow : création d'action (`POST /action/`)

Endpoint le plus complexe du backend ([controllers/action.js](api/src/controllers/action.js)). Décomposition :

**A. Validation & setup** — body requis : `name`, `action_parent_id`, `year_init`, `year_prev` (+ `year_expost` optionnel). Si la collectivité n'a pas de dossier SharePoint → `createFolder` + sauvegarde `sharepoint_folder_id`. Si pas de fichier d'agrégation → `duplicateExcelFile` depuis le template `01IBL4ADOUOXHM475PNZALWXNQOJOSDTIV`. Calcul de `instance_number` (incrémente jusqu'à un slot libre, max 3, sinon `MAX_INSTANCES_REACHED`).

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

**H. Re-lecture et correction des defaults** — Excel recalcule la colonne H après écriture des années/infos collectivité. `readExcelDefaultValues` par situation, parse par type, `bulkWrite` d'update sur les IV dont le default a changé (+ réécriture Excel si la valeur courante était le default).

**I. Finalisation** — `computeActionCompletion` sur l'action principale + les deux actions config ; création d'un `Log` `operation: 'add'`.

> ⚠️ **Durée du processus** : la création peut prendre jusqu'à 120 secondes. L'interface affiche des messages de progression.

### 16.6 Workflow : mise à jour d'un IndicatorValue (`PUT /indicator_value/:id`)

[controllers/indicator_value.js](api/src/controllers/indicator_value.js). La logique de sync diffère selon que l'action est régulière ou de type config.

**A. Sync Excel — action de type `config`** — la valeur est propagée à **tous les fichiers Excel des actions régulières** concernés :

| Situation | Actions ciblées | Fichier Excel ciblé |
|-----------|-----------------|---------------------|
| `init` | actions avec `year_init === year` | tous leurs `exel_files_prev` + `excel_files_expost` |
| `ref` | actions avec une entrée `year_ref === year` | l'entrée matching dans prev ou expost |
| `prev` | actions avec entrée `year_prev === year` | l'entrée matching dans `exel_files_prev` |
| `expost` | actions avec entrée `year_expost === year` | l'entrée matching dans `excel_files_expost` |

Pour chaque match → `updateExcelCellByIndicatorId(fileId, excel_indicator_id, value, situation, unit)`.

**B. Sync Excel — action régulière** :
- `init` → écrit dans **tous** ses fichiers prev ET expost
- `ref` → tous les fichiers avec `year_ref === year`
- `prev` → uniquement l'entrée `exel_files_prev` dont `year_prev === year`
- `expost` → uniquement l'entrée `excel_files_expost` dont `year_expost === year`

**C. Sync vers l'Excel d'agrégation collectivité** (actions non-config) :
1. `buildAggregationTargets(action, situation, year)` — liste des fichiers sources à lire et la cible d'agrégation (`init` → tous les couples ; `ref` → fichiers où `year_ref === year` ; `prev`/`expost` → fichier unique).
2. `writeAggregationTargets(action, targets, siteId)` — lit la feuille `Agrégation` de chaque source (colonnes par type d'émission GES/PM/NOx/HC/CO/Nrj), mappe vers `1. Données d'entrée` du fichier d'agrégation, `PATCH` cellule par cellule (non batchable car cellules non contiguës).

**D. Cross-action sync** — cherche les autres IV avec même `(indicator_id, situation, year, owner)`. Scope : action non-config → restreint à la même action ; config → toutes les actions. Pour chaque IV avec valeur différente : log `synchronization` + `updateMany(..., { $set: { value: newValue } })`.

**E. Onboarding** (`updateOnboardingStatus`, actions config) — charge les IV non-hidden, build `conditionValuesMap` + `yearMappings`, applique `shouldDisplayIndicator` puis `isIndicatorValueFilled`. Si **tous** les IV visibles sont remplis → flag `basedata_onboarded` ou `parc_types_onboarded = true` + `Action.status = 'completed'`.

**F. Logs** : un log par modification avec `source: 'manual'` ou `'import_excel'`.

### 16.7 Workflow : ajout / suppression d'année

**`POST /action/add_year_previsionnel`** :
1. Validation + check que `year_prev` n'existe pas déjà dans `exel_files_prev`.
2. Duplication Excel : source = premier fichier prev existant (ou master en fallback), nettoyage de la feuille `expost` et des cellules héritées du parent.
3. Push `{ year_prev, year_ref, excel_file_id }` dans `action.exel_files_prev`.
4. Création des IV config pour `(prev, year_prev)` et `(ref, year_ref)` si absents.
5. Mise à jour `AnneeRempl` / `AnRef` côté DB.
6. Écriture Excel des IV config existantes dans le nouveau fichier (continuité).
7. Création des IV principales pour `(prev, year_prev)` et `(ref, year_ref)` (non-primordiaux écrits en batch).
8. Écriture explicite des années dans le fichier.
9. Boucle de relecture/correction des defaults (cf. §16.5 H).
10. `computeActionCompletion`.

**`POST /action/add_year_expost`** : structure identique mais cible `excel_files_expost`, vide la feuille `prev`, fallback source = autre fichier expost sinon un fichier prev.

**`POST /action/remove_year_previsionnel` / `remove_year_expost`** :
1. Supprime le fichier Excel SharePoint (`DELETE /drive/items/{fileId}`).
2. Nettoie le fichier d'agrégation : supprime les rows matching `{worksheetname}-*-{situationLabel}-{year}`.
3. Retire l'entrée de `exel_files_prev` / `excel_files_expost`.
4. Si le `year_ref` retiré n'est plus utilisé → supprime aussi les IV `ref` correspondants + cleanup agrégation.
5. Cleanup orphelins : supprime les IV config sans action régulière correspondante.
6. `computeActionCompletion`.

### 16.8 Workflow : import / export Excel

**`POST /indicator_value/export-excel`** :
1. Query MongoDB sur `(action_id, situation?, year?)`.
2. Build `conditionValuesMap` + `yearMappings` pour filtrer via `shouldDisplayIndicator`.
3. Pour chaque situation, crée une feuille ExcelJS avec colonnes `category`, `sub_category`, `title`, `description`, `excel_id`, `value`, `possibilities`, `default`, `unit`, `type`.
4. Stream le buffer (`Content-Type: ...spreadsheetml.sheet`).

**`POST /indicator_value/import-excel`** :
1. Body : `fileBase64`, `collectivity`, `action_id`.
2. **Extraction** : workbook chargé depuis base64, lecture `row[4]` (id) et `row[5]` (value) → `extractedData[]`.
3. **Sync SharePoint** : collecte tous les `fileIds` concernés (prev + expost + fichiers config), lance en parallèle `importSheetsToExcelFile`.
4. **Matching DB** : charge les `Indicator` par `excel_indicator_id` et les `IndicatorValue` par `(indicator_id, situation, year?)`, Maps de lookup O(1).
5. **Conversion par type** : `number` → `parseFloat` (÷100 si `unit === '%'`) ; `checkbox` → `split(/[,;.]/).map(trim)` ; `radio`/`text` → `trim`.
6. **Bulk DB** : `bulkWrite` d'`updateOne` avec `$set: { value, value_source: 'import_excel' }` + un log par changement.
7. Update métadonnées action + `computeActionCompletion`.
8. Sync cross-action (cf. §16.6 D) + propagation vers les autres fichiers.
9. Si action config → `updateOnboardingStatus`.

### 16.9 Endpoints d'agrégation (`/excel`)

**`POST /excel/global-gains`** — lit `Agrégation!B7:K39`. Détecte dynamiquement la colonne « année » (regex `/^\d{4}$/`), les colonnes « évolution relative » et « cumulée ». Slices : lignes 6-12 (gains prévisionnels), 16-22 (gains réels), 26-32 (écarts). Pour chaque indicateur (GES/PM/HC/NOx/CO/Nrj) renvoie :

```js
{ label, unit, evolutionRelativePrev, evolutionRelativeReel,
  evolutionCumuleePrev, evolutionCumuleeReel,
  yearlyPrev: [{ year, value }], yearlyReel: [{ year, value }] }
```

Calcule en plus `avancementTrajectoire = (ecartExpostRef / ecartPrevRef) * 100`.

**`POST /excel/action-contribution`** — lit `Agrégation!C40:H300`, worksheets `['B2','B3','B4','C1'..'C7','C9']`. Pour chaque ligne matching, lit GES prev/réel 4 lignes plus loin ; classifie `type = (ges <= 0) ? 'gain' : 'degradation'` ; trie par `|GES|` décroissant.

**`POST /excel/action_aggregation`** — dashboard d'une action : lit `4. Gains par action` et `3. Émissions par action`. Colonne ciblée = `INSTANCE_COL_OFFSET[instance_number] + INSTANCE_EMISSION_COL[type]`. Calcule les écarts `init→ref`, `prev→ref`, `expost→ref`, `expost→prev`. Score d'atteinte = `(real / objective) * 100` (capped à 100/type) ; score final = moyenne des 6 types.

**`POST /excel/parent_action_aggregation`** — agrège tous les enfants d'une action parent.

**`POST /excel/compare_actions`** — construit des « bars » années (init, refs dédupliqués, prev, expost) avec interpolation linéaire des années manquantes ; renvoie une structure de graphique comparatif multi-action.

### 16.10 Calcul de complétion (ratio rempli / visible)

[utils/completion.js](api/src/utils/completion.js).

`isIndicatorValueFilled(iv)` : `checkbox` → `Array.isArray(val) && val.length > 0` ; autres → `val !== null && val !== undefined && val !== ''`.

`computeActionCompletion(actionId)` :
1. Charge IV + Action.
2. Construit `conditionValuesMap` (y compris dépendances transitives) et `yearMappings`.
3. Pour chaque situation : filtre les IV, exclut `HIDDEN_IDS`, garde celles où `shouldDisplayIndicator` est `true`, calcule `completion_{situation} = round((nbRemplis / total) * 100)` (0 si `total === 0`).
4. Si tous remplis ET total > 0 sur toutes les situations → `status = 'completed'`.
5. `bulkWrite` unique sur l'action.

### 16.11 Conditions d'affichage : évaluation récursive

[utils/indicators.js](api/src/utils/indicators.js).

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
3. Pour chaque condition : `targetSituation` = `condition.excel_indicator_situation` ou la situation courante ; `possibleYears` = `yearMappings['{iv.situation}_{iv.year}'][targetSituation]` ; cherche la source IV via clé `'{excel_indicator_id}_{situation}_{year}'`. Si la source est elle-même sous condition → appel récursif (anti-cycle). Évalue le test selon `condition.type` (cf. §8.2), applique `negate`.
4. Combine via `display_condition.operator` (`AND` / `OR`).

---

## 17. Permissions et droits

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

## 18. Variables d'environnement

### API (`api/.env`)

| Variable | Oblig. | Description |
|----------|--------|-------------|
| `ENVIRONMENT` | Non | development / staging / production (défaut development) |
| `PORT` | Non | Port d'écoute (défaut 8080) |
| `MONGODB_ENDPOINT` | **Oui** | URI MongoDB complet |
| `SECRET` | **Oui** | Clé secrète de signature JWT |
| `APP_URL` | Non | URL du frontend (défaut http://localhost:3000) |
| `SENTRY_DSN` | Non | DSN Sentry |
| `S3_ENDPOINT` / `S3_ACCESSKEYID` / `S3_SECRETACCESSKEY` | Non | Storage S3 (optionnel) |
| `BREVO_KEY` | Non | Clé API Brevo (emails) |
| `TENANT_ID` / `CLIENT_ID` / `CLIENT_SECRET` | Non* | Azure AD / App (Graph) |

*\* Requis si la synchronisation Excel/SharePoint est utilisée.*

> 🔒 `SECRET`, `CLIENT_SECRET`, `S3_SECRETACCESSKEY` et `BREVO_KEY` sont des secrets sensibles. Ne jamais les versionner ni les inclure dans une copie de ce document destinée à un tiers ; les gérer via le coffre de secrets de CleverCloud.

### App (`app/.env`)

| Variable | Description |
|----------|-------------|
| `SENTRY_URL` | DSN Sentry frontend |

L'URL de l'API est déterminée automatiquement par `config.js` selon l'environnement détecté (voir §14).

---

## 19. Conventions de code

### Backend

- Pas de `.lean()` ni `.select()` — retourner les documents Mongoose complets.
- Pas de `else` / `else if` — privilégier les retours anticipés (guard clauses).
- Pas de variables intermédiaires inutiles.
- Toutes les réponses suivent `{ ok, data, code }`. Erreurs : `{ ok: false, code: 'ERROR_CODE' }` + status HTTP approprié.

### Frontend

- Pattern : `const { ok, data, code } = await api.get(path)` puis `if (!ok) return toast.error(code)`.
- Fetch hors `useEffect`, appel de la fonction à l'intérieur.
- Stocker l'objet entier en `useState`, ne pas éclater les champs.
- Pas de `Promise.all` pour les fetch parallèles — séquentiels uniquement.
- Pas de variable `body` externe — passer l'objet inline à `api.post`.
- Filtres en un seul `useState`, spread à l'appel API, re-fetch à chaque changement.
- Le composant parent fetch les données partagées, les frères reçoivent en props.
- Ne pas déstructurer les props — accès en notation pointée.
- Pas de `useMemo` pour le filtrage — le filtrage se fait côté backend.

### Langue

L'application est entièrement en français : chaînes UI, codes d'erreur et commentaires de code.

---

## 20. Infrastructure et déploiement

### Plateforme — CleverCloud

- **API** : application Node.js (`npm start`).
- **App** : build Vite statique servi par un serveur Express intégré (`npm run build && npm start`).
- **Admin** : idem.

### Commandes

```bash
# Développement
cd api   && npm run dev    # nodemon, hot reload
cd app   && npm run dev    # Vite dev server, port 3000
cd admin && npm run dev    # Vite dev server

# Production
cd api   && npm start
cd app   && npm run build && npm start
cd admin && npm run build && npm start
```

### Environnements

| Environnement | App | API |
|---------------|-----|-----|
| Développement | localhost:3000 | localhost:8080 |
| Staging | app-staging.* | — |
| Production | — | interlud-api.cleverapps.io |

> ⚠️ **Staging / API** : la source ne précise pas d'URL d'API dédiée à la staging. À clarifier : soit l'app staging consomme l'API de production, soit une API staging existe mais n'est pas documentée.

### Services tiers requis

| Service | Usage | Configuration |
|---------|-------|---------------|
| MongoDB | Base de données principale | `MONGODB_ENDPOINT` |
| SharePoint (Azure) | Fichiers Excel collectivités | `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET` |
| Brevo | Emails transactionnels | `BREVO_KEY` |
| S3 | Stockage fichiers uploadés | `S3_*` |
| Sentry | Monitoring d'erreurs | `SENTRY_DSN` |

---

## Glossaire métier

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
