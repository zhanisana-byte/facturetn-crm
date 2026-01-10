import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompanyPage({ params }: PageProps) {
  const { id } = await params;

  // Anti-bug /companies/create
  if (id === "create") redirect("/companies/create");

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !company) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Société</h1>
        <p className="text-red-600">{error?.message}</p>
      </div>
    );
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("company_id", id)
    .eq("user_id", auth.user.id)
    .single();

  const isOwner = membership?.role === "owner";

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">{company.company_name}</h1>
          <p className="text-sm text-slate-600">
            MF : <b>{company.tax_id}</b>
          </p>
        </div>

        <div className="flex gap-2">
          {/* ✅ FACTURES – route correcte */}
          <Link
            href={`/invoices?company=${company.id}`}
            className="px-4 py-2 rounded-xl border bg-white hover:bg-slate-50 text-sm"
          >
            Factures
          </Link>

          {isOwner ? (
            <>
              <Link
                href={`/companies/${company.id}/ttn`}
                className="px-4 py-2 rounded-xl border bg-white hover:bg-slate-50 text-sm"
              >
                Paramètres TTN
              </Link>
              <Link
                href={`/companies/${company.id}/access`}
                className="px-4 py-2 rounded-xl bg-black text-white text-sm"
              >
                Accès & équipe
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-white text-sm text-slate-600">
        Gestion de la société, factures, équipe et comptables externes.
      </div>
    </div>
  );
}
