"use client";

import { useEffect, useMemo, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

type Company = {
  id: string;
  company_name: string | null;
};

export default function AddCompanyToGroupClient({ groupId }: { groupId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string>(""); // YYYY-MM-DD (externes uniquement)

  async function load() {
    setErr(null);
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setLoading(false);
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("companies")
      .select("id, company_name")
      .order("company_name", { ascending: true });

    if (error) {
      setErr(error.message);
      setCompanies([]);
      setLoading(false);
      return;
    }

    setCompanies((data ?? []) as Company[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function onAdd() {
    setErr(null);
    setSaving(true);

    if (!companyId) {
      setErr("Choisir une société.");
      setSaving(false);
      return;
    }

    // NOTE: adapte selon votre schéma si le nom de table diffère
    const endsAtIso = subscriptionEnd ? new Date(`${subscriptionEnd}T00:00:00.000Z`).toISOString() : null;
    const { error } = await supabase
      .from("group_companies")
      .insert({ group_id: groupId, company_id: companyId, link_type: "external", subscription_ends_at: endsAtIso });

    if (error) {
      setErr(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push(`/groups/${groupId}`);
  }

  return (
    <Card title="Ajouter une société externe" subtitle="Lier une société existante (externe) au groupe + date fin d’abonnement (optionnel)">
      {err ? <div className="ftn-alert mb-4">{err}</div> : null}

      {loading ? (
        <div className="ftn-muted">Chargement...</div>
      ) : (
        <div className="ftn-form">
          <label className="ftn-label">Société</label>
          <select
            className="ftn-input"
            value={companyId}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setCompanyId(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name || c.id}
              </option>
            ))}
          </select>

          <label className="ftn-label mt-4">Date fin abonnement (externe)</label>
          <input
            type="date"
            className="ftn-input"
            value={subscriptionEnd}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSubscriptionEnd(e.target.value)}
          />

          <div className="mt-5 flex gap-2 flex-wrap">
            <button className="ftn-btn" onClick={onAdd} disabled={saving}>
              {saving ? "Ajout..." : "Ajouter"}
            </button>

            <Link href={`/groups/${groupId}`} className="ftn-btn-ghost">
              Annuler
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
