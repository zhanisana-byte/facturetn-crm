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
          or (i.signature_provider is not null and i.signature_provider <> 'none')
        )
    );
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
