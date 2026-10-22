# Documentation technique — EVALUD / InTerLUD+

*Plateforme de suivi d'impact environnemental — logistique urbaine*

Référence technique complète — API · Application · Domaine métier
Document mixte : onboarding développeurs & archivage projet.

**Version 1.3** — Mise à jour le 22 octobre 2026

> Conventions de lecture : les noms de fichiers, champs, routes et identifiants sont en `police à chasse fixe`. Les blocs `> ⚠️` signalent un point d'attention ; les blocs `> 🔒` un point de sécurité à traiter. Conventions générales : voir [CLAUDE.md](CLAUDE.md). Application en français, réponses API au format `{ ok, data, code }`.

---

## Avant-propos

Ce document constitue la référence technique complète des applications EVALUD / InTerLUD+. Il s'adresse à la fois aux développeurs rejoignant le projet (onboarding) et à l'archivage long terme. Toute question portant sur un concept, un modèle de données, une route d'API, une règle métier ou un comportement de l'application devrait trouver sa réponse ici.

La documentation est découpée par thème dans le dossier [docs/documentation-technique/](docs/documentation-technique/). Chaque partie se lit seule ; les renvois entre parties sont des liens.

---

## Sommaire

### 1. [Architecture et démarrage](docs/documentation-technique/01-architecture-et-demarrage.md)

1. Vue d'ensemble du système
2. Architecture du monorepo
3. API — Configuration et démarrage
4. Variables d'environnement
5. Infrastructure et déploiement
6. Conventions de code

### 2. [API](docs/documentation-technique/02-api.md)

1. Authentification (JWT, SSO Joptimiz, invitations)
2. Modèles de données
3. Routes et contrôleurs
4. Services externes (Brevo, Microsoft Graph, Sentry, synchro Excel différée, relecture des défauts, Joptimiz)
5. Logique métier (complétion, conditions d'affichage)
6. Codes d'erreur
7. Permissions et droits

### 3. [Intégration Excel / SharePoint](docs/documentation-technique/03-excel-sharepoint.md)

1. Organisation SharePoint
2. Modèle Excel : structure, ranges, constantes
3. Microsoft Graph : auth, cache, sessions et résilience
4. Primitives Excel
5. Workflow : création d'action
6. Workflow : mise à jour d'un IndicatorValue
7. Workflow : ajout / suppression d'année
8. Workflow : import / export Excel
9. Endpoints d'agrégation
10. Calcul de complétion
11. Conditions d'affichage : évaluation récursive

### 4. [Application frontend](docs/documentation-technique/04-frontend.md)

1. Architecture frontend
2. État global (Zustand)
3. Client API
4. Routing et layouts
5. Utilitaires frontend

### 5. [Domaine métier](docs/documentation-technique/05-domaine-metier.md)

1. Concepts clés (situations, indicateurs primordiaux, identifiant Excel, onboarding, propriété, actions config)
2. Glossaire métier

---

## Export Word / PDF

Pour partager la documentation sous forme d'un document unique :

```bash
./docs/documentation-technique/export.sh
```

Le script assemble les parties dans l'ordre du sommaire et produit `docs/documentation-technique/build/EVALUD-documentation-technique.docx` et `.pdf`. Prérequis : `pandoc` (`brew install pandoc`) et LibreOffice (pour le PDF). Les fichiers Excel de référence sont sur le [SharePoint Documents partagés](https://selegobv.sharepoint.com/Documents%20partages/Forms/AllItems.aspx) ; les secrets ne figurent pas dans la documentation.

---

## Maintenance

- Une modification de `microsoftGraph.js`, `excelSync.js`, `excelDefaults.js` ou des contrôleurs `action` / `indicator_value` / `excel` impose une relecture de la partie [Intégration Excel / SharePoint](docs/documentation-technique/03-excel-sharepoint.md).
- Ne jamais recopier d'identifiant de fichier Excel dans la documentation : la version courante du master est sur le SharePoint, l'ID utilisé est la constante en tête de `microsoftGraph.js`.
- Mettre à jour la version et la date ci-dessus à chaque révision.
