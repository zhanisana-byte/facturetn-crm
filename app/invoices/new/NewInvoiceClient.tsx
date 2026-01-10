import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

type AccountType = "client" | "cabinet" | "groupe";

type PageProps = {
  searchParams?: Promise<{ company?: string }>;
};

type CompanyOption = { id: string; name: string };

export default async function InvoicesPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // ✅ profile (account_type) pour AppShell
  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type")
    .eq("id", auth.user.id)
    .maybeSingle();

  const accountType = (profile?.account_type ?? undefined) as AccountType | undefined;

  const sp = (await searchParams) ?? {};
  const companyParam = sp?.company ?? "";

  // Companies accessibles (via memberships)
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
    .map((m: any): CompanyOption => ({
      id: String(m.companies?.id ?? m.company_id ?? ""),
      name: String(m.companies?.company_name ?? "Société"),
    }))
    .filter((c) => Boolean(c.id));

  const selectedCompany = companyParam || (companies.length === 1 ? companies[0].id : "");

  let query = supabase
    .from("invoices")
    .select("id, invoice_number, total, created_at, company_id")
    .order("created_at", { ascending: false });

  if (selectedCompany) query = query.eq("company_id", selectedCompany);

  const { data: invoices, error } = await query;

  if (error) {
    return (
      <AppShell title="Factures" subtitle="Erreur chargement" accountType={accountType}>
        <div className="ftn-content">
          <div className="ftn-card">
            <div className="ftn-alert">{error.message}</div>
          </div>
        </div>
      </AppShell>
    );
  }

  const createHref = selectedCompany ? `/invoices/new?company=${selectedCompany}` : "#";

  return (
    <AppShell
      title="Factures"
      subtitle={
        selectedCompany
          ? "Factures de la société sélectionnée"
          : "Sélectionne une société pour créer une facture"
      }
      accountType={accountType}
    >
      <div className="ftn-content">
        <div className="ftn-card">
          {/* Sélecteur société */}
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
              <span className="ftn-chip">Total: {invoices?.length ?? 0}</span>
              {selectedCompany ? (
                <span className="ftn-chip">Société: {selectedCompany}</span>
              ) : (
                <span className="ftn-chip">Société: —</span>
              )}
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b">
                      <th className="text-left py-2">Numéro</th>
                      <th className="text-left py-2">Total</th>
                      <th className="text-left py-2">Date</th>
                      <th className="text-right py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices!.map((inv: any) => (
                      <tr key={inv.id} className="border-b last:border-b-0">
                        <td className="py-2 font-semibold">{inv.invoice_number ?? "—"}</td>
                        <td className="py-2">{inv.total ?? 0} TND</td>
                        <td className="py-2">
                          {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ""}
                        </td>
                        <td className="py-2 text-right">
                          <Link className="ftn-link" href={`/invoices/${inv.id}`}>
                            Ouvrir
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
