import { revalidatePath } from "next/cache";
import AppShell from "@/app/components/AppShell";
import { requirePdg } from "../_lib/pdg";

export const dynamic = "force-dynamic";

function money(v: any) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

export default async function PdgSubscriptionsPage() {
  const { service } = await requirePdg();

  const { data: subsData } = await service
    .from("platform_subscriptions")
    .select(
      "id,created_at,owner_user_id,scope_type,scope_id,status,price_ht,quantity,starts_at,ends_at,next_billing_at,note"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const subs = subsData ?? [];

  const ownerIds = Array.from(new Set(subs.map((s) => s.owner_user_id)));
  const { data: ownersData } = await service
    .from("app_users")
    .select("id,email,full_name")
    .in("id", ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);
  const owners = ownersData ?? [];
  const ownerMap = new Map(owners.map((o) => [o.id, o]));

  async function createSubscription(formData: FormData) {
    "use server";
    const owner_user_id = String(formData.get("owner_user_id") || "").trim();
    const scope_type = String(formData.get("scope_type") || "company");
    const scope_id_raw = String(formData.get("scope_id") || "").trim();
    const status = String(formData.get("status") || "trial");
    const price_ht = Number(formData.get("price_ht") || 0);
    const quantity = Number(formData.get("quantity") || 1);
    const note = String(formData.get("note") || "").trim();

    const { service } = await requirePdg();
    await service.from("platform_subscriptions").insert({
      owner_user_id,
      scope_type,
      scope_id: scope_id_raw || null,
      status,
      price_ht,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      note: note || null,
    });

    revalidatePath("/pdg/subscriptions");
  }

  async function updateSubscription(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    const status = String(formData.get("status") || "trial");
    const price_ht = Number(formData.get("price_ht") || 0);
    const quantity = Number(formData.get("quantity") || 1);
    const next_billing_at = String(formData.get("next_billing_at") || "").trim();
    const note = String(formData.get("note") || "").trim();

    const { service } = await requirePdg();
    await service
      .from("platform_subscriptions")
      .update({
        status,
        price_ht,
        quantity: Number.isFinite(quantity) ? quantity : 1,
        next_billing_at: next_billing_at ? new Date(next_billing_at).toISOString() : null,
        note: note || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    revalidatePath("/pdg/subscriptions");
  }

  return (
    <AppShell title="PDG — Abonnements" subtitle="Plans & statut" accountType="profil" isPdg>
      <div className="ftn-card-lux">
        <div className="ftn-card-head">
          <div>
            <div className="ftn-card-title">Créer un abonnement</div>
            <div className="ftn-card-sub">Société: 50 | Groupe: 50×gérées + 0×gérées | Cabinet: 0</div>
          </div>
        </div>
        <div className="ftn-card-body">
          <form action={createSubscription} className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <input name="owner_user_id" className="ftn-input" placeholder="owner_user_id (uuid)" required />
            <select name="scope_type" className="ftn-input" defaultValue="company">
              <option value="company">company (50)</option>
              <option value="group">group (50/gérée)</option>
              <option value="managed_company">managed_company (50)</option>
              <option value="cabinet_workspace">cabinet_workspace (0)</option>
            </select>
            <input name="scope_id" className="ftn-input" placeholder="scope_id (uuid) optionnel" />
            <select name="status" className="ftn-input" defaultValue="trial">
              <option value="trial">trial</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="overdue">overdue</option>
              <option value="free">free</option>
              <option value="canceled">canceled</option>
            </select>
            <input name="price_ht" className="ftn-input" placeholder="price_ht" defaultValue="0" />
            <input name="quantity" className="ftn-input" placeholder="quantity" defaultValue="1" />
            <input name="note" className="ftn-input" placeholder="Note" />
            <div>
              <button className="ftn-btn ftn-btn-ghost" type="submit">Créer</button>
            </div>
          </form>
        </div>
      </div>

      <div className="ftn-card-lux mt-4">
        <div className="ftn-card-head">
          <div>
            <div className="ftn-card-title">Liste abonnements</div>
            <div className="ftn-card-sub">200 derniers</div>
          </div>
        </div>
        <div className="ftn-card-body">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="py-2">Client</th>
                  <th className="py-2">Scope</th>
                  <th className="py-2">Prix</th>
                  <th className="py-2">Statut</th>
                  <th className="py-2">Renouvellement</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => {
                  const owner = ownerMap.get(s.owner_user_id);
                  return (
                    <tr key={s.id} className="border-t border-white/10">
                      <td className="py-2">
                        <div className="font-semibold">{owner?.full_name || "—"}</div>
                        <div className="text-xs opacity-70">{owner?.email || s.owner_user_id}</div>
                      </td>
                      <td className="py-2">
                        <div className="ftn-pill ftn-pill-neutral">{s.scope_type}</div>
                        {s.scope_id ? <div className="text-xs opacity-70 mt-1">{s.scope_id}</div> : null}
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        {money(s.price_ht)} × {s.quantity} = <strong>{money(Number(s.price_ht) * Number(s.quantity))}</strong>
                      </td>
                      <td className="py-2">
                        <span className="ftn-pill ftn-pill-info">{s.status}</span>
                      </td>
                      <td className="py-2">
                        {s.next_billing_at ? new Date(s.next_billing_at).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="py-2">
                        <form action={updateSubscription} className="flex flex-wrap gap-2 items-center">
                          <input type="hidden" name="id" value={s.id} />
                          <select name="status" className="ftn-input" defaultValue={s.status}>
                            <option value="trial">trial</option>
                            <option value="active">active</option>
                            <option value="paused">paused</option>
                            <option value="overdue">overdue</option>
                            <option value="free">free</option>
                            <option value="canceled">canceled</option>
                          </select>
                          <input name="price_ht" className="ftn-input" style={{ width: 110 }} defaultValue={String(s.price_ht ?? 0)} />
                          <input name="quantity" className="ftn-input" style={{ width: 90 }} defaultValue={String(s.quantity ?? 1)} />
                          <input name="next_billing_at" className="ftn-input" style={{ width: 140 }} placeholder="YYYY-MM-DD" defaultValue={s.next_billing_at ? new Date(s.next_billing_at).toISOString().slice(0, 10) : ""} />
                          <input name="note" className="ftn-input" style={{ width: 200 }} placeholder="Note" defaultValue={s.note ?? ""} />
                          <button className="ftn-btn ftn-btn-ghost" type="submit">Sauver</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {subs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 opacity-70">Aucun abonnement.</td>
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
