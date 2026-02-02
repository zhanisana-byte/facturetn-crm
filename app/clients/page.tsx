import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
type CompanyRow = {
  id: string;
  company_name: string;
  tax_id?: string | null;
  owner_user_id?: string | null;
};

type Row = {
  company_id: string;
  role?: string | null;
  can_manage_customers?: boolean | null;
  can_create_invoices?: boolean | null;
  can_validate_invoices?: boolean | null;
  can_submit_ttn?: boolean | null;
  companies?: CompanyRow[] | null; 
};

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
      {children}
    </span>
  );
}

function ttnBadge(hasTTN: boolean) {
  return hasTTN ? (
    <span className="ftn-pill ftn-pill-ok">TTN OK</span>
  ) : (
    <span className="ftn-pill ftn-pill-warn">TTN à configurer</span>
  );
}

export default async function ProfileClientsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: memberships, error } = await supabase
    .from("memberships")
    .select(

      "company_id, role, can_manage_customers, can_create_invoices, can_validate_invoices, can_submit_ttn, companies(id, company_name, tax_id, owner_user_id)"
    )
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const rows = ((memberships ?? []) as unknown as Row[]).filter(
    (m) => (m?.companies?.length ?? 0) > 0
  );

  const ownerIds = Array.from(
    new Set(rows.map((r) => r.companies?.[0]?.owner_user_id).filter(Boolean) as string[])
  );

  const companyIds = Array.from(new Set(rows.map((r) => r.company_id).filter(Boolean))) as string[];

  const [{ data: ownersData }, { data: ttnRows }] = await Promise.all([
    ownerIds.length
      ? supabase.from("app_users").select("id, full_name, email").in("id", ownerIds)
      : Promise.resolve({ data: [] as any }),
    companyIds.length
      ? supabase.from("company_ttn_settings").select("company_id").in("company_id", companyIds)
      : Promise.resolve({ data: [] as any }),
  ]);

  const owners = new Map<string, { full_name?: string | null; email?: string | null }>();
  (ownersData ?? []).forEach((o: any) => owners.set(String(o.id), o));

  const ttnSet = new Set<string>((ttnRows ?? []).map((r: any) => String(r.company_id)));

  return (
    <AppShell title="Mes clients" subtitle="Sociétés liées à votre profil" accountType="profil">
      <div className="mx-auto w-full max-w-6xl p-6">
        <Card title="Sociétés" subtitle="Statut TTN et accès (infos / TTN / facturation)">
          {error ? <div className="ftn-alert">{error.message}</div> : null}

          {rows.length === 0 ? (
            <div className="ftn-muted">Aucune société liée pour le moment.</div>
          ) : (
            <div className="overflow-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b">
                    <th className="py-2 pr-3">Société</th>
                    <th className="py-2 pr-3">Appartient à</th>
                    <th className="py-2 pr-3">Mon rôle</th>
                    <th className="py-2 pr-3">Mes permissions</th>
                    <th className="py-2 pr-3">TTN</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => {
                    const c = m.companies![0]; 
                    const ownerId = c.owner_user_id ?? null;
                    const isMine = ownerId === auth.user.id;
                    const owner = ownerId ? owners.get(ownerId) : null;

                    const ownerLabel = isMine
                      ? "Mon profil"
                      : owner
                      ? owner.full_name || owner.email || "Autre profil"
                      : "Autre profil";

                    const perms = {
                      can_manage_customers: !!m.can_manage_customers,
                      can_create_invoices: !!m.can_create_invoices,
                      can_validate_invoices: !!m.can_validate_invoices,
                      can_submit_ttn: !!m.can_submit_ttn,
                    };

                    const hasTTN = ttnSet.has(String(m.company_id));

                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-3 pr-3">
                          <div className="font-semibold text-slate-900">{c.company_name}</div>
                          <div className="text-xs text-slate-500">MF: {c.tax_id || "—"}</div>
                        </td>

                        <td className="py-3 pr-3">
                          <div className="text-slate-900">{ownerLabel}</div>
                          {!isMine && owner?.email ? (
                            <div className="text-xs text-slate-500">{owner.email}</div>
                          ) : null}
                        </td>

                        <td className="py-3 pr-3">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
                            {String(m.role || "member")}
                          </span>
                        </td>

                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {perms.can_manage_customers ? <Pill>Clients</Pill> : null}
                            {perms.can_create_invoices ? <Pill>Créer facture</Pill> : null}
                            {perms.can_validate_invoices ? <Pill>Valider</Pill> : null}
                            {perms.can_submit_ttn ? <Pill>TTN</Pill> : null}
                          </div>
                        </td>

                        <td className="py-3 pr-3">{ttnBadge(hasTTN)}</td>

                        <td className="py-3">
                          <Link className="ftn-btn ftn-btn-ghost" href={`/companies/${c.id}`}>
                            Ouvrir
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
