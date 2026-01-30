"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  status: string;
  created_at: string;
  companies?: { id: string; company_name: string | null; tax_id: string | null } | null;
  invited_email: string;
};

export default function GroupCompanyInvitationsReceivedClient({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  async function load() {
    const { data } = await supabase
      .from("group_company_invitations")
      .select("id,status,created_at,invited_email, companies(id,company_name,tax_id)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(200);

    setRows((data ?? []) as any);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!qq) return true;
      return (
        String(r.companies?.company_name ?? "").toLowerCase().includes(qq) ||
        String(r.companies?.tax_id ?? "").toLowerCase().includes(qq)
      );
    });
  }, [rows, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [q]);

  async function accept(id: string) {
    const res = await fetch(`/api/group-company-invitations/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    if (!res.ok) {
      alert("Erreur.");
      return;
    }
    await load();
  }

  async function decline(id: string) {
    const res = await fetch(`/api/group-company-invitations/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline" }),
    });
    if (!res.ok) {
      alert("Erreur.");
      return;
    }
    await load();
  }

  return (
    <div className="ftn-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Invitations reçues</div>
          <div className="text-xs text-slate-500">Groupe : {groupName}</div>
        </div>
        <input className="ftn-input w-64" placeholder="Rechercher (nom / MF)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mt-4 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b">
              <th className="py-2 px-2">Société</th>
              <th className="py-2 px-2">MF</th>
              <th className="py-2 px-2">Statut</th>
              <th className="py-2 px-2">Date</th>
              <th className="py-2 px-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 px-2 font-semibold">{r.companies?.company_name ?? "—"}</td>
                <td className="py-2 px-2 text-slate-600">{r.companies?.tax_id ?? "—"}</td>
                <td className="py-2 px-2">{r.status}</td>
                <td className="py-2 px-2 text-slate-600">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="py-2 px-2">
                  <div className="flex justify-end gap-2">
                    <button className="ftn-btn ftn-btn-ghost" onClick={() => decline(r.id)} disabled={r.status !== "pending"}>
                      Refuser
                    </button>
                    <button className="ftn-btn" onClick={() => accept(r.id)} disabled={r.status !== "pending"}>
                      Accepter
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 ? (
              <tr>
                <td className="py-4 px-2 text-sm text-slate-500" colSpan={5}>
                  Aucune invitation.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Page {page} / {totalPages}
        </div>
        <div className="flex gap-2">
          <button className="ftn-btn ftn-btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Précédent
          </button>
          <button className="ftn-btn ftn-btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
