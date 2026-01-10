import Link from "next/link";

export const metadata = {
  title: "Conditions générales | FactureTN",
  description: "Conditions générales d’utilisation de FactureTN.",
};

function Section({
  id,
  title,
  children,
  spanAll,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
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

export default function ConditionsGeneralesPage() {
  const year = new Date().getFullYear();
  const lastUpdate = "10/01/2026"; // tu peux changer

  return (
    <main className="ftn-legal-wrap">
      <header className="ftn-legal-top">
        <div className="ftn-legal-brand">
          <div className="ftn-legal-logo" aria-hidden="true">
            FTN
          </div>
          <div>
            <h1 className="ftn-legal-h1">Conditions générales d’utilisation (CGU)</h1>
            <p className="ftn-legal-sub">
              Dernière mise à jour : <b>{lastUpdate}</b>. Ces CGU encadrent l’accès et l’utilisation de FactureTN.
            </p>
          </div>
        </div>

        <nav className="ftn-legal-nav">
          <Link className="ftn-legal-navlink" href="/mentions-legales">
            Mentions légales
          </Link>
          <Link className="ftn-legal-navlink" href="/register">
            Créer un compte
          </Link>
        </nav>
      </header>

      <div className="ftn-legal-toc">
        <div className="ftn-legal-toc-title">Sommaire</div>
        <div className="ftn-legal-toc-links">
          <a className="ftn-legal-toc-link" href="#objet">Objet</a>
          <a className="ftn-legal-toc-link" href="#acces">Accès & compte</a>
          <a className="ftn-legal-toc-link" href="#roles">Rôles & permissions</a>
          <a className="ftn-legal-toc-link" href="#responsabilite">Responsabilité</a>
          <a className="ftn-legal-toc-link" href="#donnees">Données</a>
          <a className="ftn-legal-toc-link" href="#support">Support</a>
          <a className="ftn-legal-toc-link" href="#final">Final</a>
        </div>
      </div>

      <div className="ftn-legal-grid">
        <Section id="objet" title="1) Objet">
          <p className="ftn-legal-p">
            FactureTN est une plateforme dont l’objectif est de faciliter la gestion des{" "}
            <b>factures électroniques</b> : création, organisation, export, et partage avec une équipe ou un
            comptable (selon les autorisations).
          </p>
          <p className="ftn-legal-p">
            En utilisant FactureTN, vous acceptez les présentes Conditions Générales d’Utilisation.
          </p>
        </Section>

        <Section id="acces" title="2) Accès au service & création de compte">
          <ul className="ftn-legal-list">
            <li>Vous devez fournir des informations exactes et à jour.</li>
            <li>Vous êtes responsable de la confidentialité de votre mot de passe.</li>
            <li>
              L’accès peut être suspendu en cas d’abus, tentative de fraude, ou usage contraire aux présentes CGU.
            </li>
          </ul>
        </Section>

        <Section id="roles" title="3) Rôles, permissions & invitations" spanAll>
          <p className="ftn-legal-p">
            FactureTN propose plusieurs profils (ex: Client, Cabinet, Groupe) et un système de permissions
            (ex: création de facture, gestion client, validation, soumission, etc.). Les droits sont gérés
            par l’administrateur de la société ou via invitations.
          </p>
          <ul className="ftn-legal-list">
            <li>
              <b>Client</b> : gère sa société et ses factures, peut inviter une équipe/comptable selon permissions.
            </li>
            <li>
              <b>Cabinet</b> : accès comptable pouvant être soumis à validation (patente/informations) selon la politique
              interne de la plateforme.
            </li>
            <li>
              <b>Groupe</b> : gestion multi-sociétés et rôles avancés (selon forfait).
            </li>
          </ul>
        </Section>

        <Section id="responsabilite" title="4) Responsabilité de l’utilisateur" spanAll>
          <p className="ftn-legal-p">
            L’utilisateur est seul responsable des données saisies (identité, MF, montants, TVA, articles, etc.)
            et du respect des obligations légales et fiscales applicables.
          </p>
          <p className="ftn-legal-p">
            FactureTN fournit un outil de gestion ; il ne remplace pas un conseil fiscal/juridique.
          </p>
        </Section>

        <Section id="donnees" title="5) Données, confidentialité & infrastructure" spanAll>
          <p className="ftn-legal-p">
            FactureTN traite les données nécessaires au service (compte, sociétés, factures, permissions).
            Des mesures raisonnables de sécurité sont mises en place.
          </p>
          <ul className="ftn-legal-list">
            <li>
              <b>Hébergement :</b> Vercel
            </li>
            <li>
              <b>Base/Auth :</b> Supabase
            </li>
            <li>
              <b>Données techniques :</b> logs, anti-abus, performance (strictement nécessaires au fonctionnement)
            </li>
          </ul>
        </Section>

        <Section id="support" title="6) Support & contact">
          <p className="ftn-legal-p">
            Support :{" "}
            <a className="ftn-legal-link" href="mailto:zhanisana@gmail.com">
              zhanisana@gmail.com
            </a>{" "}
            —{" "}
            <a className="ftn-legal-link" href="tel:+21620121521">
              +216 20 121 521
            </a>
          </p>
          <p className="ftn-legal-note">
            Pour toute question liée au service, merci d’indiquer votre email de compte FactureTN.
          </p>
        </Section>

        <Section id="final" title="7) Dispositions finales" spanAll>
          <ul className="ftn-legal-list">
            <li>Les CGU peuvent être mises à jour ; la version en ligne fait foi.</li>
            <li>Si une clause est invalide, les autres restent applicables.</li>
            <li>Droit applicable : Tunisie (à préciser si tu veux une formulation juridique exacte).</li>
          </ul>

          <p className="ftn-legal-p">
            Voir aussi :{" "}
            <Link className="ftn-legal-link" href="/mentions-legales">
              Mentions légales
            </Link>
            .
          </p>
        </Section>
      </div>

      <footer className="ftn-legal-footer">
        <div>© {year} FactureTN — Tous droits réservés.</div>
        <div className="ftn-legal-footer-links">
          <Link className="ftn-legal-footlink" href="/mentions-legales">
            Mentions légales
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
