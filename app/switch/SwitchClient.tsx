"use client";

import { useMemo, useTransition } from "react";

type WorkspaceMode = "profil" | "entreprise" | "comptable" | "multi_societe";
type CompanyRow = { id: string; company_name: string };
type GroupRow = { id: string; group_name: string; group_type: "multi" | "cabinet" };

type Row =
  | { kind: "company"; id: string; typeLabel: "Société"; name: string; href: string }
  | { kind: "group"; id: string; typeLabel: "Groupe" | "Cabinet"; name: string; href: string; groupType: "multi" | "cabinet" };

export default function SwitchClient({
  companies,
  groups,
  setWorkspace,
}: {
  companies: CompanyRow[];
  groups: GroupRow[];
  setWorkspace: (mode: WorkspaceMode, companyId: string | null, groupId: string | null) => Promise<void>;
}) {
  const [pending, start] = useTransition();

  const rows: Row[] = useMemo(() => {
    const gRows: Row[] = groups.map((g) => ({
      kind: "group",
      id: g.id,
      typeLabel: g.group_type === "cabinet" ? "Cabinet" : "Groupe",
      name: g.group_name,
      // ✅ Cabinet a sa propre route (/cabinet/[id]) pour garantir le bon sidebar (comptable)
      href: g.group_type === "cabinet" ? `/cabinet/${g.id}` : `/groups/${g.id}`,
      groupType: g.group_type,
    }));

    const cRows: Row[] = companies.map((c) => ({
      kind: "company",
      id: c.id,
      typeLabel: "Société",
      name: c.company_name,
      href: `/companies/${c.id}`,
    }));

    const order = (r: Row) => (r.typeLabel === "Cabinet" ? 0 : r.typeLabel === "Groupe" ? 1 : 2);
    return [...gRows, ...cRows].sort((a, b) => order(a) - order(b));
  }, [companies, groups]);

  function activateProfil() {
    start(async () => {
      await setWorkspace("profil", null, null);
      window.location.href = "/profile";
    });
  }

  function enter(r: Row) {
    start(async () => {
      if (r.kind === "company") {
        await setWorkspace("entreprise", r.id, null);
        window.location.href = r.href;
      } else {
        // cabinet => comptable, groupe => multi_societe
        await setWorkspace(r.groupType === "cabinet" ? "comptable" : "multi_societe", null, r.id);
        window.location.href = r.href;
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold">Activer Profil</div>
          <div className="text-sm text-slate-500">Revenir au mode Profil.</div>
        </div>
        <button
          disabled={pending}
          onClick={activateProfil}
          className="h-10 rounded-md bg-black px-4 text-white text-sm disabled:opacity-60"
        >
          Activer Profil
        </button>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="text-sm font-semibold">Pages disponibles</div>
          <div className="text-xs text-slate-500">Cliquez “Entrer” → bon sidebar</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-4 text-sm">
            Aucun espace. <a className="underline" href="/pages/new">Créer un espace</a>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left font-medium px-4 py-3 w-44">Type</th>
                <th className="text-left font-medium px-4 py-3">Nom</th>
                <th className="text-right font-medium px-4 py-3 w-40">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs bg-white">
                      {r.typeLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.href}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={pending}
                      onClick={() => enter(r)}
                      className="h-9 rounded-md bg-black px-3 text-white text-xs disabled:opacity-60"
                    >
                      Entrer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <a className="underline text-sm" href="/pages/new">+ Créer un nouvel espace</a>
    </div>
  );
}
