import Link from "next/link";

export const metadata = {
  title: "Conditions générales | FactureTN",
  description: "Conditions générales d’utilisation de FactureTN (Facturation TTN Tunisie).",
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
  return (
    <main className="ftn-legal-wrap">
      <header className="ftn-legal-top">
        <div className="ftn-legal-brand">
          <div className="ftn-legal-logo" aria-hidden="true">FTN</div>
          <div>
            <h1 className="ftn-legal-h1">Conditions générales</h1>
            <p className="ftn-legal-sub">
              Conditions d’utilisation et de souscription applicables à FactureTN. (Modèle à adapter / valider juridiquement.)
            </p>
          </div>
        </div>

        <nav className="ftn-legal-nav">
          <Link className="ftn-legal-navlink" href="/mentions-legales">Mentions légales</Link>
          <Link className="ftn-legal-navlink" href="/register">Créer un compte</Link>
        </nav>
      </header>

      <div className="ftn-legal-toc">
        <div className="ftn-legal-toc-title">Sommaire</div>
        <div className="ftn-legal-toc-links">
          <a className="ftn-legal-toc-link" href="#def">Définitions</a>
          <a className="ftn-legal-toc-link" href="#account">Compte & accès</a>
          <a className="ftn-legal-toc-link" href="#plans">Plans & rôles</a>
          <a className="ftn-legal-toc-link" href="#billing">Paiement / abonnement</a>
          <a className="ftn-legal-toc-link" href="#ttn">Conformité TTN</a>
          <a className="ftn-legal-toc-link" href="#data">Données & sécurité</a>
          <a className="ftn-legal-toc-link" href="#support">Support</a>
          <a className="ftn-legal-toc-link" href="#misc">Dispositions finales</a>
        </div>
      </div>

      <div className="ftn-legal-grid">
        <Section id="def" title="1) Définitions">
          <p className="ftn-legal-p">
            <b>Plateforme</b> : FactureTN. <br />
            <b>Utilisateur</b> : personne créant un compte. <br />
            <b>Société</b> : entité gérée dans FactureTN. <br />
            <b>Cabinet</b> : compte “cabinet/comptable” soumis à validation. <br />
            <b>Groupe</b> : compte multi-sociétés avec accès avancés.
          </p>
        </Section>

        <Section id="account" title="2) Compte & accès">
          <ul className="ftn-legal-list">
            <li>L’utilisateur garantit l’exactitude des informations lors de l’inscription.</li>
            <li>Les identifiants sont personnels : l’utilisateur est responsable de leur confidentialité.</li>
            <li>FactureTN peut suspendre un compte en cas d’usage abusif, fraude, ou non-respect des CGU.</li>
          </ul>
        </Section>

        <Section id="plans" title="3) Plans & rôles (Client / Cabinet / Groupe)">
          <ul className="ftn-legal-list">
            <li><b>Client</b> : gestion standard, 1 société (selon ton plan), invitation équipe/comptable.</li>
            <li><b>Cabinet</b> : accès gratuit <b>après validation</b> (MF/Patente), accès aux dossiers selon invitations.</li>
            <li><b>Groupe</b> : multi-sociétés, rôles avancés, équipes internes, reporting (selon forfait).</li>
          </ul>
        </Section>

        <Section id="billing" title="4) Paiement / facturation / abonnement" spanAll>
          <p className="ftn-legal-p">
            Certains services peuvent être payants (ex: Groupe, options premium, sur-mesure). Les tarifs et modalités sont
            affichés avant paiement.
          </p>
          <ul className="ftn-legal-list">
            <li>Le non-paiement peut entraîner une limitation ou suspension de fonctionnalités.</li>
            <li>En cas de résiliation, l’accès peut rester actif jusqu’à la fin de la période payée.</li>
          </ul>
          <p className="ftn-legal-note">(Dev) Ajoute ici ta politique de remboursement si nécessaire.</p>
        </Section>

        <Section id="ttn" title="5) Conformité TTN / obligations de l’utilisateur" spanAll>
          <p className="ftn-legal-p">
            FactureTN fournit des outils. <b>L’utilisateur reste responsable</b> de la conformité finale de ses factures et du respect
            des obligations fiscales/légales applicables en Tunisie.
          </p>
          <ul className="ftn-legal-list">
            <li>Véracité des données : identité, MF, montants, TVA, articles, etc.</li>
            <li>Transmission à des services tiers (ex TTN) selon configuration et autorisations.</li>
            <li>FactureTN ne remplace pas un conseil fiscal/juridique.</li>
          </ul>
        </Section>

        <Section id="data" title="6) Données, sécurité et confidentialité (résumé)" spanAll>
          <p className="ftn-legal-p">
            FactureTN traite des données nécessaires au service (comptes, sociétés, factures, accès). Des mesures raisonnables
            de sécurité sont mises en place.
          </p>
          <ul className="ftn-legal-list">
            <li>Accès restreints selon rôles (membres, invitations, permissions).</li>
            <li>Journaux techniques possibles pour sécurité et support.</li>
          </ul>
        </Section>

        <Section id="support" title="7) Support & disponibilité">
          <p className="ftn-legal-p">
            Support via <b>[email support]</b>. Des interruptions peuvent survenir (maintenance, mises à jour, incidents).
          </p>
        </Section>

        <Section id="misc" title="8) Dispositions finales">
          <ul className="ftn-legal-list">
            <li>FactureTN peut faire évoluer les CGU ; la version en ligne fait foi.</li>
            <li>Si une clause est invalide, les autres restent applicables.</li>
            <li><b>Droit applicable / juridiction :</b> [Tunisie — à confirmer juridiquement]</li>
          </ul>
        </Section>
      </div>

      <footer className="ftn-legal-footer">
        <div>© {new Date().getFullYear()} FactureTN — Tous droits réservés.</div>
        <div className="ftn-legal-footer-links">
          <Link className="ftn-legal-footlink" href="/mentions-legales">Mentions légales</Link>
          <span className="ftn-legal-sep">•</span>
          <Link className="ftn-legal-footlink" href="/register">Inscription</Link>
        </div>
      </footer>
    </main>
  );
}
