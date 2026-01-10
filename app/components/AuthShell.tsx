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

          {/* ===== LEFT : HERO ===== */}
          <div className="ftn-auth-hero">
            <h3>FactureTN · CRM & Facturation TTN</h3>
            <p>
              Un CRM tunisien moderne pour gérer vos sociétés,
              vos factures et préparer la facturation électronique TTN.
            </p>

            {/* CADRES BLANCS */}
            <div className="ftn-auth-tiles">
              <div className="ftn-auth-tile">
                <div className="text-sm font-extrabold mb-1">
                  🧾 Facturation conforme TTN
                </div>
                <p className="ftn-muted">
                  Création et gestion de factures prêtes pour la
                  facturation électronique tunisienne (PDF & XML).
                </p>
              </div>

              <div className="ftn-auth-tile">
                <div className="text-sm font-extrabold mb-1">
                  🏢 Multi-sociétés & rôles
                </div>
                <p className="ftn-muted">
                  Gérez plusieurs sociétés avec des accès comptable,
                  client ou équipe, selon vos besoins.
                </p>
              </div>

              <div className="ftn-auth-tile">
                <div className="text-sm font-extrabold mb-1">
                  🔐 Sécurité & conformité
                </div>
                <p className="ftn-muted">
                  Données sécurisées, permissions contrôlées et
                  architecture moderne prête pour TTN.
                </p>
              </div>
            </div>

            <p className="mt-6 text-xs ftn-muted">
              © 2026 FactureTN — Sécurisé · Moderne · Évolutif
            </p>
          </div>

          {/* ===== RIGHT : CARD ===== */}
          <div className="ftn-auth-card">
            <div className="ftn-auth-title">{title}</div>
            {subtitle && (
              <div className="ftn-auth-sub">{subtitle}</div>
            )}

            <div className="mt-6">
              {children}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
