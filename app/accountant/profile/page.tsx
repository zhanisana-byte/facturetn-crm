import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";

export default async function CabinetProfilePage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: cabinet } = await supabase
    .from("app_users")
    .select("full_name, email, phone")
    .eq("id", auth.user.id)
    .single();

  return (
<div className="max-w-xl space-y-4">
        <Field label="Nom du cabinet" value={cabinet?.full_name} />
        <Field label="Email" value={cabinet?.email} />
        <Field label="Téléphone" value={cabinet?.phone ?? "-"} />
      </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-xl border p-4 bg-white">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
