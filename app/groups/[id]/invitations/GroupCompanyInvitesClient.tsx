"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CompanyRow = { id: string; company_name: string; tax_id: string | null };
type Scope = "none" | "all" | "selected";
type UiRole = "owner" | "admin" | "staff";

export default function CreateGroupInvitationForm({
  groupId,
  onCreated,
}: {
  groupId: string;
  onCreated?: () => void;
}) {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UiRole>("admin");
  const [scope, setScope] = useState<Scope>("all");

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("group_companies")
        .select("company_id, companies(id,company_name,tax_id)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      const rows =
        (data ?? []).map((x: any) => ({
          id: String(x?.companies?.id ?? x?.company_id),
          company_name: String(x?.companies?.company_name ?? "Société"),
          tax_id: x?.companies?.tax_id ?? null,
        })) ?? [];

      setCompanies(rows);
    })();

    return () => {
      mounted = false;
    };
  }, [groupId, supabase]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  async function submit() {
    setLoading(true);
    setLink(null);
    try {
      const invited_email = email.trim().toLowerCase();
      if (!invited_email || !invited_email.includes("@")) {
        alert("Email invalide");
        return;
      }
      if (scope === "selected" && selectedIds.length === 0) {
        alert("Sélectionne au moins une société (ou choisis 'Toutes').");
        return;
      }

      const objectivePayload = {
        note: note?.trim() || null,
        manage_companies_scope: scope,
        manage_company_ids: scope === "selected" ? selectedIds : [],
      };

      const res = await fetch("/api/group-invitations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          invited_email,
          role,
          objective: JSON.stringify(objectivePayload),
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j?.error || "Erreur création invitation");
        return;
      }

      setLink(j?.inviteLink || null);
      setEmail("");
      setNote("");
      setScope("all");
      setSelected({});
      onCreated?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="ftn-label">Email du profil</label>
        <input className="ftn-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@domaine.com" />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="ftn-label">Rôle (gestion page Groupe)</label>
          <select className="ftn-input" value={role} onChange={(e) => setRole(e.target.value as UiRole)}>
            <option value="owner">Owner (équivalent Admin)</option>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
          </select>
        </div>

        <div>
          <label className="ftn-label">Gestion des sociétés liées</label>
          <select className="ftn-input" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="none">Aucune</option>
            <option value="all">Toutes les sociétés du groupe</option>
            <option value="selected">Par sélection</option>
          </select>
        </div>
      </div>

      {scope === "selected" ? (
        <div className="rounded-2xl border p-3" style={{ borderColor: "rgba(148,163,184,.24)" }}>
          <div className="text-sm font-semibold mb-2">Sélection des sociétés</div>
          {companies.length === 0 ? (
            <div className="text-sm opacity-80">Aucune société liée au groupe.</div>
          ) : (
            <div className="grid gap-2">
              {companies.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!selected[c.id]}
                    onChange={(e) => setSelected((p) => ({ ...p, [c.id]: e.target.checked }))}
                  />
                  <span className="font-semibold">{c.company_name}</span>
                  <span className="opacity-70">({c.tax_id || "MF —"})</span>
                </label>
              ))}
            </div>
          )}
          <div className="mt-2 text-xs opacity-70">Sélectionnées: {selectedIds.length}</div>
        </div>
      ) : null}

      <div>
        <label className="ftn-label">Note (optionnelle)</label>
        <input className="ftn-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: gestion factures + TTN" />
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="ftn-btn" disabled={loading} onClick={submit}>
          {loading ? "Création..." : "Inviter"}
        </button>
        {link ? (
          <a className="ftn-link" href={link} target="_blank" rel="noreferrer">
            Ouvrir le lien d’invitation
          </a>
        ) : null}
      </div>
    </div>
  );
}
