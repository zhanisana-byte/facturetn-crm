# FactureTN — CRM de Facturation Électronique TTN (Tunisie)

## Vision
Plateforme de facturation électronique conçue pour Clients, Comptables et Groupes multi‑sociétés,
avec conformité TTN, collaboration fluide et continuité de service.

## Comptes
- Client (Entreprise)
- Comptable (Cabinet + Équipe)
- Multi‑sociétés (Groupe)

## Fonctionnalités clés
- Factures / Devis / Avoir (PDF + XML)
- Envoi email multi‑destinataires
- TVA multi‑taux par ligne (0% international)
- Déclaration mensuelle (sélection + résumé)
- Abonnements semestriels (gestion manuelle, continuité assurée)
- Archivage sécurisé (jamais de perte d’historique)
- Préparation API TTN (par société)

## Message positif quotidien
Chaque matin, un message motivant est affiché sur le Dashboard (désactivable).
Exemples :
- « Chère comptable, bon courage pour cette journée 🌿 »
- « Une bonne organisation aujourd’hui, c’est une déclaration sereine demain. »

## Support
- Téléphone : +216 20 12 15 21
- Email : Zhanisana@gmail.com

---
Projet conçu et dirigé par Sana Zhani, experte en développement et en IA.


## Déploiement (GitHub/Vercel)
Ce dépôt est prêt en **root** (dossier `app/` à la racine).


## V23 PDG (Plateforme)

### Variables d'environnement (Vercel)
- `SUPABASE_SERVICE_ROLE_KEY` (obligatoire pour /pdg)

### Activer un compte PDG
Dans Supabase, table `app_users`, mettre `is_platform_pdg = true` pour ton utilisateur.

### Accès
- `/pdg` (dashboard)
- `/pdg/users`
- `/pdg/subscriptions`
- `/pdg/accountants`

