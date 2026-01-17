"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

type Company = {
  id: string;
  company_name: string | null;
  tax_id: string | null;
};

export default function EditCompanyClient({ companyId }: { companyId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");

  async function load() {
    setErr(null);
    setLoading(true);

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("companies")
      .select("id, company_name, tax_id")
      .eq("id", companyId)
      .maybeSingle<Company>();

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setErr("Société introuvable.");
      setLoading(false);
      return;
    }

    setCompanyName(data.company_name ?? "");
    setTaxId(data.tax_id ?? "");
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function save() {
    setErr(null);
    setSaving(true);

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      router.push("/login");
      return;
    }

    if (!companyName.trim()) {
      setErr("Le nom de société est obligatoire.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("companies")
      .update({
        company_name: companyName.trim(),
        tax_id: taxId.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);

    if (error) {
      setErr(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push(`/companies/${companyId}`);
    router.refresh();
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Modifier la société</h2>
        <button
          type="button"
          className="px-3 py-2 rounded-md border text-sm"
          onClick={() => router.back()}
          disabled={saving}
        >
          Retour
        </button>
      </div>

      {err && (
        <div className="text-sm rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-600">Chargement...</div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Nom société</label>
            <input
              className="w-full px-3 py-2 rounded-md border"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ex: Société Sana Com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Matricule fiscale (MF)</label>
            <input
              className="w-full px-3 py-2 rounded-md border"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="Ex: 1304544Z"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-50"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
