
"use client";

import { useMemo, useState } from "react";
import CompanyPermissionsPicker from "./CompanyPermissionsPicker";

type CompanyRow = {
  id: string;
  company_name: string;
  tax_id?: string | null;
};

type Scope = "none" | "all" | "selected";

export default function InviteScopeClient({
  companies,
  disabled,
}: {
  companies: CompanyRow[];
  disabled?: boolean;
}) {
  const [scope, setScope] = useState<Scope>("all");

  const count = useMemo(() => {
    if (scope === "none") return 0;
    if (scope === "all") return companies.length;
    return null;
  }, [scope, companies.length]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold">Sociétés concernées</div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="ftn-label">Choix</label>
          <select
            className="ftn-input"
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            name="companies_scope"
            disabled={disabled}
          >
            <option value="none">Aucune</option>
            <option value="all">Toutes les sociétés du cabinet</option>
            <option value="selected">Par sélection</option>
          </select>

          <div className="text-xs text-slate-500 mt-1">
            {scope === "all" ? `Toutes (${count})` : scope === "none" ? "Aucune société" : "Choisis les sociétés en bas"}
          </div>
        </div>
      </div>

      {}
      <CompanyPermissionsPicker companies={companies as any} scope={scope} />
    </div>
  );
}
