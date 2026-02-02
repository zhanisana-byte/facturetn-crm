"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import Sidebar from "./shell/Sidebar";
import { getSidebarItems } from "./shell/sidebarConfig";
import type { AccountType } from "@/app/types";
import { useShellState } from "./shell/useShellState";

function normalizeAccountType(v: unknown): AccountType {
  const s = String(v ?? "").toLowerCase().trim();

  if (s === "profil" || s === "pro" || s === "profile") return "profil";
  if (s === "comptable" || s === "cabinet" || s === "accountant") return "comptable";
  if (
    s === "entreprise" ||
    s === "societe" ||
    s === "société" ||
    s === "company" ||
    s === "client"
  )
    return "entreprise";
  if (
    s === "multi_societe" ||
    s === "multi-societe" ||
    s === "multi_société" ||
    s === "groupe" ||
    s === "group"
  )
    return "multi_societe";

  return "profil";
}

type ForcedArea = "profil" | "companies" | "groups" | "accountant" | "pdg";

export default function AppShellClient({
  children,
  title,
  subtitle,
  activeCompanyId: forcedCompanyId,
  activeGroupId: forcedGroupId,
  accountType,
  isPdg,
  forcedArea, 
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  activeCompanyId?: string | null;
  activeGroupId?: string | null;
  accountType?: AccountType;
  isPdg?: boolean;
  forcedArea?: ForcedArea; 
}) {
  const pathname = usePathname() ?? "/";

  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  const safeAccountType: AccountType = useMemo(() => {
    
    if (forcedArea === "pdg") return "profil"; 
    if (forcedArea === "accountant") return "comptable";
    if (forcedArea === "companies") return "entreprise";
    if (forcedArea === "groups") return "multi_societe";
    if (forcedArea === "profil") return "profil";

    return normalizeAccountType(accountType);
  }, [forcedArea, accountType]);

  const shell = useShellState({
    accountType: safeAccountType,
    activeCompanyId: forcedCompanyId ?? null,
    activeGroupId: forcedGroupId ?? null,
  });

  const activeCompanyId = forcedCompanyId ?? shell.state.activeCompanyId;
  const activeGroupId = forcedGroupId ?? shell.state.activeGroupId;

  const items = useMemo(() => {
    return getSidebarItems({
      accountType: safeAccountType,
      pathname,
      activeCompanyId,
      activeGroupId,
      isPdg,
    });
  }, [safeAccountType, pathname, activeCompanyId, activeGroupId, isPdg]);

  return (
    <div className="ftn-shell">
      <div className="ftn-app">
        <Sidebar
          items={items}
          pathname={pathname}
          mobileOpen={mobileOpen}
          onCloseMobile={closeMobile}
        />

        <main className="ftn-main">
          {(title || subtitle) && (
            <header className="ftn-header">
              {title ? <div className="ftn-title">{title}</div> : null}
              {subtitle ? <div className="ftn-subtitle">{subtitle}</div> : null}
            </header>
          )}

          <div className="ftn-content">{children}</div>
        </main>
      </div>

      {}
      {mobileOpen ? (
        <button
          className="ftn-overlay"
          aria-label="Fermer le menu"
          onClick={closeMobile}
        />
      ) : null}
    </div>
  );
}
