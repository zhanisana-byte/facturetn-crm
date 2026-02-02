import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  params?: Promise<{ id: string }>;
};

export default async function CompanyPage({ params }: PageProps) {
  const p = (await params) ?? ({ id: "" } as any);
  const companyId = String((p as any).id ?? "");
  if (!companyId) redirect("/companies");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("id,company_name,tax_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id) redirect("/companies");

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-2xl font-semibold">{company.company_name}</div>
        <div className="text-sm text-slate-600 mt-1">
          Matricule fiscal : {company.tax_id || "—"}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <a
          href={`/companies/${companyId}/ttn`}
          className="rounded-2xl border p-5 hover:bg-slate-50 transition"
        >
          <div className="text-lg font-semibold">Paramètres TTN</div>
          <div className="text-sm opacity-70 mt-2">
            Configurer l’envoi et la signature électronique.
          </div>
          <div className="mt-4 text-sm font-medium">Ouvrir →</div>
        </a>
      </div>
    </div>
  );
}
