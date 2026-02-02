-- 021_access_invitations_kind.sql
-- Ajoute un champ pour distinguer les 2 types d'invitations :
-- A) accès à une entité (membership)
-- B) délégation facturation/TTN (profil)

alter table public.access_invitations
  add column if not exists kind text not null default 'entity'
  check (kind in ('entity','delegation'));

create index if not exists idx_access_invitations_kind on public.access_invitations(kind);
