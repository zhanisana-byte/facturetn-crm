"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

export default function CreateGroupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [groupName, setGroupName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onCreate() {
    setErr(null);
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      router.push("/login");
      return;
    }

    const name = groupName.trim();
    if (!name) {
      setErr("Nom du groupe obligatoire.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("groups")
      .insert({ group_name: name, owner_user_id: auth.user.id })
      .select("id")
      .single();

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push(`/groups/${data.id}`);
  }

  return (
    <AppShell title="Créer un groupe" subtitle="Espace multi-sociétés (gratuit)" accountType="multi_societe">
      <Card title="Nouveau groupe" subtitle="Ex: Cabinet Hamdi, Holding ABC...">
        <div className="ftn-form">
          <label className="ftn-label">Nom du groupe</label>
          <input className="ftn-input" placeholder="Ex: Cabinet Hamdi" value={groupName} onChange={(e) => setGroupName(e.target.value)} />

          {err ? <div className="ftn-alert mt-3">{err}</div> : null}

          <div className="mt-5 flex gap-2 flex-wrap">
            <button className="ftn-btn" onClick={onCreate} disabled={loading}>
              {loading ? "Création..." : "Créer"}
            </button>
            <button className="ftn-btn-ghost" onClick={() => router.push("/groups")}>
              Annuler
            </button>
          </div>

          <div className="ftn-muted mt-4">
            ⚠️ Si tu vois une erreur “relation groups does not exist”, ajoute d&apos;abord la table SQL.
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
