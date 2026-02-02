import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  params?: Promise<{ id: string; companyId: string }>;
};

export default async function GroupCompanyTTNHome({ params }: PageProps) {
  const p = (await params) ?? ({ id: "", companyId: "" } as any);
  const groupId = String((p as any).id ?? "");
  const companyId = String((p as any).companyId ?? "");
  if (!groupId || !companyId) redirect("/groups");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("id,company_name,tax_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id) redirect(`/groups/${groupId}`);

  const env = "production";

  const { data: cred } = await supabase
    .from("ttn_credentials")
    .select("send_mode, signature_provider, require_signature, connection_type, ws_url, ws_login, ws_password")
    .eq("company_id", companyId)
    .eq("environment", env)
    .maybeSingle();

  const sendMode = String(cred?.send_mode ?? "api") === "manual" ? "manual" : "api";
  const signatureProvider = String(cred?.signature_provider ?? "none");

  const apiReady =
    sendMode === "api" &&
    String(cred?.connection_type ?? "webservice") === "webservice" &&
    !!cred?.ws_url &&
    !!cred?.ws_login &&
    !!cred?.ws_password;

  const sendLabel =
    sendMode === "manual"
      ? "Déclaration manuelle"
      : apiReady
      ? "Envoi direct TTN (configuré)"
      : "Envoi direct TTN (à configurer)";

  const sendBadge = sendMode === "manual" ? "" : apiReady ? "" : "⚠️";

  const signatureLabel =
    signatureProvider === "digigo"
      ? "DigiGO (OTP)"
      : signatureProvider === "usb_agent"
      ? "Clé USB (Agent local)"
      : "Aucune";

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-2xl font-semibold">{company.company_name}</div>
        <div className="text-sm text-slate-600 mt-1">Matricule fiscal : {company.tax_id || "—"}</div>
        <div className="text-xs text-slate-500 mt-2">
          Paramètres TTN (depuis le groupe). Chaque section s’ouvre dans une page séparée.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <a href={`/companies/${companyId}/ttn/mode-envoi`} className="rounded-2xl border p-5 hover:bg-slate-50 transition">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Mode d’envoi</div>
              <div className="text-sm opacity-70 mt-1">Envoi direct (API) ou déclaration manuelle.</div>
              <div className="mt-3 text-sm">
                <span className="font-medium">Sélection actuelle :</span>{" "}
                <span className="opacity-80">{sendLabel}</span>
              </div>
            </div>
            <div className="text-xl">{sendBadge}</div>
          </div>
        </a>

        <a href={`/companies/${companyId}/ttn/signature`} className="rounded-2xl border p-5 hover:bg-slate-50 transition">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Type de signature</div>
              <div className="text-sm opacity-70 mt-1">DigiGO, Clé USB (agent local) ou aucune signature.</div>
              <div className="mt-3 text-sm">
                <span className="font-medium">Sélection actuelle :</span>{" "}
                <span className="opacity-80">{signatureLabel}</span>
              </div>
            </div>
            <div className="text-xl">➡️</div>
          </div>
        </a>
      </div>

      <div className="pt-2">
        <a className="ftn-btn-ghost" href={`/groups/${groupId}`}>
          ← Retour Groupe
        </a>
      </div>
    </div>
  );
}
