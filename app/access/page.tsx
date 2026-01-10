import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Badge } from "@/components/ui";
import AccessInviteClient from "./AccessInviteClient";

export default async function AccessPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type,email,full_name")
    .eq("id", auth.user.id)
    .single();

  const accountType = (profile?.account_type as any) || undefined;

  const { data: memberships } = await supabase
    .from("memberships")
    .select("company_id, role, companies(id, company_name)")
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  const companies =
    (memberships ?? [])
      .map((m: any) => ({
        id: m.companies?.id ?? m.company_id,
        name: m.companies?.company_name ?? "Société",
        role: m.role,
      }))
      .filter((c: any) => c.id);

  return (
    <AppShell title="Accès & permissions" subtitle="Inviter des comptables et définir qui peut faire quoi" accountType={accountType}>
      <div className="ftn-grid">
        <Card title="Inviter un comptable" subtitle="Invitation sécurisée + historique">
          <AccessInviteClient companies={companies} />
          <div className="mt-3">
            <Link className="ftn-link" href="/invitations?tab=sent">
              Voir invitations envoyées
            </Link>
          </div>
        </Card>

        <Card title="Audit & sécurité" subtitle="Bonnes pratiques TTN">
          <div className="flex flex-wrap gap-2">
            <Badge>Facture envoyée TTN = verrouillée</Badge>
            <Badge>Traçabilité: créé par / envoyé par</Badge>
            <Badge>Déclaration mensuelle: validation</Badge>
          </div>
          <div className="ftn-muted mt-4">
            Tu peux activer l'historique TTN en ajoutant une table <b>ttn_events</b>. Les erreurs TTN seront visibles côté client et comptable.
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
