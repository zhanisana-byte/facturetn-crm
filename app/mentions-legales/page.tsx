import Link from "next/link";

export const metadata = {
  title: "Mentions légales | FactureTN",
  description: "Mentions légales de FactureTN (Facturation TTN Tunisie).",
};

function Card({
  title,
  subtitle,
  children,
  spanAll,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  spanAll?: boolean;
}) {
  return (
    <section className={"ftn-legal-card " + (spanAll ? "ftn-legal-spanall" : "")}>
      <header className="ftn-legal-card-head">
        <h2 className="ftn-legal-h2">{title}</h2>
        {subtitle ? <p className="ftn-legal-muted">{subtitle}</p> : null}
      </header>
      <div className="ftn-legal-card-body">{children}</div>
    </section>
  );
}

export default function MentionsLegalesPage() {
  return (
    <main className="ftn-legal-wrap">
      <header className="ftn-legal-top">
        <div className="ftn-legal-brand">
          <div className="ftn-legal-logo" aria-hidden="true">FTN</div>
          <div>
            <h1 className="ftn-legal-h1">Mentions légales</h1>
            <p className="ftn-legal-sub">
              Informations légales relatives à l’éditeur et à l’exploitation de la plateforme FactureTN.
            </p>
          </div>
        </div>

        <nav className="ftn-legal-nav">
          <Link className="ftn-legal-navlink" href="/conditions-generales">
            Conditions générales
          </Link>
          <Link className="ftn-legal-navlink" href="/register">
            Créer un compte
          </Link>
        </nav>
      </header>

      <div className="ftn-legal-grid">
        <Card title="1) Éditeur du site" subtitle="À compléter avec tes informations officielles.">
          <ul className="ftn-legal-list">
            <li><b>Raison sociale / Nom :</b> [À compléter]</li>
            <li><b>Forme juridique :</b> [À compléter]</li>
            <li><b>Adresse :</b> [À compléter]</li>
            <li><b>Email :</b> [À compléter]</li>
            <li><b>Téléphone :</b> [À compléter]</li>
            <li><b>Matricule fiscal / RC :</b> [À compléter]</li>
            <li><b>Directeur de publication :</b> [À compléter]</li>
          </ul>
          <p className="ftn-legal-note">
            (Dev) Remplace les champs “[À compléter]” par les valeurs légales exactes.
          </p>
        </Card>

        <Card title="2) Hébergement">
          <ul className="ftn-legal-list">
            <li><b>Hébergeur :</b> [Vercel / OVH / autre]</li>
            <li><b>Adresse :</b> [À compléter]</li>
            <li><b>Site :</b> [À compléter]</li>
          </ul>
        </Card>

        <Card title="3) Objet du service" spanAll>
          <p className="ftn-legal-p">
            FactureTN est une plateforme de gestion de facturation dédiée à la conformité et à l’organisation de la
            facturation, notamment dans le cadre de la <b>facture électronique / exigences TTN en Tunisie</b>.
          </p>
          <p className="ftn-legal-p">
            Le service permet la création, gestion, export, partage et archivage des factures, et la gestion d’accès
            (équipe, comptable, cabinet, multi-sociétés) selon le plan choisi.
          </p>
        </Card>

        <Card title="4) Propriété intellectuelle" spanAll>
          <p className="ftn-legal-p">
            L’ensemble des contenus (marque, logo, interface, textes, illustrations, code, base de données) est protégé
            par le droit de la propriété intellectuelle. Toute exploitation sans autorisation est interdite.
          </p>
        </Card>

        <Card title="5) Données personnelles (résumé)" spanAll>
          <p className="ftn-legal-p">
            FactureTN traite certaines données nécessaires au fonctionnement du service. Les modalités figurent dans les{" "}
            <Link className="ftn-legal-link" href="/conditions-generales">Conditions générales</Link>.
          </p>
          <p className="ftn-legal-p">
            (Conseil) Ajoute une page “Politique de confidentialité” si tu veux séparer RGPD / cookies.
          </p>
        </Card>

        <Card title="6) Responsabilité" spanAll>
          <p className="ftn-legal-p">
            L’éditeur met en œuvre les moyens raisonnables pour assurer l’accès au service, sans garantir l’absence
            d’interruptions ou d’erreurs. L’utilisateur reste responsable des informations saisies et du respect des
            obligations légales et fiscales.
          </p>
        </Card>

        <Card title="7) Contact" spanAll>
          <p className="ftn-legal-p">Pour toute question : <b>[email support]</b></p>
        </Card>
      </div>

      <footer className="ftn-legal-footer">
        <div>© {new Date().getFullYear()} FactureTN — Tous droits réservés.</div>
        <div className="ftn-legal-footer-links">
          <Link className="ftn-legal-footlink" href="/conditions-generales">Conditions générales</Link>
          <span className="ftn-legal-sep">•</span>
          <Link className="ftn-legal-footlink" href="/register">Inscription</Link>
        </div>
      </footer>
    </main>
  );
}
