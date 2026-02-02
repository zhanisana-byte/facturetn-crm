import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import AppShell from "@/app/components/AppShell";
import { getAuthUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function ProfileLayout({ children }: { children: ReactNode }) {
  const { user } = await getAuthUser();
  if (!user?.id) redirect("/login");

  return (
    <AppShell title="Profil" subtitle="Espace Profil (facturation)">
      {children}
    </AppShell>
  );
}
