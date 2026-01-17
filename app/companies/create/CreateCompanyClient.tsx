"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

type CompanyInsertResult = { id: string };

export default function CreateCompanyClient() {
  const supabase = createClient();
  const router = useRouter();

  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);

    if (!name.trim()) {
      setErr("Le nom de la société est obligatoire.");
      return;
    }

    setLoading(true);

    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr || !auth?.user) {
        router.push("/login");
        return;
      }

      // ✅ RLS: insertion directe interdite. On crée via RPC SECURITY DEFINER.
      const { data: companyId, error: rpcErr } = await supabase.rpc("create_company_with_owner", {
        p_company_name: name.trim(),
        p_tax_id: taxId.trim() || null,
        p_address: null,
        p_phone: null,
        p_email: null,
      });

      if (rpcErr) throw rpcErr;
      if (!companyId) throw new Error("Création société échouée (id manquant).");

      // ✅ Activer le workspace société (UPsert, pas update)
      const { error: wErr } = await supabase.from("user_workspace").upsert(
        {
          user_id: auth.user.id,
          active_mode: "entreprise",
          active_company_id: companyId,
          active_group_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (wErr) throw wErr;

      // ✅ Redirect vers la société
      router.push(`/companies/success?id=${companyId}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erreur lors de la création de la société.");
      setLoading(false);
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Nouvelle société</h2>

      {err && (
        <div className="text-sm rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2">
          {err}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium">Nom de la société *</label>
        <input
          className="w-full px-3 py-2 rounded-md border"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Société Sana Com"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Matricule fiscale (MF)</label>
        <input
          className="w-full px-3 py-2 rounded-md border"
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          placeholder="Ex : 1304544Z"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-50"
        >
          {loading ? "Création..." : "Créer la société"}
        </button>
      </div>
    </Card>
  );
}
