import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import LinksCompanyClient from "./LinksCompanyClient";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type LinkRow = {
  groupId: string;
  groupName: string;
  linkType: "managed";
  linkedAt?: string | null;
};

export default async function CompanyLinksPage({ params }: PageProps) {
  const { id } = await params;
  if (!isUuid(id)) redirect("/switch");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const userId = auth.user.id;

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("id,company_name,owner_user_id")
    .eq("id", id)
    .maybeSingle();

  if (cErr || !company) {
    return <div className="ftn-alert">Société introuvable{cErr?.message ? `: ${cErr.message}` : ""}</div>;
  }

  const isOwner = company.owner_user_id === userId;
  let isAdmin = false;
  if (!isOwner) {
    const { data: m, error: mErr } = await supabase
      .from("memberships")
      .select("role,is_active")
      .eq("company_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!mErr && m?.is_active && (m.role === "admin" || m.role === "owner")) {
      isAdmin = true;
    }
  }

  if (!isOwner && !isAdmin) {
    return <div className="ftn-alert">Accès refusé.</div>;
  }

  const { data: links, error: lErr } = await supabase
    .from("group_companies")
    .select("group_id, link_type, created_at, groups(id,group_name)")
    .eq("company_id", id)
    .order("created_at", { ascending: false });

  const rows: LinkRow[] = (links ?? []).map((l: any) => ({
    groupId: String(l?.group_id ?? ""),
    groupName: String(l?.groups?.group_name ?? "Groupe"),
    linkType: "managed",
    linkedAt: (l?.created_at ?? null) as any,
  }));

  return (
    <Card
      title="Cabinet / Groupe liés"
      subtitle="Liste des groupes reliés à cette société. Vous pouvez retirer un lien si nécessaire."
    >
      {lErr ? <div className="ftn-alert">Erreur chargement liens: {lErr.message}</div> : null}

      <LinksCompanyClient companyId={id} rows={rows} />

      <div className="ftn-help mt-4">
        Astuce : si vous retirez un lien, les permissions groupesociété ne s'appliquent plus.
      </div>
    </Card>
  );
}
