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
          {/* ================= LEFT : TEXTE (SAME DESIGN, BETTER TYPO) ================= */}
          <div className="ftn-auth-hero">
            <div className="ftn-hero-copy">
              <div className="ftn-hero-kicker">
                CRM • Facturation électronique
              </div>

              <h3 className="ftn-hero-title">FactureTN</h3>

              <p className="ftn-hero-lead">
                <b>FactureTN est un CRM de facturation électronique.</b>
              </p>

              <p className="ftn-hero-text">
                Il facilite la <b>création</b>, la <b>gestion</b> et le{" "}
                <b>téléchargement</b> des factures{" "}
                <b>(PDF &amp; XML)</b>.
              </p>

              <p className="ftn-hero-strong">
                Il ne remplace pas le comptable.
              </p>

              <p className="ftn-hero-text">
                Il structure les factures pour <b>simplifier</b> le travail du
                comptable.
              </p>

              <div className="ftn-hero-tags">
                <span className="ftn-hero-tag">PDF</span>
                <span className="ftn-hero-tag">XML</span>
                <span className="ftn-hero-tag">TTN</span>
                <span className="ftn-hero-tag">Gestion</span>
              </div>

              <div className="ftn-hero-foot">
                © 2026 FactureTN — CRM de facturation électronique
              </div>
            </div>
          </div>

          {/* ================= RIGHT : CARD (UNCHANGED) ================= */}
          <div className="ftn-auth-card">
            <div className="ftn-auth-title">{title}</div>
            {subtitle && (
              <div className="ftn-auth-sub">{subtitle}</div>
            )}

            <div style={{ marginTop: 22 }}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
