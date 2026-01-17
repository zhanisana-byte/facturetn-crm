import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ id: string; companyId: string }> };

export default async function GroupCompanyTTNPage({ params }: PageProps) {
  const { id: groupId, companyId  } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id,group_name,owner_user_id")
    .eq("id", groupId)
    .maybeSingle();
  if (!group?.id) redirect("/groups");

  const isOwner = group.owner_user_id === auth.user.id;
  let myRole: string | null = isOwner ? "owner" : null;

  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", groupId)
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();
    myRole = gm?.role ?? null;
  }

  if (!isOwner && myRole !== "admin") redirect(`/groups/${groupId}`);

  const { data: link } = await supabase
    .from("group_companies")
    .select("company_id,link_type")
    .eq("group_id", groupId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!link?.company_id) redirect(`/groups/${groupId}`);

  const { data: company } = await supabase
    .from("companies")
    .select("id,company_name,tax_id")
    .eq("id", companyId)
    .maybeSingle();

  const { data: credsRaw } = await supabase
    .from("ttn_credentials")
    .select("id,enabled,environment,client_id,taxpayer_id,company_code,created_at,updated_at")
    .eq("company_id", companyId)
    .maybeSingle();
  const creds = credsRaw ?? null;

  // ✅ Règle demandée: pas de module Factures dans les pages Groupe/Société/Cabinet.

  return (
    <AppShell
      title="TTN / El Fatoora"
      subtitle={`${company?.company_name ?? "Société"} • Groupe: ${group.group_name}`}
      accountType="multi_societe"
    >
      <div className="mx-auto w-full max-w-6xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-600">
            Type lien:{" "}
            <span className="font-semibold">{String(link.link_type ?? "internal")}</span>
          </div>
          <div className="flex gap-2">
            <Link className="ftn-btn" href={`/invoices?company=${companyId}`}>
              Factures (Profil)
            </Link>
            <Link className="ftn-btn" href={`/groups/${groupId}`}>
              ← Retour
            </Link>
          </div>
        </div>

        <Card>
          <div className="p-5 space-y-2">
            <div className="text-sm font-semibold">Paramètres TTN</div>
            {!creds ? (
              <div className="text-sm text-slate-600">
                Aucun paramètre TTN trouvé pour cette société.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">Activé:</span>{" "}
                  <span className="font-semibold">{creds.enabled ? "Oui" : "Non"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Environnement:</span>{" "}
                  <span className="font-semibold">{creds.environment ?? "—"}</span>
                </div>
                <div className="truncate">
                  <span className="text-slate-500">Client ID:</span>{" "}
                  <span className="font-semibold">{creds.client_id ? "••••••" : "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Taxpayer ID:</span>{" "}
                  <span className="font-semibold">{creds.taxpayer_id ?? "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Company code:</span>{" "}
                  <span className="font-semibold">{creds.company_code ?? "—"}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-5">
            <div className="text-sm font-semibold">Factures</div>
            <div className="text-sm text-slate-600 mt-2">
              La création et la gestion des factures se fait uniquement dans le <b>Profil Pro</b>. Utilisez le bouton
              <b> Factures (Profil)</b> ci-dessus (ou passez par <b>Switch</b>).
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
