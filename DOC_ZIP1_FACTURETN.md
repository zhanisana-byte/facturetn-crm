# FactureTN – ZIP1 (Full) – Corrections incluses

## Ce ZIP contient
- Projet complet (Next.js + Supabase) prêt à pousser sur GitHub
- Fix Next.js App Router: `params` en **Promise** dans les routes `[id]`
- Fix Supabase server client: `await createClient()` côté serveur
- SQL unique: `supabase/migrations/001_zip1_init.sql` (tables + functions + triggers + RLS + policies)
- Fonction RPC recommandée: `create_company_with_owner(...)` (évite les problèmes RLS à la création)

## Règles anti-bug (Vercel)
1. Toujours tester localement:
   - `npm install`
   - `npm run build`
2. Variables Vercel obligatoires:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Ne jamais utiliser `CREATE POLICY IF NOT EXISTS` (Postgres ne supporte pas)

## Installation DB
- (Optionnel) Reset DB
- Exécuter `001_zip1_init.sql` dans Supabase SQL Editor

## Notes
- ZIP1 = foundation stable. Les pages avancées (Customers CRUD complet, TTN, recurring) seront dans ZIP2+.
