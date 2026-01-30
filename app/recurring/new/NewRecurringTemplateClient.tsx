"use client";

import { useMemo, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string };

export default function NewRecurringTemplateClient({
  companies,
}: {
  companies: Company[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const [companyId, setCompanyId] = useState<string>(companies?.[0]?.id ?? "");
  const [title, setTitle] = useState<string>("");
  const [currency, setCurrency] = useState<string>("TND");
  const [dayOfMonth, setDayOfMonth] = useState<string>("1");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setSaving(true);

    if (!supabase) {
      setErr(
        "Configuration Supabase manquante. Vérifiez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
      setSaving(false);
      return;
    }

    const { data: s } = await supabase.auth.getSession();
    if (!s.session?.user) {
      router.push("/login");
      return;
    }

    if (!companyId) {
      setErr("Sélectionne une société.");
      setSaving(false);
      return;
    }

    if (!title.trim()) {
      setErr("Titre requis.");
      setSaving(false);
      return;
    }

    const r = await fetch("/api/recurring/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: companyId,
        title: title.trim(),
        currency: currency.trim() || "TND",
        cadence: "monthly",
        day_of_month: Number(dayOfMonth || 1),
      }),
    }).catch(() => null);

    if (!r || !r.ok) {
      const j = await r?.json().catch(() => ({} as any));
      setErr(j?.error || "Erreur lors de la création de la facture permanente.");
      setSaving(false);
      return;
    }

    const j = await r.json().catch(() => null);
    const id = String(j?.id || "");
    if (!id) {
      setErr("Création OK, mais id introuvable.");
      setSaving(false);
      return;
    }

    router.push(`/recurring/${id}`);
  }

  return (
    <div className="ftn-card">
      <div className="text-lg font-semibold">Créer une facture permanente</div>
      <div className="text-sm text-slate-600 mt-1">
        Cette facture permanente sera générée automatiquement selon la cadence choisie.
      </div>

      {err ? <div className="ftn-alert mt-4">{err}</div> : null}

      <div className="mt-4 grid gap-3 max-w-xl">
        <label className="block">
          <div className="text-sm font-medium">Société</div>
          <select
            className="ftn-input"
            value={companyId}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setCompanyId(e.target.value)}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <div className="text-sm font-medium">Titre</div>
          <input
            className="ftn-input"
            value={title}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setTitle(e.target.value)}
            placeholder="Ex: Abonnement mensuel"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-sm font-medium">Devise</div>
            <input
              className="ftn-input"
              value={currency}
              onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setCurrency(e.target.value)}
              placeholder="TND"
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium">Jour du mois</div>
            <input
              className="ftn-input"
              type="number"
              min={1}
              max={28}
              value={dayOfMonth}
              onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDayOfMonth(e.target.value)}
            />
            <div className="text-xs text-slate-500 mt-1">1 à 28 (recommandé)</div>
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <button className="ftn-btn" type="button" onClick={submit} disabled={saving}>
            {saving ? "Création…" : "Créer"}
          </button>
          <button
            className="ftn-btn ftn-btn-ghost"
            type="button"
            onClick={() => router.push("/recurring")}
            disabled={saving}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
