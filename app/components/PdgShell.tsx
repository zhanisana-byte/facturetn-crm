"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

type NavItem = { href: string; label: string; badge?: string };

export default function PdgShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const links: NavItem[] = [
    { href: "/pdg", label: "Dashboard", badge: "PDG" },
    { href: "/pdg/users", label: "Utilisateurs" },
    { href: "/pdg/subscriptions", label: "Abonnements (Users)" },
    { href: "/pdg/groups", label: "Abonnements (Groupes)" },
    { href: "/pdg/accountants", label: "Comptables" },
    { href: "/pdg/support", label: "Support" },
    { href: "/dashboard", label: "Retour CRM" },
  ];

  async function doLogout() {
    try {
      await fetch("/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  return (
    <div className="ftn-app">
      <aside className="ftn-sidebar">
        <div className="ftn-brand">
          <div className="ftn-logo">FT</div>
          <div className="ftn-brand-text">
            <div className="ftn-brand-title">FactureTN</div>
            <div className="ftn-brand-sub">Espace PDG (Plateforme)</div>
          </div>
        </div>

        <nav className="ftn-nav">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={isActive(pathname, l.href) ? "ftn-nav-item active" : "ftn-nav-item"}
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
            Mode : <strong>PDG</strong>
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
  );
}
