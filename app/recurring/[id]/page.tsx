import AppShell from "@/app/components/AppShell";
import { getAuthUser } from "@/lib/auth/server";
import { ensureWorkspaceRow } from "@/lib/workspace/server";
import RecurringTemplateClient from "./RecurringTemplateClient";

export const dynamic = "force-dynamic";

export default async function RecurringTemplatePage(props: { params?: Promise<{ id: string }> }) {
  const params = (await props.params) ?? ({} as any);
  const { id } = await params;
  const { supabase, user } = await getAuthUser();
  const ws = await ensureWorkspaceRow(supabase, user.id);
  const mode = ws?.active_mode ?? "profil";

  const { data: t, error: tErr } = await supabase
    .from("recurring_templates")
    .select("id,company_id,title,cadence,day_of_month,currency,is_active,created_at")
    .eq("id", id)
    .maybeSingle();

  const { data: items } = await supabase
    .from("recurring_template_items")
    .select("id,template_id,position,description,qty,price,vat,discount")
    .eq("template_id", id)
    .order("position", { ascending: true });

  const { data: company } = t?.company_id
    ? await supabase
        .from("companies")
        .select("id,company_name")
        .eq("id", String(t.company_id))
        .maybeSingle()
    : { data: null };

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id,invoice_number,issue_date,billing_period,total_ttc,currency,status,ttn_status")
    .eq("recurring_template_id", id)
    .order("issue_date", { ascending: false })
    .limit(200);

  return (
    <AppShell title="Facture permanente" subtitle="Paramètres + lignes + génération" accountType={mode as any}>
      {tErr || !t ? (
        <div className="ftn-card">
          <div className="ftn-alert">Facture permanente introuvable ou accès refusé.</div>
        </div>
      ) : (
        <RecurringTemplateClient
          template={t as any}
          items={(items as any) ?? []}
          company={company as any}
          generatedInvoices={(invoices as any) ?? []}
        />
      )}
    </AppShell>
  );
}
