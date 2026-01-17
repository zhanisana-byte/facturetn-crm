import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CompanyRow = {
  id: string;
  company_name: string | null;
  tax_id: string | null;
  created_at?: string | null;
  // relation: ttn_credentials(company_id)
  ttn_credentials?: { company_id: string } | null;
};

function Pill({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <span
      className="ftn-pill"
      style={ok ? undefined : { opacity: 0.75 }}
    >
      {children}
    </span>
  );
}

/**
 * TTN côté Cabinet (raccourci):
 * - TTN est toujours "par société" : /companies/{id}/ttn
 * - Cette page liste les sociétés accessibles au cabinet (via RLS/memberships)
 * - Et met en avant la "société du cabinet" (company dont owner_user = user)
 */
export default async function CabinetTTNPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Sécurité UX: cette page est faite pour le mode Cabinet (comptable)
  // (si tu veux autoriser profil aussi, retire ce contrôle)
  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profile?.account_type && String(profile.account_type) !== "comptable") redirect("/dashboard");

  // Société du cabinet (si elle existe): première société owner_user = user
  const { data: ownedCompanies } = await supabase
    .from("companies")
    .select("id,company_name,tax_id,ttn_credentials(company_id),created_at")
    .eq("owner_user", auth.user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const cabinetCompany = (ownedCompanies?.[0] as CompanyRow | undefined) ?? undefined;

  // Companies accessibles au cabinet (via RLS / memberships)
  const { data: companies } = await supabase
    .from("companies")
    .select("id,company_name,tax_id,ttn_credentials(company_id),created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (companies || []) as unknown as CompanyRow[];

  return (
    <AppShell
      title="TTN (Sociétés)"
      subtitle="Le TTN se configure par société. Cette page est un raccourci pour le cabinet."
      accountType="comptable"
    >
      {/* Mise en avant : Société du cabinet */}
      <Card
        title="Société du cabinet"
        subtitle="Si le cabinet facture ses honoraires, la configuration TTN est ici."
      >
        {!cabinetCompany ? (
          <div className="ftn-muted">
            Aucune “société du cabinet” trouvée. Créez une société depuis votre Profil
            (ex: “Cabinet XYZ”) pour pouvoir facturer les honoraires du cabinet.
            <div className="mt-3">
              <Link className="ftn-link" href="/companies/create">
                Créer une société →
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm">
                <b>{cabinetCompany.company_name || "—"}</b>
              </div>
              <div className="ftn-muted mt-1">
                MF : <b>{cabinetCompany.tax_id || "—"}</b>
              </div>
              <div className="mt-2">
                {!!cabinetCompany.ttn_credentials?.company_id ? (
                  <Pill ok>✅ TTN configuré</Pill>
                ) : (
                  <Pill>⚠️ TTN non configuré</Pill>
                )}
              </div>

              <div
                className="ftn-card mt-3"
                style={{
                  borderColor: "rgba(234,179,8,.35)",
                  background: "rgba(234,179,8,.06)",
                }}
              >
                <b>Note :</b> le cabinet (espace) ne possède pas de TTN. Le TTN est toujours
                configuré <b>au niveau de la société</b>.
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Link className="ftn-btn" href={`/companies/${cabinetCompany.id}`}>
                Accéder à la société
              </Link>
              <Link className="ftn-btn ftn-btn-ghost" href={`/companies/${cabinetCompany.id}/ttn`}>
                Paramètres TTN →
              </Link>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-4" />

      {/* Liste globale */}
      <Card
        title="Sociétés gérées / accessibles"
        subtitle="Chaque société possède ses propres paramètres TTN."
      >
        {!rows.length ? (
          <div className="ftn-muted">
            Aucune société trouvée. Ajoutez une société via invitation ou créez votre société du cabinet.
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
                {rows.map((c) => {
                  const hasTTN = !!c.ttn_credentials?.company_id;
                  return (
                    <tr key={c.id} className="border-t border-slate-200/40">
                      <td className="py-2 pr-4">{c.company_name || "—"}</td>
                      <td className="py-2 pr-4">{c.tax_id || "—"}</td>
                      <td className="py-2 pr-4">
                        {hasTTN ? (
                          <Pill ok>Configuré</Pill>
                        ) : (
                          <Pill>Non configuré</Pill>
                        )}
                      </td>
                      <td className="py-2">
                        <Link className="ftn-link" href={`/companies/${c.id}/ttn`}>
                          Paramètres TTN →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4">
          <Link className="ftn-link" href="/accountant/cabinet">
            ← Retour au cabinet
          </Link>
        </div>
      </Card>
    </AppShell>
  );
}
