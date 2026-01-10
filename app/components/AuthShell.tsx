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
    <div className="ftn-auth">
      <div className="ftn-auth-wrap">
        {/* ===== LEFT : HERO ===== */}
        <div className="ftn-auth-hero ftn-hero">
          <div className="ftn-hero-badge">CRM • FACTURATION ÉLECTRONIQUE</div>

          <h1 className="ftn-hero-h1">FactureTN</h1>

          <div className="ftn-hero-lead">
            <p>
              <b>FactureTN est un CRM de facturation électronique.</b>
            </p>
            <p>
              Il facilite la <b>création</b>, la <b>gestion</b> et le{" "}
              <b>téléchargement</b> des factures <b>(PDF &amp; XML)</b>.
            </p>
            <p>
              <b>Il ne remplace pas le comptable.</b>
            </p>
            <p>
              Il structure les factures pour <b>simplifier</b> le travail du
              comptable.
            </p>
          </div>

          <div className="ftn-hero-chips">
            <span className="ftn-chip">PDF</span>
            <span className="ftn-chip">XML</span>
            <span className="ftn-chip">TTN</span>
            <span className="ftn-chip">Gestion</span>
          </div>

          <div className="ftn-hero-foot">© 2026 FactureTN — CRM de facturation électronique</div>
        </div>

        {/* ===== RIGHT : CARD ===== */}
        <div className="ftn-auth-card">
          <div className="ftn-auth-title">{title}</div>
          {subtitle ? <div className="ftn-auth-sub">{subtitle}</div> : null}

          <div className="ftn-auth-form">{children}</div>
        </div>
      </div>
    </div>
  );
}
