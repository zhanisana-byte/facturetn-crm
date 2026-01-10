import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Table, Badge } from "@/components/ui";

type PageProps = {
  searchParams?: Promise<{ company?: string }>;
};

export default async function InvoicesPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const sp = (await searchParams) ?? {};
  const companyParam = sp?.company ?? "";

  type CompanyOption = { id: string; name: string };

  // Companies accessibles (via memberships)
  const { data: memberships } = await supabase
    .from("memberships")
    .select("company_id, companies(id, company_name)")
    .eq("is_active", true);

  const companies: CompanyOption[] = (memberships ?? [])
    .map((m: any): CompanyOption => ({
      id: String(m.companies?.id ?? m.company_id ?? ""),
      name: String(m.companies?.company_name ?? "Société"),
    }))
    .filter((c) => Boolean(c.id));

  // Société sélectionnée (URL) ou auto si une seule
  const selectedCompany = companyParam || (companies.length === 1 ? companies[0].id : "");

  // Query invoices
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, total, created_at, company_id")
    .order("created_at", { ascending: false });

  if (selectedCompany) query = query.eq("company_id", selectedCompany);

  const { data: invoices, error } = await query;

  if (error) {
    return (
      <AppShell title="Factures" subtitle="Erreur chargement" accountType={undefined}>
        <Card title="Erreur" subtitle="Impossible de charger les factures">
          <div className="ftn-alert">{error.message}</div>
        </Card>
      </AppShell>
    );
  }

  // Bouton : créer facture uniquement si société sélectionnée
  const createHref = selectedCompany ? `/invoices/new?company=${selectedCompany}` : "#";

  return (
    <AppShell
      title="Factures"
      subtitle={selectedCompany ? "Factures de la société sélectionnée" : "Sélectionne une société pour créer une facture"}
      accountType={undefined}
    >
      <Card title="Liste" subtitle="PDF • XML • Statuts TTN (bientôt)">
        {/* Sélecteur société (si plusieurs) */}
        {companies.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {companies.map((c) => (
              <Link
                key={c.id}
                href={`/invoices?company=${c.id}`}
                className={
                  "px-3 py-1.5 rounded-full text-xs border transition " +
                  (selectedCompany === c.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:bg-slate-50")
                }
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <Badge>Total: {invoices?.length ?? 0}</Badge>
            {selectedCompany ? <Badge>Société: {selectedCompany}</Badge> : <Badge>Société: —</Badge>}
          </div>

          {selectedCompany ? (
            <Link href={createHref} className="ftn-btn">
              + Nouvelle facture
            </Link>
          ) : (
            <button className="ftn-btn" disabled title="Sélectionne une société">
              + Nouvelle facture
            </button>
          )}
        </div>

        <div className="mt-5">
          {invoices?.length === 0 ? (
            <div className="ftn-muted">Aucune facture trouvée.</div>
          ) : (
            <Table
              head={
                <tr>
                  <th>Numéro</th>
                  <th>Total</th>
                  <th>Date</th>
                  <th className="text-right">Action</th>
                </tr>
              }
            >
              {invoices!.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-semibold">{inv.invoice_number ?? "—"}</td>
                  <td>{inv.total ?? 0} TND</td>
                  <td>{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ""}</td>
                  <td className="text-right">
                    <Link className="ftn-link" href={`/invoices/${inv.id}`}>
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </AppShell>
  );
}
