import AppShell from "@/app/components/AppShell";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeclarationsClient from "./DeclarationsClient";
import { mapDbAccountType } from "@/app/types";

export const dynamic = "force-dynamic";

export default async function DeclarationsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: u } = await supabase
    .from("app_users")
    .select("account_type,is_pdg")
    .eq("id", auth.user.id)
    .maybeSingle();

  const t = mapDbAccountType(u?.account_type);

  // sociétés accessibles
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
    <AppShell title="Déclarations" subtitle="Suivi TTN + programmation + manuel + CA/TVA" accountType={t}>
      <DeclarationsClient companies={companies} />
    </AppShell>
  );
}
