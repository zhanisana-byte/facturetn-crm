import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = { params?: Promise<{ id: string }> };

export default async function ModeEnvoiChoosePage({ params }: Props) {
  const p = (await params) ?? ({ id: "" } as any);
  const companyId = String((p as any).id ?? "");
  if (!companyId) redirect("/companies");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: company } = await supabase.from("companies").select("id,company_name").eq("id", companyId).maybeSingle();
  if (!company?.id) redirect(`/companies/${companyId}/ttn`);

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-xl font-semibold">Mode d’envoi — {company.company_name}</div>
        <div className="text-sm text-slate-600 mt-1">
          Choisissez comment vos factures seront transmises à la plateforme TTN.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href={`/companies/${companyId}/ttn/mode-envoi/en-ligne`} className="rounded-2xl border p-5 hover:bg-slate-50 transition">
          <div className="text-lg font-semibold">🚀 Envoi direct TTN (en ligne)</div>
          <div className="text-sm opacity-70 mt-2">
            Envoi automatique vers TTN via connexion Webservice (API). Requiert WS URL + Login + Password.
          </div>
          <div className="mt-4 text-sm font-medium">Configurer →</div>
        </a>

        <a href={`/companies/${companyId}/ttn/mode-envoi/manuel`} className="rounded-2xl border p-5 hover:bg-slate-50 transition">
          <div className="text-lg font-semibold">📝 Déclaration manuelle</div>
          <div className="text-sm opacity-70 mt-2">
            Aucun paramètre de connexion TTN requis. Vous exportez le TEIF (XML) et vous déposez manuellement sur TTN.
          </div>
          <div className="mt-4 text-sm font-medium">Activer →</div>
        </a>
      </div>

      <div className="flex gap-3">
        <a className="ftn-btn-ghost" href={`/companies/${companyId}/ttn`}>
          ← Retour Paramètres TTN
        </a>
      </div>
    </div>
  );
}
