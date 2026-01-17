import { revalidatePath } from "next/cache";
import AppShell from "@/app/components/AppShell";
import { requirePdg } from "../_lib/pdg";

export const dynamic = "force-dynamic";

function cn(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

export default async function PdgUsersPage() {
  const { service } = await requirePdg();

  const { data } = await service
    .from("app_users")
    .select(
      "id,created_at,email,full_name,account_type,is_suspended,suspended_reason,subscription_plan,subscription_status,subscription_ends_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];

  async function setSuspended(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const suspend = String(formData.get("suspend") || "") === "1";
    const reason = String(formData.get("reason") || "").trim();

    const { service } = await requirePdg();
    await service
      .from("app_users")
      .update({
        is_suspended: suspend,
        suspended_reason: suspend ? reason || null : null,
        suspended_at: suspend ? new Date().toISOString() : null,
      })
      .eq("id", userId);

    revalidatePath("/pdg/users");
  }

  async function setSubscription(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const plan = String(formData.get("plan") || "free");
    const status = String(formData.get("status") || "trial");
    const endsAt = String(formData.get("ends_at") || "").trim();

    const { service } = await requirePdg();
    await service
      .from("app_users")
      .update({
        subscription_plan: plan,
        subscription_status: status,
        subscription_ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      })
      .eq("id", userId);

    revalidatePath("/pdg/users");
  }

  return (
    <AppShell title="PDG — Inscrits" subtitle="Gérer les comptes" accountType="profil" isPdg>
      <div className="ftn-card-lux">
        <div className="ftn-card-head">
          <div>
            <div className="ftn-card-title">Liste des inscrits</div>
            <div className="ftn-card-sub">200 derniers utilisateurs</div>
          </div>
        </div>
        <div className="ftn-card-body">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="py-2">Date</th>
                  <th className="py-2">Nom</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Abonnement</th>
                  <th className="py-2">Statut</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t border-white/10">
                    <td className="py-2 whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="py-2">{u.full_name || "—"}</td>
                    <td className="py-2">{u.email || "—"}</td>
                    <td className="py-2">{u.account_type || "—"}</td>
                    <td className="py-2">
                      <div className="flex flex-col gap-1">
                        <span className="ftn-pill ftn-pill-neutral">
                          {u.subscription_plan || "free"} / {u.subscription_status || "trial"}
                        </span>
                        {u.subscription_ends_at ? (
                          <span className="text-xs opacity-70">
                            Fin: {new Date(u.subscription_ends_at).toLocaleDateString("fr-FR")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "ftn-pill",
                          u.is_suspended ? "ftn-pill-warning" : "ftn-pill-success"
                        )}
                      >
                        {u.is_suspended ? "Suspendu" : "Actif"}
                      </span>
                      {u.is_suspended && u.suspended_reason ? (
                        <div className="text-xs opacity-70 mt-1">{u.suspended_reason}</div>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-col gap-2 min-w-[260px]">
                        <form action={setSubscription} className="flex flex-wrap gap-2">
                          <input type="hidden" name="user_id" value={u.id} />
                          <select name="plan" defaultValue={u.subscription_plan || "free"} className="ftn-input" style={{ minWidth: 120 }}>
                            <option value="free">free</option>
                            <option value="societe_50">societe_50</option>
                            <option value="group_29">group_29</option>
                            <option value="external_50">external_50</option>
                            <option value="cabinet_free">cabinet_free</option>
                          </select>
                          <select name="status" defaultValue={u.subscription_status || "trial"} className="ftn-input" style={{ minWidth: 120 }}>
                            <option value="trial">trial</option>
                            <option value="active">active</option>
                            <option value="paused">paused</option>
                            <option value="overdue">overdue</option>
                            <option value="free">free</option>
                          </select>
                          <input
                            name="ends_at"
                            placeholder="Fin (YYYY-MM-DD)"
                            className="ftn-input"
                            defaultValue={u.subscription_ends_at ? new Date(u.subscription_ends_at).toISOString().slice(0, 10) : ""}
                            style={{ width: 140 }}
                          />
                          <button className="ftn-btn ftn-btn-ghost" type="submit">
                            Mettre à jour
                          </button>
                        </form>

                        <form action={setSuspended} className="flex flex-wrap gap-2">
                          <input type="hidden" name="user_id" value={u.id} />
                          <input
                            name="reason"
                            placeholder="Raison (optionnel)"
                            className="ftn-input"
                            style={{ minWidth: 180 }}
                          />
                          <button className="ftn-btn ftn-btn-ghost" name="suspend" value={u.is_suspended ? "0" : "1"} type="submit">
                            {u.is_suspended ? "Réactiver" : "Suspendre"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-4 opacity-70">
                      Aucun utilisateur.
                    </td>
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
