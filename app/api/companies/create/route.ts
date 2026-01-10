"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "normal" | "permanente";

export default function NewInvoiceClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const companyId = sp.get("company") || "";
  const mode = (sp.get("mode") as Mode | null) ?? null;

  const canUse = useMemo(() => !!companyId, [companyId]);

  function setMode(nextMode: Mode) {
    const qs = new URLSearchParams(sp.toString());
    qs.set("mode", nextMode);
    router.push(`/invoices/new?${qs.toString()}`);
  }

  function resetMode() {
    const qs = new URLSearchParams(sp.toString());
    qs.delete("mode");
    router.push(`/invoices/new?${qs.toString()}`);
  }

  if (!canUse) {
    return (
      <div className="ftn-content">
        <div className="ftn-alert">
          Company manquante dans l’URL. Ouvre cette page avec <b>?company=ID</b>.
        </div>
      </div>
    );
  }

  return (
    <div className="ftn-content">
      {/* ===== STEP 1: CHOIX MODE ===== */}
      {!mode && (
        <div className="ftn-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold">Nouvelle facture TTN</div>
              <p className="ftn-muted" style={{ marginTop: 6 }}>
                Choisissez le mode avant de saisir les champs de la facture TTN.
              </p>
            </div>
            <span className="ftn-badge tone-info">Étape 1 / 2</span>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            {/* NORMAL */}
            <button
              type="button"
              onClick={() => setMode("normal")}
              className="ftn-reg-option accent-orange"
              style={{ padding: 16 }}
            >
              <div className="ftn-reg-top">
                <span className="ftn-reg-dot" aria-hidden="true" />
                <div className="ftn-reg-head">
                  <div className="ftn-reg-title">Mode Normal</div>
                  <div className="ftn-reg-sub">Facture TTN classique · création immédiate</div>
                </div>
                <span className="ftn-reg-check">○</span>
              </div>

              <div className="ftn-reg-bullets">
                <span className="ftn-reg-pill">PDF</span>
                <span className="ftn-reg-pill">XML</span>
                <span className="ftn-reg-pill">Numérotation</span>
                <span className="ftn-reg-pill">TTN</span>
              </div>

              <p className="ftn-muted" style={{ marginTop: 10, textAlign: "left" }}>
                Recommandé pour commencer : vous saisissez, validez, puis exportez PDF/XML.
              </p>

              <div style={{ marginTop: 12 }}>
                <span className="ftn-btn" style={{ width: "100%" }}>
                  Continuer en Normal
                </span>
              </div>
            </button>

            {/* PERMANENTE */}
            <button
              type="button"
              onClick={() => setMode("permanente")}
              className="ftn-reg-option accent-blue"
              style={{ padding: 16 }}
            >
              <div className="ftn-reg-top">
                <span className="ftn-reg-dot" aria-hidden="true" />
                <div className="ftn-reg-head">
                  <div className="ftn-reg-title">Mode Permanente</div>
                  <div className="ftn-reg-sub">Facture TTN mensuelle · modèle récurrent</div>
                </div>
                <span className="ftn-reg-check">○</span>
              </div>

              <div className="ftn-reg-bullets">
                <span className="ftn-reg-pill">Récurrent</span>
                <span className="ftn-reg-pill">Mensuel</span>
                <span className="ftn-reg-pill">Auto-génération</span>
                <span className="ftn-reg-pill">TTN</span>
              </div>

              <p className="ftn-muted" style={{ marginTop: 10, textAlign: "left" }}>
                Idéal pour abonnements : génération automatique après activation du module récurrent.
              </p>

              <div style={{ marginTop: 12 }}>
                <span className="ftn-btn-ghost" style={{ width: "100%" }}>
                  Configurer Permanente
                </span>
              </div>
            </button>
          </div>

          <div className="ftn-muted" style={{ marginTop: 12 }}>
            Astuce : commencez en <b>Normal</b>, puis activez <b>Permanente</b> quand votre module récurrent est prêt.
          </div>

          <style jsx>{`
            @media (max-width: 900px) {
              div[style*="grid-template-columns: 1fr 1fr"] {
                grid-template-columns: 1fr !important;
              }
            }
          `}</style>
        </div>
      )}

      {/* ===== STEP 2: FORMULAIRE SELON MODE ===== */}
      {mode === "normal" && (
        <div className="ftn-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold">Facture TTN — Mode Normal</div>
              <p className="ftn-muted" style={{ marginTop: 6 }}>
                Remplissez votre facture. Export PDF/XML ensuite.
              </p>
            </div>
            <button type="button" className="ftn-btn-ghost" onClick={resetMode}>
              ← Changer le mode
            </button>
          </div>

          {/* ✅ ICI tu mets ton formulaire actuel "normal" */}
          <div className="ftn-callout" style={{ marginTop: 14 }}>
            <div className="ftn-callout-title">Formulaire Normal</div>
            <div className="ftn-muted" style={{ marginTop: 6 }}>
              Colle ici ton formulaire actuel (champs facture, lignes, TVA, etc.)
            </div>
          </div>
        </div>
      )}

      {mode === "permanente" && (
        <div className="ftn-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold">Facture TTN — Mode Permanente</div>
              <p className="ftn-muted" style={{ marginTop: 6 }}>
                Configurez la récurrence mensuelle (client, période, règles).
              </p>
            </div>
            <button type="button" className="ftn-btn-ghost" onClick={resetMode}>
              ← Changer le mode
            </button>
          </div>

          {/* ✅ ICI tu mets ton formulaire actuel "permanente" */}
          <div className="ftn-callout" style={{ marginTop: 14 }}>
            <div className="ftn-callout-title">Configuration Permanente</div>
            <div className="ftn-muted" style={{ marginTop: 6 }}>
              Colle ici ton module récurrent (template + schedule mensuel + validation).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
