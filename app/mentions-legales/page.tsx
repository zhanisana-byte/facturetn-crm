import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Mentions légales | FactureTN",
  description: "Mentions légales et informations juridiques de la plateforme FactureTN.",
};

function Card({
  title,
  subtitle,
  children,
  spanAll,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  spanAll?: boolean;
}) {
  return (
    <section className={"ftn-legal-card " + (spanAll ? "ftn-legal-spanall" : "")}>
      <header className="ftn-legal-card-head">
        <h2 className="ftn-legal-h2">{title}</h2>
        {subtitle && <p className="ftn-legal-muted">{subtitle}</p>}
      </header>
      <div className="ftn-legal-card-body">{children}</div>
    </section>
  );
}

export default async function MentionsLegalesPage() {
  const year = new Date().getFullYear();

  return (
    <main className="ftn-legal-wrap">
      <header className="ftn-legal-top">
        <div className="ftn-legal-brand">
          <div className="ftn-legal-logo">FTN</div>
          <div>
            <h1 className="ftn-legal-h1">Mentions légales</h1>
            <p className="ftn-legal-sub">
              Informations légales relatives à l’édition et à l’exploitation de la plateforme FactureTN.
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
        <Card title="1) Éditeur de la plateforme" subtitle="Responsable de publication">
          <ul className="ftn-legal-list">
            <li><b>Éditrice :</b> Sana Zhani</li>
            <li><b>Activité :</b> Service informatique & Bureau d’étude</li>
            <li><b>Patente :</b> 1492904/A</li>
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
            <li><b>Adresse :</b> IMMM Communica, Jarzouna</li>
            <li><b>Bureau :</b> Regus – Lac 2</li>
          </ul>
        </Card>

        <Card title="2) Hébergement & infrastructure">
          <ul className="ftn-legal-list">
            <li><b>Hébergement :</b> Vercel (cloud)</li>
            <li><b>Base de données & Authentification :</b> Supabase</li>
            <li><b>Services tiers :</b> emailing, sécurité, APIs externes</li>
          </ul>
          <p className="ftn-legal-note">
            Ces prestataires peuvent entraîner des interruptions temporaires indépendantes de la volonté de FactureTN.
          </p>
        </Card>

        <Card title="3) Objet du service" spanAll>
          <p className="ftn-legal-p">
            FactureTN est une plateforme logicielle développée dans le cadre d’une activité de
            <b> service informatique et bureau d’étude</b>, destinée à faciliter la gestion des factures
            électroniques : création, organisation, export, gestion des sociétés et des accès, ainsi que la
            préparation et la transmission technique via des interfaces API lorsque disponibles.
          </p>
          <p className="ftn-legal-p">
            FactureTN constitue un outil d’assistance technique. Il ne fournit aucun conseil fiscal,
            comptable ou juridique.
          </p>
        </Card>

        <Card title="4) Responsabilité de l’utilisateur" spanAll>
          <p className="ftn-legal-p">
            Vous êtes seul responsable des données saisies, importées ou transmises via la plateforme, de leur
            exactitude et de leur conformité aux lois et réglementations applicables.
          </p>
        </Card>

        <Card title="5) Limitation de responsabilité" spanAll>
          <p className="ftn-legal-p">
            FactureTN est fourni « en l’état » et selon une obligation de moyens. L’éditrice ne saurait être tenue
            responsable des bugs, erreurs techniques, interruptions, indisponibilités, attaques informatiques,
            incidents de sécurité, erreurs de transmission API, pertes de données ou dommages indirects.
          </p>
        </Card>

        <Card title="6) Propriété intellectuelle" spanAll>
          <p className="ftn-legal-p">
            L’ensemble des éléments composant la plateforme (code, interface, design, textes, base de données)
            est protégé. Toute reproduction ou diffusion sans autorisation est interdite.
          </p>
        </Card>

        <Card title="7) Contact" spanAll>
          <p className="ftn-legal-p">
            <a className="ftn-legal-link" href="mailto:zhanisana@gmail.com">zhanisana@gmail.com</a>{" "}
            — <a className="ftn-legal-link" href="tel:+21620121521">+216 20 121 521</a>
          </p>
        </Card>
      </div>

      <footer className="ftn-legal-footer">
        <div>© {year} FactureTN — Tous droits réservés.</div>
      </footer>
    </main>
  );
}
