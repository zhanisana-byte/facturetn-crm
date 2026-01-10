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
        <Card title="1) Éditeur de la plateforme" subtitle="Responsable de publication & exploitation">
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
              <b>Adresse :</b> IMMM COMMUNICA JARZOUNA
            </li>
            <li>
              <b>Adresse (bureau) :</b> Regus Lac 2
            </li>
          </ul>

          <p className="ftn-legal-note">
            FactureTN est un service logiciel visant à faciliter la gestion des factures électroniques (création,
            organisation, export et gestion des accès).
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
              <b>Traitements techniques :</b> journaux techniques, sécurité, performance (nécessaires au service)
            </li>
          </ul>

          <p className="ftn-legal-note">
            Les fournisseurs cloud peuvent utiliser des régions d’exécution variables selon la performance et la
            disponibilité.
          </p>
        </Card>

        <Card title="3) Objet du service" spanAll>
          <p className="ftn-legal-p">
            <b>FactureTN</b> a pour objectif de faciliter la gestion de la <b>facturation électronique</b> :
            création de factures, gestion des sociétés, export, et partage sécurisé avec une équipe ou un comptable
            (selon les permissions).
          </p>
          <p className="ftn-legal-p">
            L’utilisateur reste responsable des informations saisies et du respect des obligations légales et
            fiscales applicables.
          </p>
        </Card>

        <Card title="4) Propriété intellectuelle" spanAll>
          <p className="ftn-legal-p">
            L’interface, le design, les textes, le code et la base de données sont protégés. Toute reproduction,
            modification ou diffusion sans autorisation est interdite.
          </p>
        </Card>

        <Card title="5) Liens utiles" spanAll>
          <p className="ftn-legal-p">
            Lire les{" "}
            <Link className="ftn-legal-link" href="/conditions-generales">
              Conditions générales d’utilisation
            </Link>{" "}
            (CGU).
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
