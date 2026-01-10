# FactureTN • ZIP6 PRO (TTN Ready)

## Ce qui est inclus

### 1) Paramètres TTN obligatoires par société
- Nouveau menu dans la fiche société : **Paramètres TTN**
- Nouvelle page : `/companies/[id]/ttn`
- Validation UX des champs obligatoires :
  - `ttn_mode` (Prestataire vs Jetons TTN)
  - `connection_type` (Webservice / SFTP)
  - `environment` (Test / Production)
  - `cert_serial_number` (N° série certificat)
  - `cert_email` (Email certificat)

### 2) Badge “TTN prêt” dans la liste des sociétés
- Page `/companies` affiche : ✅ Prêt / ⚠️ À config

### 3) Journal TTN (historique)
- Migration SQL ajoute la table `ttn_events` utilisée par `/ttn`

## SQL

👉 Ajouter le SQL dans `docs/SQL_ZIP6_PRO_TTN.md` (copier/coller dans Supabase).

## Notes importantes

- Les colonnes TTN sont **ajoutées** à `ttn_credentials` pour rester compatible avec ZIP6.
- Les secrets/API doivent rester côté serveur (ne pas exposer de secrets dans le front).