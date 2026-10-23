# Application frontend

> Partie de la [documentation technique EVALUD](../../DOCUMENTATION.md).

**Sommaire**

1. [Architecture frontend](#1-architecture-frontend)
2. [État global (Zustand)](#2-état-global-zustand)
3. [Client API](#3-client-api)
4. [Routing et layouts](#4-routing-et-layouts)
5. [Utilitaires frontend](#5-utilitaires-frontend)

---

## 1. Architecture frontend

Commandes ([app/package.json](../../app/package.json)) : `npm run dev` (Vite port 3000), `npm run build` (→ `app/build/`), `npm start` (build + Express), `npm run lint`.

**Bootstrap** : [app/src/main.jsx](../../app/src/main.jsx) (`createRoot`, `startReactDsfr`, passe `Link` de react-router à DSFR) → [app/src/App.jsx](../../app/src/App.jsx) (router + 3 layouts).

### Structure des dossiers (`app/src/`)

```
app/src/
├── App.jsx              # Routing principal, layouts
├── config.js            # Détection d'env., apiURL, SENTRY_URL
├── scenes/              # Composants page (miroir des routes)
│   ├── auth/  home/  actions/  general-data/  collectivity/
│   ├── economic-actor/  notification/  settings/  admin/
│   └── confidentiality/  faq/  contact/  not-found/
├── components/          # Layout, header, NavBar, Select, modal, ...
├── services/
│   ├── api.js           # Client HTTP singleton
│   └── store.js         # État global Zustand
└── utils/
    ├── indicatorHelpers.js  # Évaluation des conditions d'affichage
    ├── constants.js         # SITUATION_TYPES
    └── index.js             # formatDateToYYYYMMDD, etc.
```

**Scenes** : `home/` (KPIs GES/énergie, trajectoire, synthèse actions) ; `actions/` (liste, compare, view : dashboard / settings / completion / history) ; `general-data/` (saisie partagée parc types, données de base) ; `collectivity/` (membres, adhésion) ; `economic-actor/` (fiche de l'acteur économique connecté) ; `admin/` (CRUD entités système + `suivi/`, vue de suivi de toutes les collectivités) ; `confidentiality/`, `faq/`, `contact/` (pages publiques) ; `not-found/` (404).

### Design system

Le frontend utilise `@codegouvfr/react-dsfr` — le système de design officiel de l'État français (DSFR) — complété par TailwindCSS. Palette custom Interlud : `green 500=#2DAC6A` (primary), `teal 400=#56BDB8`, `orange 500=#F59600`, `slate 700=#0A3641`. Fonts : Source Sans Pro, Quicksand. Charts via recharts, notifications via react-hot-toast, i18n via i18next.

### Alias de chemin

L'alias `@/` pointe vers `app/src/` (configuré dans [jsconfig.json](../../app/jsconfig.json) et [vite.config.js](../../app/vite.config.js)).

---

## 2. État global (Zustand)

Fichier : [app/src/services/store.js](../../app/src/services/store.js).

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

## 3. Client API

Fichier : [app/src/services/api.js](../../app/src/services/api.js). Singleton exporté : `const API = new api()`.

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

## 4. Routing et layouts

Fichier : [app/src/App.jsx](../../app/src/App.jsx).

| Layout | Chemin | Comportement |
|--------|--------|--------------|
| `AuthLayout` | `/auth/*` | Redirige vers `/` si déjà connecté |
| `PublicLayout` | `/conditions`, `/cgu`, `/politique`, `/politique-de-confidentialite`, `/faq`, `/contact` | Accessible sans authentification |
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
/economic-actor            → Fiche de l'acteur économique connecté
/notifications             → Centre de notifications
/settings                  → Paramètres du compte
/recherche  /a-propos      → Placeholders (contenu non implémenté)

/admin/users[/:id]            /admin/collectivity[/:id]
/admin/action[/:id]           /admin/indicator[/:id]
/admin/economic-actors[/:id]  /admin/suivi (suivi de toutes les collectivités)

/conditions  /cgu  /politique  /politique-de-confidentialite  /faq  /contact
                           → Pages publiques (PublicLayout)
*                          → Page 404
```

> Les routes `/admin/*` sont accessibles côté front pour tout utilisateur authentifié — la restriction de rôle est appliquée côté API (stratégie `admin`).

---

## 5. Utilitaires frontend

### `indicatorHelpers.js`

Miroir frontend de [api/src/utils/indicators.js](../../api/src/utils/indicators.js) :

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
- sinon → `production` → `apiURL = https://api.evalud.green`

---

[← Intégration Excel / SharePoint](03-excel-sharepoint.md) · [Sommaire](../../DOCUMENTATION.md) · [Domaine métier →](05-domaine-metier.md)
