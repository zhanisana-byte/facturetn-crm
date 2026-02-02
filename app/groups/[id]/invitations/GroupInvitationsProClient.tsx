"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type CompanyRow = {
  id: string;
  company_name: string | null;
  tax_id: string | null;
  link_type: "external" | "managed";
  created_at: string;
};

type Props = {
  companies: CompanyRow[];
};

function pill(label: string, variant: "ok" | "warn" = "ok") {
  return (
    <Badge variant={variant === "ok" ? "default" : "secondary"}>
      {label}
    </Badge>
  );
}

export default function GroupInvitationsProClient({ companies }: Props) {
  const rows = useMemo(() => companies ?? [], [companies]);

  if (!rows.length) {
    return (
      <div className="text-sm text-slate-500 py-6">
        Aucune société invitée.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b text-xs text-slate-500">
            <th className="text-left py-2 px-2">Société</th>
            <th className="text-left py-2 px-2">Matricule</th>
            <th className="text-left py-2 px-2">Type</th>
            <th className="text-left py-2 px-2">Date</th>
            <th className="text-right py-2 px-2">Action</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b last:border-0 text-sm">
              <td className="py-2 px-2 font-medium">
                {c.company_name ?? "—"}
              </td>

              <td className="py-2 px-2 text-slate-600">
                {c.tax_id ?? "—"}
              </td>

              <td className="py-2 px-2">
                {c.link_type === "managed"
                  ? pill("Gérée", "ok")
                  : pill("Externe", "warn")}
              </td>

              <td className="py-2 px-2 text-xs text-slate-600">
                {format(new Date(c.created_at), "dd/MM/yyyy")}
              </td>

              <td className="py-2 px-2 text-right">
                <Button variant="outline" size="sm" disabled>
                  En attente
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
