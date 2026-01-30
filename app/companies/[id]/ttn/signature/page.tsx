import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = { params?: Promise<{ id: string }> };

export default async function SignatureChoosePage({ params }: Props) {
  const p = (await params) ?? ({ id: "" } as any);
  const companyId = String((p as any).id ?? "");
  if (!companyId) redirect("/companies");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: company } = await supabase.from("companies").select("id,company_name").eq("id", companyId).maybeSingle();
  if (!company?.id) redirect(`/companies/${companyId}/ttn`);

  const lockedOther = true;

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-xl font-semibold">Type de signature — {company.company_name}</div>
        <div className="text-sm text-slate-600 mt-1">Choisissez la méthode de signature. Chaque option s’ouvre dans une page dédiée.</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a href={`/companies/${companyId}/ttn/signature/digigo`} className="rounded-2xl border p-5 hover:bg-slate-50 transition">
          <div className="text-lg font-semibold">DigiGO (OTP)</div>
          <div className="text-sm opacity-70 mt-2">Signature par code OTP envoyé par SMS ou email.</div>
          <div className="mt-4 text-sm font-medium">Configurer →</div>
        </a>

        <a href={`/companies/${companyId}/ttn/signature/usb`} className="rounded-2xl border p-5 hover:bg-slate-50 transition">
          <div className="text-lg font-semibold">Clé USB (Agent local)</div>
          <div className="text-sm opacity-70 mt-2">Signature via certificat sur clé USB avec agent Windows.</div>
          <div className="mt-4 text-sm font-medium">Configurer →</div>
        </a>

        {lockedOther ? (
          <div className="rounded-2xl border p-5 bg-slate-50">
            <div className="text-lg font-semibold">Autre signature</div>
            <div className="text-sm opacity-70 mt-2">Cette méthode sera disponible ultérieurement.</div>
            <div className="mt-4 text-xs px-2 py-1 inline-block rounded-full border bg-white">🔒 Verrouillé</div>
          </div>
        ) : (
          <a href={`/companies/${companyId}/ttn/signature/autre`} className="rounded-2xl border p-5 hover:bg-slate-50 transition">
            <div className="text-lg font-semibold">Autre signature</div>
            <div className="text-sm opacity-70 mt-2">Configurer une autre méthode.</div>
            <div className="mt-4 text-sm font-medium">Configurer →</div>
          </a>
        )}
      </div>

      <div className="flex gap-3">
        <a className="ftn-btn-ghost" href={`/companies/${companyId}/ttn`}>
          ← Retour Paramètres TTN
        </a>
      </div>
    </div>
  );
}
