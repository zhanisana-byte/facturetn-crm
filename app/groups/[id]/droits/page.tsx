import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GroupRightsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: groupId } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id, group_name, owner_user_id")
    .eq("id", groupId)
    .maybeSingle();

  if (!group?.id) redirect("/groups/select");

  const isOwner = group.owner_user_id === auth.user.id;
  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", groupId)
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (gm?.role !== "admin") redirect("/groups/select");
  }

  const { data: links } = await supabase
    .from("group_companies")
    .select("company_id, companies(id, company_name, tax_id)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  const rows = (links ?? []).map((l: any) => {
    const c = l?.companies ?? null;
    return {
      id: String(c?.id ?? l?.company_id ?? ""),
      name: String(c?.company_name ?? "Société"),
      taxId: String(c?.tax_id ?? "—"),
      type: "managed" as const,
    };
  });

  return (
    <div className="p-6 space-y-4">
      <div className="ftn-card-lux p-4">
        <div className="text-xl font-semibold">{group.group_name}</div>
        <div className="text-sm opacity-80">Accès et rattachements</div>
      </div>

      <div className="ftn-card p-4">
        <div className="font-semibold">Sociétés gérées</div>
        <div className="text-xs opacity-70">Liste des sociétés accessibles par ce groupe</div>

        {rows.length === 0 ? (
          <div className="ftn-muted mt-3">Aucune société liée pour le moment.</div>
        ) : (
          <div className="mt-3 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs opacity-70 border-b">
                <tr>
                  <th className="py-2 pr-3">Société</th>
                  <th className="py-2 pr-3">MF</th>
                  <th className="py-2 pr-3">Type</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b" style={{ borderColor: "rgba(148,163,184,.16)" }}>
                    <td className="py-2 pr-3">{r.name}</td>
                    <td className="py-2 pr-3">{r.taxId}</td>
                    <td className="py-2 pr-3">Gérée</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
