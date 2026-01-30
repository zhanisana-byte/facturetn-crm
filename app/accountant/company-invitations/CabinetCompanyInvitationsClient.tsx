"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  status: string;
  created_at: string;
  invited_email: string | null;
  companies?: { id: string; company_name: string | null; tax_id: string | null } | null;
};

function statusLabel(s: string) {
  if (s === "pending") return { txt: "En attente", cls: "ftn-pill ftn-pill-warn" };
  if (s === "accepted") return { txt: "Acceptée", cls: "ftn-pill ftn-pill-ok" };
  if (s === "declined") return { txt: "Refusée", cls: "ftn-pill" };
  if (s === "revoked") return { txt: "Révoquée", cls: "ftn-pill" };
  return { txt: s || "—", cls: "ftn-pill" };
}

export default function CabinetCompanyInvitationsClient({
  cabinetGroupId,
  cabinetName,
}: {
  cabinetGroupId: string;
  cabinetName: string;
}) {
  const supabase = createClient();

  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("group_company_invitations")
      .select("id,status,created_at,invited_email, companies(id,company_name,tax_id)")
      .eq("group_id", cabinetGroupId)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinetGroupId]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!qq) return true;
      const n = String(r.companies?.company_name ?? "").toLowerCase();
      const mf = String(r.companies?.tax_id ?? "").toLowerCase();
      const mail = String(r.invited_email ?? "").toLowerCase();
      return n.includes(qq) || mf.includes(qq) || mail.includes(qq);
    });
  }, [rows, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q]);

  async function respond(id: string, action: "accept" | "decline") {
    const res = await fetch(`/api/group-company-invitations/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (!res.ok) {
      alert(
        action === "accept"
          ? "Une erreur est survenue lors de l’acceptation. Veuillez réessayer."
          : "Une erreur est survenue lors du refus. Veuillez réessayer."
      );
      return;
    }

    await load();
    alert(action === "accept" ? "Invitation acceptée ✅" : "Invitation refusée ✅");
  }

  return (
    <div className="ftn-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Invitations reçues (Sociétés)</div>
          <div className="text-xs text-slate-500">Cabinet : {cabinetName}</div>
        </div>

        <input
          className="ftn-input w-72"
          placeholder="Rechercher (nom / MF / email)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="mt-4 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b">
              <th className="py-2 px-2">Société</th>
              <th className="py-2 px-2">MF</th>
              <th className="py-2 px-2">Email (demande)</th>
              <th className="py-2 px-2">Statut</th>
              <th className="py-2 px-2">Date</th>
              <th className="py-2 px-2 text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="py-4 px-2 text-sm text-slate-500" colSpan={6}>
                  Chargement…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td className="py-4 px-2 text-sm text-slate-500" colSpan={6}>
                  Aucune invitation.
                </td>
              </tr>
            ) : (
              pageRows.map((r) => {
                const isPending = r.status === "pending";
                const st = statusLabel(r.status);
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 px-2 font-semibold">
                      {r.companies?.company_name ?? "—"}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {r.companies?.tax_id ?? "—"}
                    </td>
                    <td className="py-2 px-2 text-slate-600">{r.invited_email ?? "—"}</td>
                    <td className="py-2 px-2">
                      <span className={st.cls}>{st.txt}</span>
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex justify-end gap-2">
                        <button
                          className="ftn-btn ftn-btn-ghost"
                          onClick={() => respond(r.id, "decline")}
                          disabled={!isPending}
                          type="button"
                        >
                          Refuser
                        </button>
                        <button
                          className="ftn-btn"
                          onClick={() => respond(r.id, "accept")}
                          disabled={!isPending}
                          type="button"
                        >
                          Accepter
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Page {page} / {totalPages}
        </div>

        <div className="flex gap-2">
          <button
            className="ftn-btn ftn-btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            Précédent
          </button>
          <button
            className="ftn-btn ftn-btn-ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            type="button"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
