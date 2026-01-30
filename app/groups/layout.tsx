import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * IMPORTANT :
 * Ne PAS rendre <AppShell> ici.
 * /groups/[id]/layout.tsx rend deja <AppShell>, sinon on obtient 2 sidebars.
 */
export default async function GroupsLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  return <>{children}</>;
}
