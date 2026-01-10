"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type AccountType = "client" | "cabinet" | "groupe";

function cn(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

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
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // ✅ FIX BUG: si on est dans /accountant/* on force cabinet (évite le switch client/comptable)
  const effectiveType: AccountType =
    accountType ?? (pathname.startsWith("/accountant") ? "cabinet" : "client");

  const links = useMemo<NavItem[]>(() => {
    if (effectiveType === "cabinet") {
      return [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/accountant/cabinet", label: "Mon cabinet" },
        { href: "/accountant/profile", label: "Profil comptable" },
        { href: "/accountant/clients", label: "Mes clients" },
        { href: "/accountant/invoices", label: "Factures" },
        // ✅ évite mot "Accès"
        { href: "/recap", label: "Récap" },
        { href: "/help", label: "Support" },
      ];
    }

    if (effectiveType === "groupe") {
      return [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/companies", label: "Mes sociétés" },
        { href: "/invoices", label: "Factures" },
        { href: "/ttn", label: "TTN" },
        { href: "/recap", label: "Récap" },
        { href: "/help", label: "Support" },
      ];
    }

    // client
    return [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/companies", label: "Ma société" },
      { href: "/customers", label: "Clients" },
      { href: "/invoices", label: "Factures" },
      { href: "/ttn", label: "TTN" },
      { href: "/recap", label: "Récap" },
      { href: "/help", label: "Support" },
    ];
  }, [effectiveType]);

  return (
    <div className="ftn-shell">
      <div className="ftn-app">
        {/* ✅ MOBILE TOPBAR */}
        <div className="ftn-topbar">
          <button
            type="button"
            className="ftn-burger"
            aria-label="Ouvrir le menu"
            onClick={() => setOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>

          <Link href="/dashboard" className="ftn-topbrand">
            <span className="ftn-toplogo">FT</span>
            <span className="ftn-toptxt">FactureTN</span>
          </Link>

          <div className="ftn-topspacer" />
        </div>

        {/* ✅ DESKTOP SIDEBAR */}
        <aside className="ftn-sidebar ftn-sidebar-desktop">
          <div className="ftn-brand">
            <div className="ftn-logo">FT</div>
            <div>
              <div className="ftn-brand-title">FactureTN</div>
              <div className="ftn-brand-sub">
                {effectiveType === "cabinet"
                  ? "Cabinet"
                  : effectiveType === "groupe"
                  ? "Multi-sociétés"
                  : "Client"}
              </div>
            </div>
          </div>

          <nav className="ftn-nav">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn("ftn-nav-item", isActive(pathname, l.href) && "active")}
              >
                <span>{l.label}</span>
                {l.badge ? <span className="ftn-badge">{l.badge}</span> : null}
              </Link>
            ))}
          </nav>

          <div className="ftn-sidebar-footer">
            <div className="ftn-small" style={{ opacity: 0.8 }}>
              TTN • PDF/XML • CRM
            </div>
          </div>
        </aside>

        {/* ✅ MOBILE DRAWER SIDEBAR */}
        <div className={cn("ftn-drawer", open && "open")} role="dialog" aria-modal="true">
          <div className="ftn-drawer-backdrop" onClick={() => setOpen(false)} />
          <aside className="ftn-drawer-panel">
            <div className="ftn-drawer-head">
              <div className="ftn-brand" style={{ margin: 0, borderBottom: "none" }}>
                <div className="ftn-logo">FT</div>
                <div>
                  <div className="ftn-brand-title">FactureTN</div>
                  <div className="ftn-brand-sub">
                    {effectiveType === "cabinet"
                      ? "Cabinet"
                      : effectiveType === "groupe"
                      ? "Multi-sociétés"
                      : "Client"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="ftn-drawer-close"
                aria-label="Fermer"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <nav className="ftn-nav" style={{ padding: 10 }}>
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn("ftn-nav-item", isActive(pathname, l.href) && "active")}
                >
                  <span>{l.label}</span>
                  {l.badge ? <span className="ftn-badge">{l.badge}</span> : null}
                </Link>
              ))}
            </nav>
          </aside>
        </div>

        {/* MAIN */}
        <main className="ftn-main">
          <div className="ftn-header">
            <div className="ftn-title">{title}</div>
            {subtitle ? <div className="ftn-subtitle">{subtitle}</div> : null}
          </div>
          <div className="ftn-content">{children}</div>
        </main>
      </div>

      {/* ✅ CSS LOCAL (drawer + topbar) */}
      <style jsx>{`
        .ftn-topbar {
          display: none;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(148, 163, 184, 0.22);
          box-shadow: 0 18px 55px rgba(2, 6, 23, 0.08);
          margin: 0 0 12px 0;
          backdrop-filter: blur(10px);
        }

        .ftn-burger {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(15, 23, 42, 0.92);
          display: grid;
          place-items: center;
          box-shadow: 0 10px 25px rgba(2, 6, 23, 0.18);
        }
        .ftn-burger span {
          display: block;
          width: 18px;
          height: 2px;
          background: rgba(255, 255, 255, 0.92);
          border-radius: 2px;
          margin: 2px 0;
        }

        .ftn-topbrand {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: rgba(15, 23, 42, 0.92);
          font-weight: 900;
        }
        .ftn-toplogo {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: rgba(15, 23, 42, 0.92);
          color: #fff;
          font-weight: 900;
        }
        .ftn-toptxt {
          font-size: 14px;
          letter-spacing: -0.01em;
        }
        .ftn-topspacer {
          flex: 1;
        }

        .ftn-drawer {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: none;
        }
        .ftn-drawer.open {
          display: block;
        }
        .ftn-drawer-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(2, 6, 23, 0.55);
          backdrop-filter: blur(2px);
        }
        .ftn-drawer-panel {
          position: absolute;
          top: 10px;
          left: 10px;
          bottom: 10px;
          width: min(360px, calc(100% - 20px));
          border-radius: 26px;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.96));
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 30px 90px rgba(2, 6, 23, 0.35);
          overflow: hidden;
          color: #fff;
          animation: ftnIn 0.18s ease-out both;
        }
        @keyframes ftnIn {
          from {
            transform: translateX(-6px);
            opacity: 0.6;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .ftn-drawer-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 14px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .ftn-drawer-close {
          width: 40px;
          height: 40px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.92);
          font-weight: 900;
        }

        /* ✅ Responsive behavior */
        @media (max-width: 1024px) {
          .ftn-topbar {
            display: flex;
          }
          .ftn-sidebar-desktop {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
