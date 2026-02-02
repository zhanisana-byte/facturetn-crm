import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = { params: Promise<{ id: string; companyId: string }> };

export default async function GroupCompanyViewPage({ params }: Props) {
  const { id: groupId, companyId } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const userId = auth.user.id;

  const { data: link } = await supabase
    .from("group_companies")
    .select("id")
    .eq("group_id", groupId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!link?.id) redirect(`/groups/${groupId}`);

  const { data: group } = await supabase
    .from("groups")
    .select("owner_user_id")
    .eq("id", groupId)
    .maybeSingle();

  const isOwner = group?.owner_user_id === userId;
  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (!gm?.is_active || String(gm.role) !== "admin") redirect(`/groups/${groupId}`);
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id,company_name,tax_id,address")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id) redirect(`/groups/${groupId}`);

  return (
    <div className="p-6 space-y-4">
      <div className="ftn-card-lux p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">{company.company_name}</div>
            <div className="text-sm opacity-80">MF: {company.tax_id || "—"}</div>
            <div className="text-xs opacity-70">{company.address || ""}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="ftn-btn" href={`/groups/${groupId}`} prefetch={false}>Retour groupe</Link>
            <Link className="ftn-btn" href={`/groups/${groupId}/clients`} prefetch={false}>Sociétés</Link>
            <Link className="ftn-btn" href={`/groups/${groupId}/invoices`} prefetch={false}>Facturation</Link>
          </div>
        </div>
      </div>

      <div className="ftn-card p-4">
        <div className="font-semibold mb-2">Actions</div>
        <div className="flex flex-wrap gap-2">
          <Link className="ftn-btn" href={`/groups/${groupId}/companies/${companyId}/ttn`} prefetch={false}>
            Paramètres TTN
          </Link>
          <Link className="ftn-btn" href={`/companies/${companyId}`} prefetch={false}>
            Ouvrir société (vue Société)
          </Link>
        </div>

        <div className="mt-3 text-sm opacity-80">
          ⚠️ Ici on reste en “mode Groupe”. On ne switch pas vers la société.
        </div>
      </div>
    </div>
  );
}
