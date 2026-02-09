"use client";

import { useState } from "react";
import Link from "next/link";

type Invoice = {
  id: string;
  number: string;
  client_name: string;
  client_mf: string;
  total: number;
  status: "draft" | "pending" | "signed";
  created_at: string;
};

export default function InvoiceTable({
  invoices,
  onDelete,
}: {
  invoices: Invoice[];
  onDelete: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );

  const canDelete = invoices.filter(
    (i) => selected.includes(i.id) && i.status !== "signed"
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th />
            <th>N°</th>
            <th>Client</th>
            <th>MF</th>
            <th>Total</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-t">
              <td className="text-center">
                {inv.status !== "signed" && (
                  <input
                    type="checkbox"
                    checked={selected.includes(inv.id)}
                    onChange={() => toggle(inv.id)}
                  />
                )}
              </td>

              <td>{inv.number}</td>
              <td>{inv.client_name}</td>
              <td>{inv.client_mf}</td>
              <td>{inv.total.toFixed(3)} TND</td>

              <td>
                {inv.status === "signed" ? "✔ Signée" : "⏳ Non signée"}
              </td>

              <td className="flex gap-2">
                {inv.status !== "signed" && (
                  <>
                    <Link href={`/invoices/${inv.id}/edit`} className="btn">
                      ✏️
                    </Link>
                    <Link
                      href={`/invoices/${inv.id}/signature`}
                      className="btn"
                    >
                      🖊️
                    </Link>
                  </>
                )}

                {inv.status === "signed" && (
                  <Link href={`/invoices/${inv.id}`} className="btn">
                    👁️
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {canDelete.length > 0 && (
        <button
          onClick={() => onDelete(canDelete.map((i) => i.id))}
          className="mt-3 bg-red-600 text-white px-4 py-2 rounded"
        >
          🗑️ Supprimer ({canDelete.length})
        </button>
      )}
    </div>
  );
}
