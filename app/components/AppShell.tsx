"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { AccountType } from "@/app/types";

// ✅ Optionnel: si tu veux importer depuis AppShell ailleurs
export type { AccountType };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

type NavItem = { href: string; label: string; badge?: string };

export default function AppShell({
  title,
  subtitle,
  accountType,
  children,
}: {
  title: string;
  subtitle?: string;
  accountType?: AccountType;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const links = useMemo<NavItem[]>(() => {
    if (accountType === "comptable") {
      return [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/accountant/cabinet", label: "Mon cabinet" },
        { href: "/accountant/clients", label: "Mes clients" },
        { href: "/accountant/invoices", label: "Factures" },
        { href: "/accountant/declaration", label: "Déclaration mensuelle" },
        { href: "/accountant/recurring", label: "Factures permanentes" },
        { href: "/accountant/team", label: "Équipe cabinet" },
        { href: "/invitations", label: "Invitations" },
        { href: "/subscription", label: "Abonnement" },
        { href: "/help", label: "Aide & Support" },
        { href: "/profile", label: "Profil" },
      ];
    }

    if (accountType === "multi_societe") {
      return [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/groups", label: "Groupes" },
        { href: "/companies", label: "Sociétés" },
        { href: "/invoices", label: "Factures" },
        { href: "/recurring", label: "Factures permanentes" },
        { href: "/declaration", label: "Déclaration mensuelle" },
        { href: "/invitations", label: "Invitations" },
        { href: "/ttn", label: "Historique TTN" },
        { href: "/access", label: "Accès & permissions" },
        { href: "/subscription", label: "Abonnement" },
        { href: "/help", label: "Aide & Support" },
        { href: "/profile", label: "Profil" },
      ];
    }

    // ✅ entreprise (par défaut)
    return [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/companies", label: "Ma société" },
      { href: "/invoices", label: "Factures" },
      { href: "/recurring", label: "Factures permanentes" },
      { href: "/declaration", label: "Déclaration mensuelle" },
      { href: "/invitations", label: "Invitations" },
      { href: "/subscription", label: "Abonnement" },
      { href: "/help", label: "Aide & Support" },
      { href: "/profile", label: "Profil" },
    ];
  }, [accountType]);

  async function doLogout() {
    try {
      await fetch("/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="ftn-shell">
      <div className="ftn-app">
        <aside className="ftn-sidebar">
          <div className="ftn-brand">
            <div className="ftn-logo">FT</div>
            <div className="ftn-brand-text">
              <div className="ftn-brand-title">FactureTN</div>
              <div className="ftn-brand-sub">
                Facturation Électronique Tunisienne (TTN)
              </div>
            </div>
          </div>

          <nav className="ftn-nav">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={
                  isActive(pathname, l.href)
                    ? "ftn-nav-item active"
                    : "ftn-nav-item"
                }
              >
                <span>{l.label}</span>
                {l.badge ? <span className="ftn-badge">{l.badge}</span> : null}
              </Link>
            ))}
          </nav>

          <div className="ftn-sidebar-footer">
            <button className="ftn-btn ftn-btn-ghost" onClick={doLogout}>
              Se déconnecter
            </button>
            <div className="ftn-muted ftn-small">
              Accès pour : <strong>{accountType ?? "entreprise"}</strong>
            </div>
          </div>
        </aside>

        <main className="ftn-main">
          <header className="ftn-header">
            <div>
              <h1 className="ftn-title">{title}</h1>
              {subtitle ? <p className="ftn-subtitle">{subtitle}</p> : null}
            </div>
          </header>

          <section className="ftn-content">{children}</section>
        </main>
      </div>
    </div>
  );
}
