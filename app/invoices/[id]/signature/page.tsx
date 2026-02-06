import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvoiceSignatureSummaryClient from "./ui";

export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export default async function Page({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const invoiceId = s(params.id);
  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!invoice) redirect("/invoices");

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true });

  return <InvoiceSignatureSummaryClient invoice={invoice as any} items={(items ?? []) as any[]} />;
}
