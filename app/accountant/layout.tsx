
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AccountantLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  return <AppShell forcedArea="accountant">{children}</AppShell>;
}
