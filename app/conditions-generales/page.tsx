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
            <h1 className="ftn-legal-h1">Conditions générales</h1>
            <p className="ftn-legal-sub">
              Dernière mise à jour : <b>{lastUpdate}</b>. Ces conditions encadrent l’accès et l’utilisation
              de FactureTN.
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
          <a className="ftn-legal-toc-link" href="#compte">Compte</a>
          <a className="ftn-legal-toc-link" href="#plans">Plans & rôles</a>
          <a className="ftn-legal-toc-link" href="#factures">Factures</a>
          <a className="ftn-legal-toc-link" href="#donnees">Données</a>
          <a className="ftn-legal-toc-link" href="#responsabilite">Responsabilité</a>
          <a className="ftn-legal-toc-link" href="#support">Support</a>
          <a className="ftn-legal-toc-link" href="#final">Final</a>
        </div>
      </div>

      <div className="ftn-legal-grid">
        <Section id="objet" title="1) Objet">
          <p className="ftn-legal-p">
            FactureTN est une plateforme visant à <b>faciliter la gestion des factures électroniques</b> :
            création, organisation, export, partage et gestion des droits d’accès (équipe, comptable, multi-sociétés).
          </p>
          <p className="ftn-legal-p">
            En créant un compte ou en utilisant le service, vous acceptez les présentes conditions.
          </p>
        </Section>

        <Section id="compte" title="2) Compte, sécurité & accès">
          <ul className="ftn-legal-list">
            <li>Vous devez fournir des informations exactes lors de l’inscription.</li>
            <li>Vous êtes responsable de la confidentialité de vos identifiants.</li>
            <li>Tout usage abusif peut entraîner suspension ou restriction d’accès.</li>
          </ul>
        </Section>

        <Section id="plans" title="3) Plans & rôles (Client / Cabinet / Groupe)" spanAll>
          <ul className="ftn-legal-list">
            <li>
              <b>Client</b> : création et gestion d’une société (selon plan), factures, invitations équipe/comptable.
            </li>
            <li>
              <b>Cabinet</b> : accès comptable pouvant nécessiter <b>validation</b> (patente / informations fournies),
              et accès aux clients uniquement via invitations/permissions.
            </li>
            <li>
              <b>Groupe</b> : gestion multi-sociétés, rôles avancés, équipes internes et reporting (selon forfait).
            </li>
          </ul>
          <p className="ftn-legal-note">
            Les fonctionnalités peuvent évoluer. Les limites (ex: nombre de sociétés) dépendent du plan affiché dans l’interface.
          </p>
        </Section>

        <Section id="factures" title="4) Factures & obligations de l’utilisateur" spanAll>
          <p className="ftn-legal-p">
            L’utilisateur reste responsable de la véracité des données saisies (identité, MF, montants, TVA, articles, etc.)
            et du respect des obligations fiscales/légales.
          </p>
          <ul className="ftn-legal-list">
            <li>FactureTN fournit des outils de gestion et d’export.</li>
            <li>La plateforme ne remplace pas un conseil fiscal/juridique.</li>
            <li>Vous devez vérifier vos documents avant envoi/partage.</li>
          </ul>
        </Section>

        <Section id="donnees" title="5) Données & confidentialité (résumé)" spanAll>
          <p className="ftn-legal-p">
            FactureTN traite des données nécessaires au service (compte, sociétés, factures, permissions). Des mesures
            raisonnables sont mises en place pour protéger l’accès.
          </p>
          <p className="ftn-legal-p">
            Infrastructure : Vercel (hébergement) et Supabase (base/auth). Certaines données techniques peuvent être
            traitées pour le fonctionnement et la sécurité.
          </p>
        </Section>

        <Section id="responsabilite" title="6) Responsabilité" spanAll>
          <p className="ftn-legal-p">
            FactureTN vise une disponibilité élevée, sans garantir l’absence d’interruptions. L’éditeur ne peut être tenu
            responsable des pertes liées à une mauvaise utilisation, à des données erronées saisies, ou à des incidents externes.
          </p>
        </Section>

        <Section id="support" title="7) Support & contact">
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
        </Section>

        <Section id="final" title="8) Dispositions finales" spanAll>
          <ul className="ftn-legal-list">
            <li>Les CG peuvent être mises à jour ; la version en ligne fait foi.</li>
            <li>Si une clause est invalide, les autres restent applicables.</li>
            <li>
              Droit applicable / juridiction : <b>[Tunisie — à préciser juridiquement]</b>
            </li>
          </ul>

          <p className="ftn-legal-note">
            Tu peux afficher un lien vers <Link className="ftn-legal-link" href="/mentions-legales">Mentions légales</Link>
            {" "}dans toutes les pages d’inscription et login.
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
