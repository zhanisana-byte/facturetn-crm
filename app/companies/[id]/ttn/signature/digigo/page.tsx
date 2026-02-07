import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import DigiGoSignatureClient from "./ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = { params?: Promise<{ id: string }> };

export default async function DigiGoSignaturePage({ params }: Props) {
  const p = (await params) ?? ({ id: "" } as any);
  const companyId = String((p as any).id ?? "");
  if (!companyId) redirect("/companies");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ok = await canCompanyAction(supabase, auth.user.id, companyId, "submit_ttn");
  if (!ok) redirect(`/companies/${companyId}`);

  const env = "production" as const;

  const { data: company } = await supabase
    .from("companies")
    .select("id,company_name,tax_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id) redirect(`/companies/${companyId}/ttn`);

  const admin = createAdminClient();
  const { data: cred } = await admin
    .from("ttn_credentials")
    .select("*")
    .eq("company_id", companyId)
    .eq("environment", env)
    .maybeSingle();

  const safeCred = cred
    ? { ...cred, ws_password: undefined, ws_password_present: !!cred.ws_password }
    : null;

  return (
    <div className="p-6">
      <DigiGoSignatureClient company={company} initial={safeCred} />
    </div>
  );
}
