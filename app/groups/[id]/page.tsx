import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ id: string }> };

export default async function GroupDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id,group_name,owner_user_id")
    .eq("id", id)
    .single();

  if (!group) redirect("/switch");

  const isOwner = group.owner_user_id === user.id;

  let myRole: string | null = isOwner ? "owner" : null;
  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    myRole = gm?.role ?? null;
  }

  if (!isOwner && myRole !== "admin") redirect("/switch");

  const { data: links } = await supabase
    .from("group_companies")
    .select("company_id, link_type, companies(id,company_name,tax_id)")
    .eq("group_id", id)
    .order("created_at", { ascending: false });

  const companies =
    (links ?? []).map((l: any) => ({
      id: l.companies?.id ?? l.company_id,
      name: l.companies?.company_name ?? "Société",
      taxId: l.companies?.tax_id ?? "—",
      linkType: l.link_type ?? "internal",
    })) ?? [];

  return (
    <AppShell
      title={group.group_name}
      subtitle="Espace Groupe"
      accountType="multi_societe"
      activeGroupId={id}
    >
      <div className="ftn-card p-4">
        <div className="text-sm">
          Rôle: <b>{myRole}</b>
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          <Link className="ftn-btn" href={`/groups/${id}/clients`}>Mes sociétés</Link>
          <Link className="ftn-btn" href="/companies/create">+ Créer société</Link>
          <Link className="ftn-btn" href="/switch">Switch</Link>
        </div>

        <div className="mt-6">
          <div className="font-semibold">Sociétés rattachées ({companies.length})</div>
          <div className="mt-2 grid gap-2">
            {companies.map((c) => (
              <Link
                key={c.id}
                className="rounded-xl border p-3 hover:bg-slate-50"
                href={`/companies/${c.id}`}
              >
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-slate-600">
                  MF: {c.taxId} · type: {c.linkType}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
