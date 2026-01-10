import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Table, Badge } from "@/components/ui";

type SearchParamsShape = {
  month?: string;
  year?: string;
  company?: string;
  by?: string;
};

type PageProps = {
  searchParams?: Promise<SearchParamsShape>;
};

function ymNow() {
  const d = new Date();
  return { m: d.getMonth() + 1, y: d.getFullYear() };
}

function monthStartEnd(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

export default async function DeclarationPage({ searchParams }: PageProps) {
  const { month, year, company, by } = (await searchParams) ?? {};

  type CompanyOption = { id: string; name: string };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type,email,full_name")
    .eq("id", auth.user.id)
    .single();

  const accountType = (profile?.account_type as any) || undefined;

  const now = ymNow();
  const m = Math.min(12, Math.max(1, Number(month || now.m)));
  const y = Math.min(2100, Math.max(2000, Number(year || now.y)));
  const createdByFilter = by === "me" || by === "others" ? by : "all";

  // Companies for selection (use memberships)
  const { data: memberships } = await supabase
    .from("memberships")
    .select("company_id, role, companies(id, company_name)")
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  const companies: CompanyOption[] = (memberships ?? [])
    .map((mm: any): CompanyOption => ({
      id: String(mm.companies?.id ?? mm.company_id ?? ""),
      name: String(mm.companies?.company_name ?? "Société"),
    }))
    .filter((c) => Boolean(c.id));

  const selectedCompany = company || (companies.length === 1 ? companies[0].id : "");

  const { start, end } = monthStartEnd(y, m);

  // Try rich select first (may fail if columns not created yet)
  const trySelects = [
    "id, invoice_number, total, created_at, company_id, created_by, ttn_status, declared_month",
    "id, invoice_number, total, created_at, company_id, created_by",
    "id, invoice_number, total, created_at, company_id",
  ];

  let invoices: any[] = [];
  let invError: any = null;

  for (const sel of trySelects) {
    let q = supabase.from("invoices").select(sel).gte("created_at", start).lt("created_at", end).order("created_at", { ascending: false });
    if (selectedCompany) q = q.eq("company_id", selectedCompany);
    if (createdByFilter === "me") q = q.eq("created_by", auth.user.id);
    if (createdByFilter === "others") q = q.neq("created_by", auth.user.id);

    const { data, error } = await q;
    if (!error) {
      invoices = data ?? [];
      invError = null;
      break;
    }
    invError = error;
  }

  const totalTTC = invoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const sentTTN = invoices.filter((i) => String(i.ttn_status || "").toLowerCase() === "ok" || String(i.ttn_status || "").toLowerCase() === "sent").length;
  const pendingTTN = invoices.filter((i) => String(i.ttn_status || "").toLowerCase() === "pending" || !i.ttn_status).length;

  const monthLabel = new Date(y, m - 1, 1).toLocaleString("fr-FR", { month: "long", year: "numeric" });

  return (
    <AppShell title="Déclaration mensuelle" subtitle={`Déclaration du mois — ${monthLabel}`} accountType={accountType}>
      <div className="ftn-grid">
        <Card title="Filtres" subtitle="Mois • société • qui a créé la facture">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="ftn-muted">Mois:</span>
            <Link className="ftn-chip" href={`/declaration?year=${y}&month=${Math.max(1, m - 1)}&company=${selectedCompany}&by=${createdByFilter}`}>◀</Link>
            <span className="ftn-chip is-active">{monthLabel}</span>
            <Link className="ftn-chip" href={`/declaration?year=${y}&month=${Math.min(12, m + 1)}&company=${selectedCompany}&by=${createdByFilter}`}>▶</Link>

            <span className="ftn-muted ml-2">Créées par:</span>
            <Link className={"ftn-chip " + (createdByFilter === "all" ? "is-active" : "")} href={`/declaration?year=${y}&month=${m}&company=${selectedCompany}&by=all`}>Tout</Link>
            <Link className={"ftn-chip " + (createdByFilter === "me" ? "is-active" : "")} href={`/declaration?year=${y}&month=${m}&company=${selectedCompany}&by=me`}>Moi</Link>
            <Link className={"ftn-chip " + (createdByFilter === "others" ? "is-active" : "")} href={`/declaration?year=${y}&month=${m}&company=${selectedCompany}&by=others`}>Comptable / équipe</Link>
          </div>

          {companies.length > 1 ? (
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="ftn-muted">Société:</span>
              {companies.map((c) => (
                <Link key={c.id} className={"ftn-chip " + (selectedCompany === c.id ? "is-active" : "")} href={`/declaration?year=${y}&month=${m}&company=${c.id}&by=${createdByFilter}`}>
                  {c.name}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>Total factures: {invoices.length}</Badge>
            <Badge>Total TTC: {totalTTC.toFixed(3)} TND</Badge>
            <Badge>Envoyées TTN: {sentTTN}</Badge>
            <Badge>En attente TTN: {pendingTTN}</Badge>
          </div>

          <div className="ftn-muted mt-3">
            Astuce: cette page doit montrer <b>qui a créé la facture</b> (client vs comptable) et l'état TTN, pour une déclaration mensuelle claire.
          </div>
        </Card>

        <Card title="Factures du mois" subtitle="Tableau — créé par / TTN / statut">
          {invError ? (
            <div className="ftn-alert">
              {invError.message}
              <div className="ftn-muted mt-2">
                Si tu n'as pas encore ajouté les colonnes (ex: <b>created_by</b>, <b>ttn_status</b>), ce tableau reste compatible et affichera la version simple.
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
                  <th>Total</th>
                  <th>Créée par</th>
                  <th>TTN</th>
                </tr>
              }
            >
              {invoices.map((inv: any) => {
                const createdBy = inv.created_by
                  ? inv.created_by === auth.user.id
                    ? "Moi"
                    : "Comptable / équipe"
                  : "—";
                const ttn = String(inv.ttn_status || "").toLowerCase();
                const pill = ttn === "ok" || ttn === "sent" ? "is-ok" : ttn === "error" ? "is-bad" : "is-warn";
                const ttnLabel = inv.ttn_status ? inv.ttn_status : "pending";
                return (
                  <tr key={inv.id}>
                    <td className="font-semibold">{inv.invoice_number ?? inv.id}</td>
                    <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td>{Number(inv.total || 0).toFixed(3)} TND</td>
                    <td>{createdBy}</td>
                    <td>
                      <span className={"ftn-pill " + pill}>{ttnLabel}</span>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="ftn-btn" href={selectedCompany ? `/invoices/new?company=${selectedCompany}` : "/companies"}>
              + Créer une facture
            </Link>
            <Link className="ftn-btn ftn-btn-soft" href="/ttn">
              Voir historique TTN
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
