# EVALUD — Application

Frontend React / Vite de la plateforme EVALUD (programme InTerLUD+) : écrans des collectivités, des acteurs économiques et administration (`/admin/*`). Référence technique complète : [DOCUMENTATION.md](../DOCUMENTATION.md).

## Démarrage

```bash
cd app
npm install
npm run dev      # Vite, port 3000
npm run build    # build de production dans dist/
npm start        # sert le build via server/index.js (production)
npm run lint     # ESLint
```

Prérequis : Node.js 18+, l'API lancée sur le port 8080 (voir [api/README.md](../api/README.md)).

Pas de fichier `.env` : l'environnement est déduit de l'URL dans `src/config.js` (`localhost` → API locale, sinon API de production).

## Stack

- React 18 + Vite, React Router v6
- Zustand pour l'état global (`src/services/store.js`)
- Design system [@codegouvfr/react-dsfr](https://github.com/codegouvfr/react-dsfr) (DSFR) + TailwindCSS
- Recharts pour les graphiques

## Structure (`src/`)

| Dossier / fichier | Contenu |
|-------------------|---------|
| `App.jsx` | Routes et layouts (`AuthLayout`, `UserLayout`) |
| `config.js` | Détection d'environnement, `apiURL` |
| `scenes/` | Pages, une par section : `home` (tableau de bord), `actions`, `general-data`, `collectivity`, `economic-actor`, `notification`, `settings`, `admin`, `auth`, `faq`, `contact`, `confidentiality`, `not-found` |
| `components/` | Composants partagés |
| `services/` | `api.js` (client HTTP, token JWT), `store.js` (Zustand) |
| `utils/` | `constants`, `indicatorHelpers` (situations, conditions d'affichage), helpers |

## Conventions

- Interface entièrement en français.
- Alias `@/` → `src/` (`jsconfig.json`).
- Toutes les réponses de l'API sont au format `{ ok, data, code }` ; le token est transmis via `api.setToken(token)` après connexion.
- Conventions de code : voir [CLAUDE.md](CLAUDE.md).
