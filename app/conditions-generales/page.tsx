import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Conditions générales | FactureTN",
  description: "Conditions Générales d’Utilisation de la plateforme FactureTN.",
};

function Section({
  id,
  title,
  children,
  spanAll,
}: {
  id: string;
  title: string;
  children: ReactNode;
  spanAll?: boolean;
}) {
  return (
    <section id={id} className={"ftn-legal-card " + (spanAll ? "ftn-legal-spanall" : "")}>
      <header className="ftn-legal-card-head">
        <h2 className="ftn-legal-h2">{title}</h2>
      </header>
      <div className="ftn-legal-card-body">{children}</div>
    </section>
  );
}

export default async function ConditionsGeneralesPage() {
  const year = new Date().getFullYear();
  const lastUpdate = "10/01/2026";

  return (
    <main className="ftn-legal-wrap">
      <header className="ftn-legal-top">
        <div className="ftn-legal-brand">
          <div className="ftn-legal-logo">FTN</div>
          <div>
            <h1 className="ftn-legal-h1">Conditions Générales d’Utilisation</h1>
            <p className="ftn-legal-sub">
              Dernière mise à jour : <b>{lastUpdate}</b>
            </p>
          </div>
        </div>

        <nav className="ftn-legal-nav">
          <Link className="ftn-legal-navlink" href="/mentions-legales">
            Mentions légales
          </Link>
          <Link className="ftn-legal-navlink" href="/register">
            Inscription
          </Link>
        </nav>
      </header>

      <div className="ftn-legal-grid">
        <Section id="objet" title="1) Objet">
          <p className="ftn-legal-p">
            FactureTN est une plateforme logicielle développée dans le cadre d’une activité de
            <b> service informatique et bureau d’étude</b>, ayant pour objectif de faciliter la gestion
            des factures électroniques, des sociétés, des accès utilisateurs et des transmissions techniques.
          </p>
        </Section>

        <Section id="acces" title="2) Accès au service">
          <ul className="ftn-legal-list">
            <li>Vous fournissez des informations exactes et à jour.</li>
            <li>Vous êtes responsable de la confidentialité de vos accès.</li>
            <li>L’accès peut être suspendu en cas d’usage abusif ou illicite.</li>
          </ul>
        </Section>

        <Section id="responsabilite" title="3) Responsabilité de l’utilisateur" spanAll>
          <p className="ftn-legal-p">
            Vous êtes seul responsable des données saisies, importées ou transmises via la plateforme, ainsi que
            de leur conformité légale, fiscale et réglementaire.
          </p>
        </Section>

        <Section id="securite" title="4) Sécurité & disponibilité" spanAll>
          <p className="ftn-legal-p">
            FactureTN met en œuvre des moyens raisonnables de sécurité mais ne garantit pas l’absence totale
            d’incidents, d’attaques ou d’interruptions.
          </p>
        </Section>

        <Section id="api" title="5) Services tiers & API" spanAll>
          <p className="ftn-legal-p">
            Certaines fonctionnalités reposent sur des services tiers ou interfaces API externes. FactureTN
            ne garantit ni leur disponibilité, ni leur fonctionnement, ni les résultats obtenus.
          </p>
        </Section>

        <Section id="limitation" title="6) Limitation de responsabilité" spanAll>
          <p className="ftn-legal-p">
            FactureTN ne pourra être tenu responsable des bugs, erreurs techniques, indisponibilités,
            pertes de données, incidents de sécurité, erreurs de transmission ou dommages indirects.
          </p>
        </Section>

        <Section id="droit" title="7) Droit applicable">
          <p className="ftn-legal-p">
            Les présentes CGU sont régies par le droit tunisien. Une solution amiable sera privilégiée
            avant toute action judiciaire.
          </p>
        </Section>
      </div>

      <footer className="ftn-legal-footer">
        <div>© {year} FactureTN — Tous droits réservés.</div>
      </footer>
    </main>
  );
}
