import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type Row = {
  company_id: string;
  companies: {
    id: string;
    company_name: string | null;
    tax_id: string | null;
    ttn_credentials?: { company_id: string } | null;
  } | null;
};

/**
 * TTN côté Groupe:
 * - Le groupe ne "porte" pas la configuration TTN.
 * - TTN est géré par société (company).
 * Cette page donne une vue globale + raccourcis vers /companies/{id}/ttn.
 */
export default async function GroupTTNPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: groupId  } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type")
    .eq("id", auth.user.id)
    .maybeSingle();

  // Companies liés au groupe
  const { data: links } = await supabase
    .from("group_companies")
    .select("company_id,companies(id,company_name,tax_id,ttn_credentials(company_id))")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  const rows = (links || []) as unknown as Row[];

  return (
    <AppShell
      title="TTN (Groupe)"
      subtitle="Vue globale TTN sur les sociétés du groupe"
      accountType="multi_societe"
    >
      <Card
        title="Sociétés du groupe"
        subtitle="Chaque société a ses propres paramètres TTN + certificat."
      >
        {!rows.length ? (
          <div className="ftn-muted">
            Aucune société liée à ce groupe.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="py-2 pr-4">Société</th>
                  <th className="py-2 pr-4">MF</th>
                  <th className="py-2 pr-4">TTN</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = r.companies;
                  const hasTTN = !!c?.ttn_credentials?.company_id;
                  return (
                    <tr key={r.company_id} className="border-t border-slate-200/40">
                      <td className="py-2 pr-4">{c?.company_name || "—"}</td>
                      <td className="py-2 pr-4">{c?.tax_id || "—"}</td>
                      <td className="py-2 pr-4">
                        {hasTTN ? (
                          <span className="ftn-pill">Configuré</span>
                        ) : (
                          <span className="ftn-pill" style={{ opacity: 0.7 }}>
                            Non configuré
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        {c?.id ? (
                          <Link className="ftn-link" href={`/companies/${c.id}/ttn`}>
                            Paramètres TTN →
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <Link className="ftn-link" href={`/groups/${groupId}`}>
            ← Retour au groupe
          </Link>
          <Link className="ftn-link" href="/ttn">
            Voir Dashboard TTN →
          </Link>
        </div>
      </Card>
    </AppShell>
  );
}
