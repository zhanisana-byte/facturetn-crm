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
  return (
    <div className="ftn-shell">
      <div className="ftn-auth">
        <div className="ftn-auth-wrap">
          {/* ===== LEFT : MESSAGE SIMPLE ===== */}
          <div className="ftn-auth-hero">
            <h3>FactureTN</h3>

            <p className="mt-3 text-sm ftn-muted" style={{ lineHeight: 1.7 }}>
              <b>FactureTN est un CRM de facturation électronique.</b>
              <br />
              Il facilite la création, la gestion et le téléchargement des factures{" "}
              <b>(PDF &amp; XML)</b>.
              <br />
              <b>Il ne remplace pas le comptable.</b>
              <br />
              Il structure les factures pour simplifier le travail du comptable.
            </p>

            <p className="mt-6 text-xs ftn-muted">
              © 2026 FactureTN — CRM de facturation électronique
            </p>
          </div>

          {/* ===== RIGHT : CARD ===== */}
          <div className="ftn-auth-card">
            <div className="ftn-auth-title">{title}</div>
            {subtitle ? <div className="ftn-auth-sub">{subtitle}</div> : null}

            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
