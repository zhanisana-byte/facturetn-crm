import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ id: string }> };

export default async function CompanyHomePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();

  // ✅ getSession = rapide
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) redirect("/login");

  // ✅ Vérif accès entreprise (membership)
  const { data: membership } = await supabase
    .from("memberships")
    .select("role,is_active")
    .eq("company_id", id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) redirect("/switch");

  const { data: company } = await supabase
    .from("companies")
    .select("id,company_name,tax_id")
    .eq("id", id)
    .single();

  return (
    <AppShell
      title={company?.company_name ?? "Société"}
      subtitle="Espace Société"
      accountType="entreprise"
      activeCompanyId={id}
    >
      <div className="ftn-card p-4">
        <div className="text-sm text-slate-600">
          Matricule fiscale: <b>{company?.tax_id ?? "—"}</b>
        </div>
        <div className="mt-2 text-sm">
          Rôle: <b>{membership.role}</b>
        </div>

        <div className="mt-4 flex gap-2">
          <a className="ftn-btn" href={`/companies/edit/${id}`}>Ma société</a>
          <a className="ftn-btn" href={`/companies/${id}/ttn`}>Paramètres TTN</a>
          <a className="ftn-btn" href="/switch">Switch</a>
        </div>
      </div>
    </AppShell>
  );
}
