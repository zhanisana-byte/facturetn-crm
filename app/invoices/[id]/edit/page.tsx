import { redirect, notFound } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import EditInvoiceClient from "./EditInvoiceClient";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const invoiceId = String(params?.id || "").trim();
  if (!invoiceId) notFound();

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!invoice) notFound();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true });

  return (
    <AppShell title="Modifier document" subtitle="Mise à jour des champs et lignes" accountType="profil">
      <EditInvoiceClient invoice={invoice as any} items={(items ?? []) as any[]} />
    </AppShell>
  );
}
