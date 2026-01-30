import { redirect } from "next/navigation";

type SupabaseServerClient = any;

export async function resolveCabinetContext(supabase: SupabaseServerClient, userId: string) {
  // 1) workspace actuel
  const { data: uw } = await supabase
    .from("user_workspace")
    .select("active_mode, active_group_id")
    .eq("user_id", userId)
    .maybeSingle();

  let cabinetGroupId: string | null = null;

  // 2) si active_group_id correspond à un cabinet
  if (uw?.active_group_id) {
    const { data: g } = await supabase
      .from("groups")
      .select("id, group_type")
      .eq("id", uw.active_group_id)
      .maybeSingle();

    if (g?.id && g.group_type === "cabinet") cabinetGroupId = g.id;
  }

  // 3) sinon chercher un cabinet où je suis owner/admin
  if (!cabinetGroupId) {
    const { data: myCabinets } = await supabase
      .from("group_members")
      .select("group_id, role, groups:groups(id, group_type)")
      .eq("user_id", userId)
      .eq("is_active", true);

    const eligible =
      (myCabinets ?? [])
        .filter((x: any) => x?.groups?.group_type === "cabinet")
        .filter((x: any) => ["owner", "admin"].includes(String(x?.role ?? "").toLowerCase()))
        .map((x: any) => x.groups) ?? [];

    cabinetGroupId = eligible[0]?.id ?? null;
  }

  // 4) Forcer workspace cabinet (évite le bug “visible seulement dans Switch”)
  if (cabinetGroupId) {
    await supabase
      .from("user_workspace")
      .upsert(
        {
          user_id: userId,
          active_mode: "comptable",
          active_company_id: null,
          active_group_id: cabinetGroupId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
  }

  return { cabinetGroupId };
}

export function requireCabinet(ctx: { cabinetGroupId: string | null }) {
  if (!ctx.cabinetGroupId) redirect("/cabinet/create");
}
