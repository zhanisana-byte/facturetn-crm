import type { ReactNode } from "react";

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="ftn-auth">
      <div className="ftn-auth-wrap">
        <aside className="ftn-auth-hero">
          <h3>FactureTN • CRM & Facturation TTN</h3>
          <p>
            Un CRM tunisien, simple et puissant : factures, multi-sociétés, rôles comptables,
            export PDF/XML et préparation de l'intégration TTN.
          </p>

          <div className="ftn-auth-tiles" aria-hidden>
            <div className="ftn-auth-tile" />
            <div className="ftn-auth-tile" />
            <div className="ftn-auth-tile" />
          </div>

          <p style={{ marginTop: 18, fontSize: 12 }}>
            {year} • FactureTN — Sécurisé • Moderne • Évolutif
          </p>
        </aside>

        <section className="ftn-auth-card">
          <div className="ftn-auth-title">{title}</div>
          {subtitle ? <div className="ftn-auth-sub">{subtitle}</div> : null}
          <div style={{ marginTop: 14 }}>{children}</div>
        </section>
      </div>
    </div>
  );
}
