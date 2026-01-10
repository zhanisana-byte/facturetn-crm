import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Table, Badge } from "@/components/ui";

type SearchParamsShape = {
  month?: string;
  year?: string;
  company?: string;
  q?: string;
};

type CompanyOption = {
  id: string;
  name: string;
};

type CompanyRow = {
  id: string;
  company_name: string | null;
};

type MembershipRow = { company_id: string };
type AssignmentRow = { company_id: string };

function ymNow() {
  const d = new Date();
  return { m: d.getMonth() + 1, y: d.getFullYear() };
}

function monthStartEnd(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

export default async function AccountantInvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsShape>;
}) {
  const sp = (await searchParams) ?? {};
  const { month, year, company, q } = sp;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type,subscription_status")
    .eq("id", auth.user.id)
    .single();

  const isOwner =
    profile?.account_type === "comptable" && profile?.subscription_status === "free_admin";

  const now = ymNow();
  const m = Math.min(12, Math.max(1, Number(month || now.m)));
  const y = Math.min(2100, Math.max(2000, Number(year || now.y)));
  const query = (q ?? "").trim();

  // Companies: owner => memberships; staff => assignments
  let companyIds: string[] = [];
  if (isOwner) {
    const { data: myMemberships } = await supabase
      .from("memberships")
      .select("company_id")
      .eq("user_id", auth.user.id)
      .eq("is_active", true);

    companyIds = (myMemberships ?? [])
      .map((r: MembershipRow) => r.company_id)
      .filter(Boolean);
  } else {
    const { data: myAssignments } = await supabase
      .from("client_assignments")
      .select("company_id")
      .eq("staff_user_id", auth.user.id)
      .eq("is_active", true);

    companyIds = (myAssignments ?? [])
      .map((r: AssignmentRow) => r.company_id)
      .filter(Boolean);
  }

  companyIds = Array.from(new Set(companyIds));

  const { data: companyRows } = companyIds.length
    ? await supabase
        .from("companies")
        .select("id,company_name")
        .in("id", companyIds)
        .order("company_name", { ascending: true })
    : ({ data: [] as CompanyRow[] });

  const companies: CompanyOption[] = (companyRows ?? []).map((c: CompanyRow) => ({
    id: c.id,
    name: c.company_name ?? "Société",
  }));

  const selectedCompany = company || "";

  const { start, end } = monthStartEnd(y, m);

  // invoices query (tolerant selects)
  const trySelects = [
    "id, invoice_number, total, created_at, company_id, customer_name, customer_tax_id, ttn_status, is_declared, declared_month",
    "id, invoice_number, total, created_at, company_id, customer_name, customer_tax_id",
    "id, invoice_number, total, created_at, company_id",
  ];

  let invoices: any[] = [];
  let invError: any = null;

  for (const sel of trySelects) {
    let qy = supabase
      .from("invoices")
      .select(sel)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false });

    if (selectedCompany) qy = qy.eq("company_id", selectedCompany);

    if (query) {
      const like = `%${query}%`;
      qy = qy.or(
        `invoice_number.ilike.${like},customer_name.ilike.${like},customer_tax_id.ilike.${like}`
      );
    }

    const { data, error } = await qy;
    if (!error) {
      invoices = data ?? [];
      invError = null;
      break;
    }
    invError = error;
  }

  const totalTTC = invoices.reduce((s, i) => s + (Number(i.total) || 0), 0);

  const monthLabel = new Date(y, m - 1, 1).toLocaleString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <AppShell title="Factures (cabinet)" subtitle={monthLabel} accountType={profile?.account_type as any}>
      <div className="ftn-grid">
        <Card title="Filtres" subtitle="Mois • société • recherche (client/MF/n° facture)">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="ftn-muted">Mois:</span>

            <Link
              className="ftn-chip"
              href={`/accountant/invoices?year=${y}&month=${Math.max(
                1,
                m - 1
              )}&company=${selectedCompany}&q=${encodeURIComponent(query)}`}
            >
              ◀
            </Link>

            <span className="ftn-chip is-active">{monthLabel}</span>

            <Link
              className="ftn-chip"
              href={`/accountant/invoices?year=${y}&month=${Math.min(
                12,
                m + 1
              )}&company=${selectedCompany}&q=${encodeURIComponent(query)}`}
            >
              ▶
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="ftn-muted">Société:</span>

            <Link
              className={"ftn-chip " + (!selectedCompany ? "is-active" : "")}
              href={`/accountant/invoices?year=${y}&month=${m}&q=${encodeURIComponent(query)}`}
            >
              Toutes
            </Link>

            {companies.map((c: CompanyOption) => (
              <Link
                key={c.id}
                className={"ftn-chip " + (selectedCompany === c.id ? "is-active" : "")}
                href={`/accountant/invoices?year=${y}&month=${m}&company=${c.id}&q=${encodeURIComponent(query)}`}
              >
                {c.name}
              </Link>
            ))}
          </div>

          <div className="mt-3">
            <form className="flex gap-2" action="/accountant/invoices" method="get">
              <input type="hidden" name="year" value={String(y)} />
              <input type="hidden" name="month" value={String(m)} />
              {selectedCompany ? <input type="hidden" name="company" value={selectedCompany} /> : null}
              <input
                name="q"
                defaultValue={query}
                placeholder="Recherche: client, MF, facture..."
                className="w-full max-w-md rounded-xl border px-3 py-2 text-sm"
              />
              <button className="ftn-btn" type="submit">
                Rechercher
              </button>
            </form>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>Total: {invoices.length}</Badge>
            <Badge>Total TTC: {totalTTC.toFixed(3)} TND</Badge>
          </div>
        </Card>

        <Card title="Liste des factures" subtitle="Téléchargement PDF + statut TTN si disponible">
          {invError ? (
            <div className="ftn-alert">
              {invError.message}
              <div className="ftn-muted mt-2">
                La page reste compatible si certaines colonnes n&apos;existent pas (fallback).
              </div>
            </div>
          ) : null}

          {invoices.length === 0 ? (
            <div className="ftn-muted">Aucune facture sur ce mois.</div>
          ) : (
            <Table
              head={
                <tr>
                  <th>Facture</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th>MF</th>
                  <th>Total</th>
                  <th>TTN</th>
                  <th>PDF</th>
                </tr>
              }
            >
              {invoices.map((inv: any) => {
                const ttn = String(inv.ttn_status || "").toLowerCase();
                const pill =
                  ttn === "accepted" || ttn === "ok"
                    ? "is-ok"
                    : ttn === "rejected" || ttn === "error"
                    ? "is-bad"
                    : "is-warn";

                const ttnLabel = inv.ttn_status ? String(inv.ttn_status) : "—";

                return (
                  <tr key={inv.id}>
                    <td className="font-semibold">{inv.invoice_number ?? inv.id}</td>
                    <td>{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ""}</td>
                    <td>{inv.customer_name ?? "—"}</td>
                    <td>{inv.customer_tax_id ?? "—"}</td>
                    <td>{Number(inv.total || 0).toFixed(3)} TND</td>
                    <td>
                      <span className={"ftn-pill " + pill}>{ttnLabel}</span>
                    </td>
                    <td>
                      <Link className="ftn-btn ftn-btn-soft" href={`/api/invoices/${inv.id}/pdf`}>
                        PDF
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              className="ftn-btn"
              href={selectedCompany ? `/invoices/new?company=${selectedCompany}` : "/accountant/clients"}
            >
              + Créer une facture
            </Link>
            <Link className="ftn-btn ftn-btn-soft" href="/accountant/declaration">
              Déclaration mensuelle
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
