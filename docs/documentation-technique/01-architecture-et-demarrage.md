# Architecture et démarrage

> Partie de la [documentation technique EVALUD](../../DOCUMENTATION.md).

**Sommaire**

1. [Vue d'ensemble du système](#1-vue-densemble-du-système)
2. [Architecture du monorepo](#2-architecture-du-monorepo)
3. [API — Configuration et démarrage](#3-api--configuration-et-démarrage)
4. [Variables d'environnement](#4-variables-denvironnement)
5. [Infrastructure et déploiement](#5-infrastructure-et-déploiement)
6. [Conventions de code](#6-conventions-de-code)

---

## 1. Vue d'ensemble du système

**EVALUD** est une plateforme web de suivi d'impact environnemental pour le programme national **InTerLUD+** (charte logistique urbaine durable). Elle permet à des collectivités territoriales françaises (EPCI) et à des acteurs économiques de saisir des indicateurs sur leurs actions de décarbonation de la logistique urbaine, puis de calculer les gains obtenus en gaz à effet de serre (GES), oxydes d'azote (NOx), particules (PM) et énergie, sur 4 situations temporelles.

### Stack technique

| Couche | Technologie |
|--------|-------------|
| **Backend** (`api/`) | Node.js + Express + MongoDB (Mongoose) |
| **Frontend principal** (`app/`) | React 18 + Vite + Zustand + TailwindCSS + DSFR |
| **Authentification** | JWT via Passport.js + SSO Joptimiz (OAuth 2.0) |
| **Emails** | Brevo (ex-Sendinblue) |
| **Fichiers** | Stockage compatible S3 |
| **Office** | Microsoft Graph API (SharePoint / Excel) |
| **Monitoring** | Sentry |

### URL de production

| Composant | URL |
|-----------|-----|
| **App** | `https://app.evalud.green` |
| **API** | `https://api.evalud.green` |

### Données externes

- **MongoDB** : stockage principal (Mongoose).
- **Microsoft Graph / SharePoint** : fichiers Excel par action, synchronisation bidirectionnelle avec les indicateurs.
- **Brevo** : emails transactionnels (invitations, reset, notifications, formulaire de contact).
- **Joptimiz** : fournisseur d'identité OAuth 2.0 (bouton « Se connecter avec Joptimiz »).
- **AWS S3** (optionnel) : pièces jointes.
- **Sentry** : suivi d'erreurs (production).

---

## 2. Architecture du monorepo

Le projet est organisé en monorepo regroupant deux dossiers : l'API backend et l'application frontend.

### Arborescence détaillée

```
Interlud/
├── api/                  # Backend Node.js/Express (port 8080)
│   └── src/
│       ├── index.js       # Point d'entrée, middlewares, montage des routes
│       ├── config.js      # Variables d'environnement centralisées
│       ├── controllers/   # Routeurs Express (un fichier par ressource)
│       ├── models/        # Schémas Mongoose
│       ├── services/      # mongo, passport, sentry, brevo, joptimiz,
│       │                  # microsoftGraph, excelSync, excelDefaults
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
```

---

## 3. API — Configuration et démarrage

### Fichier d'entrée : `api/src/index.js`

Commandes ([api/package.json](../../api/package.json)) :

```bash
cd api
npm run dev    # nodemon, hot reload
npm start      # production
```

Ordre d'initialisation du serveur :

1. `dotenv.config()` — chargement des variables d'environnement
2. Initialisation de Sentry (production)
3. Connexion MongoDB via [services/mongo](../../api/src/services/mongo.js)
4. CORS avec `credentials` (whitelist `APP_URL` + URL de prod)
5. `cookieParser()`
6. `bodyParser.json({ limit: '50mb' })`
7. `bodyParser.urlencoded({ extended: true, limit: '50mb' })`
8. Morgan (logging HTTP, format `tiny` en développement)
9. Montage de toutes les routes
10. `passport.initialize()` via [services/passport](../../api/src/services/passport.js)
11. Handler d'erreur Sentry
12. `app.listen(PORT)`

**Health check** : `GET /` → `{ name: "api", environment, last_deployed_at }`.

### Centralisation de la configuration : `api/src/config.js`

Les variables d'environnement sont exportées depuis ce fichier. Exception : les secrets Azure (`TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`) sont lus directement dans [services/microsoftGraph.js](../../api/src/services/microsoftGraph.js).

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
| `JOPTIMIZ_URL` | String | `https://account.joptimiz.preprod.allohouston.fr` (préprod) |
| `JOPTIMIZ_CLIENT_ID` | String | `evalud` |
| `JOPTIMIZ_CLIENT_SECRET` | String | — |
| `JOPTIMIZ_REDIRECT_URI` | String | `http://localhost:8080/user/sso/joptimiz` |

---

## 4. Variables d'environnement

### API (`api/.env`)

| Variable | Oblig. | Description |
|----------|--------|-------------|
| `ENVIRONMENT` | Non | development / production (défaut development) |
| `PORT` | Non | Port d'écoute (défaut 8080) |
| `MONGODB_ENDPOINT` | **Oui** | URI MongoDB complet |
| `SECRET` | **Oui** | Clé secrète de signature JWT |
| `APP_URL` | Non | URL du frontend (défaut http://localhost:3000) |
| `SENTRY_DSN` | Non | DSN Sentry |
| `S3_ENDPOINT` / `S3_ACCESSKEYID` / `S3_SECRETACCESSKEY` | Non | Storage S3 (optionnel) |
| `BREVO_KEY` | Non | Clé API Brevo (emails, contact) |
| `TENANT_ID` / `CLIENT_ID` / `CLIENT_SECRET` | Non* | Azure AD / App (Graph) — lus directement dans `microsoftGraph.js` |
| `JOPTIMIZ_URL` | Non | URL du serveur OAuth Joptimiz (défaut préprod ; prod : `https://login.joptimiz.green`) |
| `JOPTIMIZ_CLIENT_ID` | Non | Identifiant client OAuth (défaut `evalud`) |
| `JOPTIMIZ_CLIENT_SECRET` | Non** | Secret client OAuth |
| `JOPTIMIZ_REDIRECT_URI` | Non** | Callback OAuth (défaut `http://localhost:8080/user/sso/joptimiz` ; prod : `https://api.evalud.green/user/sso/joptimiz`) |

*\* Requis si la synchronisation Excel/SharePoint est utilisée.*
*\*\* Requis pour la connexion via Joptimiz.*

> 🔒 `SECRET`, `CLIENT_SECRET`, `JOPTIMIZ_CLIENT_SECRET`, `S3_SECRETACCESSKEY` et `BREVO_KEY` sont des secrets. Ils ne sont jamais versionnés ni inclus dans une copie de ce document destinée à un tiers ; ils sont gérés via le coffre de variables d'environnement de CleverCloud.

### App (`app/.env`)

| Variable | Description |
|----------|-------------|
| `SENTRY_URL` | DSN Sentry frontend |

L'URL de l'API est déterminée automatiquement par `config.js` selon l'environnement détecté (voir [Application frontend §5](04-frontend.md#5-utilitaires-frontend)).

---

## 5. Infrastructure et déploiement

### Plateforme — CleverCloud

- **API** : application Node.js (`npm start`).
- **App** : build Vite statique servi par un serveur Express intégré (`npm run build && npm start`).

### Commandes

```bash
# Développement
cd api   && npm run dev    # nodemon, hot reload
cd app   && npm run dev    # Vite dev server, port 3000

# Production
cd api   && npm start
cd app   && npm run build && npm start
```

### Environnements

| Environnement | App | API |
|---------------|-----|-----|
| Développement | localhost:3000 | localhost:8080 |
| Production | app.evalud.green | api.evalud.green |

### Services tiers requis

| Service | Usage | Configuration |
|---------|-------|---------------|
| MongoDB | Base de données principale | `MONGODB_ENDPOINT` |
| SharePoint (Azure) | Fichiers Excel collectivités | `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET` |
| Joptimiz | SSO OAuth 2.0 | `JOPTIMIZ_*` |
| Brevo | Emails transactionnels | `BREVO_KEY` |
| S3 | Stockage fichiers uploadés | `S3_*` |
| Sentry | Monitoring d'erreurs | `SENTRY_DSN` |

---

## 6. Conventions de code

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

[Sommaire](../../DOCUMENTATION.md) · [API →](02-api.md)
