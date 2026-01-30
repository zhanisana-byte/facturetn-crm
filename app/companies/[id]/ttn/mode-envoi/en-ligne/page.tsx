import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import TtnApiEnLigneClient from "./ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = { params?: Promise<{ id: string }> };

export default async function TtnApiEnLignePage({ params }: Props) {
  const p = (await params) ?? ({ id: "" } as any);
  const companyId = String((p as any).id ?? "");
  if (!companyId) redirect("/companies");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // ✅ Sécurité: l'utilisateur doit avoir le droit de configurer TTN
  const ok = await canCompanyAction(supabase, auth.user.id, companyId, "submit_ttn");
  if (!ok) redirect(`/companies/${companyId}`);

  // ✅ Environnement TTN (adapter si vous avez un switch test/production)
  const env: "test" | "production" = "production";

  const { data: company } = await supabase
    .from("companies")
    .select("id,company_name,tax_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id) redirect(`/companies/${companyId}/ttn`);

  // ✅ Lire les credentials avec le service role (bypass RLS),
  // mais on NE renvoie jamais le mot de passe au navigateur.
  const admin = createAdminClient();
  const { data: cred } = await admin
    .from("ttn_credentials")
    .select("*")
    .eq("company_id", companyId)
    .eq("environment", env)
    .maybeSingle();

  const safeInitial = cred
    ? {
        ...cred,
        ws_password: undefined,
        ws_password_present: !!cred.ws_password,
      }
    : null;

  return (
    <div className="p-6">
      <TtnApiEnLigneClient company={company} initial={safeInitial} environment={env} />
    </div>
  );
}
