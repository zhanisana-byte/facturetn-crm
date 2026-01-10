import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

type PageProps = {
  searchParams?: Promise<{ company?: string }>;
};

type CompanyOption = { id: string; name: string };

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ftn-badge tone-info" style={{ marginRight: 8 }}>
      {children}
    </span>
  );
}

function money(v: any) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

export default async function InvoicesPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const sp = (await searchParams) ?? {};
  const companyParam = sp?.company ?? "";

  // 1) Profil (account_type)
  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type")
    .eq("id", auth.user.id)
    .single();

  const accountType = (profile?.account_type as string | null) ?? null;
  const isClient = accountType === "client";
  const isCabinet = accountType === "cabinet";
  const isGroupe = accountType === "groupe";

  // 2) Companies accessibles via memberships
  const { data: memberships, error: memErr } = await supabase
    .from("memberships")
    .select("company_id, companies(id, company_name)")
    .eq("is_active", true);

  if (memErr) {
    return (
      <AppShell title="Factures" subtitle="Erreur chargement" accountType={accountType ?? undefined}>
        <div className="ftn-content">
          <div className="ftn-card">
            <div className="ftn-alert">{memErr.message}</div>
          </div>
        </div>
      </AppShell>
    );
  }

  const companies: CompanyOption[] = (memberships ?? [])
    .map((m: any): CompanyOption => ({
      id: String(m.companies?.id ?? m.company_id ?? ""),
      name: String(m.companies?.company_name ?? "Société"),
    }))
    .filter((c) => Boolean(c.id));

  // 3) Société sélectionnée
  // - Client: auto 1 seule société (s’il y en a une)
  // - Cabinet/Groupe: on respecte ?company si présent, sinon vide ou auto si une seule
  const autoCompany = companies.length === 1 ? companies[0].id : "";
  const selectedCompany = isClient
    ? (companies[0]?.id ?? "")
    : (companyParam || autoCompany);

  // 4) Query invoices
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, total_ttc, total, created_at, company_id, ttn_status, payment_status")
    .order("created_at", { ascending: false });

  if (selectedCompany) query = query.eq("company_id", selectedCompany);

  const { data: invoices, error: invErr } = await query;

  if (invErr) {
    return (
      <AppShell title="Factures" subtitle="Erreur chargement" accountType={accountType ?? undefined}>
        <div className="ftn-content">
          <div className="ftn-card">
            <div className="ftn-alert">{invErr.message}</div>
          </div>
        </div>
      </AppShell>
    );
  }

  // 5) Bouton créer facture
  const canCreate = Boolean(selectedCompany);
  const createHref = canCreate ? `/invoices/new?company=${selectedCompany}` : "#";

  // 6) Textes pro selon compte
  const subtitle =
    isClient
      ? "Vos factures (1 société)"
      : isCabinet
      ? "Factures clients — choisissez une société"
      : "Factures multi-sociétés";

  return (
    <AppShell title="Factures" subtitle={subtitle} accountType={accountType ?? undefined}>
      <div className="ftn-content">
        <div className="ftn-card">
          {/* Header actions */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-extrabold">Liste des factures</div>
              <p className="ftn-muted" style={{ marginTop: 6 }}>
                PDF • XML • Statuts TTN • Paiement
              </p>

              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Badge>Total: {invoices?.length ?? 0}</Badge>
                <Badge>
                  Société: {selectedCompany ? selectedCompany : "—"}
                </Badge>
                {accountType ? <Badge>Compte: {accountType}</Badge> : null}
              </div>
            </div>

            {canCreate ? (
              <Link href={createHref} className="ftn-btn">
                + Nouvelle facture
              </Link>
            ) : (
              <button className="ftn-btn" disabled title="Sélectionne une société">
                + Nouvelle facture
              </button>
            )}
          </div>

          {/* Sélecteur société (Cabinet/Groupe seulement, et si plusieurs) */}
          {!isClient && companies.length > 1 && (
            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {companies.map((c) => {
                const active = selectedCompany === c.id;
                return (
                  <Link
                    key={c.id}
                    href={`/invoices?company=${c.id}`}
                    className={active ? "ftn-btn-ghost" : "ftn-btn-ghost"}
                    style={{
                      borderColor: active ? "rgba(186,134,52,.55)" : undefined,
                      background: active ? "rgba(186,134,52,.12)" : undefined,
                    }}
                    title={c.id}
                  >
                    {c.name}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Table */}
          <div style={{ marginTop: 16 }}>
            {(!invoices || invoices.length === 0) ? (
              <div className="ftn-muted">Aucune facture trouvée.</div>
            ) : (
              <table className="ftn-table">
                <thead>
                  <tr>
                    <th>Numéro</th>
                    <th>Total</th>
                    <th>Date</th>
                    <th>Paiement</th>
                    <th>TTN</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any) => {
                    const total = inv.total_ttc ?? inv.total ?? 0;
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 800 }}>{inv.invoice_number ?? "—"}</td>
                        <td>{money(total)} TND</td>
                        <td>
                          {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ""}
                        </td>
                        <td>{inv.payment_status ?? "unpaid"}</td>
                        <td>{inv.ttn_status ?? "not_sent"}</td>
                        <td style={{ textAlign: "right" }}>
                          <Link className="ftn-link" href={`/invoices/${inv.id}`}>
                            Ouvrir
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Hint cabinet */}
          {isCabinet && !selectedCompany && (
            <div className="ftn-alert" style={{ marginTop: 16 }}>
              Cabinet : sélectionnez une société client pour voir/créer les factures.
            </div>
          )}

          {/* Hint client */}
          {isClient && companies.length === 0 && (
            <div className="ftn-alert" style={{ marginTop: 16 }}>
              Aucune société trouvée. Créez votre société dans l’espace société.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
