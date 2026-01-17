"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Table } from "@/components/ui";

type Row = {
  id: string;
  name: string;
  taxId: string;
  linkType: "internal" | "external";
};

export default function GroupClientsClient({ groupId, rows }: { groupId: string; rows: Row[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      return (
        r.name.toLowerCase().includes(qq) ||
        r.taxId.toLowerCase().includes(qq) ||
        r.linkType.toLowerCase().includes(qq)
      );
    });
  }, [q, rows]);

  if (!rows || rows.length === 0) {
    return (
      <div className="ftn-muted">
        Aucune société liée à ce groupe pour le moment. Utilise <b>Créer société interne</b> ou <b>Ajouter société externe</b>.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <input
          className="ftn-input"
          placeholder="Rechercher une société (nom / MF / type)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="ftn-badge">{filtered.length}</span>
      </div>

      <Table head={<tr><th>Société</th><th>MF</th><th>Type</th><th></th></tr>}>
        {filtered.map((c) => (
          <tr key={c.id}>
            <td className="font-semibold">{c.name}</td>
            <td>{c.taxId}</td>
            <td>
              <span className="ftn-badge">{c.linkType === "external" ? "Externe" : "Interne"}</span>
            </td>
            <td className="text-right">
              <div className="flex flex-wrap justify-end gap-2">
                <Link className="ftn-link" href={`/companies/${c.id}`}>Gestion</Link>
                <Link className="ftn-link" href={`/companies/${c.id}/ttn`}>TTN</Link>
                <Link className="ftn-link" href={`/companies/${c.id}/droits`}>Accès</Link>
                <Link className="ftn-link" href={`/groups/${groupId}`}>Groupe</Link>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
