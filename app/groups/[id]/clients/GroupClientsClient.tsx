
"use client";

import Link from "next/link";
import { useMemo, useState, ChangeEvent } from "react";
import { Table } from "@/components/ui";

type Member = {
  userId: string;
  name: string;
  email: string;
  role: string;
  perms: string; 
};

type Row = {
  id: string;
  name: string;
  taxId: string;
  linkType: "managed";
  companyComplete: boolean;
  ttnExists: boolean;
  ttnComplete: boolean;
  members: Member[];
  subscriptionEndsAt: string | null;
};

export default function GroupClientsClient({
  groupId,
  rows,
  removeAction,
}: {
  groupId: string;
  rows: Row[];
  removeAction: (formData: FormData) => void;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all">("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let base = rows;

    
    if (!qq) return base;

    return base.filter((r) => {
      const m = (r.members ?? [])
        .map((x) => `${x.name} ${x.email} ${x.role} ${x.perms}`.toLowerCase())
        .join(" | ");

      return (
        r.name.toLowerCase().includes(qq) ||
        r.taxId.toLowerCase().includes(qq) ||
        r.linkType.toLowerCase().includes(qq) ||
        m.includes(qq)
      );
    });
  }, [q, rows, type]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (!rows || rows.length === 0) {
    return (
      <div className="ftn-muted">
        Aucune société liée à ce groupe. Vous pouvez <b>créer une société gérée</b>, ou{" "}
        <b>accepter</b> des sociétés gérées via <b>Invitations reçues</b>.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          className="ftn-input"
          placeholder="Rechercher (nom / MF / équipe / permissions)"
          value={q}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />

        <select
          className="ftn-input"
          value={type}
          onChange={(e) => {
            setType(e.target.value as any);
            setPage(1);
          }}
          style={{ maxWidth: 220 }}
        >
          <option value="all">Tous</option>        </select>

        <span className="ftn-badge">{filtered.length}</span>
      </div>

      <Table
        head={
          <tr>
            <th>Société</th>
            <th>Type</th>
            <th>Société</th>
            <th>TTN</th>
            <th>Équipe & permissions</th>
            <th></th>
          </tr>
        }
      >
        {pageRows.map((c) => {
          const members = c.members ?? [];
          const preview = members.slice(0, 2);
          const rest = Math.max(0, members.length - preview.length);

          return (
            <tr key={c.id}>
              <td>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs opacity-70">MF : {c.taxId}</div>
                {c.linkType === "managed" && c.subscriptionEndsAt ? (
                  <div className="text-xs opacity-70">Fin : {new Date(c.subscriptionEndsAt).toLocaleDateString()}</div>
                ) : null}
              </td>

              <td>
                <span className="ftn-badge">{c.linkType === "managed" ? "Gérée" : "Gérée"}</span>
              </td>

              <td>
                {c.companyComplete ? (
                  <span className="ftn-pill">Complète</span>
                ) : (
                  <span className="ftn-pill ftn-pill-warn">Incomplète</span>
                )}
              </td>

              <td>
                {!c.ttnExists ? (
                  <span className="ftn-pill">—</span>
                ) : c.ttnComplete ? (
                  <span className="ftn-pill">Complet</span>
                ) : (
                  <span className="ftn-pill ftn-pill-warn">Incomplet</span>
                )}
              </td>

              <td>
                {members.length === 0 ? (
                  <div className="text-xs opacity-70">—</div>
                ) : (
                  <div className="text-xs">
                    {preview.map((m) => (
                      <div key={m.userId} className="opacity-90">
                        <b>{m.name}</b>{" "}
                        <span className="opacity-70">
                          ({m.role || "membre"}) — {m.perms}
                        </span>
                      </div>
                    ))}
                    {rest > 0 ? <div className="opacity-70">+ {rest} autre(s)</div> : null}
                  </div>
                )}
              </td>

              <td className="text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <Link className="ftn-link" href={`/groups/${groupId}/companies/${c.id}`} prefetch={false}>
                    Voir
                  </Link>
                  <Link className="ftn-link" href={`/groups/${groupId}/companies/${c.id}/ttn`} prefetch={false}>
                    TTN
                  </Link>
                  <Link className="ftn-link" href={`/groups/${groupId}/droits`} prefetch={false}>
                    Droits
                  </Link>

                  <form
                    action={removeAction}
                    onSubmit={(e) => {
                      if (!confirm("Confirmez-vous la suppression de cette société du groupe ?")) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="group_id" value={groupId} />
                    <input type="hidden" name="company_id" value={c.id} />
                    <button type="submit" className="ftn-link" style={{ color: "#ef4444" as any }}>
                      Supprimer
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>

      <div className="flex items-center justify-between mt-3">
        <div className="text-xs opacity-70">
          Page {safePage}/{totalPages}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="ftn-btn ftn-btn-ghost"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            Précédent
          </button>
          <button
            type="button"
            className="ftn-btn ftn-btn-ghost"
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
