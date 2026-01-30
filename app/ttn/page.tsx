import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/app/lib/workspace";
import { shellTypeFromWorkspace } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
export default async function TTNPage() {
  const workspace = await getWorkspace();
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // ✅ Optionnel: limiter l'accès TTN au mode société فقط (حسب منطقك)
  // إذا تحب تخليه مفتوح، انحي bloc هذا
  const activeMode = workspace?.active_mode ?? "profil";
  const allowed = activeMode === "entreprise" || activeMode === "multi_societe";
  if (!allowed) redirect("/dashboard");

  // invoices scheduled (queue)
  const { data: scheduled } = await supabase
    .from("ttn_invoice_queue")
    .select("id,invoice_id,company_id,scheduled_at,status,last_error,created_at")
    .in("status", ["scheduled", "queued"])
    .order("scheduled_at", { ascending: true });

  // last events
  const { data: events } = await supabase
    .from("ttn_events")
    .select("id,invoice_id,company_id,status,message,created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <AppShell
      title="TTN"
      subtitle="Suivi + rappels d'envoi (test)"
      accountType={shellTypeFromWorkspace(activeMode)}
    >
      <div className="grid gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Envois programmés</h2>
              <p className="text-sm text-slate-600 mt-1">
                Rappels internes (le cron/worker TTN sera branché après).
              </p>
            </div>
            <Link
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
              href="/invoices"
            >
              Voir factures
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b">
                  <th className="text-left py-2">Facture</th>
                  <th className="text-left py-2">Société</th>
                  <th className="text-left py-2">Date prévue</th>
                  <th className="text-left py-2">Statut</th>
                  <th className="text-left py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {(scheduled ?? []).map((r: any) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="py-2">
                      <Link
                        className="text-indigo-700 hover:underline"
                        href={`/invoices/${r.invoice_id}`}
                      >
                        {String(r.invoice_id).slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="py-2">{String(r.company_id).slice(0, 8)}...</td>
                    <td className="py-2">
                      {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "-"}
                    </td>
                    <td className="py-2">{r.status}</td>
                    <td className="py-2">
                      <Link
                        className="px-3 py-1 rounded-lg border border-slate-200 text-xs hover:bg-slate-50"
                        href={`/invoices/${r.invoice_id}`}
                      >
                        Ouvrir
                      </Link>
                    </td>
                  </tr>
                ))}

                {(!scheduled || scheduled.length === 0) && (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={5}>
                      Aucun envoi TTN programmé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Derniers événements TTN</h2>
          <p className="text-sm text-slate-600 mt-1">Historique (20 derniers)</p>

          <div className="mt-4 space-y-2">
            {(events ?? []).map((e: any) => (
              <div key={e.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm font-medium">{e.status}</div>
                  <div className="text-xs text-slate-500">
                    {e.created_at ? new Date(e.created_at).toLocaleString() : "-"}
                  </div>
                </div>

                <div className="text-xs text-slate-600 mt-1">
                  Facture: {String(e.invoice_id).slice(0, 8)}...
                </div>

                {e.message ? <div className="text-sm mt-2">{e.message}</div> : null}
              </div>
            ))}

            {(!events || events.length === 0) && (
              <div className="text-sm text-slate-500">Aucun événement TTN.</div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
