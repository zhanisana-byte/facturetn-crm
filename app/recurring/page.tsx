import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { getAuthUser } from "@/lib/auth/server";
import { ensureWorkspaceRow } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

type TemplateRow = {
  id: string;
  company_id: string;
  title: string;
  cadence: string;
  day_of_month: number | null;
  is_active: boolean;
  currency: string;
  created_at: string | null;
};

export default async function RecurringPage() {
  const { supabase, user } = await getAuthUser();

  const ws = await ensureWorkspaceRow(supabase, user.id);
  const mode = ws?.active_mode ?? "profil";

  const { data: ms } = await supabase
    .from("memberships")
    .select("company_id, is_active, companies(id, company_name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const companies = (ms ?? [])
    .map((m: any) => ({
      id: String(m.companies?.id ?? m.company_id ?? ""),
      name: String(m.companies?.company_name ?? "Société"),
    }))
    .filter((c: any) => Boolean(c.id));

  const companyIds = companies.map((c) => c.id);
  const companyNameById = new Map(companies.map((c) => [c.id, c.name] as const));

  const list: TemplateRow[] = companyIds.length
    ? (((await supabase
        .from("recurring_templates")
        .select("id,company_id,title,cadence,day_of_month,is_active,currency,created_at")
        .in("company_id", companyIds)
        .order("created_at", { ascending: false })
        .limit(300)).data ?? []) as TemplateRow[])
    : [];

  async function validateTemplate(templateId: string) {
    "use server";
    const { supabase, user } = await getAuthUser();

    const { data: t } = await supabase
      .from("recurring_templates")
      .select("id,company_id,title,currency,is_active")
      .eq("id", templateId)
      .maybeSingle();

    if (!t?.id) throw new Error("Template introuvable.");
    if (!t.is_active) throw new Error("Template inactif.");

    const { data: items } = await supabase
      .from("recurring_template_items")
      .select("description,qty,price,vat,discount,position")
      .eq("template_id", templateId)
      .order("position", { ascending: true })
      .limit(500);

    const lines = (items ?? []).map((it: any, idx: number) => ({
      line_no: idx + 1,
      description: String(it.description ?? ""),
      quantity: Number(it.qty ?? 1),
      unit_price_ht: Number(it.price ?? 0),
      vat_pct: Number(it.vat ?? 0),
      discount_pct: Number(it.discount ?? 0),
    }));

    const payload: any = {
      company_id: t.company_id,
      issue_date: new Date().toISOString().slice(0, 10),
      currency: String(t.currency ?? "TND"),
      document_type: "facture",
      invoice_mode: "permanente",
      unique_reference: `PERM-${String(t.title ?? "MODELE").slice(0, 20)}`,
      created_by_user_id: user.id,
      ttn_status: "not_sent",
      status: "draft",
    };

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .insert(payload)
      .select("id")
      .single();

    if (invErr) throw new Error(invErr.message);

    if (lines.length) {
      const insertItems = lines.map((l: any) => ({
        invoice_id: inv.id,
        line_no: l.line_no,
        description: l.description,
        quantity: l.quantity,
        unit_price_ht: l.unit_price_ht,
        discount_pct: l.discount_pct,
        vat_pct: l.vat_pct,
      }));

      const { error: itErr } = await supabase.from("invoice_items").insert(insertItems);
      if (itErr) throw new Error(itErr.message);

      await supabase.rpc("compute_invoice_totals", { p_invoice_id: inv.id });
    }
  }

  return (
    <AppShell
      title="Factures permanentes"
      subtitle="Tableau de gestion + génération automatique"
      accountType={mode as any}
    >
      <div className="p-6">
        <div className="ftn-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Factures permanentes</div>
              <div className="text-sm text-slate-600">
                Chaque ligne représente une facture permanente. Le système génère automatiquement les factures selon la cadence.
              </div>
            </div>

            <div className="flex gap-2">
              <Link className="ftn-btn ftn-btn-ghost" href="/invoices" prefetch={false}>
                Voir Factures
              </Link>
              <Link className="ftn-btn" href="/recurring/new" prefetch={false}>
                + Nouvelle facture permanente
              </Link>
            </div>
          </div>

          <div className="mt-5 overflow-auto rounded-2xl border">
            {list.length === 0 ? (
              <div className="p-4 text-sm">Aucune facture permanente.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Société</th>
                    <th className="text-left font-medium px-4 py-3">Titre</th>
                    <th className="text-left font-medium px-4 py-3">Cadence</th>
                    <th className="text-left font-medium px-4 py-3">Devise</th>
                    <th className="text-right font-medium px-4 py-3 w-[280px]">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {list.map((t) => (
                    <tr key={t.id} className="border-t hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">
                        {companyNameById.get(t.company_id) ?? "Société"}
                      </td>
                      <td className="px-4 py-3">{t.title}</td>
                      <td className="px-4 py-3">
                        {t.cadence}
                        {t.day_of_month ? ` (J${t.day_of_month})` : ""}
                      </td>
                      <td className="px-4 py-3">{t.currency}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2 justify-end">
                          <Link className="ftn-btn ftn-btn-ghost" href={`/recurring/${t.id}`} prefetch={false}>
                            Voir
                          </Link>
                          <Link className="ftn-btn" href={`/recurring/${t.id}?edit=1`} prefetch={false}>
                            Modifier
                          </Link>

                          <form action={validateTemplate.bind(null, t.id)}>
                            <button className="ftn-btn" type="submit">
                              Valider → Factures
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Devise acceptée : ISO-4217 (le guide TEIF parle de currencyCodeList ISO_4217). Par défaut TND.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
