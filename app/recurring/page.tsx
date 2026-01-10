import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

/* =========================
   Types
========================= */
type SearchParams = {
  company?: string;
};

/* =========================
   Page
========================= */
export default async function RecurringPage({
  searchParams,
}: {
  // IMPORTANT : Next.js App Router attend Promise ici
  searchParams?: Promise<SearchParams>;
}) {
  // Toujours résoudre searchParams avec type explicite
  const sp: SearchParams = await (
    searchParams ?? Promise.resolve<SearchParams>({})
  );

  const supabase = await createClient();

  /* =========================
     AUTH (GUARD STRICT)
  ========================= */
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) {
    redirect("/login");
  }

  /* =========================
     SOCIÉTÉS DE L'UTILISATEUR
  ========================= */
  const { data: companies } = await supabase
    .from("companies")
    .select("id, company_name")
    .eq("owner_user", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const companyId = sp.company ?? companies?.[0]?.id;

  if (!companyId) {
    return (
      <AppShell title="Factures permanentes" subtitle="Aucune société">
        <div className="text-gray-500">
          Veuillez créer une société pour activer les factures permanentes.
        </div>
      </AppShell>
    );
  }

  /* =========================
     FACTURES PERMANENTES
  ========================= */
  const { data } = await supabase
    .from("recurring_invoice_templates")
    .select(
      `
      id,
      label,
      frequency,
      next_run_date,
      is_active,
      customers ( name )
    `
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const templates = data ?? [];

  /* =========================
     RENDER
  ========================= */
  return (
    <AppShell
      title="Factures permanentes"
      subtitle="Création et gestion des factures mensuelles automatiques"
    >
      {/* Header actions */}
      <div className="flex justify-between items-center mb-6">
        <div className="text-sm text-gray-600">
          Société active :{" "}
          <span className="font-medium">
            {companies?.find((c) => c.id === companyId)?.company_name}
          </span>
        </div>

        <Link
          href={`/recurring/new?company=${companyId}`}
          className="px-4 py-2 rounded-lg bg-black text-white text-sm"
        >
          + Nouvelle facture permanente
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3">Libellé</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Fréquence</th>
              <th className="px-4 py-3">Prochaine facture</th>
              <th className="px-4 py-3">Statut</th>
            </tr>
          </thead>

          <tbody>
            {templates.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-gray-500"
                >
                  Aucune facture permanente.
                </td>
              </tr>
            )}

            {templates.map((tpl: any) => (
              <tr key={tpl.id} className="border-t">
                <td className="px-4 py-3 font-medium">{tpl.label}</td>
                <td className="px-4 py-3">
                  {tpl.customers?.name ?? "-"}
                </td>
                <td className="px-4 py-3 capitalize">{tpl.frequency}</td>
                <td className="px-4 py-3">
                  {tpl.next_run_date
                    ? new Date(tpl.next_run_date).toLocaleDateString()
                    : "-"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      tpl.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {tpl.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
