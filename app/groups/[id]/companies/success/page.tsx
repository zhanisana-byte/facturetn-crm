import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GroupInternalCompanySuccessPage({
  params,
  searchParams,
}: {
  params?: Promise<{ id: string }>;
  searchParams?: Promise<{ company?: string }>;
}) {
  const p = (await params) ?? ({} as any);
  const sp = (await searchParams) ?? {};
  const groupId = String((p as any).id ?? "");
  const companyId = String(sp.company ?? "");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  if (!groupId || !companyId) redirect("/groups");

  return (
    <AppShell title="Création réussie ✅" subtitle="Espace Groupe" accountType="multi_societe" activeGroupId={groupId}>
      <div className="mx-auto w-full max-w-2xl p-6">
        <div className="ftn-card-lux p-6 space-y-4">
          <div className="text-xl font-semibold">Création réussie ✅</div>
          <div className="text-sm opacity-80">La société interne a été créée et liée au groupe.</div>

          <div className="flex flex-wrap gap-2">
            <Link className="ftn-btn-primary" href={`/groups/${groupId}`} prefetch={false}>
              Retour au groupe
            </Link>
            <Link className="ftn-btn-secondary" href={`/companies/${companyId}`} prefetch={false}>
              Aller vers la société
            </Link>
            <Link className="ftn-btn-secondary" href={`/companies/${companyId}/ttn`} prefetch={false}>
              Configurer TTN
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
