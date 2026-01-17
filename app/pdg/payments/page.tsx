import { revalidatePath } from "next/cache";
import AppShell from "@/app/components/AppShell";
import { requirePdg } from "../_lib/pdg";

export const dynamic = "force-dynamic";

function money(v: any) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

export default async function PdgPaymentsPage() {
  const { service } = await requirePdg();

  const { data: payData } = await service
    .from("platform_payments")
    .select("id,created_at,paid_at,amount_ht,method,status,reference,note,payer_user_id,subscription_id")
    .order("paid_at", { ascending: false })
    .limit(200);

  const payments = payData ?? [];

  const payerIds = Array.from(new Set(payments.map((p) => p.payer_user_id)));
  const { data: payersData } = await service
    .from("app_users")
    .select("id,email,full_name")
    .in("id", payerIds.length ? payerIds : ["00000000-0000-0000-0000-000000000000"]);
  const payers = payersData ?? [];
  const payerMap = new Map(payers.map((u) => [u.id, u]));

  async function createPayment(formData: FormData) {
    "use server";
    const payer_user_id = String(formData.get("payer_user_id") || "").trim();
    const subscription_id_raw = String(formData.get("subscription_id") || "").trim();
    const amount_ht = Number(formData.get("amount_ht") || 0);
    const method = String(formData.get("method") || "cash");
    const status = String(formData.get("status") || "paid");
    const reference = String(formData.get("reference") || "").trim();
    const paid_at = String(formData.get("paid_at") || "").trim();
    const note = String(formData.get("note") || "").trim();

    const { service } = await requirePdg();
    await service.from("platform_payments").insert({
      payer_user_id,
      subscription_id: subscription_id_raw || null,
      amount_ht: Number.isFinite(amount_ht) ? amount_ht : 0,
      method,
      status,
      reference: reference || null,
      paid_at: paid_at ? new Date(paid_at).toISOString() : new Date().toISOString(),
      note: note || null,
    });

    revalidatePath("/pdg/payments");
  }

  return (
    <AppShell title="PDG — Paiements" subtitle="Cash / virement / versement / free" accountType="profil" isPdg>
      <div className="ftn-card-lux">
        <div className="ftn-card-head">
          <div>
            <div className="ftn-card-title">Enregistrer un paiement</div>
            <div className="ftn-card-sub">Le CA CRM se calcule sur les paiements encaissés</div>
          </div>
        </div>
        <div className="ftn-card-body">
          <form action={createPayment} className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <input name="payer_user_id" className="ftn-input" placeholder="payer_user_id (uuid)" required />
            <input name="subscription_id" className="ftn-input" placeholder="subscription_id (uuid) optionnel" />
            <input name="amount_ht" className="ftn-input" placeholder="Montant HT" required />
            <select name="method" className="ftn-input" defaultValue="cash">
              <option value="cash">cash</option>
              <option value="virement">virement</option>
              <option value="versement">versement</option>
              <option value="free">free</option>
            </select>
            <select name="status" className="ftn-input" defaultValue="paid">
              <option value="paid">paid</option>
              <option value="pending">pending</option>
              <option value="canceled">canceled</option>
            </select>
            <input name="reference" className="ftn-input" placeholder="Référence (virement...)" />
            <input name="paid_at" className="ftn-input" placeholder="Date (YYYY-MM-DD)" />
            <input name="note" className="ftn-input" placeholder="Note" />
            <div>
              <button className="ftn-btn ftn-btn-ghost" type="submit">Ajouter</button>
            </div>
          </form>
        </div>
      </div>

      <div className="ftn-card-lux mt-4">
        <div className="ftn-card-head">
          <div>
            <div className="ftn-card-title">Historique paiements</div>
            <div className="ftn-card-sub">200 derniers</div>
          </div>
        </div>
        <div className="ftn-card-body">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="py-2">Date</th>
                  <th className="py-2">Client</th>
                  <th className="py-2">Montant</th>
                  <th className="py-2">Méthode</th>
                  <th className="py-2">Statut</th>
                  <th className="py-2">Référence</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const u = payerMap.get(p.payer_user_id);
                  return (
                    <tr key={p.id} className="border-t border-white/10">
                      <td className="py-2 whitespace-nowrap">
                        {new Date(p.paid_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="py-2">
                        <div className="font-semibold">{u?.full_name || "—"}</div>
                        <div className="text-xs opacity-70">{u?.email || p.payer_user_id}</div>
                      </td>
                      <td className="py-2 whitespace-nowrap">{money(p.amount_ht)} DT</td>
                      <td className="py-2"><span className="ftn-pill ftn-pill-neutral">{p.method}</span></td>
                      <td className="py-2"><span className="ftn-pill ftn-pill-info">{p.status}</span></td>
                      <td className="py-2">{p.reference || "—"}</td>
                    </tr>
                  );
                })}
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 opacity-70">Aucun paiement.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
