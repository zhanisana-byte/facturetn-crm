import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { shellTypeFromUser } from "@/app/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Accès & permissions (CABINET)
 * V1: page dédiée pour gérer les droits des membres d'équipe.
 * (La gestion fine par société pourra être ajoutée ensuite.)
 */
export default async function AccountantPermissionsPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const meId = auth.user.id;

  const { data: me } = await supabase
    .from("app_users")
    .select("account_type, plan_code, max_companies, full_name, email")
    .eq("id", meId)
    .maybeSingle();
  if ((me as any)?.account_type !== "comptable") {
    redirect("/dashboard");
  }


  const shellType = shellTypeFromUser({
    dbType: (me as any)?.account_type ?? null,
    planCode: (me as any)?.plan_code ?? null,
    maxCompanies: (me as any)?.max_companies ?? null,
  });

  const { data: members, error: memErr } = await supabase
    .from("accountant_team_members")
    .select(
      `
      id,
      staff_email,
      full_name,
      status,
      can_manage_customers,
      can_create_invoices,
      can_validate_invoices,
      can_submit_ttn,
      created_at
    `
    )
    .eq("owner_user_id", meId)
    .order("created_at", { ascending: false });

  return (
    <AppShell
      title="Accès & permissions"
      subtitle="Définissez les droits des membres de votre cabinet"
      accountType={shellType}
    >
      <div className="mx-auto w-full max-w-6xl p-6">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-900">Équipe du cabinet</div>
            <div className="text-xs text-slate-500">
              Les droits ci-dessous s’appliquent à l’équipe. La gestion par société (affectations + droits)
              sera ajoutée dans une étape suivante.
            </div>
          </div>

          {memErr ? (
            <div className="p-6 text-sm text-rose-700">Erreur chargement équipe : {memErr.message}</div>
          ) : null}

          {!memErr && (!members || members.length === 0) ? (
            <div className="p-6 text-sm text-slate-600">
              Aucun membre trouvé. Invitez votre équipe depuis <span className="font-semibold">Invitations</span>.
            </div>
          ) : null}

          {!memErr && members && members.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {members.map((m: any) => (
                <div key={m.id} className="p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{m.full_name || "—"}</div>
                      <div className="truncate text-xs text-slate-500">{m.staff_email || "—"}</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        {String(m.status || "pending").toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Gérer clients : {m.can_manage_customers ? "Oui" : "Non"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Créer factures : {m.can_create_invoices ? "Oui" : "Non"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Valider : {m.can_validate_invoices ? "Oui" : "Non"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Soumettre TTN : {m.can_submit_ttn ? "Oui" : "Non"}
                    </span>
                  </div>

                  <div className="mt-2 text-[11px] text-slate-400">
                    ID : <span className="font-mono">{m.id}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Astuce : la gestion des invitations se fait dans <span className="font-semibold">/accountant/team</span>.
        </div>
      </div>
    </AppShell>
  );
}
