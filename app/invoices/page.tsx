import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import InvoicesClient from "./InvoicesClient";
import { mapDbAccountType } from "@/app/types";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: u } = await supabase
    .from("app_users")
    .select("id,account_type,is_pdg")
    .eq("id", auth.user.id)
    .maybeSingle();

  const accountType = mapDbAccountType(u?.account_type);

  const [{ data: ms }, { data: owned }] = await Promise.all([
    supabase
      .from("memberships")
      .select("company_id, companies(id, company_name)")
      .eq("user_id", auth.user.id)
      .eq("is_active", true),
    supabase.from("companies").select("id,company_name").eq("owner_user", auth.user.id),
  ]);

  const map = new Map<string, { id: string; name: string }>();

  (ms ?? []).forEach((m: any) => {
    const id = String(m?.companies?.id ?? m?.company_id ?? "");
    if (!id) return;
    map.set(id, { id, name: String(m?.companies?.company_name ?? "Société") });
  });

  (owned ?? []).forEach((c: any) => {
    const id = String(c?.id ?? "");
    if (!id) return;
    map.set(id, { id, name: String(c?.company_name ?? "Société") });
  });

  const companies = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AppShell
      title="Factures"
      subtitle="Toutes vos factures (facture / devis / avoir / permanente) + suivi TTN"
      accountType={accountType}
      isPdg={Boolean(u?.is_pdg)}
    >
      <InvoicesClient companies={companies} />
    </AppShell>
  );
}
