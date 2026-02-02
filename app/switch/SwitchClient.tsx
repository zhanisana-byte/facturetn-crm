"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Space =
  | {
      id: string;
      label: string;
      role: string;
      kind: "company";
      tax_id?: string;
    }
  | {
      id: string;
      label: string;
      role: string;
      kind: "group" | "cabinet";
    };

type Props = {
  initialSpaces: Space[];
  initialQ: string;
  initialType: "all" | "company" | "group" | "cabinet";
  initialPage: number;
};

function clampPage(p: number) {
  if (!Number.isFinite(p) || p < 1) return 1;
  return Math.floor(p);
}

function includesCI(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function formatSbError(err: any) {
  if (!err) return "Erreur inconnue";
  const parts = [
    err.message,
    err.details ? `Details: ${err.details}` : "",
    err.hint ? `Hint: ${err.hint}` : "",
    err.code ? `Code: ${err.code}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

function uniqBy<T>(arr: T[], key: (v: T) => string) {
  const map = new Map<string, T>();
  for (const item of arr) map.set(key(item), item);
  return Array.from(map.values());
}

function dedupeKey(s: Space) {
  if (s.kind === "company") {
    const mf = ("tax_id" in s ? String(s.tax_id ?? "").trim() : "") || "";
    return mf ? `company:mf:${mf.toLowerCase()}` : `company:id:${s.id}`;
  }
  return `${s.kind}:id:${s.id}`;
}

export default function SwitchClient({ initialSpaces, initialQ, initialType, initialPage }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = useState(initialQ);
  const [type, setType] = useState<Props["initialType"]>(initialType);
  const [page, setPage] = useState(clampPage(initialPage));
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const PAGE_SIZE = 8;

  useEffect(() => {
    const urlQ = (sp.get("q") ?? "").trim();
    const urlType = (sp.get("type") ?? "all") as Props["initialType"];
    const urlPage = clampPage(Number(sp.get("page") ?? "1"));

    if (urlQ !== q) setQ(urlQ);
    if (urlType !== type && ["all", "company", "group", "cabinet"].includes(urlType)) setType(urlType);
    if (urlPage !== page) setPage(urlPage);
    
  }, [sp]);

  useEffect(() => {
    setPage(1);
  }, [q, type]);

  function syncUrl(next: { q?: string; type?: string; page?: number }) {
    const params = new URLSearchParams(sp.toString());

    if (next.q !== undefined) {
      const v = next.q.trim();
      if (v) params.set("q", v);
      else params.delete("q");
    }
    if (next.type !== undefined) {
      const v = next.type;
      if (v && v !== "all") params.set("type", v);
      else params.delete("type");
    }
    if (next.page !== undefined) {
      const v = clampPage(next.page);
      if (v !== 1) params.set("page", String(v));
      else params.delete("page");
    }

    startTransition(() => {
      router.replace(`/switch?${params.toString()}`);
    });
  }

  const filtered = useMemo(() => {
    const qq = q.trim();

    const rows = (initialSpaces ?? []).filter((s) => {
      if (type !== "all" && s.kind !== type) return false;
      if (!qq) return true;

      const text = [s.label ?? "", "tax_id" in s ? s.tax_id ?? "" : "", s.kind].join(" | ");
      return includesCI(text, qq);
    });

    return uniqBy(rows, dedupeKey);
  }, [initialSpaces, q, type]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    if (safePage !== page) {
      setPage(safePage);
      syncUrl({ page: safePage });
    }
    
  }, [safePage]);

  async function ensureAppUserRow() {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const u = auth?.user;
    if (!u) return { ok: false as const, redirect: "/login" };

    const { error } = await supabase.from("app_users").upsert(
      {
        id: u.id,
        email: u.email ?? "",
        full_name: (u.user_metadata as any)?.full_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) return { ok: false as const, error };
    return { ok: true as const, userId: u.id };
  }

  async function activateProfile() {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();

      const boot = await ensureAppUserRow();
      if (!boot.ok) {
        if ((boot as any).redirect) router.push((boot as any).redirect);
        else alert(formatSbError((boot as any).error));
        return;
      }

      const { error } = await supabase.from("user_workspace").upsert(
        {
          user_id: boot.userId,
          active_mode: "profil",
          active_company_id: null,
          active_group_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        alert("Activation Profil impossible:\n" + formatSbError(error));
        console.error(error);
        return;
      }

      router.push("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  async function activateSpace(space: Space) {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();

      const boot = await ensureAppUserRow();
      if (!boot.ok) {
        if ((boot as any).redirect) router.push((boot as any).redirect);
        else alert(formatSbError((boot as any).error));
        return;
      }

      const mode = space.kind === "company" ? "entreprise" : space.kind === "cabinet" ? "cabinet" : "groupe";

      const payload: any = {
        user_id: boot.userId,
        active_mode: mode,
        active_company_id: space.kind === "company" ? space.id : null,
        active_group_id: space.kind === "company" ? null : space.id,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("user_workspace").upsert(payload, { onConflict: "user_id" });

      if (error) {
        alert("Impossible d’activer cet espace:\n" + formatSbError(error));
        console.error(error);
        return;
      }

      if (space.kind === "company") router.push(`/companies/${space.id}`);
      else if (space.kind === "cabinet") router.push(`/accountant/cabinet`);
      else router.push(`/groups/${space.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Switch</h1>
        <p className="text-sm text-slate-500">Choisissez l’espace à ouvrir</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Activer Profil</div>
            <div className="text-sm text-slate-500">Revenir au mode Profil.</div>
          </div>
          <button
            disabled={busy}
            onClick={activateProfile}
            className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            Activer Profil
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white/70 p-5">
        <div className="mb-4">
          <div className="text-base font-semibold">Espaces disponibles</div>
          <div className="text-sm text-slate-500">Recherche + filtre + pagination (URL sync)</div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              syncUrl({ q: v });
            }}
            placeholder="Rechercher (nom, MF, rôle...)"
            className="w-[320px] rounded-lg border border-slate-200 bg-white px-3 py-2"
          />

          <select
            value={type}
            onChange={(e) => {
              const v = e.target.value as Props["initialType"];
              setType(v);
              syncUrl({ type: v });
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <option value="all">Tous</option>
            <option value="company">Sociétés</option>
            <option value="group">Groupes</option>
            <option value="cabinet">Cabinets</option>
          </select>

          <div className="text-sm text-slate-500">
            {busy ? "Activation..." : isPending ? "Mise à jour..." : `${total} résultat(s)`}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left font-medium px-4 py-3">Type</th>
                <th className="text-left font-medium px-4 py-3">Nom</th>
                <th className="text-left font-medium px-4 py-3">Rôle</th>
                <th className="text-right font-medium px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((s) => (
                <tr key={`${s.kind}:${s.id}`} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {s.kind === "company" ? "Société" : s.kind === "cabinet" ? "Cabinet" : "Groupe"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.label}</div>
                    {"tax_id" in s && s.tax_id ? <div className="text-xs text-slate-500">MF: {s.tax_id}</div> : null}
                  </td>
                  <td className="px-4 py-3">{s.role}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={busy}
                      onClick={() => activateSpace(s)}
                      className="rounded-lg border border-slate-200 bg-black px-3 py-1.5 text-white disabled:opacity-60"
                    >
                      Ouvrir
                    </button>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-600">
                    Aucun résultat.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Page {safePage} / {totalPages}
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={safePage <= 1 || busy}
              onClick={() => {
                const p = Math.max(1, safePage - 1);
                setPage(p);
                syncUrl({ page: p });
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-50"
            >
              Précédent
            </button>
            <button
              disabled={safePage >= totalPages || busy}
              onClick={() => {
                const p = Math.min(totalPages, safePage + 1);
                setPage(p);
                syncUrl({ page: p });
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
