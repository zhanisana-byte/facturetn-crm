import { redirect } from "next/navigation";
import InvoiceSignatureClient from "./InvoiceSignatureClient";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function safeBackUrl(v: any, fallback: string) {
  const raw = s(v);
  // On autorise uniquement les chemins relatifs internes
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  // Optionnel: empêche // ou http(s)
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

  // Vérifie que la facture existe (et évite un écran signature sur id invalide)
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice?.id) redirect("/invoices");

  const backParam = searchParams?.back;
  const backRaw = Array.isArray(backParam) ? backParam[0] : backParam;

  const fallbackBack = `/invoices/${invoiceId}`;
  const backUrl = safeBackUrl(backRaw, fallbackBack);

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6">
      <InvoiceSignatureClient invoiceId={invoiceId} backUrl={backUrl} />
    </div>
  );
}
