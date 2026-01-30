"use client";

import { useMemo, useState } from "react";

export type CompanyRow = {
  id: string;
  company_name: string;
  tax_id?: string | null;
};

export type TaskKey = "factures" | "ttn" | "declarations" | "clients" | "settings";

const TASKS: { key: TaskKey; label: string }[] = [
  { key: "factures", label: "Factures" },
  { key: "ttn", label: "TTN" },
  { key: "declarations", label: "Déclarations" },
  { key: "clients", label: "Clients" },
  { key: "settings", label: "Paramètres" },
];

type Perm = Record<TaskKey, boolean>;

function defaultPerm(): Perm {
  return { factures: true, ttn: true, declarations: false, clients: true, settings: false };
}

export default function CompanyPermissionsPicker({
  companies,
  scope,
}: {
  companies: CompanyRow[];
  scope: "none" | "all" | "selected";
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const obj: Record<string, boolean> = {};
    companies.forEach((c) => (obj[c.id] = false));
    return obj;
  });

  const [perms, setPerms] = useState<Record<string, Perm>>(() => {
    const obj: Record<string, Perm> = {};
    companies.forEach((c) => (obj[c.id] = defaultPerm()));
    return obj;
  });

  const effectiveSelectedIds = useMemo(() => {
    if (scope === "all") return companies.map((c) => c.id);
    if (scope === "none") return [];
    return companies.filter((c) => selected[c.id]).map((c) => c.id);
  }, [companies, scope, selected]);

  const effectivePerms = useMemo(() => {
    const out: Record<string, Perm> = {};
    effectiveSelectedIds.forEach((id) => {
      out[id] = perms[id] ?? defaultPerm();
    });
    return out;
  }, [effectiveSelectedIds, perms]);

  // ✅ On envoie au server via inputs hidden
  const hiddenSelected = JSON.stringify(effectiveSelectedIds);
  const hiddenPerms = JSON.stringify(effectivePerms);

  return (
    <div className="mt-4">
      <input type="hidden" name="companies_selected_json" value={hiddenSelected} />
      <input type="hidden" name="companies_permissions_json" value={hiddenPerms} />

      {scope === "none" ? (
        <div className="ftn-muted">Aucune société sélectionnée.</div>
      ) : null}

      {scope === "all" ? (
        <div className="ftn-callout">
          Toutes les sociétés du cabinet seront accessibles. Configure les tâches globales en modifiant une société (optionnel).
        </div>
      ) : null}

      {scope === "selected" ? (
        <div className="ftn-card mt-3">
          <div className="ftn-h3">Permissions par société</div>
          <div className="ftn-muted mt-1">
            Coche les sociétés à gérer puis choisis les tâches autorisées.
          </div>

          <div className="mt-4 space-y-3">
            {companies.map((c) => {
              const isOn = !!selected[c.id];
              const p = perms[c.id] ?? defaultPerm();

              return (
                <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={(e) =>
                          setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))
                        }
                      />
                      <div>
                        <div className="font-medium">{c.company_name}</div>
                        <div className="text-sm text-slate-500">
                          {c.tax_id ? `MF: ${c.tax_id}` : "MF: —"} • ID: {c.id}
                        </div>
                      </div>
                    </label>

                    <div className="text-sm text-slate-500">
                      {isOn ? "Sélectionnée" : "Non sélectionnée"}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                    {TASKS.map((t) => (
                      <label
                        key={t.key}
                        className={`rounded-lg border px-3 py-2 text-sm flex items-center gap-2 ${
                          !isOn ? "opacity-40" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={!isOn}
                          checked={!!p[t.key]}
                          onChange={(e) =>
                            setPerms((prev) => ({
                              ...prev,
                              [c.id]: { ...(prev[c.id] ?? defaultPerm()), [t.key]: e.target.checked },
                            }))
                          }
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>

                  {isOn ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="ftn-btn ftn-btn-ghost"
                        onClick={() =>
                          setPerms((prev) => ({
                            ...prev,
                            [c.id]: { factures: true, ttn: true, declarations: true, clients: true, settings: true },
                          }))
                        }
                      >
                        Tout
                      </button>
                      <button
                        type="button"
                        className="ftn-btn ftn-btn-ghost"
                        onClick={() =>
                          setPerms((prev) => ({
                            ...prev,
                            [c.id]: { factures: true, ttn: true, declarations: false, clients: true, settings: false },
                          }))
                        }
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        className="ftn-btn ftn-btn-ghost"
                        onClick={() =>
                          setPerms((prev) => ({
                            ...prev,
                            [c.id]: { factures: false, ttn: false, declarations: false, clients: false, settings: false },
                          }))
                        }
                      >
                        Rien
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
