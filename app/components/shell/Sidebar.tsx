"use client";

import Link from "next/link";
import type { SidebarItem } from "./types";
import SidebarSignOut from "./SidebarSignOut";

function Icon({ name }: { name?: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  } as const;

  switch (name) {
    case "dashboard":
      return (
        <svg {...common} aria-hidden>
          <path
            d="M4 13h7V4H4v9Zm9 7h7V11h-7v9ZM4 20h7v-5H4v5Zm9-18v7h7V2h-7Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      );

    case "settings":
      return (
        <svg {...common} aria-hidden>
          <path
            d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M19.4 15a8.2 8.2 0 0 0 .1-1l2-1.2-2-3.4-2.3.6a7.8 7.8 0 0 0-1.7-1L15 6h-6l-.5 3a7.8 7.8 0 0 0-1.7 1L4.5 9.4l-2 3.4 2 1.2a8.2 8.2 0 0 0 .1 1 8.2 8.2 0 0 0-.1 1l-2 1.2 2 3.4 2.3-.6a7.8 7.8 0 0 0 1.7 1L9 22h6l.5-3a7.8 7.8 0 0 0 1.7-1l2.3.6 2-3.4-2-1.2c.1-.33.1-.66.1-1Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "create":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    case "entities":
    case "companies":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    case "invitations":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 7h16v10H4V7Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="m4 8 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );

    case "invoices":
      return (
        <svg {...common} aria-hidden>
          <path
            d="M7 3h10v18l-2-1-2 1-2-1-2 1-2-1-2 1V3Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    case "recurring":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 12a9 9 0 0 1 15.5-6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M21 12a9 9 0 0 1-15.5 6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18 3v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 21v-4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case "declarations":
      return (
        <svg {...common} aria-hidden>
          <path d="M7 3h10v18H7V3Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9 7h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    case "help":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 18h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path
            d="M9.1 9a3 3 0 1 1 4.9 2.3c-.9.7-2 1.2-2 2.7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path d="M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0Z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );

    case "team":
      return (
        <svg {...common} aria-hidden>
          <path d="M16 11a4 4 0 1 0-8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M3 21a7 7 0 0 1 18 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );

    case "subscription":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 6h16v12H4V6Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 10h12M6 14h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    case "ttn":
      return (
        <svg {...common} aria-hidden>
          <path
            d="M12 2l3 7h7l-5.5 4 2.2 7L12 16.8 5.3 20l2.2-7L2 9h7l3-7Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "clients":
      return (
        <svg {...common} aria-hidden>
          <path d="M16 11c1.7 0 3-1.6 3-3.5S17.7 4 16 4s-3 1.6-3 3.5S14.3 11 16 11Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 11c1.7 0 3-1.6 3-3.5S9.7 4 8 4 5 5.6 5 7.5 6.3 11 8 11Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M2 21c.5-3 3-5 6-5s5.5 2 6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M14 16c2.6 0 4.8 1.4 5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    case "cabinet":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 21V8l8-4 8 4v13H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9 21v-8h6v8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );

    case "company":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 21V5a2 2 0 0 1 2-2h8l6 6v12H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M14 3v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M7 13h10M7 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    case "switch":
      return (
        <svg {...common} aria-hidden>
          <path d="M7 7h11l-2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17 17H6l2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 7v6M6 17v-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );

    default:
      return (
        <svg {...common} aria-hidden>
          <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
  }
}

export default function Sidebar({
  items,
  pathname,
  mobileOpen,
  onCloseMobile,
}: {
  items: SidebarItem[];
  pathname: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const isActive = (href: string, exact?: boolean) => {
    if (!href) return false;
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen ? (
        <button className="ftn-overlay" aria-label="Fermer le menu" onClick={onCloseMobile} />
      ) : null}

      <aside className={`ftn-sidebar ${mobileOpen ? "ftn-sidebar-open" : ""}`}>
        <div className="ftn-brand">
          <div className="ftn-logo" />
          <div>
            <div className="ftn-brand-title">FactureTN</div>
            <div className="ftn-brand-sub">CRM</div>
          </div>
        </div>

        {/* NAV premium */}
        <nav className="ftn-nav">
          {items.map((it) => {
            if (it.kind === "divider") return <div key={it.key} className="my-3 h-px bg-white/10" />;
            if (it.kind === "title")
              return (
                <div key={it.key} className="mt-3 mb-2 text-xs uppercase tracking-wider text-white/60 px-2">
                  {it.label}
                </div>
              );

            const active = isActive(it.href, it.exact);

            return (
              <Link
                key={it.key}
                href={it.href}
                onClick={onCloseMobile}
                className={["ftn-nav-item", active ? "ftn-nav-item-active" : ""].join(" ")}
              >
                <span className="ftn-nav-left">
                  <span className="ftn-nav-ic" aria-hidden>
                    <Icon name={it.icon} />
                  </span>
                  <span className="ftn-nav-label truncate">{it.label}</span>
                </span>

                {it.badge ? <span className="ftn-nav-badge">{it.badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="ftn-sidebar-footer mt-6 pt-4 border-t border-white/10">
          <div className="mb-2">
            <SidebarSignOut onAfter={onCloseMobile} />
          </div>
          <div className="text-xs text-white/60">© FactureTN</div>
        </div>
      </aside>
    </>
  );
}
