
"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Manager = {
  user_id: string;
  name: string;
  email: string;
  can_view: boolean;
  can_invoice: boolean;
  can_submit_ttn: boolean;
  can_manage_company: boolean;
};

type Row = {
  company_id: string;
  company_name: string;
  tax_id: string | null;
  subscription_end: string | null;
  subscription_status: string | null;
  company_complete: boolean;
  ttn_complete: boolean;
  managers: Manager[];
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR");
}

function Pill({ ok, okText, koText }: { ok: boolean; okText: string; koText: string }) {
  return (
    <span className={ok ? "ftn-pill ftn-pill-success" : "ftn-pill ftn-pill-warning"}>
      {ok ? okText : koText}
    </span>
  );
}

function PermBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-xs ${on ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500"}`}>
      {label}
    </span>
  );
}

export default function CabinetClientsTable({
  rows,
  page,
  totalPages,
  q,
  companyFilter,
  ttnFilter,
  canManage,
}: {
  rows: Row[];
  page: number;
  totalPages: number;
  q: string;
  companyFilter: "all" | "complete" | "incomplete";
  ttnFilter: "all" | "complete" | "incomplete";
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/accountant/cabinet";
  const sp = useSearchParams();

  const qs = useMemo(() => new URLSearchParams(sp?.toString() || ""), [sp]);

  function setParam(key: string, val: string) {
    const p = new URLSearchParams(qs);
    if (!val || val === "all") p.delete(key);
    else p.set(key, val);
    p.set("page", "1");
    router.push(`${pathname}?${p.toString()}`);
  }

  function goPage(n: number) {
    const p = new URLSearchParams(qs);
    p.set("page", String(n));
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="ftn-card">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="ftn-h3">Mes clients</div>
          <div className="ftn-muted mt-1">
            Sociétés liées au cabinet + abonnement + complétude + équipe/permissions.
          </div>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <input
            className="ftn-input"
            placeholder="Rechercher (nom / MF)…"
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setParam("q", (e.currentTarget.value || "").trim());
              }
            }}
          />

          <select
            className="ftn-input"
            value={companyFilter}
            onChange={(e) => setParam("company", e.target.value)}
          >
            <option value="all">Champs société: Tous</option>
            <option value="complete">Champs société: Complets</option>
            <option value="incomplete">Champs société: Incomplets</option>
          </select>

          <select
            className="ftn-input"
            value={ttnFilter}
            onChange={(e) => setParam("ttn", e.target.value)}
          >
            <option value="all">TTN: Tous</option>
            <option value="complete">TTN: Complet</option>
            <option value="incomplete">TTN: Incomplet</option>
          </select>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-3 pr-3">Société</th>
              <th className="py-3 pr-3">Abonnement</th>
              <th className="py-3 pr-3">Champs société</th>
              <th className="py-3 pr-3">Paramètres TTN</th>
              <th className="py-3 pr-3">Équipe & permissions</th>
              <th className="py-3 pr-3">Action</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-6 text-slate-500" colSpan={6}>
                  Aucune société trouvée.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.company_id} className="border-b last:border-b-0 align-top">
                  <td className="py-4 pr-3">
                    <div className="font-medium">{r.company_name}</div>
                    <div className="text-slate-500">
                      MF: {r.tax_id || "—"} • ID: {r.company_id}
                    </div>
                  </td>

                  <td className="py-4 pr-3">
                    <div>Fin: {fmtDate(r.subscription_end)}</div>
                    <div className="text-slate-500">Statut: {r.subscription_status || "—"}</div>
                  </td>

                  <td className="py-4 pr-3">
                    <Pill ok={r.company_complete} okText="Complet" koText="Non complet" />
                  </td>

                  <td className="py-4 pr-3">
                    <Pill ok={r.ttn_complete} okText="Complet" koText="Non complet" />
                  </td>

                  <td className="py-4 pr-3">
                    {r.managers.length === 0 ? (
                      <div className="text-slate-500">Aucun membre assigné</div>
                    ) : (
                      <div className="space-y-2">
                        {r.managers.slice(0, 2).map((m) => (
                          <div key={m.user_id} className="rounded-xl border border-slate-200 p-3">
                            <div className="font-medium">{m.name}</div>
                            <div className="text-slate-500 text-xs">{m.email}</div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              <PermBadge label="Voir" on={m.can_view} />
                              <PermBadge label="Factures" on={m.can_invoice} />
                              <PermBadge label="TTN" on={m.can_submit_ttn} />
                              <PermBadge label="Gérer société" on={m.can_manage_company} />
                            </div>
                          </div>
                        ))}
                        {r.managers.length > 2 ? (
                          <div className="text-xs text-slate-500">
                            +{r.managers.length - 2} autre(s)
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>

                  <td className="py-4 pr-3">
                    <a
                      className={`ftn-btn ftn-btn-ghost ${!canManage ? "opacity-50 pointer-events-none" : ""}`}
                      href={`/accountant/team?company=${r.company_id}`}
                      title={!canManage ? "Owner/Admin requis" : "Gérer équipe & permissions"}
                    >
                      Gérer
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {}
      <div className="mt-5 flex items-center justify-between">
        <div className="text-sm text-slate-500">
          Page {page} / {totalPages}
        </div>

        <div className="flex gap-2">
          <button
            className="ftn-btn ftn-btn-ghost"
            onClick={() => goPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Précédent
          </button>

          <button
            className="ftn-btn ftn-btn-ghost"
            onClick={() => goPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
