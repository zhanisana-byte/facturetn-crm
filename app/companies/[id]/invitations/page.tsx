import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import InvitationsSocieteClient from "./InvitationsSocieteClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanyInvitationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: companyId  } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Company
  const { data: company } = await supabase
    .from("companies")
    .select("id,company_name,tax_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id) {
    return (
      <AppShell title="Invitations" subtitle="Société introuvable" accountType="entreprise">
        <div className="mx-auto w-full max-w-6xl p-6">
          <div className="ftn-alert tone-bad">Société introuvable.</div>
        </div>
      </AppShell>
    );
  }

  // AuthZ: owner/admin actif via memberships
  const { data: myMembership } = await supabase
    .from("memberships")
    .select("id,role,is_active")
    .eq("company_id", companyId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const isManager = Boolean(myMembership?.is_active && (myMembership.role === "owner" || myMembership.role === "admin"));

  // Pending invitations
  const { data: invites } = await supabase
    .from("access_invitations")
    .select("id,invited_email,role,objective,status,expires_at,created_at,token")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (
    <AppShell
      title="Invitations"
      subtitle={company.company_name ? `Société: ${company.company_name}` : undefined}
      accountType="entreprise"
      activeCompanyId={companyId}
    >
      <InvitationsSocieteClient
        companyId={companyId}
        companyName={company.company_name ?? "Société"}
        isManager={isManager}
        initialInvitations={(invites as any[]) ?? []}
      />
    </AppShell>
  );
}
