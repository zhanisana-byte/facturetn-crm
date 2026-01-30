"use client";

import { useMemo, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

export default function CreateGroupClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [groupName, setGroupName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onCreate() {
    setErr(null);
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setLoading(false);
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

    // ✅ Ensure the creator is also in group_members as OWNER
    // (some pages rely on group_members to compute permissions & listings)
    try {
      await supabase
        .from("group_members")
        .upsert(
          { group_id: data.id, user_id: auth.user.id, role: "owner", is_active: true },
          { onConflict: "group_id,user_id" }
        );
    } catch {
      // ignore (older schemas may not have group_members)
    }

    setLoading(false);
    router.push(`/groups/success?id=${data.id}`);
  }

  return (
    <Card title="Nouveau groupe" subtitle="Ex: Cabinet Hamdi, Holding ABC...">
      <div className="ftn-form">
        <label className="ftn-label">Nom du groupe</label>
        <input
          className="ftn-input"
          placeholder="Ex: Cabinet Hamdi"
          value={groupName}
          onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setGroupName(e.target.value)}
        />

        {err ? <div className="ftn-alert mt-3">{err}</div> : null}

        <div className="mt-5 flex gap-2 flex-wrap">
          <button className="ftn-btn" onClick={onCreate} disabled={loading}>
            {loading ? "Création..." : "Créer"}
          </button>
          <button
            className="ftn-btn-ghost"
            onClick={() => router.push("/groups")}
            type="button"
            disabled={loading}
          >
            Annuler
          </button>
        </div>

        <div className="ftn-muted mt-4">
          ⚠️ Si vous vois une erreur “relation groups does not exist”, ajoute d&apos;abord la table SQL.
        </div>
      </div>
    </Card>
  );
}
