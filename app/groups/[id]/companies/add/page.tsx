"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { Card, Badge, Table } from "@/components/ui";

export default function AddCompanyToGroupPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const supabase = createClient();

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inviteLink = useMemo(() => {
    const email = encodeURIComponent(q.trim());
    return `/register?group=${encodeURIComponent(groupId)}${email ? `&email=${email}` : ""}`;
  }, [groupId, q]);

  async function onSearch() {
    setErr(null);
    setInfo(null);
    setLoading(true);

    const term = q.trim();
    if (!term) {
      setErr("Tape MF ou email.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("companies")
      .select("id,company_name,tax_id,email")
      .or(`tax_id.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(20);

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    if ((data?.length ?? 0) === 0) {
      setInfo("Aucune société trouvée. Invite le client à s'inscrire (ou crée la société dans le groupe).");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(data ?? []);
    setLoading(false);
  }

  async function onAdd(companyId: string) {
    setErr(null);
    setInfo(null);
    setLoading(true);

    const { error } = await supabase.from("group_companies").insert({ group_id: groupId, company_id: companyId });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push(`/groups/${groupId}`);
  }

  return (
    <AppShell title="Ajouter une société" subtitle="Recherche une société existante (abonnement géré au niveau du groupe)" accountType="multi_societe">
      <Card title="Rechercher société" subtitle="Recherche par MF (tax_id) ou email société">
        <div className="ftn-form">
          <label className="ftn-label">MF ou Email</label>
          <div className="flex gap-2 flex-wrap">
            <input className="ftn-input flex-1 min-w-[220px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex: 1234567/A ou client@mail.tn" />
            <button className="ftn-btn" onClick={onSearch} disabled={loading}>
              {loading ? "Recherche..." : "Rechercher"}
            </button>
            <button className="ftn-btn-ghost" onClick={() => router.push(`/groups/${groupId}`)}>
              Retour
            </button>
          </div>

          {err ? <div className="ftn-alert mt-4">{err}</div> : null}
          {info ? <div className="ftn-ok mt-4">{info}</div> : null}

          <div className="mt-5">
            {rows.length > 0 ? (
              <Table head={<tr><th>Société</th><th>MF</th><th>Email</th><th></th></tr>}>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.company_name}</td>
                    <td>{r.tax_id}</td>
                    <td>{r.email ?? "—"}</td>
                    <td className="text-right">
                      <button className="ftn-btn-ghost" onClick={() => onAdd(r.id)} disabled={loading}>
                        Ajouter au groupe
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : null}
          </div>

          <div className="mt-6 p-4 rounded-2xl border bg-white/70">
            <div className="font-semibold">Client pas encore inscrit ?</div>
            <div className="ftn-muted mt-1">
              Envoie-lui ce lien d&apos;inscription (avec le groupe pré-rempli). Après inscription, tu pourras l&apos;ajouter.
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Badge>Link</Badge>
              <code className="ftn-code">{inviteLink}</code>
            </div>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
