# PDG (Propriétaire du CRM) — Scénarios & Règles

Ce document décrit les écrans PDG (route `/pdg`) et les scénarios métier.

## 1) Accès PDG

- Accès autorisé si :
  - email = `PLATFORM_PDG_EMAIL` (par défaut : `zhanisana@gmail.com`), **ou**
  - `app_users.is_platform_pdg = true`.

## 2) Dashboard PDG (`/pdg`)

Objectif : vue **macro** de la plateforme.

Widgets :
- **MRR (HT)** : somme des abonnements `platform_subscriptions` en statut `active` (`price_ht × quantity`).
- **Revenu semaine** : somme des paiements encaissés (status `paid`) sur la semaine ISO.
- **Revenu mois** : somme des paiements encaissés sur le mois.
- **Inscriptions** : nouveaux comptes 7j / 30j + total suspendus.

Tableau : **Clients fidèles** (Top 10)
- Définition V1 : ≥ 3 paiements sur ~4 mois.

## 3) Inscrits (`/pdg/users`)

But : gérer les comptes.

Actions :
- Modifier le plan : `subscription_plan`, `subscription_status`, `subscription_ends_at`.
- Suspendre / réactiver : `is_suspended`, `suspended_reason`, `suspended_at`.

> Note : la suspension est stockée côté DB. Si tu veux bloquer totalement l'app, on ajoutera une vérification globale (middleware/guard).

## 4) Abonnements (`/pdg/subscriptions`)

But : gérer la facturation **plateforme**.

Table : `platform_subscriptions`.

Champs clés :
- `scope_type` :
  - `company` (Société) : 50 DT HT / mois
  - `group` (Groupe) : 29 DT HT par société interne + 50 DT HT par société externe
  - `external_company` : 50 DT HT / mois
  - `cabinet_workspace` : 0 DT (gratuit)
- `price_ht` : prix unitaire
- `quantity` : quantité (ex: nb sociétés)
- `next_billing_at` : prochaine échéance

## 5) Paiements (`/pdg/payments`)

Table : `platform_payments`.

Méthodes :
- `cash`
- `virement`
- `versement`
- `free` (gratuit / remise)

Le CA CRM se calcule sur les paiements encaissés (`status = paid`).

## 6) Rapports (`/pdg/reports`)

- CA par **mois** (HT) + répartition par méthode.
- CA par **semaine** (HT).
- Clients fidèles (définition V1).

## 7) Variables d'environnement (Vercel)

À ajouter :
- `PLATFORM_PDG_EMAIL` = `zhanisana@gmail.com`
- `SUPABASE_SERVICE_ROLE_KEY` (obligatoire pour les pages PDG)

## 8) Sécurité

Ne jamais stocker ni partager de mot de passe en dur dans le code.
