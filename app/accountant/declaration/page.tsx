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

export default async function AccountantDeclarationPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsShape>;
}) {
  const sp = (await searchParams) ?? {};
  const { month, year, company, by } = sp;

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
  const createdByFilter: "all" | "me" | "others" = by === "me" || by === "others" ? by : "all";

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

  const selectedCompany = company || (companies.length === 1 ? companies[0].id : "");

  const { start, end } = monthStartEnd(y, m);

  // invoices query (tolerant selects)
  const trySelects = [
    "id, invoice_number, total, created_at, company_id, created_by, ttn_status, declared_month, is_declared",
    "id, invoice_number, total, created_at, company_id, created_by",
    "id, invoice_number, total, created_at, company_id",
  ];

  let invoices: any[] = [];
  let invError: any = null;

  for (const sel of trySelects) {
    let q = supabase
      .from("invoices")
      .select(sel)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false });

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
  const declared = invoices.filter((i) => i.is_declared || i.declared_month).length;
  const pendingTTN = invoices.filter((i) => {
    const st = String(i.ttn_status || "").toLowerCase();
    return st === "queued" || st === "not_sent";
  }).length;

  const monthLabel = new Date(y, m - 1, 1).toLocaleString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <AppShell
      title="Déclaration mensuelle"
      subtitle={isOwner ? `Cabinet — ${monthLabel}` : `Mes clients — ${monthLabel}`}
      accountType={profile?.account_type as any}
    >
      <div className="ftn-grid">
        <Card title="Filtres" subtitle="Mois • société • qui a créé la facture">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="ftn-muted">Mois:</span>

            <Link
              className="ftn-chip"
              href={`/accountant/declaration?year=${y}&month=${Math.max(
                1,
                m - 1
              )}&company=${selectedCompany}&by=${createdByFilter}`}
            >
              ◀
            </Link>

            <span className="ftn-chip is-active">{monthLabel}</span>

            <Link
              className="ftn-chip"
              href={`/accountant/declaration?year=${y}&month=${Math.min(
                12,
                m + 1
              )}&company=${selectedCompany}&by=${createdByFilter}`}
            >
              ▶
            </Link>

            <span className="ftn-muted ml-2">Créées par:</span>

            <Link
              className={"ftn-chip " + (createdByFilter === "all" ? "is-active" : "")}
              href={`/accountant/declaration?year=${y}&month=${m}&company=${selectedCompany}&by=all`}
            >
              Tout
            </Link>

            <Link
              className={"ftn-chip " + (createdByFilter === "me" ? "is-active" : "")}
              href={`/accountant/declaration?year=${y}&month=${m}&company=${selectedCompany}&by=me`}
            >
              Moi
            </Link>

            <Link
              className={"ftn-chip " + (createdByFilter === "others" ? "is-active" : "")}
              href={`/accountant/declaration?year=${y}&month=${m}&company=${selectedCompany}&by=others`}
            >
              Équipe / autres
            </Link>
          </div>

          {companies.length > 1 ? (
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="ftn-muted">Société:</span>
              {companies.map((c: CompanyOption) => (
                <Link
                  key={c.id}
                  className={"ftn-chip " + (selectedCompany === c.id ? "is-active" : "")}
                  href={`/accountant/declaration?year=${y}&month=${m}&company=${c.id}&by=${createdByFilter}`}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>Total factures: {invoices.length}</Badge>
            <Badge>Total TTC: {totalTTC.toFixed(3)} TND</Badge>
            <Badge>Déclarées: {declared}</Badge>
            <Badge>En attente TTN: {pendingTTN}</Badge>
          </div>

          <div className="ftn-muted mt-3">
            Objectif: valider la déclaration mensuelle par client (cabinet) et suivre TTN (en attente / accepté / rejeté).
          </div>
        </Card>

        <Card title="Factures du mois" subtitle="Tableau — créé par / TTN / déclaré">
          {invError ? (
            <div className="ftn-alert">
              {invError.message}
              <div className="ftn-muted mt-2">
                Si certaines colonnes n&apos;existent pas encore, la page reste compatible (fallback).
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
                  <th>Déclarée</th>
                </tr>
              }
            >
              {invoices.map((inv: any) => {
                const createdBy = inv.created_by
                  ? inv.created_by === auth.user.id
                    ? "Moi"
                    : "Équipe / autre"
                  : "—";

                const ttn = String(inv.ttn_status || "").toLowerCase();
                const pill =
                  ttn === "accepted" || ttn === "ok"
                    ? "is-ok"
                    : ttn === "rejected" || ttn === "error"
                    ? "is-bad"
                    : "is-warn";

                const ttnLabel = inv.ttn_status ? String(inv.ttn_status) : "pending";
                const isDeclared = !!(inv.is_declared || inv.declared_month);

                return (
                  <tr key={inv.id}>
                    <td className="font-semibold">{inv.invoice_number ?? inv.id}</td>
                    <td>{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ""}</td>
                    <td>{Number(inv.total || 0).toFixed(3)} TND</td>
                    <td>{createdBy}</td>
                    <td>
                      <span className={"ftn-pill " + pill}>{ttnLabel}</span>
                    </td>
                    <td>
                      {isDeclared ? (
                        <span className="ftn-pill is-ok">oui</span>
                      ) : (
                        <span className="ftn-pill is-warn">non</span>
                      )}
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

            <Link className="ftn-btn ftn-btn-soft" href="/accountant/invoices">
              Tableau factures cabinet
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
