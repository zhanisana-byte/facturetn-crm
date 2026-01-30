"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SidebarSignOut({ onAfter }: { onAfter?: () => void }) {
  const router = useRouter();

  const onSignOut = async () => {
    const supabase = createClient();

    // createClient peut retourner null si env manquante
    if (!supabase) {
      onAfter?.();
      router.push("/login");
      return;
    }

    try {
      await supabase.auth.signOut();
    } finally {
      onAfter?.();
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={onSignOut}
      className={[
        "w-full text-left",
        "rounded-lg px-3 py-2",
        "border border-white/10 bg-transparent hover:bg-white/5",
        "transition",
      ].join(" ")}
    >
      Déconnexion
    </button>
  );
}
