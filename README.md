# EVALUD

**Plateforme de suivi d'impact pour la décarbonation de la logistique urbaine**, développée dans le cadre du programme national [InTerLUD+](https://www.interlud.green/) (certificats CEE).

InTerLUD+ mettent en place des actions concrètes pour réduire les émissions du transport de marchandises en ville. EVALUD leur permet de mesurer si ces actions atteignent leurs objectifs.

---

## Fonctionnement

Pour chaque action environnementale, les collectivités saisissent des indicateurs selon **4 situations temporelles** :

| Situation | Description                         |
| --------- | ----------------------------------- |
| `init`    | Situation initiale (état de départ) |
| `ref`     | Année de référence (sans l'action)  |
| `prev`    | Prévisionnel (résultats projetés)   |
| `expost`  | Ex-post (résultats réels mesurés)   |

La plateforme calcule ensuite les gains obtenus sur les émissions (GES, NOx, PM, énergie…) et les compare aux objectifs via des tableaux de bord interactifs.

Les calculs sont basés sur les **facteurs d'émission ADEME (Base Carbone)**, validés par le Cerema.

---

## Utilisateurs

- **Agents de collectivité** — saisie et suivi de leurs actions et indicateurs
- **Pilotes du programme** (Rozo, Cerema) — vue agrégée nationale
- **Acteurs économiques** — entreprises propriétaires d'actions

Guide utilisateurs : [app/public/EVALUD_Guide_Utilisateurs.pdf](app/public/EVALUD_Guide_Utilisateurs.pdf), accessible dans l'application via la page `/faq`.

---

## Architecture

Le projet est un monorepo composé de deux sous-projets :

```
.
├── api/      # Backend Node.js / Express (port 8080)
└── app/      # Frontend React pour les collectivités et l'administration (port 3000)
```

En production : app sur [app.evalud.green](https://app.evalud.green), API sur `api.evalud.green`.

### API (`api/`)

- **Runtime** : Node.js + Express 4
- **Base de données** : MongoDB via Mongoose
- **Auth** : Passport.js + JWT (deux stratégies : `user` et `admin`) + SSO Joptimiz (OAuth 2.0)
- **Emails** : Brevo (Sendinblue)
- **Fichiers** : stockage S3 compatible (AWS / MinIO)
- **Office** : Microsoft Graph API (synchronisation SharePoint / Excel, différée avec debounce)
- **Erreurs** : Sentry

Principales routes exposées :

| Route                 | Description                                                               |
| --------------------- | ------------------------------------------------------------------------- |
| `/user`               | Authentification, inscription, invitations, réinitialisation mot de passe |
| `/action`             | CRUD des actions environnementales                                        |
| `/indicator`          | Définitions des indicateurs                                               |
| `/indicator_value`    | Valeurs saisies par les collectivités                                     |
| `/collectivity`       | Collectivités territoriales                                               |
| `/economic_actor`     | Acteurs économiques                                                       |
| `/excel`              | Import / export, calculs d'agrégation                                     |
| `/dashboard`          | Statistiques et analytiques                                               |
| `/log`                | Journal d'audit                                                           |
| `/indicator_category` | Catégories d'indicateurs                                                  |
| `/user_action_right`  | Droits par action et par utilisateur                                      |
| `/notification`       | Notifications utilisateur                                                 |
| `/contact`            | Formulaire de contact (email via Brevo)                                   |

### App (`app/`)

- **Framework** : React 18 + Vite
- **État global** : Zustand
- **Routing** : React Router v6
- **Design system** : [@codegouvfr/react-dsfr](https://github.com/codegouvfr/react-dsfr) (DSFR gouvernemental)
- **Styles** : TailwindCSS
- **Graphiques** : Recharts

Principales sections :

| Route                     | Description                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| `/`                       | Tableau de bord avec graphiques GES / PM / énergie                               |
| `/actions`                | Liste et détail des actions                                                      |
| `/actions/:id/completion` | Saisie des indicateurs par situation                                             |
| `/general-data`           | Saisie de données générales (import Excel)                                       |
| `/collectivity/*`         | Collectivité de l'utilisateur et ses membres                                     |
| `/economic-actor`         | Acteur économique de l'utilisateur                                               |
| `/notifications`          | Notifications                                                                    |
| `/settings`               | Paramètres du compte                                                             |
| `/admin/*`                | Gestion des utilisateurs, collectivités, indicateurs, acteurs économiques, suivi |
| `/faq`, `/contact`        | Guide utilisateurs et formulaire de contact                                      |

---

## Modèle de données

```
Collectivité ─── possède ──► Utilisateurs
     │
     └── possède ──► Actions
                         │
                         └── possède ──► Indicateurs
                                              │
                                              └── possède ──► ValeurIndicateurs
                                                               (par situation × année)
```

**Action** — une mesure environnementale (types : `custom`, `reference`, `global`, `config`). Le taux de complétion est suivi par situation.

**Indicateur** — une variable mesurable liée à une action. Supporte une logique d'affichage conditionnel (affiché uniquement si un autre indicateur a une certaine valeur).

**ValeurIndicateur** — la donnée réellement saisie pour un indicateur × action × situation × année.

**Collectivité** — une communauté territoriale française (EPCI), identifiée par son SIREN. Peut être liée à un dossier SharePoint pour la synchronisation Excel.

**ActeurEconomique** — une entreprise ou organisation pouvant être propriétaire d'actions.

---

## Démarrage

### Prérequis

- Node.js 18+
- MongoDB
- Un fichier `.env` dans `api/` (voir `api/.env.example`)

### Installation et lancement

```bash
# API
cd api
npm install
npm run dev        # démarre sur le port 8080

# App
cd app
npm install
npm run dev        # démarre sur le port 3000
```

```bash
# Tests de l'API
cd api
npm test
```

### Variables d'environnement (`api/.env.example`)

```
ENVIRONMENT=development
PORT=8080
APP_URL=http://localhost:3000
MONGODB_ENDPOINT=mongodb://localhost:27017/interlud
SECRET=change_me

# Emails (Brevo)
BREVO_KEY=

# Monitoring (production)
SENTRY_DSN=

# Pièces jointes S3 (optionnel)
S3_ENDPOINT=
S3_ACCESSKEYID=
S3_SECRETACCESSKEY=

# Azure AD — synchro Excel / SharePoint (Microsoft Graph)
TENANT_ID=
CLIENT_ID=
CLIENT_SECRET=

# SSO Joptimiz (OAuth 2.0) — préprod par défaut, prod : https://login.joptimiz.green
JOPTIMIZ_URL=
JOPTIMIZ_CLIENT_ID=evalud
JOPTIMIZ_CLIENT_SECRET=
JOPTIMIZ_REDIRECT_URI=
```

---

## Notes techniques

- L'interface est entièrement en **français**.
- Toutes les réponses API suivent le format `{ ok: boolean, data, code }`.
- L'alias `@/` dans l'app pointe vers `app/src/`.
- La synchronisation bidirectionnelle Excel ↔ SharePoint est gérée via Microsoft Graph. Les classeurs (masters, templates, dossiers des collectivités) sont sur le [SharePoint Documents partagés](https://selegobv.sharepoint.com/Documents%20partages/Forms/AllItems.aspx) ; l'ID du master courant est une constante en tête de `api/src/services/microsoftGraph.js`.
- Référence technique complète : [DOCUMENTATION.md](DOCUMENTATION.md).

---

## Licence

[MIT](LICENSE)
