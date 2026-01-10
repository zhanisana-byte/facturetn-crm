import { revalidatePath } from "next/cache";
import PdgShell from "@/app/components/PdgShell";
import { requirePDG } from "@/lib/pdg";
import { createServiceClient } from "@/lib/supabase/service";
import { Card, Table, Btn, Select, Input } from "@/components/ui";

type GroupRow = {
  id: string;
  group_name: string;
  owner_user_id: string;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_ends_at: string | null;
  trial_ends_at: string | null;
  companies_limit: number | null;
  billing_name: string | null;
  billing_tax_id: string | null;
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("fr-FR");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function PdgGroupsPage({ searchParams }: { searchParams?: { q?: string } }) {
  await requirePDG();
  const admin = createServiceClient();
  const q = String(searchParams?.q || "").trim().toLowerCase();

  // Load groups + owner email (separate query, keep it simple)
  let gq = admin
    .from("groups")
    .select("id,group_name,owner_user_id,subscription_plan,subscription_status,subscription_ends_at,trial_ends_at,companies_limit,billing_name,billing_tax_id,created_at")
    .order("created_at", { ascending: false })
    .limit(250);

  if (q) gq = gq.ilike("group_name", `%${q}%`);

  const { data: groups, error } = await gq;

  // owner emails map
  const ownerIds = Array.from(new Set((groups || []).map((g: any) => g.owner_user_id).filter(Boolean)));
  const { data: owners } = ownerIds.length
    ? await admin.from("app_users").select("id,email,full_name").in("id", ownerIds)
    : { data: [] as any[] };

  const ownerMap = new Map<string, { email?: string; full_name?: string }>();
  (owners || []).forEach((o: any) => ownerMap.set(o.id, { email: o.email, full_name: o.full_name }));

  async function updateGroup(formData: FormData) {
    "use server";
    await requirePDG();
    const admin = createServiceClient();

    const groupId = String(formData.get("group_id") || "");
    const plan = String(formData.get("plan") || "group");
    const status = String(formData.get("status") || "trial");
    const endDate = String(formData.get("ends_at") || "").trim();
    const limitRaw = String(formData.get("companies_limit") || "").trim();

    const billing_name = String(formData.get("billing_name") || "").trim();
    const billing_tax_id = String(formData.get("billing_tax_id") || "").trim();

    const patch: any = {
      subscription_plan: plan,
      subscription_status: status,
      billing_name: billing_name || null,
      billing_tax_id: billing_tax_id || null,
    };

    patch.subscription_ends_at = endDate ? new Date(endDate + "T00:00:00.000Z").toISOString() : null;

    // companies_limit: empty => NULL (illimité)
    if (!limitRaw) patch.companies_limit = null;
    else patch.companies_limit = Math.max(1, parseInt(limitRaw, 10) || 1);

    await admin.from("groups").update(patch).eq("id", groupId);
    revalidatePath("/pdg/groups");
  }

  async function extend30(formData: FormData) {
    "use server";
    await requirePDG();
    const admin = createServiceClient();

    const groupId = String(formData.get("group_id") || "");
    if (!groupId) return;

    const { data } = await admin.from("groups").select("subscription_ends_at").eq("id", groupId).single();

    const base = data?.subscription_ends_at ? new Date(data.subscription_ends_at) : new Date();
    const next = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

    await admin
      .from("groups")
      .update({ subscription_ends_at: next.toISOString(), subscription_status: "active" })
      .eq("id", groupId);

    revalidatePath("/pdg/groups");
  }

  return (
    <PdgShell
      title="Abonnements (Groupes)"
      subtitle="V24: le Groupe paie (illimité si companies_limit vide). Facture SaaS au nom du groupe."
    >
      <Card title="Recherche">
        <form className="flex gap-2 flex-wrap" action="/pdg/groups" method="get">
          <Input name="q" placeholder="Nom du groupe" defaultValue={q} style={{ minWidth: 260 }} />
          <Btn type="submit">Rechercher</Btn>
          <a className="ftn-btn-ghost" href="/pdg/groups">
            Reset
          </a>
        </form>
        {error ? <div className="ftn-alert mt-3">{error.message}</div> : null}
      </Card>

      <Card title="Groupes" subtitle="Derniers 250">
        <Table
          head={
            <tr>
              <th>Groupe</th>
              <th>Owner</th>
              <th>Plan</th>
              <th>Statut</th>
              <th>Fin</th>
              <th>Limite sociétés</th>
              <th>Facturation (nom / MF)</th>
              <th>Actions</th>
            </tr>
          }
        >
          {(groups as GroupRow[] | null)?.map((g) => {
            const owner = ownerMap.get(g.owner_user_id);
            return (
              <tr key={g.id}>
                <td className="font-semibold">{g.group_name}</td>
                <td>
                  <div className="ftn-muted">{owner?.full_name || "—"}</div>
                  <div className="ftn-small">{owner?.email || g.owner_user_id}</div>
                </td>

                <td className="capitalize">{g.subscription_plan || "group"}</td>
                <td className="capitalize">{g.subscription_status || "trial"}</td>
                <td>{fmtDate(g.subscription_ends_at)}</td>
                <td>{g.companies_limit == null ? "Illimité" : g.companies_limit}</td>
                <td>
                  <div className="ftn-small">{g.billing_name || "—"}</div>
                  <div className="ftn-small">{g.billing_tax_id || "—"}</div>
                </td>

                <td>
                  <div className="flex gap-2 flex-wrap">
                    <form action={updateGroup} className="flex gap-2 flex-wrap items-center">
                      <input type="hidden" name="group_id" value={g.id} />

                      <Select name="plan" defaultValue={g.subscription_plan || "group"}>
                        <option value="group">group</option>
                        <option value="group_plus">group_plus</option>
                        <option value="enterprise">enterprise</option>
                      </Select>

                      <Select name="status" defaultValue={g.subscription_status || "trial"}>
                        <option value="trial">trial</option>
                        <option value="active">active</option>
                        <option value="expired">expired</option>
                        <option value="suspended">suspended</option>
                      </Select>

                      <Input
                        name="ends_at"
                        type="date"
                        defaultValue={g.subscription_ends_at ? g.subscription_ends_at.slice(0, 10) : ""}
                        title="subscription_ends_at"
                      />

                      <Input
                        name="companies_limit"
                        placeholder="(vide=∞)"
                        defaultValue={g.companies_limit == null ? "" : String(g.companies_limit)}
                        style={{ width: 110 }}
                        title="companies_limit"
                      />

                      <Input
                        name="billing_name"
                        placeholder="Nom facturation"
                        defaultValue={g.billing_name || ""}
                        style={{ minWidth: 170 }}
                      />

                      <Input
                        name="billing_tax_id"
                        placeholder="MF facturation"
                        defaultValue={g.billing_tax_id || ""}
                        style={{ width: 140 }}
                      />

                      <Btn type="submit">Maj</Btn>
                    </form>

                    <form action={extend30}>
                      <input type="hidden" name="group_id" value={g.id} />
                      <Btn type="submit" className="tone-ok">
                        +30j
                      </Btn>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </PdgShell>
  );
}
