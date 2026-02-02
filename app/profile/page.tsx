import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/server";
import ProfileClient from "./ProfileClient";
import { ensureWorkspaceRow } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { supabase, user } = await getAuthUser();

  const ws = await ensureWorkspaceRow(supabase, user.id);
  const activeMode = ws?.active_mode ?? "profil";

  if (activeMode !== "profil") {
    await supabase
      .from("user_workspace")
      .upsert(
        {
          user_id: user.id,
          active_mode: "profil",
          active_company_id: null,
          active_group_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    redirect("/profile/dashboard"); 
  }

  const { data: me, error: meErr } = await supabase
    .from("app_users")
    .select("id,email,full_name,account_type")
    .eq("id", user.id)
    .single();

  if (meErr || !me) {
    return <div className="ftn-err">Impossible de charger le profil. Veuillez réessayer.</div>;
  }

  return <ProfileClient initialUser={me} activeMode={"profil"} />;
}
