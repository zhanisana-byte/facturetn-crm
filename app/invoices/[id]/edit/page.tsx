import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import EditInvoiceClient from "./EditInvoiceClient";

export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export default async function EditInvoicePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const id = s(params?.id);
  if (!id) redirect("/invoices");

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!invoice) redirect("/invoices");

  const st = s((invoice as any).signature_status).toLowerCase();
  if (st === "signed") redirect(`/invoices/${id}`);

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("line_no", { ascending: true });

  return (
    <AppShell title="Modifier" subtitle="Mettre à jour les champs et les lignes" accountType="profil">
      <EditInvoiceClient invoice={invoice as any} items={(items ?? []) as any[]} />
    </AppShell>
  );
}
