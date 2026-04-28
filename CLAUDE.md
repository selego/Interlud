# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comportement général (règles Karpathy)

**Think before coding** — Avant d'écrire du code, énumère les options et expose ton plan. Attends validation sur tout changement non trivial.

**Simplicity first** — La solution la plus simple qui fonctionne. Pas d'over-engineering.

**Surgical changes** — Ne touche que ce qui est explicitement demandé. Pas de refacto "tant qu'on y est".

**Goal-driven** — Quand tu bloques, relis l'objectif initial. Ne te perds pas dans les détails d'implémentation.

> Règle d'or : si Claude répète une erreur → cette règle appartient dans ce fichier.

## Repository structure

This is a monorepo with three sub-projects:

- `app/` — Main user-facing React/Vite frontend (runs on port 3000)
- `api/` — Node.js/Express backend (runs on port 8080)
- `admin/` — Secondary React/Vite admin frontend
- `POC/` — Proof of concept (not in active development)

## Commands

### API (`cd api`)

```bash
npm run dev      # Start dev server (nodemon)
npm start        # Production start
```

### App (`cd app`)

```bash
npm run dev      # Vite dev server
npm run build    # Production build
npm run lint     # ESLint
npm start        # Build + serve with Express
```

### Admin (`cd admin`)

```bash
npm run dev      # Vite dev server
npm run build    # Production build
npm start        # Build + serve with Express
```

## API architecture

Express.js + MongoDB (Mongoose) + Passport.js (JWT).

**Auth**: JWT extracted from `Authorization: JWT <token>` header or `jwt` cookie. Two passport strategies: `'user'` (role: user/economic_actor) and `'admin'` (role: admin). Use `passport.authenticate('user', ...)` or `passport.authenticate('admin', ...)` to protect routes.

**Route layout** (`api/src/`):

- `controllers/` — Express routers, one file per resource
- `models/` — Mongoose schemas
- `services/` — mongo, passport, sentry, brevo (email), microsoftGraph
- `utils/` — helpers, constants, errorCodes, completion/indicator logic
- `config.js` — all env vars exported from one place

**Key env vars** (see `.env.example`):

```
MONGODB_ENDPOINT, SECRET, APP_URL, ENVIRONMENT, PORT
BREVO_KEY, SENTRY_DSN, S3_ENDPOINT, S3_ACCESSKEYID, S3_SECRETACCESSKEY
```

## App architecture

React 18 + Vite + TailwindCSS + Zustand + react-router-dom v6.

**Global state** (`app/src/services/store.js` — Zustand):

- `user` — authenticated user object
- `collectivity` — currently selected collectivity (persisted to `localStorage` as `selectedCollectivityId`)
- `economicActor` — loaded when `user.role === 'economic_actor'`
- `userActionRights` — per-action rights for the current user

**API client** (`app/src/services/api.js`): Singleton `api` instance. Token is set via `api.setToken(token)` after login. All responses are expected to return `{ ok, data, code }`.

**Directory layout** (`app/src/`):

- `scenes/` — page-level components, mirroring route structure
- `components/` — shared UI components
- `services/` — `api.js` (HTTP client), `store.js` (Zustand)
- `utils/` — helpers, constants, `indicatorHelpers.js`
- `config.js` — environment detection + `apiURL`, `SENTRY_URL`

**Routing** (defined in `App.jsx`):

- `AuthLayout` — redirects to `/` if already logged in
- `UserLayout` — fetches user on mount via `/user/signin_token`, redirects to `/auth` if unauthenticated, then loads collectivity/economicActor
- Routes under `/admin/*` are accessible to all authenticated users (role enforcement happens on the API)

## Domain model

The core domain revolves around **environmental actions** tracked across 4 temporal situations: `init` (initial), `ref` (reference), `prev` (prevision), `expost` (ex-post evaluation).

- **Action** — an environmental measure. Types: `custom`, `reference`, `global`, `config`. Can have a parent action (`action_parent_id`). Owner is either `collectivity` or `economic_actor`. Completion scores per situation (`completion_init/ref/prev/expost`).
- **Indicator** — a measurable variable linked to an action. Has `excel_indicator_id` for Excel import/export mapping. Values exist per situation. Can have conditional display logic (`display_condition`).
- **IndicatorValue** — the actual value submitted for an indicator in a given situation.
- **Collectivity** — a territorial community (EPCI). Users belong to collectivities with a per-collectivity role and status (`pending/approved/rejected`).
- **EconomicActor** — a company/actor that can own actions.
- **User** — roles: `user`, `admin`, `economic_actor`.

## Conventions

- The app is in French. UI strings, API error codes, and comments are in French.
- API responses always use `{ ok: true/false, data, code }` shape.
- The `@/` path alias maps to `app/src/` (configured in `jsconfig.json`).
- The design system used is `@codegouvfr/react-dsfr` (French government DSFR).
