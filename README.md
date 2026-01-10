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
