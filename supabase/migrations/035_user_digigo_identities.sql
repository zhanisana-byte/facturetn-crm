-- v35: Identité DigiGO par utilisateur (signataire)
-- Objectif: permettre plusieurs signataires pour une même société.
-- Chaque utilisateur stocke son identité DigiGO (téléphone/email/CIN).
-- ⚠️ Le certificat DigiGO reste personnel (lié au signataire), même si utilisé pour signer au nom d'une société.

create table if not exists public.user_digigo_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  email text,
  national_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_digigo_identities_updated_at on public.user_digigo_identities;
create trigger trg_user_digigo_identities_updated_at
before update on public.user_digigo_identities
for each row execute function public.set_updated_at();

alter table public.user_digigo_identities enable row level security;

-- RLS: chaque utilisateur gère sa propre identité
drop policy if exists user_digigo_identities_select_own on public.user_digigo_identities;
create policy user_digigo_identities_select_own
on public.user_digigo_identities for select
using (auth.uid() = user_id);

drop policy if exists user_digigo_identities_upsert_own on public.user_digigo_identities;
create policy user_digigo_identities_upsert_own
on public.user_digigo_identities for insert
with check (auth.uid() = user_id);

drop policy if exists user_digigo_identities_update_own on public.user_digigo_identities;
create policy user_digigo_identities_update_own
on public.user_digigo_identities for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
