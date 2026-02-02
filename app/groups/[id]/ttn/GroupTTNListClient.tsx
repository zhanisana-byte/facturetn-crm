"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = {
  company: { id: string; company_name: string; tax_id: string | null };
  linkType: "managed";
  ok: boolean;
};

export default function GroupTTNListClient({
  groupId,
  rows,
}: {
  groupId: string;
  rows: Row[];
}) {
  const [status, setStatus] = useState<"all" | "incomplete" | "complete">("all");
  const [type, setType] = useState<"all">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (status === "complete" && !r.ok) return false;
      if (status === "incomplete" && r.ok) return false;
      if (type !== "all" && r.linkType !== type) return false;
      if (qq) {
        const name = String(r.company.company_name ?? "").toLowerCase();
        const mf = String(r.company.tax_id ?? "").toLowerCase();
        if (!name.includes(qq) && !mf.includes(qq)) return false;
      }
      return true;
    });
  }, [rows, status, type, q]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length]);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage]
  );

  const counts = useMemo(() => {
    const all = rows.length;
    const complete = rows.filter((r) => r.ok).length;
    const incomplete = all - complete;
    return { all, complete, incomplete };
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-white p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatus("all")}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                status === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"
              }`}
            >
              Tous ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setStatus("incomplete")}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                status === "incomplete" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"
              }`}
            >
              Incomplets ({counts.incomplete})
            </button>
            <button
              type="button"
              onClick={() => setStatus("complete")}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                status === "complete" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"
              }`}
            >
              Complets ({counts.complete})
            </button>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              value={type}
              onChange={(e) => {
                setType(e.target.value as any);
                setPage(1);
              }}
            >
              <option value="all">Tous types</option>            </select>

            <input
              className="h-10 w-full md:w-[280px] rounded-lg border border-slate-200 bg-white px-3 text-sm"
              placeholder="Rechercher (nom ou MF)…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="mt-2 text-xs text-slate-500">
          Astuce : priorisez “Incomplets” pour terminer rapidement les paramètres TTN.
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Société</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
                <th className="text-left px-4 py-3 font-semibold">TTN</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.company.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.company.company_name}</div>
                    <div className="text-xs text-slate-500">MF : {r.company.tax_id ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                        r.linkType === "managed"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      {r.linkType === "managed" ? "Gérée" : "Gérée"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                        r.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"
                      }`}
                    >
                      {r.ok ? "Complet" : "Incomplet"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link className="btn btn-sm" href={`/groups/${groupId}/ttn/${r.company.id}`}>
                      {r.ok ? "Modifier" : "Compléter"}
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-600" colSpan={4}>
                    Aucun résultat avec ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">Page {safePage}/{totalPages}</div>
        <div className="flex gap-2">
          <button
            type="button"
            className="h-9 rounded-md border px-3 text-xs"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            Précédent
          </button>
          <button
            type="button"
            className="h-9 rounded-md border px-3 text-xs"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
