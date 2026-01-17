"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

type Row = {
  id: string;
  company_name?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function fmt(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("fr-FR");
}

/**
 * Retourne une classe CSS (compatible avec ton design ftn-pill)
 * - is-ok / is-warn / is-bad
 */
function badgeClassFromStatus(status?: string | null) {
  const s = String(status || "").toLowerCase();

  // ✅ Validé / OK
  if (s.includes("valid") || s === "ok" || s === "sent" || s === "approved") {
    return "is-ok";
  }

  // ❌ Expiré / Erreur / Refus
  if (
    s.includes("exp") ||
    s.includes("error") ||
    s.includes("refus") ||
    s.includes("reject") ||
    s.includes("bad")
  ) {
    return "is-bad";
  }

  // ⚠️ En attente / Suspended / Trial / Autres
  if (s.includes("susp") || s.includes("pending") || s.includes("trial")) {
    return "is-warn";
  }

  return "is-warn";
}

export default function ValidationClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setLoading(false);
      router.push("/login");
      return;
    }

    // NOTE: adapte selon ton schéma si tu as une table dédiée "cabinet_validations"
    const { data, error } = await supabase
      .from("companies")
      .select("id, company_name, created_at, status")
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onValidate(companyId: string) {
    setErr(null);

    const { error } = await supabase
      .from("companies")
      .update({ status: "validated" })
      .eq("id", companyId);

    if (error) {
      setErr(error.message);
      return;
    }

    await load();
  }

  return (
    <Card title="Demandes de validation" subtitle="Liste des sociétés à valider">
      {err ? <div className="ftn-alert mb-4">{err}</div> : null}

      {loading ? (
        <div className="ftn-muted">Chargement...</div>
      ) : rows.length === 0 ? (
        <div className="ftn-muted">Aucune demande.</div>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-[rgba(148,163,184,.22)] bg-white/60 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    {r.company_name || "Société"}
                  </div>
                  <div className="ftn-muted text-xs mt-1">
                    Créée le {fmt(r.created_at)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* ✅ FIX VERCEL: Badge accepte seulement children => on utilise span */}
                  <span className={"ftn-pill " + badgeClassFromStatus(r.status)}>
                    {r.status || "pending"}
                  </span>

                  <button className="ftn-btn" onClick={() => onValidate(r.id)}>
                    Valider
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
