import { revalidatePath } from "next/cache";
import PdgShell from "@/app/components/PdgShell";
import { requirePDG } from "@/lib/pdg";
import { createServiceClient } from "@/lib/supabase/service";
import { Card, Table, Btn, BtnGhost } from "@/components/ui";

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  accountant_status: string | null;
  accountant_free_access: boolean | null;
  accountant_verified_at: string | null;
  created_at: string | null;
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("fr-FR");
}

export default async function PdgAccountantsPage() {
  await requirePDG();
  const admin = createServiceClient();

  const { data: pending, error } = await admin
    .from("app_users")
    .select(
      "id,email,full_name,created_at,accountant_status,accountant_free_access,accountant_verified_at"
    )
    // Compat: ancien label = "comptable", nouveau = "cabinet"
    .in("account_type", ["cabinet", "comptable"])
    .order("created_at", { ascending: false })
    .limit(300);

  async function approve(formData: FormData) {
    "use server";
    await requirePDG();
    const admin = createServiceClient();
    const userId = String(formData.get("user_id") || "");
    if (!userId) return;

    await admin
      .from("app_users")
      .update({
        accountant_status: "verified",
        accountant_free_access: true,
        accountant_verified_at: new Date().toISOString(),
        subscription_plan: "cabinet",
        subscription_status: "active",
        subscription_ends_at: null,
      })
      .eq("id", userId);

    revalidatePath("/pdg/accountants");
  }

  async function reject(formData: FormData) {
    "use server";
    await requirePDG();
    const admin = createServiceClient();
    const userId = String(formData.get("user_id") || "");
    if (!userId) return;

    await admin
      .from("app_users")
      .update({ accountant_status: "rejected", accountant_free_access: false })
      .eq("id", userId);

    revalidatePath("/pdg/accountants");
  }

  async function toggleFree(formData: FormData) {
    "use server";
    await requirePDG();
    const admin = createServiceClient();
    const userId = String(formData.get("user_id") || "");
    const on = String(formData.get("on") || "") === "1";
    if (!userId) return;

    await admin
      .from("app_users")
      .update({
        accountant_free_access: on,
        subscription_status: on ? "active" : "trial",
        subscription_ends_at: on ? null : null,
      })
      .eq("id", userId);

    revalidatePath("/pdg/accountants");
  }

  return (
    <PdgShell title="Comptables" subtitle="Validation patente + gratuit à vie">
      <Card title="Validation">
        <div className="ftn-muted">
          Règle : quand vous valides un comptable → <b>gratuit à vie</b> + statut <b>verified</b>.
        </div>
        {error ? <div className="ftn-alert mt-3">{error.message}</div> : null}
      </Card>

      <Card title="Liste comptables" subtitle="Derniers 300">
        <Table
          head={
            <tr>
              <th>Email</th>
              <th>Nom</th>
              <th>Statut</th>
              <th>Free à vie</th>
              <th>Vérifié le</th>
              <th>Inscription</th>
              <th>Actions</th>
            </tr>
          }
        >
          {(pending as Row[] | null)?.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.full_name || "—"}</td>
              <td className="capitalize">{u.accountant_status || "—"}</td>
              <td>{u.accountant_free_access ? "✅" : "—"}</td>
              <td>{fmtDate(u.accountant_verified_at)}</td>
              <td>{fmtDate(u.created_at)}</td>
              <td>
                <div className="flex gap-2 flex-wrap">
                  <form action={approve}>
                    <input type="hidden" name="user_id" value={u.id} />
                    <Btn type="submit" className="tone-ok">Valider</Btn>
                  </form>
                  <form action={reject}>
                    <input type="hidden" name="user_id" value={u.id} />
                    <Btn type="submit" className="tone-bad">Refuser</Btn>
                  </form>
                  <form action={toggleFree}>
                    <input type="hidden" name="user_id" value={u.id} />
                    <input type="hidden" name="on" value={u.accountant_free_access ? "0" : "1"} />
                    <BtnGhost type="submit">{u.accountant_free_access ? "Retirer Free" : "Free à vie"}</BtnGhost>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </PdgShell>
  );
}
