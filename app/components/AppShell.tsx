// app/components/AppShell.tsx
import type { ReactNode } from "react";
import AppShellClient from "@/app/components/AppShellClient";
import type { AccountType } from "@/app/types";

export type ForcedArea = "profil" | "companies" | "groups" | "accountant" | "pdg";

export default function AppShell({
  children,
  title,
  subtitle,
  activeCompanyId,
  activeGroupId,
  accountType,
  isPdg,
  forcedArea, // ✅ NEW
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  activeCompanyId?: string | null;
  activeGroupId?: string | null;
  accountType?: AccountType;
  isPdg?: boolean;
  forcedArea?: ForcedArea; // ✅ NEW
}) {
  return (
    <AppShellClient
      title={title}
      subtitle={subtitle}
      activeCompanyId={activeCompanyId}
      activeGroupId={activeGroupId}
      accountType={accountType}
      isPdg={isPdg}
      forcedArea={forcedArea} // ✅ NEW
    >
      {children}
    </AppShellClient>
  );
}
