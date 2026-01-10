// app/mentions-legales/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Mentions légales | FactureTN",
  description: "Mentions légales de FactureTN (Facturation TTN Tunisie).",
};

function Card({
  title,
  children,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ftn-card">
      <header className="ftn-card-head">
        <h2 className="ftn-h2">{title}</h2>
        {subtitle ? <p className="ftn-muted">{subtitle}</p> : null}
      </header>
      <div className="ftn-card-body">{children}</div>
    </section>
  );
}

export default function MentionsLegalesPage() {
  return (
    <main className="ftn-wrap">
      <header className="ftn-top">
        <div className="ftn-brand">
          <div className="ftn-logo" aria-hidden="true">
            FTN
          </div>
          <div>
            <h1 className="ftn-h1">Mentions légales</h1>
            <p className="ftn-sub">
              Informations légales relatives à l’éditeur et à l’exploitation de
              la plateforme FactureTN.
            </p>
          </div>
        </div>

        <nav className="ftn-nav">
          <Link className="ftn-navlink" href="/conditions-generales">
            Conditions générales
          </Link>
          <Link className="ftn-navlink" href="/register">
            Créer un compte
          </Link>
        </nav>
      </header>

      <div className="ftn-grid">
        <Card
          title="1) Éditeur du site"
          subtitle="À compléter avec tes informations officielles."
        >
          <ul className="ftn-list">
            <li>
              <b>Raison sociale / Nom :</b> [À compléter]
            </li>
            <li>
              <b>Forme juridique :</b> [À compléter]
            </li>
            <li>
              <b>Adresse :</b> [À compléter]
            </li>
            <li>
              <b>Email :</b> [À compléter]
            </li>
            <li>
              <b>Téléphone :</b> [À compléter]
            </li>
            <li>
              <b>Matricule fiscal / RC :</b> [À compléter]
            </li>
            <li>
              <b>Directeur de publication :</b> [À compléter]
            </li>
          </ul>
          <p className="ftn-note">
            (Commentaire dev) Remplace les champs “[À compléter]” par les valeurs
            légales exactes.
          </p>
        </Card>

        <Card title="2) Hébergement">
          <ul className="ftn-list">
            <li>
              <b>Hébergeur :</b> [Vercel / OVH / autre]
            </li>
            <li>
              <b>Adresse :</b> [À compléter]
            </li>
            <li>
              <b>Site :</b> [À compléter]
            </li>
          </ul>
        </Card>

        <Card title="3) Objet du service">
          <p className="ftn-p">
            FactureTN est une plateforme de gestion de facturation dédiée à la
            conformité et à l’organisation de la facturation, notamment dans le
            cadre de la <b>facture électronique / exigences TTN en Tunisie</b>.
          </p>
          <p className="ftn-p">
            La plateforme fournit des outils de création, gestion, export,
            partage et archivage des factures, ainsi que des modules de gestion
            d’accès (équipe, comptable, cabinet, multi-sociétés) selon le plan
            choisi.
          </p>
        </Card>

        <Card title="4) Propriété intellectuelle">
          <p className="ftn-p">
            L’ensemble des contenus (marque, logo, interface, textes,
            illustrations, code, base de données) est protégé par le droit de la
            propriété intellectuelle. Toute reproduction, représentation,
            modification ou exploitation sans autorisation est interdite.
          </p>
        </Card>

        <Card title="5) Données personnelles (résumé)">
          <p className="ftn-p">
            FactureTN collecte et traite certaines données nécessaires au
            fonctionnement du service (création de compte, gestion des sociétés,
            factures, accès). Les modalités détaillées figurent dans les{" "}
            <Link className="ftn-link" href="/conditions-generales">
              Conditions générales
            </Link>{" "}
            et, si tu en crées une, dans ta Politique de confidentialité.
          </p>
          <p className="ftn-p">
            (Conseil dev) Ajoute une page “Politique de confidentialité” si tu
            veux séparer clairement la partie RGPD / consentements / cookies.
          </p>
        </Card>

        <Card title="6) Responsabilité">
          <p className="ftn-p">
            L’éditeur met en œuvre les moyens raisonnables pour assurer l’accès
            et le bon fonctionnement du service. Cependant, l’éditeur ne garantit
            pas l’absence d’interruptions, d’erreurs ou d’indisponibilités
            temporaires.
          </p>
          <p className="ftn-p">
            L’utilisateur demeure responsable des informations saisies, de la
            conformité de ses factures et du respect des obligations légales et
            fiscales applicables.
          </p>
        </Card>

        <Card title="7) Contact">
          <p className="ftn-p">
            Pour toute question : <b>[email support]</b>
          </p>
        </Card>
      </div>

      <footer className="ftn-footer">
        <div>© {new Date().getFullYear()} FactureTN — Tous droits réservés.</div>
        <div className="ftn-footer-links">
          <Link className="ftn-footlink" href="/conditions-generales">
            Conditions générales
          </Link>
          <span className="ftn-sep">•</span>
          <Link className="ftn-footlink" href="/register">
            Inscription
          </Link>
        </div>
      </footer>

      <style jsx>{`
        .ftn-wrap {
          min-height: 100vh;
          padding: 28px 16px 40px;
          background: radial-gradient(
              1200px 600px at 10% 0%,
              rgba(99, 102, 241, 0.08),
              transparent 55%
            ),
            radial-gradient(
              900px 500px at 90% 10%,
              rgba(249, 115, 22, 0.08),
              transparent 55%
            ),
            #f7f7fb;
          color: #0f172a;
        }
        .ftn-top {
          max-width: 980px;
          margin: 0 auto 18px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .ftn-brand {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .ftn-logo {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          font-weight: 800;
          font-size: 14px;
          background: rgba(15, 23, 42, 0.92);
          color: white;
          box-shadow: 0 10px 25px rgba(2, 6, 23, 0.18);
        }
        .ftn-h1 {
          margin: 0;
          font-size: 24px;
          line-height: 1.15;
          letter-spacing: -0.02em;
        }
        .ftn-sub {
          margin: 6px 0 0;
          font-size: 13px;
          color: rgba(15, 23, 42, 0.7);
          max-width: 640px;
        }
        .ftn-nav {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .ftn-navlink {
          font-size: 13px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          background: rgba(255, 255, 255, 0.7);
          text-decoration: none;
          color: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(8px);
        }
        .ftn-navlink:hover {
          border-color: rgba(15, 23, 42, 0.16);
          background: rgba(255, 255, 255, 0.92);
        }
        .ftn-grid {
          max-width: 980px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        .ftn-card {
          border-radius: 18px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          background: rgba(255, 255, 255, 0.78);
          backdrop-filter: blur(10px);
          box-shadow: 0 10px 28px rgba(2, 6, 23, 0.06);
        }
        .ftn-card-head {
          padding: 16px 16px 0;
        }
        .ftn-h2 {
          margin: 0;
          font-size: 15px;
          letter-spacing: -0.01em;
        }
        .ftn-card-body {
          padding: 12px 16px 16px;
        }
        .ftn-muted {
          margin: 6px 0 0;
          font-size: 12.5px;
          color: rgba(15, 23, 42, 0.65);
        }
        .ftn-p {
          margin: 0 0 10px;
          font-size: 13.5px;
          line-height: 1.55;
          color: rgba(15, 23, 42, 0.82);
        }
        .ftn-list {
          margin: 0;
          padding-left: 18px;
          font-size: 13.5px;
          line-height: 1.65;
          color: rgba(15, 23, 42, 0.82);
        }
        .ftn-note {
          margin: 10px 0 0;
          font-size: 12px;
          color: rgba(15, 23, 42, 0.6);
          border-left: 3px solid rgba(99, 102, 241, 0.35);
          padding-left: 10px;
        }
        .ftn-link {
          color: rgba(15, 23, 42, 0.9);
          font-weight: 700;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .ftn-footer {
          max-width: 980px;
          margin: 18px auto 0;
          padding: 14px 4px 0;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 12.5px;
          color: rgba(15, 23, 42, 0.62);
        }
        .ftn-footer-links {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .ftn-footlink {
          color: rgba(15, 23, 42, 0.72);
          text-decoration: none;
          font-weight: 600;
        }
        .ftn-footlink:hover {
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .ftn-sep {
          opacity: 0.6;
        }
        @media (min-width: 900px) {
          .ftn-grid {
            grid-template-columns: 1fr 1fr;
          }
          .ftn-grid :global(section:nth-child(3)),
          .ftn-grid :global(section:nth-child(4)),
          .ftn-grid :global(section:nth-child(5)),
          .ftn-grid :global(section:nth-child(6)),
          .ftn-grid :global(section:nth-child(7)) {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </main>
  );
}
