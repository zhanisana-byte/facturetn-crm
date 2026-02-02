-- 027_group_company_invitations_company_side.sql
-- Allow company owners to invite a Group/Cabinet to manage a company (via group_company_invitations)
-- This complements 013_group_company_links.sql where only group admins could insert.
--
-- Use-case:
-- - Company owner creates an invitation -> group owner/admin accepts -> link is created in group_companies.

do $$
begin
  -- Company owner can create an invitation for a group (invite group admin email)
  drop policy if exists "gci_insert_company_owner" on public.group_company_invitations;
  create policy "gci_insert_company_owner" on public.group_company_invitations
    for insert
    with check (
      exists (
        select 1
        from public.companies c
        where c.id = group_company_invitations.company_id
          and c.owner_user_id = auth.uid()
      )
    );

  -- Company owner can read invitations for their company
  drop policy if exists "gci_select_company_owner" on public.group_company_invitations;
  create policy "gci_select_company_owner" on public.group_company_invitations
    for select
    using (
      exists (
        select 1
        from public.companies c
        where c.id = group_company_invitations.company_id
          and c.owner_user_id = auth.uid()
      )
      or lower(invited_email) = lower((auth.jwt() ->> 'email')::text)
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = group_company_invitations.group_id
          and gm.user_id = auth.uid()
          and gm.role in ('owner','admin')
      )
      or exists (
        select 1 from public.groups g
        where g.id = group_company_invitations.group_id
          and g.owner_user_id = auth.uid()
      )
    );

  -- Company owner can revoke (update status) invitations for their company
  drop policy if exists "gci_update_company_owner" on public.group_company_invitations;
  create policy "gci_update_company_owner" on public.group_company_invitations
    for update
    using (
      exists (
        select 1
        from public.companies c
        where c.id = group_company_invitations.company_id
          and c.owner_user_id = auth.uid()
      )
      or lower(invited_email) = lower((auth.jwt() ->> 'email')::text)
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = group_company_invitations.group_id
          and gm.user_id = auth.uid()
          and gm.role in ('owner','admin')
      )
      or exists (
        select 1 from public.groups g
        where g.id = group_company_invitations.group_id
          and g.owner_user_id = auth.uid()
      )
    )
    with check (true);
end$$;
