import Link from "next/link";

export const metadata = {
  title: "Mentions légales | FactureTN",
  description: "Mentions légales de FactureTN (Vercel + Supabase).",
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
  const year = new Date().getFullYear();

  return (
    <main className="ftn-legal-wrap">
      <header className="ftn-legal-top">
        <div className="ftn-legal-brand">
          <div className="ftn-legal-logo" aria-hidden="true">
            FTN
          </div>
          <div>
            <h1 className="ftn-legal-h1">Mentions légales</h1>
            <p className="ftn-legal-sub">
              Informations relatives à l’éditeur et à l’exploitation de la plateforme FactureTN.
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
        <Card
          title="1) Éditeur de la plateforme"
          subtitle="Responsable de publication & exploitation"
        >
          <ul className="ftn-legal-list">
            <li>
              <b>Éditrice / Responsable :</b> Sana Zhani
            </li>
            <li>
              <b>Activité :</b> Service informatique + Bureau d’étude
            </li>
            <li>
              <b>Patente :</b> 1492904/A
            </li>
            <li>
              <b>Email :</b>{" "}
              <a className="ftn-legal-link" href="mailto:zhanisana@gmail.com">
                zhanisana@gmail.com
              </a>
            </li>
            <li>
              <b>Téléphone :</b>{" "}
              <a className="ftn-legal-link" href="tel:+21620121521">
                +216 20 121 521
              </a>
            </li>
            <li>
              <b>Adresse :</b> [À compléter]
            </li>
            <li>
              <b>Matricule fiscal / RC :</b> [À compléter si applicable]
            </li>
          </ul>

          <p className="ftn-legal-note">
            Si tu veux, je te prépare une version “Tunisie-friendly” avec les mentions exactes à afficher
            selon ton statut (personne physique / SUARL).
          </p>
        </Card>

        <Card title="2) Hébergement & infrastructure">
          <ul className="ftn-legal-list">
            <li>
              <b>Hébergement web :</b> Vercel (infrastructure cloud)
            </li>
            <li>
              <b>Base de données / Auth :</b> Supabase
            </li>
            <li>
              <b>Localisation technique :</b> variable selon la région d’exécution (edge / datacenters)
            </li>
          </ul>
          <p className="ftn-legal-note">
            (Info) Les services tiers peuvent traiter des données techniques nécessaires au fonctionnement.
          </p>
        </Card>

        <Card title="3) Objet du service" spanAll>
          <p className="ftn-legal-p">
            <b>FactureTN</b> a pour objectif de faciliter la gestion de la <b>facturation électronique</b> :
            création, organisation, export et gestion d’accès (équipe, comptable, multi-sociétés) afin de
            simplifier le quotidien des entreprises.
          </p>
          <p className="ftn-legal-p">
            FactureTN fournit des outils de gestion. L’utilisateur reste responsable des informations saisies
            et du respect des obligations légales et fiscales applicables.
          </p>
        </Card>

        <Card title="4) Propriété intellectuelle" spanAll>
          <p className="ftn-legal-p">
            Les contenus (marque, interface, design, textes, code, base de données) sont protégés. Toute
            reproduction, modification ou diffusion sans autorisation est interdite.
          </p>
        </Card>

        <Card title="5) Données personnelles (résumé)" spanAll>
          <p className="ftn-legal-p">
            FactureTN collecte et traite des données nécessaires au service (compte, sociétés, factures,
            droits d’accès). Pour plus de détails, consulte les{" "}
            <Link className="ftn-legal-link" href="/conditions-generales">
              Conditions générales
            </Link>
            .
          </p>
        </Card>

        <Card title="6) Contact" spanAll>
          <p className="ftn-legal-p">
            Support :{" "}
            <a className="ftn-legal-link" href="mailto:zhanisana@gmail.com">
              zhanisana@gmail.com
            </a>
            {" — "}
            <a className="ftn-legal-link" href="tel:+21620121521">
              +216 20 121 521
            </a>
          </p>
        </Card>
      </div>

      <footer className="ftn-legal-footer">
        <div>© {year} FactureTN — Tous droits réservés.</div>
        <div className="ftn-legal-footer-links">
          <Link className="ftn-legal-footlink" href="/conditions-generales">
            Conditions générales
          </Link>
          <span className="ftn-legal-sep">•</span>
          <Link className="ftn-legal-footlink" href="/register">
            Inscription
          </Link>
        </div>
      </footer>
    </main>
  );
}
