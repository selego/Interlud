# EVALUD — API

Backend Node.js / Express / MongoDB de la plateforme EVALUD (programme InTerLUD+). Référence technique complète : [DOCUMENTATION.md](../DOCUMENTATION.md).

## Démarrage

```bash
cd api
npm install
cp .env.example .env   # puis renseigner les variables
npm run dev            # nodemon, port 8080
npm start              # production
```

Prérequis : Node.js 18+, une instance MongoDB.

Health check : `GET /` → `{ name: "api", environment, last_deployed_at }`.

## Variables d'environnement

| Variable | Rôle |
|----------|------|
| `ENVIRONMENT`, `PORT`, `APP_URL` | Environnement (`development` / `production`), port (8080), URL du front |
| `MONGODB_ENDPOINT` | URI MongoDB |
| `SECRET` | Clé de signature JWT |
| `BREVO_KEY` | Emails transactionnels (invitations, reset, contact) |
| `SENTRY_DSN` | Monitoring (production) |
| `S3_ENDPOINT`, `S3_ACCESSKEYID`, `S3_SECRETACCESSKEY` | Pièces jointes (optionnel) |
| `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET` | Azure AD : synchro Excel / SharePoint via Microsoft Graph |
| `JOPTIMIZ_URL`, `JOPTIMIZ_CLIENT_ID`, `JOPTIMIZ_CLIENT_SECRET`, `JOPTIMIZ_REDIRECT_URI` | SSO Joptimiz (OAuth 2.0) |

Sans les variables Azure, l'API fonctionne mais aucune écriture Excel n'a lieu. Sans les variables Joptimiz, seul le login email / mot de passe est disponible.

## Structure (`src/`)

| Dossier | Contenu |
|---------|---------|
| `index.js` | Point d'entrée, middlewares, montage des routes |
| `config.js` | Variables d'environnement centralisées |
| `controllers/` | Un routeur Express par ressource (`user`, `action`, `indicator`, `indicator_value`, `collectivity`, `economic_actor`, `excel`, `dashboard`, `log`, `notification`, `user_action_right`, `indicator_category`, `contact`) |
| `models/` | Schémas Mongoose |
| `services/` | `mongo`, `passport`, `sentry`, `brevo`, `joptimiz`, `microsoftGraph` (Graph API, sessions workbook), `excelSync` (écritures Excel différées), `excelDefaults` (relecture des défauts recalculés) |
| `utils/` | `completion`, `indicators` (conditions d'affichage), `errorCodes`, `constants` |

## Conventions

- Réponses toujours au format `{ ok, data, code }` ; codes d'erreur en français dans `utils/errorCodes.js`.
- Routes protégées par `passport.authenticate('user' | 'admin', { session: false })`.
- Pas de `.lean()` ni `.select()` sur les requêtes Mongoose, pas de `else` : voir [CLAUDE.md](CLAUDE.md).

## Excel / SharePoint

Toute la donnée de calcul vit dans des classeurs Excel sur le SharePoint [Documents partagés](https://selegobv.sharepoint.com/Documents%20partages/Forms/AllItems.aspx) : masters, template d'agrégation, puis un dossier par collectivité. L'ID du master courant est la constante `masterExcelFileId` en tête de `src/services/microsoftGraph.js`. Le détail des workflows (création d'action, synchro différée, agrégation, import / export) est décrit dans la partie [Intégration Excel / SharePoint](../docs/documentation-technique/03-excel-sharepoint.md) de la documentation technique.
