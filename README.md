# FactureTN.com — CRM (MVP)

## 1) Setup
1. `npm i`
2. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. In Supabase SQL Editor, run `supabase/migrations/001_init.sql`
4. `npm run dev`

## Deploy (Vercel)
- Import repo, set the same env vars in Vercel project settings.

## TTN (El Fatoora) – v13
- TEIF (XML) compact + contrôle strict **< 50KB**
- Webservice TTN (SOAP): `saveEfact` envoie `documentEfact` comme **byte[]** (SOAP base64)
- Traçabilité: enregistre `ttn_save_id` (idSaveEfact) sur la facture
- Polling: endpoint `.../api/invoices/{id}/ttn/status` utilise `consultEfact`
- Signature: intégration **DSS externe** (recommandée) via les paramètres TTN de la société
  - `dss_url`, `dss_token`, `dss_profile`
  - Option `require_signature`: bloque l'envoi TTN si le TEIF signé n'est pas obtenu
