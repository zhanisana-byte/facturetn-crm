import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params?: Promise<{ id: string }>;
}) {
  const p = (await params) ?? ({ id: "" } as any);
  const id = String((p as any).id || "");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  return (
    <AppShell title="Groupe" subtitle="Espace Groupe" activeGroupId={id} accountType="multi_societe">
      {children}
    </AppShell>
  );
}
