// app/accountant/invitations/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CabinetInvitationsClient from "./CabinetInvitationsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Search = {
  tab?: "societes" | "equipe";
};

function pickTab(v: unknown): "societes" | "equipe" {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "societes" ? "societes" : "equipe";
}

export default async function AccountantInvitationsPage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
}) {
  const sp = (await searchParams) ?? {};
  const tab = pickTab(sp.tab);

  // Si quelqu’un ouvre ?tab=societes, on redirige vers la page dédiée
  if (tab === "societes") redirect("/accountant/company-invitations");

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Cabinet actif (workspace)
  const { data: ws } = await supabase
    .from("user_workspace")
    .select("active_group_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const cabinetGroupId = ws?.active_group_id ?? null;
  if (!cabinetGroupId) redirect("/switch");

  // Vérifier que c’est bien un cabinet
  const { data: g } = await supabase
    .from("groups")
    .select("id, group_name, group_type")
    .eq("id", cabinetGroupId)
    .maybeSingle();

  if (!g?.id || String(g.group_type ?? "") !== "cabinet") redirect("/switch");

  const cabinetName = g.group_name ?? "Cabinet";

  return (
    <div className="p-6 space-y-4">
      <div className="ftn-card-lux p-5">
        <div className="text-xl font-semibold">Invitations équipe</div>
        <div className="text-sm opacity-80">Cabinet : {cabinetName}</div>
      </div>

      {/* ✅ La page équipe existe déjà : on l’affiche ici */}
      <CabinetInvitationsClient cabinetGroupId={cabinetGroupId} />
    </div>
  );
}
