import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

/* =========================
   TYPES
========================= */
type AccountType = "client" | "cabinet" | "groupe";

type PageProps = {
  searchParams?: Promise<{ company?: string }>;
};

type CompanyOption = {
  id: string;
  name: string;
};

/* =========================
   UI helpers
========================= */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ftn-badge tone-info mr-2">
      {children}
    </span>
  );
}

function money(v: any) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

/* =========================
   PAGE
========================= */
export default async function InvoicesPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  /* ---------- Auth ---------- */
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const sp = (await searchParams) ?? {};
  const companyParam = sp.company ?? "";

  /* ---------- Profile ---------- */
  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type")
    .eq("id", auth.user.id)
    .single();

  const rawType = profile?.account_type;
  const accountType: AccountType | undefined =
    rawType === "client" || rawType === "cabinet" || rawType === "groupe"
      ? rawType
      : undefined;

  const isClient = accountType === "client";
  const isCabinet = accountType === "cabinet";
  const isGroupe = accountType === "groupe";

  /* ---------- Companies via memberships ---------- */
  const { data: memberships, error: memErr } = await supabase
    .from("memberships")
    .select("company_id, companies(id, company_name)")
    .eq("is_active", true);

  if (memErr) {
    return (
      <AppShell title="Factures" subtitle="Erreur chargement" accountType={accountType}>
        <div className="ftn-content">
          <div className="ftn-card">
            <div className="ftn-alert">{memErr.message}</div>
          </div>
        </div>
      </AppShell>
    );
  }

  const companies: CompanyOption[] = (memberships ?? [])
    .map((m: any) => ({
      id: String(m.companies?.id ?? m.company_id ?? ""),
      name: String(m.companies?.company_name ?? "Société"),
    }))
    .filter((c) => Boolean(c.id));

  /* ---------- Selected company ---------- */
  const autoCompany = companies.length === 1 ? companies[0].id : "";

  const selectedCompany = isClient
    ? companies[0]?.id ?? ""
    : companyParam || autoCompany;

  /* ---------- Invoices query ---------- */
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, total_ttc, total, created_at, company_id, ttn_status, payment_status")
    .order("created_at", { ascending: false });

  if (selectedCompany) query = query.eq("company_id", selectedCompany);

  const { data: invoices, error: invErr } = await query;

  if (invErr) {
    return (
      <AppShell title="Factures" subtitle="Erreur chargement" accountType={accountType}>
        <div className="ftn-content">
          <div className="ftn-card">
            <div className="ftn-alert">{invErr.message}</div>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ---------- UI texts ---------- */
  const subtitle =
    isClient
      ? "Vos factures (1 société)"
      : isCabinet
      ? "Factures clients — sélectionnez une société"
      : "Factures multi-sociétés";

  const canCreate = Boolean(selectedCompany);
  const createHref = canCreate ? `/invoices/new?company=${selectedCompany}` : "#";

  /* =========================
     RENDER
  ========================= */
  return (
    <AppShell title="Factures" subtitle={subtitle} accountType={accountType}>
      <div className="ftn-content">
        <div className="ftn-card">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-extrabold">Liste des factures</div>
              <p className="ftn-muted mt-1">
                PDF • XML • Paiement • TTN
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>Total: {invoices?.length ?? 0}</Badge>
                <Badge>Société: {selectedCompany || "—"}</Badge>
                {accountType && <Badge>Compte: {accountType}</Badge>}
              </div>
            </div>

            {canCreate ? (
              <Link href={createHref} className="ftn-btn">
                + Nouvelle facture
              </Link>
            ) : (
              <button className="ftn-btn" disabled>
                + Nouvelle facture
              </button>
            )}
          </div>

          {/* Company selector (cabinet / groupe) */}
          {!isClient && companies.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {companies.map((c) => {
                const active = selectedCompany === c.id;
                return (
                  <Link
                    key={c.id}
                    href={`/invoices?company=${c.id}`}
                    className="ftn-btn-ghost"
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
          <div className="mt-4">
            {!invoices || invoices.length === 0 ? (
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
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any) => {
                    const total = inv.total_ttc ?? inv.total ?? 0;
                    return (
                      <tr key={inv.id}>
                        <td className="font-semibold">{inv.invoice_number ?? "—"}</td>
                        <td>{money(total)} TND</td>
                        <td>
                          {inv.created_at
                            ? new Date(inv.created_at).toLocaleDateString()
                            : ""}
                        </td>
                        <td>{inv.payment_status ?? "unpaid"}</td>
                        <td>{inv.ttn_status ?? "not_sent"}</td>
                        <td className="text-right">
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

          {/* Hints */}
          {isCabinet && !selectedCompany && (
            <div className="ftn-alert mt-4">
              Cabinet : sélectionnez une société client pour créer ou consulter des factures.
            </div>
          )}

          {isClient && companies.length === 0 && (
            <div className="ftn-alert mt-4">
              Aucune société trouvée. Créez votre société avant de facturer.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
