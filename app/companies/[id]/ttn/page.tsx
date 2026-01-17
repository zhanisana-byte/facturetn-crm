import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import TTNSettingsClient from "./TTNSettingsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanyTTNPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Load company + existing TTN credentials (if any)
  const { data: companyData } = await supabase
    .from("companies")
    .select("id,company_name,tax_id")
    .eq("id", id)
    .maybeSingle();

  const { data: credData } = await supabase
    .from("ttn_credentials")
    .select(
      "company_id,ttn_key_name,ttn_public_key,ttn_secret,ttn_mode,connection_type,environment,public_ip,cert_serial_number,cert_email,provider_name,token_pack_ref,signer_full_name,signer_email,ws_url,ws_login,ws_password,ws_matricule,dss_url,dss_token,dss_profile,require_signature"
    )
    .eq("company_id", id)
    .maybeSingle();

  const { data: logsData } = await supabase
    .from("ttn_test_logs")
    .select("id,test_type,environment,success,status_code,message,created_at")
    .eq("company_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const logs = logsData ?? [];

  return (
    <AppShell
      title="Paramètres TTN"
      subtitle="Configurer El Fatoora (TEIF + signature + connexion) pour cette société"
      // TTN société = toujours en contexte "entreprise" (sidebar stable)
      accountType="entreprise"
      activeCompanyId={id}
    >
      <TTNSettingsClient company={companyData ?? null} initial={credData} initialLogs={logs} />
    </AppShell>
  );
}
