import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DroitsSocieteClient from "./DroitsSocieteClient";

export const dynamic = "force-dynamic";
export default async function SocieteDroitsPage(props: { params?: Promise<{ id: string }> }) {
  const params = (await props.params) ?? ({} as any);
  const { id: companyId } = params as any;

  const supabase = await createClient();
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("id, company_name, tax_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id) {
    return (
<div className="mx-auto max-w-3xl p-6">
          <h1 className="text-2xl font-semibold">Droits & rôles — Société</h1>
          <p className="mt-2 text-sm text-slate-600">Société introuvable.</p>
        </div>
    );
  }

  const { data: myMembership } = await supabase
    .from("memberships")
    .select("id, role, is_active")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!myMembership?.id) redirect("/companies");

  const isOwner = String(myMembership.role || "") === "owner";

  const { data: members } = await supabase
    .from("memberships")
    .select(
      `
      id,
      user_id,
      role,
      is_active,
      can_manage_customers,
      can_create_invoices,
      can_validate_invoices,
      can_submit_ttn,
      created_at,
      app_users:app_users (
        full_name,
        email
      )
    `
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  return (
<DroitsSocieteClient
        companyId={companyId}
        companyName={company.company_name ?? "Société"}
        isOwner={isOwner}
        members={(members as any[]) ?? []}
      />
  );
}
