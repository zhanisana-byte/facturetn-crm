"use client";

import { useMemo, useState } from "react";
import { Btn, BtnGhost, Table, Badge } from "@/components/ui";

type LinkRow = {
  groupId: string;
  groupName: string;
  linkType: "managed";
  linkedAt?: string | null;
};

export default function LinksCompanyClient({
  companyId,
  rows,
}: {
  companyId: string;
  rows: LinkRow[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...(rows || [])].sort((a, b) => String(b.linkedAt || "").localeCompare(String(a.linkedAt || "")));
  }, [rows]);

  async function unlink(groupId: string) {
    setErr(null);
    setBusyId(groupId);
    try {
      const r = await fetch("/api/group-companies/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, group_id: groupId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || `Erreur (${r.status})`);
      }
      window.location.reload();
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {err ? <div className="ftn-alert mb-3">{err}</div> : null}

      {sorted.length === 0 ? (
        <div className="ftn-empty">Aucun groupe lié à cette société.</div>
      ) : (
        <Table
          head={
            <tr>
              <th>Groupe</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          }
        >
          {sorted.map((r) => (
            <tr key={r.groupId}>
              <td>
                <div className="font-semibold">{r.groupName}</div>
                <div className="text-xs opacity-70">ID: {r.groupId}</div>
              </td>
              <td>
                <Badge>{"Gérée"}</Badge>
              </td>
              <td className="whitespace-nowrap">
                <BtnGhost
                  onClick={() => unlink(r.groupId)}
                  disabled={busyId === r.groupId}
                  aria-busy={busyId === r.groupId}
                >
                  {busyId === r.groupId ? "Suppression…" : "Retirer le lien"}
                </BtnGhost>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <div className="mt-3 flex gap-2 flex-wrap justify-end">
        <Btn
          type="button"
          onClick={() => (window.location.href = `/companies/${companyId}/invitations`)}
        >
          Gérer invitations
        </Btn>
      </div>
    </div>
  );
}
