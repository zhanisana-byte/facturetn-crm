-- supabase/migrations/invoice_lock.sql
create or replace function public.ftn_invoice_is_signed(p_invoice_id uuid)
returns boolean
language sql
stable
as $$
  select
    exists (
      select 1
      from public.invoice_signatures s
      where s.invoice_id = p_invoice_id
        and (
          (s.signed_xml is not null and length(btrim(s.signed_xml)) > 0)
          or (s.state is not null and lower(s.state) = 'signed')
          or s.signed_at is not null
        )
    )
    or exists (
      select 1
      from public.invoices i
      where i.id = p_invoice_id
        and (
          (i.signature_status is not null and i.signature_status = 'signed')
          or i.signed_xml_path is not null
          or i.signed_pdf_path is not null
        )
    );
$$;

create or replace function public.ftn_only_allowed_ttn_update()
returns boolean
language plpgsql
as $$
begin
  return
    (to_jsonb(new)
      - 'ttn_status'
      - 'ttn_reference'
      - 'ttn_last_error'
      - 'ttn_scheduled_at'
      - 'ttn_submitted_at'
      - 'ttn_validated_at'
      - 'ttn_save_id'
      - 'ttn_generated_ref'
      - 'ttn_signed'
      - 'ttn_submitted_by')
    =
    (to_jsonb(old)
      - 'ttn_status'
      - 'ttn_reference'
      - 'ttn_last_error'
      - 'ttn_scheduled_at'
      - 'ttn_submitted_at'
      - 'ttn_validated_at'
      - 'ttn_save_id'
      - 'ttn_generated_ref'
      - 'ttn_signed'
      - 'ttn_submitted_by');
end;
$$;

create or replace function public.ftn_block_mutation_if_invoice_signed()
returns trigger
language plpgsql
as $$
declare
  inv_id uuid;
begin
  if tg_table_name = 'invoices' then
    inv_id := coalesce(old.id, new.id);
  else
    inv_id := coalesce(old.invoice_id, new.invoice_id);
  end if;

  if inv_id is null then
    return coalesce(new, old);
  end if;

  if public.ftn_invoice_is_signed(inv_id) then
    if tg_table_name = 'invoices' and tg_op = 'UPDATE' then
      if not public.ftn_only_allowed_ttn_update() then
        raise exception 'Invoice is signed and cannot be modified (only TTN fields are allowed).' using errcode = 'P0001';
      end if;
      return new;
    end if;

    raise exception 'Invoice is signed and cannot be modified or deleted.' using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_invoices_block_if_signed on public.invoices;
create trigger trg_invoices_block_if_signed
before update or delete on public.invoices
for each row execute function public.ftn_block_mutation_if_invoice_signed();

drop trigger if exists trg_invoice_items_block_if_signed on public.invoice_items;
create trigger trg_invoice_items_block_if_signed
before insert or update or delete on public.invoice_items
for each row execute function public.ftn_block_mutation_if_invoice_signed();
