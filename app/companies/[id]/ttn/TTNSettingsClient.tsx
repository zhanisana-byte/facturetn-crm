"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TTNSettingsClient({
  companyId,
  initialSettings,
}: {
  companyId: string;
  initialSettings: any;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);

    await supabase.from("ttn_company_settings").upsert({
      company_id: companyId,
      signature_type: "digigo",
    });

    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="ftn-card">
        <h3 className="ftn-title">Signature électronique</h3>

        <div className="space-y-3 mt-4">
          <label className="flex items-center gap-3 p-3 border rounded-xl bg-gray-50 opacity-50">
            <input type="radio" disabled />
            <span>USB (désactivé)</span>
          </label>

          <label className="flex items-center gap-3 p-3 border rounded-xl bg-gray-50 opacity-50">
            <input type="radio" disabled />
            <span>Autre signature (désactivée)</span>
          </label>

          <label className="flex items-center gap-3 p-3 border rounded-xl bg-white">
            <input type="radio" checked disabled />
            <span className="font-medium">DigiGo (Cloud)</span>
          </label>
        </div>
      </div>

      <button
        onClick={save}
        disabled={loading}
        className="ftn-btn-primary"
      >
        Enregistrer
      </button>
    </div>
  );
}
