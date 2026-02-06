import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvoiceSignatureUI from "./ui";

export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function safeBackUrl(v: any, fallback: string) {
  const raw = s(v);
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const invoiceId = s(params.id);
  if (!invoiceId) redirect("/invoices");

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) redirect("/invoices");

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", (invoice as any).company_id)
    .maybeSingle();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true });

  const backParam = searchParams?.back;
  const backRaw = Array.isArray(backParam) ? backParam[0] : backParam;
  const fallbackBack = `/invoices/${invoiceId}`;
  const backUrl = safeBackUrl(backRaw, fallbackBack);

  return (
    <InvoiceSignatureUI
      invoice={invoice as any}
      company={(company ?? null) as any}
      items={(items ?? []) as any[]}
      backUrl={backUrl}
    />
  );
}
