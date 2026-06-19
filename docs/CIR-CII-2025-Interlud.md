# Interlud — CIR/CII 2025

Plateforme nationale de suivi du programme InTerLUD+ (logistique urbaine durable). 3 développeurs, **418 commits sur la période oct–déc 2025** (~46 jours de développement intensif). Remplace un suivi historiquement réalisé via fichiers Excel ADEME manuels par collectivité.

## 1. Travaux menés en 2025

**Modèle de données**

- **10 modèles interconnectés** : Collectivité, Action, Indicateur, Valeur d'indicateur, Catégorie d'indicateur, Acteur économique, Journal de modifications, Utilisateur, Notification, Droits d'action par utilisateur
- Structuration par collectivité, action, situation temporelle (initiale/diagnostic, référence, prévisionnelle, ex-post) et année
- **Système de rôles hiérarchiques à 3 niveaux** (administrateur global, administrateur collectivité, utilisateur classique) avec **droits lecture/écriture granulaires par fiche action**
- **4 niveaux de visibilité** des données (tous utilisateurs / liés à la collectivité / liste nominative / admins collectivité) croisés avec 2 niveaux d'autorisation
- **Secret statistique** : données d'acteurs économiques masquées tant que moins de 3 acteurs ont contribué pour un EPCI

**Intégration bidirectionnelle SharePoint/OneDrive (Microsoft Graph API)**

- Authentification OAuth2 Azure (client credentials), duplication automatique du master Excel à la création d'une collectivité et d'un acteur économique
- Mise à jour cellule par cellule avec recherche dynamique par identifiant d'indicateur, mise à jour par lot (une colonne = un appel), import/export Excel synchronisé
- Retry exponentiel avec gestion du rate-limiting (jusqu'à 3 tentatives, délais 2s/4s/8s, respect du header `Retry-After`)
- Copie du tableur de calcul par EPCI, envoi des indicateurs vers les onglets d'entrée, récupération des gains depuis l'onglet de sortie « Agrégation total »

**Scraping et analyse des classeurs Excel ADEME**

- Scripts d'extraction : indicateurs, catégories, types, unités, valeurs par défaut, conditions d'affichage
- Détection des formules Excel imbriquées et non supportées, construction d'un graphe de dépendances inter-onglets

**Moteur de calcul, de complétion et de synchronisation**

- Calcul temps réel du taux de remplissage par action, situation et année (< 5 s, déclenché à chaque mise à jour d'indicateur, à l'image d'un tableur)
- Propagation automatique des valeurs entre actions partageant les mêmes indicateurs (pas de double saisie)
- **Estimation annuelle par régression linéaire** lorsque les valeurs sont saisies sur des périodes différentes
- Calcul des 7 familles de gains environnementaux : énergie finale (MWh), GES (tCO2e), NOx, CO, HC, PM10, PM2.5
- Journalisation complète (ancienne/nouvelle valeur, source, utilisateur, date) et **annulation immédiate (ctrl+z)** réinitialisée à chaque déconnexion

## 2. Fonctionnalités différenciantes

- **Moteur de conditions d'affichage avec résolution récursive** — 9 opérateurs (equals, contains, greaterThan, lessThan, greaterOrEqual, lessOrEqual, notEmpty, isEmpty, neverVisible), logique ET/OU, négation, transitivité, détection de boucles circulaires
- **Synchronisation bidirectionnelle BDD ↔ SharePoint** — inexistante dans toute solution standard de logistique urbaine
- **Mutualisation multi-acteurs** — un acteur économique lié à plusieurs EPCI saisit ses données une seule fois ; la duplication du fichier d'agrégation est propagée à chaque collectivité associée
- **Comparaison de toutes les situations** entre elles (expost-init, expost-ref, expost-prev, prev-ref, prev-init, ref-init) avec visualisations d'évolution annuelle
- **Import Excel structuré** — par identifiant, conversion par type, propagation SharePoint, journalisation, recalcul de complétion ; export CSV par fiche action dans le respect de la confidentialité
- **Dashboard d'agrégation des gains environnementaux** depuis les onglets « Agrégation » SharePoint, en temps réel
- **Tranche optionnelle — pilotage des chartes** : création de fiches action personnalisées (champs métier + champs custom typés/filtrables, tags pilote/partenaire, jauge d'avancement), comparaison inter-collectivités vs résultats globaux, remplissage incrémental (logistique de chantier)

## 3. Difficultés techniques

- **Formules Excel imbriquées** — parsing des formules, construction du graphe de dépendances inter-onglets pour rejouer la logique du tableur ADEME hors Excel
- **Rate-limiting Graph API** — retry exponentiel, respect du Retry-After, écriture par lot pour limiter le nombre d'appels
- **Synchronisation cohérente multi-sources** — propagation atomique vers tous les duplicats, extension aux acteurs économiques présents dans plusieurs collectivités
- **Conditions d'affichage transitives** — résolution récursive en deux passes avec détection de boucles circulaires
- **Calcul temps réel sous contrainte** — recalcul de la seule action modifiée en moins de 5 secondes malgré l'aller-retour SharePoint
- **Import Excel volumineux** — écriture en lot et synchronisation SharePoint en parallèle
- **Contraintes réglementaires et d'éco-conception** — hébergement UE, recommandations ANSSI, RGPD, RGAA (navigation clavier, contrastes, textes alternatifs), historique sur 10 ans, approche RGESN (images .webp, icônes vectorielles, cache, suppression des fonctionnalités non essentielles)

## 4. Ce qui dépasse l'état de l'art

- **Avant 2025** : suivi exclusivement via fichiers Excel ADEME manuels par collectivité
- **Pont applicatif BDD ↔ Excel SharePoint** — inexistant dans le domaine de la logistique urbaine
- **Moteur de conditions d'affichage complexes hors Excel** — transposition de la logique tableur en application web
- **Extraction automatisée de la structure des classeurs ADEME** — ingénierie inverse jamais réalisée sous forme outillée
- **Agrégation dynamique des gains environnementaux** — tableaux de bord temps réel vs calcul manuel des fichiers Excel
- **Plateforme multi-acteurs centralisée** — premier suivi centralisé et partagé du programme InTerLUD+ à l'échelle nationale, avec gestion fine des rôles, de la visibilité et du secret statistique

---

*Rapport généré depuis les snippets CIR/CII 2025 et le cahier des charges CST — Selego*
