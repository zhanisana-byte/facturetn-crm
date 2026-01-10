import Link from "next/link";
import AppShell from "@/app/components/AppShell";

export default function HelpPage() {
  return (
    <AppShell
      title="Aide & Support"
      subtitle="Guides rapides (client, multi-société, comptable) + contacts."
    >
      <div className="ftn-page">
        {/* ================= CONTACT / SUPPORT ================= */}
        <div className="ftn-card">
          <h2 style={{ marginTop: 0 }}>Support FactureTN</h2>

          <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
            <li>
              📧 Email :{" "}
              <a href="mailto:support@facturetn.com">
                support@facturetn.com
              </a>
            </li>

            <li>
              📞 Téléphone :{" "}
              <b style={{ fontSize: 16 }}>+216 20 121 521</b>
            </li>

            <li>🕘 Horaires : Lun–Ven 9h–17h (Tunisie)</li>
          </ul>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Link className="ftn-btn" href="/subscription">
              Voir abonnement
            </Link>

            <Link className="ftn-btn ftn-btn-soft" href="/ttn">
              Paramètres TTN
            </Link>
          </div>
        </div>

        {/* ================= FAQ ================= */}
        <div className="ftn-card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>FAQ rapide</h2>

          <details>
            <summary>Pourquoi l’export XML doit être &lt; 50 Ko ?</summary>
            <p style={{ marginTop: 8 }}>
              L’intégration TTN impose une taille maximale par document.
              FactureTN garde l’XML compact et prépare la signature côté TTN.
            </p>
          </details>

          <details>
            <summary>Où configurer la signature / certificat TTN ?</summary>
            <p style={{ marginTop: 8 }}>
              Dans <b>Ma société → Paramètres TTN</b>.  
              Chaque société possède ses propres informations.
            </p>
          </details>

          <details>
            <summary>Comptable : comment gérer plusieurs clients ?</summary>
            <p style={{ marginTop: 8 }}>
              Via les <b>Invitations</b>, puis bascule entre sociétés depuis
              l’espace comptable.
            </p>
          </details>
        </div>

        {/* ================= GUIDES ================= */}
        <div className="ftn-card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Guides rapides</h2>

          <div className="ftn-grid-3" style={{ marginTop: 12 }}>
            <div className="ftn-card ftn-card-soft">
              <h3 style={{ marginTop: 0 }}>Client (1 société)</h3>
              <ol>
                <li>Créer la société (MF, TVA, timbre).</li>
                <li>Créer les factures (PDF / XML).</li>
                <li>Valider la déclaration mensuelle.</li>
              </ol>
            </div>

            <div className="ftn-card ftn-card-soft">
              <h3 style={{ marginTop: 0 }}>Multi-sociétés / Groupe</h3>
              <ol>
                <li>Gérer plusieurs sociétés.</li>
                <li>Définir rôles & permissions.</li>
                <li>Centraliser la validation TTN.</li>
              </ol>
            </div>

            <div className="ftn-card ftn-card-soft">
              <h3 style={{ marginTop: 0 }}>Comptable</h3>
              <ol>
                <li>Recevoir invitation sécurisée.</li>
                <li>Accéder aux factures clients.</li>
                <li>Audit & préparation TTN.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
