-- V13: Ajouter un statut explicite "pending_validation" pour la facture
-- Objectif: distinguer clairement "brouillon" vs "attente validation" vs "validée"

do $$ begin
  alter type public.invoice_status add value if not exists 'pending_validation';
exception when duplicate_object then null;
exception when others then null;
end $$;

-- Compat: certaines anciennes versions utilisaient le statut 'ready_to_send'
-- On le migre vers 'pending_validation' si présent.
update public.invoices
set status = 'pending_validation'
where status::text = 'ready_to_send';
