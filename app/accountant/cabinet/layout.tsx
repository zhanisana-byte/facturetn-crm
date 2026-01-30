// app/accountant/cabinet/layout.tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspaceRow } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AccountantCabinetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type")
    .eq("id", auth.user.id)
    .maybeSingle();

  const t = String(profile?.account_type ?? "").toLowerCase().trim();
  const normalized = t === "cabinet" ? "comptable" : t;

  // Autoriser profil + comptable
  if (!["profil", "comptable"].includes(normalized)) {
    redirect("/switch");
  }

  // garde la stabilisation workspace
  await ensureWorkspaceRow(supabase, auth.user.id);

  // IMPORTANT: pas de AppShell ici (sinon double sidebar)
  return <>{children}</>;
}
