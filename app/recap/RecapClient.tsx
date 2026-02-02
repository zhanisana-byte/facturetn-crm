"use client";

import Link from "next/link";
import { useMemo, useState, ChangeEvent } from "react";
type PageRow = {
  id: string;
  company_name?: string | null;
  tax_id?: string | null;
  page_type?: string | null;
};

type TeamRow = {
  company_id: string;
  company_name: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
};

function labelType(t?: string | null) {
  const v = (t || "").toLowerCase();
  if (!v) return "Page";
  if (v.includes("cab")) return "Cabinet";
  if (v.includes("multi") || v.includes("group")) return "Multi-société";
  return "Société";
}

export default function RecapClient({
  pages,
  teams,
}: {
  pages: PageRow[];
  teams: TeamRow[];
}) {
  const [filterPageId, setFilterPageId] = useState<string>("all");

  const pageOptions = useMemo(() => {
    const arr = [...(pages ?? [])];
    arr.sort((a, b) => String(a.company_name || "").localeCompare(String(b.company_name || "")));
    return arr;
  }, [pages]);

  const teamsFiltered = useMemo(() => {
    const list = teams ?? [];
    if (filterPageId === "all") return list;
    return list.filter((t) => t.company_id === filterPageId);
  }, [teams, filterPageId]);

  const teamsGrouped = useMemo(() => {
    const map = new Map<string, TeamRow[]>();
    for (const r of teamsFiltered) {
      const key = r.company_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    
    for (const [k, v] of map.entries()) {
      v.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
      map.set(k, v);
    }
    return map;
  }, [teamsFiltered]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="font-semibold mb-2">Mes pages</div>

        {pageOptions.length ? (
          <div className="space-y-2">
            {pageOptions.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3"
              >
                <div>
                  <div className="font-semibold">{p.company_name || "Page"}</div>
                  <div className="text-xs text-slate-600">
                    {labelType(p.page_type)} {p.tax_id ? `• ${p.tax_id}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link className="ftn-btn-ghost" href={`/companies/${p.id}`}>
                    Ouvrir
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-600">Aucune page trouvée.</div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <div className="font-semibold">Mes équipes</div>
            <div className="text-xs text-slate-600">
              Les personnes qui ont accès à vos pages (par page).
            </div>
          </div>

          <select
            className="ftn-input"
            value={filterPageId}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFilterPageId(e.target.value)}
          >
            <option value="all">Toutes les pages</option>
            {pageOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.company_name || "Page"}
              </option>
            ))}
          </select>
        </div>

        {teamsFiltered.length ? (
          <div className="space-y-4">
            {Array.from(teamsGrouped.entries()).map(([companyId, members]) => {
              const pageName =
                pageOptions.find((p) => p.id === companyId)?.company_name ||
                members[0]?.company_name ||
                "Page";

              return (
                <div key={companyId} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="font-semibold">{pageName}</div>
                    <Link className="ftn-link text-sm" href={`/companies/${companyId}`}>
                      Gérer dans la page →
                    </Link>
                  </div>

                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="py-2 pr-3">Membre</th>
                          <th className="py-2 pr-3">Email</th>
                          <th className="py-2 pr-3">Rôle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => (
                          <tr key={m.user_id} className="border-t border-slate-100">
                            <td className="py-2 pr-3 font-medium">
                              {m.full_name || "—"}
                            </td>
                            <td className="py-2 pr-3">{m.email || "—"}</td>
                            <td className="py-2 pr-3">{m.role}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-xs text-slate-500 mt-2">
                    Pour révoquer / modifier, utilisez “Gérer dans la page”.
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-slate-600">
            Aucune équipe à afficher (aucun membre trouvé).
          </div>
        )}
      </div>
    </div>
  );
}
