"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AcceptClient({ token }: { token: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("Traitement...");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setStatus("loading");
      setMessage("Vérification de la session...");

      const { data: auth } = await supabase.auth.getUser();

      if (!auth?.user) {
        const next = `/access/accept/${token}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      setMessage("Acceptation de l’invitation...");

      const { error } = await supabase.rpc("accept_access_invitation", {
        p_token: token
      });

      if (cancelled) return;

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("ok");
      setMessage("Invitation acceptée ✅ Redirection...");
      router.replace("/invitations?accepted=1");
      router.refresh();
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router, supabase, token]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-lg rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">
          {status === "loading"
            ? "Traitement..."
            : status === "ok"
            ? "Succès"
            : "Erreur"}
        </h1>

        <p className="mt-2 text-sm text-gray-700">{message}</p>

        {status === "error" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              className="rounded-xl border bg-white px-4 py-2 text-sm hover:bg-gray-50"
              href="/invitations"
            >
              Mes invitations
            </Link>
            <Link
              className="rounded-xl border bg-white px-4 py-2 text-sm hover:bg-gray-50"
              href="/dashboard"
            >
              Tableau de bord
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
