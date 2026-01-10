import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";

type PageProps = { params: Promise<{ id: string }> };
export default async function Page({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type")
    .eq("id", auth.user.id)
    .single();

  return (
    <AppShell title="Archives" subtitle="Audit & nettoyage 60 jours" accountType={profile?.account_type}>
      <Card title="Archives" subtitle="Audit & nettoyage 60 jours">
        <div className="ftn-muted">Sociétés retirées / invitations expirées / purge après 60 jours (option).</div>
        <div className="mt-4">
          <Link className="ftn-link" href={`/groups/${id}`}>← Retour au groupe</Link>
        </div>
      </Card>
    </AppShell>
  );
}
