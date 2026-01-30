"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import Sidebar from "./shell/Sidebar";
import { getSidebarItems } from "./shell/sidebarConfig";
import type { AccountType } from "@/app/types";
import { useShellState } from "./shell/useShellState";

/**
 * Normalise les valeurs possibles venant du backend / URL / legacy
 * vers un AccountType strict.
 */
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
  const pathname = usePathname() ?? "/";

  /* =====================================================
   * Mobile sidebar state
   * ===================================================== */
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  /* =====================================================
   * Account type sécurisé (fallback) + FORCAGE par area
   * ===================================================== */
  const safeAccountType: AccountType = useMemo(() => {
    // ✅ Priorité au forcedArea
    if (forcedArea === "pdg") return "profil"; // PDG est géré via isPdg
    if (forcedArea === "accountant") return "comptable";
    if (forcedArea === "companies") return "entreprise";
    if (forcedArea === "groups") return "multi_societe";
    if (forcedArea === "profil") return "profil";

    // ✅ Sinon normalisation depuis accountType
    return normalizeAccountType(accountType);
  }, [forcedArea, accountType]);

  /* =====================================================
   * Shell state (persisté : société / groupe)
   * ===================================================== */
  const shell = useShellState({
    accountType: safeAccountType,
    activeCompanyId: forcedCompanyId ?? null,
    activeGroupId: forcedGroupId ?? null,
  });

  const activeCompanyId = forcedCompanyId ?? shell.state.activeCompanyId;
  const activeGroupId = forcedGroupId ?? shell.state.activeGroupId;

  /* =====================================================
   * Sidebar items
   * ===================================================== */
  const items = useMemo(() => {
    return getSidebarItems({
      accountType: safeAccountType,
      pathname,
      activeCompanyId,
      activeGroupId,
      isPdg,
    });
  }, [safeAccountType, pathname, activeCompanyId, activeGroupId, isPdg]);

  /* =====================================================
   * Render
   * ===================================================== */
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

      {/* Overlay mobile */}
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
