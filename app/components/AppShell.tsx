"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { getSidebarItems } from "./shell/sidebarConfig";
import type { AccountType } from "@/app/types";
import type { ActivePage } from "./shell/sidebarConfig";

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function parseCompanyId(pathname: string): string | null {
  const m = pathname.match(/^\/companies\/([^\/?#]+)/);
  const id = m?.[1] ?? null;
  if (!id) return null;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  return isUuid ? id : null;
}

function parseGroupId(pathname: string): string | null {
  const m = pathname.match(/^\/groups\/([^\/?#]+)/);
  const id = m?.[1] ?? null;
  if (!id) return null;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  return isUuid ? id : null;
}

export default function AppShellClient(props: {
  children: React.ReactNode;
  accountType: AccountType;
  activeCompanyId?: string | null;
  activeGroupId?: string | null;
  hasPagesToSwitch?: boolean;
  title?: string;
  subtitle?: string;
  isPdg?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const hasPagesToSwitch = props.hasPagesToSwitch ?? true;

  const urlCompanyId = parseCompanyId(pathname);
  const urlGroupId = parseGroupId(pathname);

  const forcedAccountType: AccountType = useMemo(() => {
    if (pathname.startsWith("/accountant")) return "comptable";
    if (urlCompanyId) return "entreprise";
    if (urlGroupId) return "multi_societe";
    return props.accountType ?? "profil";
  }, [pathname, urlCompanyId, urlGroupId, props.accountType]);

  const forcedActiveCompanyId = urlCompanyId ?? props.activeCompanyId ?? null;
  const forcedActiveGroupId = urlGroupId ?? props.activeGroupId ?? null;

  const forcedActivePage: ActivePage = useMemo(() => {
    if (urlCompanyId) return { id: urlCompanyId, type: "company" };
    if (urlGroupId) return { id: urlGroupId, type: "group" };
    if (pathname.startsWith("/accountant")) return { id: "cabinet", type: "cabinet" };
    return null;
  }, [pathname, urlCompanyId, urlGroupId]);

  const sidebarItems = useMemo(() => {
    return getSidebarItems({
      accountType: forcedAccountType,
      activePage: forcedActivePage,
      activeCompanyId: forcedActiveCompanyId,
      activeGroupId: forcedActiveGroupId,
      hasPagesToSwitch,
      isPdg: props.isPdg ?? false,
    });
  }, [
    forcedAccountType,
    forcedActivePage,
    forcedActiveCompanyId,
    forcedActiveGroupId,
    hasPagesToSwitch,
    props.isPdg,
  ]);

  const [mobileOpen, setMobileOpen] = useState(false);

  async function doLogout() {
    try {
      await fetch("/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  async function activateProfile() {
    setMobileOpen(false);
    try {
      await fetch("/api/workspace/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "profil", company_id: null, group_id: null }),
      });
    } catch {}
    router.push("/profile");
    router.refresh();
  }

  return (
    <div className="ftn-shell">
      {mobileOpen ? (
        <button className="ftn-overlay" aria-label="Fermer le menu" onClick={() => setMobileOpen(false)} type="button" />
      ) : null}

      <div className="ftn-header-row">
        <button className="ftn-menu-btn" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu" type="button">
          <span />
          <span />
          <span />
        </button>

        <div className="ftn-app" style={{ width: "100%" }}>
          <aside className={"ftn-sidebar " + (mobileOpen ? "ftn-sidebar-open" : "")}>
            <div className="ftn-brand">
              <div className="ftn-logo">FT</div>
              <div className="ftn-brand-text">
                <div className="ftn-brand-title">FactureTN</div>
                <div className="ftn-brand-sub">
                  Mode : <strong>{forcedAccountType}</strong>
                </div>
              </div>
            </div>

            <nav className="ftn-nav">
              {sidebarItems.map((it) => {
                if (it.kind === "divider") return <div key={it.key} style={{ height: 10 }} />;
                if (it.kind === "title") {
                  return (
                    <div key={it.key} className="text-xs font-extrabold uppercase opacity-70 px-2 mt-3">
                      {it.label}
                    </div>
                  );
                }

                const active = isActive(pathname, it.href, it.exact);

                return (
                  <Link
                    key={it.key}
                    href={it.href}
                    className={active ? "ftn-nav-item active" : "ftn-nav-item"}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span>{it.label}</span>
                    {it.badge ? <span className="ftn-badge">{it.badge}</span> : null}
                  </Link>
                );
              })}
            </nav>

            <div className="ftn-sidebar-footer">
              {forcedAccountType !== "profil" ? (
                <button className="ftn-btn ftn-btn-ghost" onClick={activateProfile} type="button">
                  Activer Profil
                </button>
              ) : null}

              <button className="ftn-btn ftn-btn-ghost" onClick={doLogout} type="button">
                Se déconnecter
              </button>
            </div>
          </aside>

          <main className="ftn-main">
            {props.title ? (
              <header className="ftn-header">
                <div>
                  <h1 className="ftn-title">{props.title}</h1>
                  {props.subtitle ? <p className="ftn-subtitle">{props.subtitle}</p> : null}
                </div>
              </header>
            ) : null}

            <section className="ftn-content">{props.children}</section>
          </main>
        </div>
      </div>
    </div>
  );
}
