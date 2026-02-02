import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { mapDbAccountType } from "@/app/types";

export const dynamic = "force-dynamic";
type CompanyRow = {
  id: string;
  company_name: string | null;
  tax_id: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  created_at?: string | null;
};

export default async function CompaniesPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type")
    .eq("id", user.id)
    .maybeSingle();

  const t = mapDbAccountType(profile?.account_type);
  
  if (t !== "profil" && t !== "entreprise") redirect("/dashboard");

  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, company_name, tax_id, address, email, phone, created_at")
    .order("created_at", { ascending: false });

  return (
    <AppShell
      accountType={t}
            title="Page Société"
      subtitle="Gérez vos sociétés, vos factures et travaillez facilement avec votre comptable."
    >
      <div className="max-w-5xl">
        <div className="ftn-card">
          <h3 className="ftn-h3" style={{ marginTop: 0 }}>
            Avantages de la page Société
          </h3>
          <ul className="ftn-list">
            <li>Créer et gérer des factures (PDF / fichiers TTN)</li>
            <li>Historique clair et traçabilité des actions</li>
            <li>Collaboration avec votre comptable (invitation / accès)</li>
            <li>Préparation des données pour les déclarations (TTN via comptable)</li>
          </ul>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <Link className="ftn-btn" href="/companies/create">
              + Créer une société
            </Link>

            <Link className="ftn-btn ftn-btn-ghost" href="/dashboard">
              Retour Dashboard
            </Link>
          </div>
        </div>

        <div className="ftn-card" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h3 className="ftn-h3" style={{ marginTop: 0 }}>
              Mes sociétés
            </h3>

            <Link className="ftn-btn ftn-btn-ghost" href="/companies/create">
              Ajouter
            </Link>
          </div>

          {error ? (
            <div className="ftn-alert" style={{ marginTop: 10 }}>
              Erreur chargement sociétés : {error.message}
            </div>
          ) : null}

          {!error && (!companies || companies.length === 0) ? (
            <div className="ftn-muted" style={{ marginTop: 8 }}>
              Aucune société trouvée. Cliquez sur <b>“Créer une société”</b> pour commencer.
            </div>
          ) : null}

          {!error && companies && companies.length > 0 ? (
            <div className="ftn-grid" style={{ gap: 12, marginTop: 12 }}>
              {companies.map((c: CompanyRow) => {
                const name = c.company_name?.trim() || "Société";
                const tax = c.tax_id ? `MF: ${c.tax_id}` : "MF: —";

                return (
                  <div key={c.id} className="ftn-card" style={{ padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div>
                        <div className="ftn-h3" style={{ margin: 0 }}>
                          {name}
                        </div>
                        <div className="ftn-muted">{tax}</div>
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      
                        <Link className="ftn-btn" href={`/companies/edit/${c.id}`}>
                          Modifier
                        </Link>
                      </div>
                    </div>

                    <div className="ftn-muted" style={{ marginTop: 10 }}>
                      {c.address ? (
                        <div> {c.address}</div>
                      ) : (
                        <div> Adresse : —</div>
                      )}
                      <div>️ {c.email || "—"}</div>
                      <div>️ {c.phone || "—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
