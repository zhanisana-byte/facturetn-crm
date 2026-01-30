"use client";

import { useMemo, useState } from "react";

export default function InvoiceActions({
  invoiceId,
  companyId,
  documentType,
  canSendTTN,
  canValidate,
  canSubmitForValidation,
  validationRequired,
  status,
  validatedAt,
  ttnStatus,
  ttnScheduledAt,
  ttnSendMode,
  signatureProvider,
  signatureRequired,
  invoiceSigned,
  signaturePending,
  digigoTransactionId,
  digigoOtpId,
  viewedBeforeSignatureAt,
}: {
  invoiceId: string;
  companyId?: string;
  documentType: string;
  canSendTTN: boolean;
  canValidate: boolean;
  canSubmitForValidation: boolean;
  validationRequired: boolean;
  status: string;
  validatedAt: string | null;
  ttnStatus: string;
  ttnScheduledAt: string | null;
  ttnSendMode: "api" | "manual";
  signatureProvider: string;
  signatureRequired: boolean;
  invoiceSigned: boolean;
  signaturePending: boolean;
  digigoTransactionId: string | null;
  digigoOtpId: string | null;
  viewedBeforeSignatureAt: string | null;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [viewConfirmed, setViewConfirmed] = useState<boolean>(() => !!viewedBeforeSignatureAt);
  const [viewLoading, setViewLoading] = useState<boolean>(false);

  const [scheduleAt, setScheduleAt] = useState<string>(() => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}`;
  });

  async function markViewed() {
    try {
      setViewLoading(true);
      const res = await fetch(`/api/invoices/${invoiceId}/viewed`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        alert(data?.error || "Impossible d’enregistrer la consultation.");
        return false;
      }
      setViewConfirmed(true);
      return true;
    } catch (e: any) {
      alert(e?.message || "Erreur réseau");
      return false;
    } finally {
      setViewLoading(false);
    }
  }

  async function download(url: string, label: string, fallbackName: string) {
    try {
      setLoading(label);
      const res = await fetch(url, { method: "GET" });

      const ct = res.headers.get("content-type") || "";
      if (!res.ok || ct.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || `Erreur: ${label}`);
        return;
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^\"]+)"?/i);
      const filename = match?.[1] || fallbackName;

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      alert(e?.message || "Erreur réseau");
    } finally {
      setLoading(null);
    }
  }

  async function call(url: string, label: string) {
    try {
      setLoading(label);
      const res = await fetch(url, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        alert(data?.error || `Erreur: ${label}`);
        return;
      }
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Erreur réseau");
    } finally {
      setLoading(null);
    }
  }

  async function callGet(url: string, label: string) {
    try {
      setLoading(label);
      const res = await fetch(url, { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        alert(data?.error || `Erreur: ${label}`);
        return;
      }
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Erreur réseau");
    } finally {
      setLoading(null);
    }
  }

  async function callWithBody(url: string, label: string, body: any) {
    try {
      setLoading(label);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        alert(data?.error || `Erreur: ${label}`);
        return;
      }
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Erreur réseau");
    } finally {
      setLoading(null);
    }
  }

  const pdfUrl = `/api/invoices/${invoiceId}/pdf`;
  const xmlUrl = `/api/invoices/${invoiceId}/xml`;
  const xmlSignedUrl = `/api/invoices/${invoiceId}/xml-signed`;

  const docType = String(documentType || "facture").toLowerCase();
  const isQuote = docType === "devis";
  const isManualMode = ttnSendMode === "manual";
  const st = String(status || "draft");

  const ttnLocked = String(ttnStatus || "not_sent") !== "not_sent";

  const showSubmitForValidation = validationRequired && !validatedAt && st === "draft";
  const showValidate = validationRequired && !validatedAt && st === "pending_validation";

  const mustViewBeforeSignature = !isQuote && signatureRequired && !invoiceSigned;

  const provider = String(signatureProvider || "none");

  const signatureUi = useMemo(() => {
    if (!signatureRequired) return { label: "Non requise", tone: "text-slate-500" };
    if (invoiceSigned) return { label: "OK ✅", tone: "text-emerald-700" };
    if (signaturePending) return { label: "En attente", tone: "text-amber-700" };
    return { label: "à faire", tone: "text-slate-700" };
  }, [signatureRequired, invoiceSigned, signaturePending]);

  const canDeclareManual =
    !isQuote && !ttnLocked && canSendTTN && (signatureRequired ? invoiceSigned : true);

  const canSendTTNNow =
    !isQuote && !ttnLocked && canSendTTN && (signatureRequired ? invoiceSigned : true) && !isManualMode;

  async function startUsbSignature() {
    if (mustViewBeforeSignature && !viewConfirmed) {
      alert("Vous devez d’abord voir la facture avant signature.");
      return;
    }
    try {
      setLoading("Signature");
      const res = await fetch(`/api/signature/sign-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, environment: "production" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        alert(data?.error || "Impossible de démarrer la signature.");
        return;
      }
      const deepLinkUrl = String(data?.deepLinkUrl || "");
      if (!deepLinkUrl) {
        alert("Lien de signature indisponible.");
        return;
      }
      window.location.href = deepLinkUrl;
    } catch (e: any) {
      alert(e?.message || "Erreur réseau");
    } finally {
      setLoading(null);
    }
  }

  async function confirmDigigo(otp_id: string, otp: string) {
    const res2 = await fetch(`/api/signature/digigo/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_id: invoiceId, otp_id, otp }),
    });
    const d2 = await res2.json().catch(() => ({}));
    if (!res2.ok || d2?.ok === false) {
      alert(d2?.error || "La validation DigiGO a échoué.");
      return;
    }
    window.location.reload();
  }

  async function continueDigigoWithPin(pin: string) {
    const res = await fetch(`/api/signature/digigo/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_id: invoiceId, pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      alert(data?.error || "PIN invalide (DigiGO).");
      return;
    }
    if (data?.otp_required) {
      const otp = prompt("DigiGO : saisissez l’OTP reçu (SMS/email)");
      if (!otp) {
        window.location.reload();
        return;
      }
      await confirmDigigo(String(data?.otp_id || ""), otp);
      return;
    }
    window.location.reload();
  }

  async function startDigigoSignature() {
    if (mustViewBeforeSignature && !viewConfirmed) {
      alert("Vous devez d’abord voir la facture avant signature.");
      return;
    }
    try {
      setLoading("DigiGO");

      const start1 = await fetch(`/api/signature/digigo/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
      const d1 = await start1.json().catch(() => ({}));

      if (!start1.ok || d1?.ok === false) {
        alert(d1?.error || "Impossible de démarrer DigiGO.");
        return;
      }

      if (d1?.need_identity) {
        const phone = prompt("DigiGO : votre téléphone (format +216...)");
        const email = prompt("DigiGO : votre email (optionnel)") || "";
        const national_id = prompt("DigiGO : CIN / identifiant (optionnel)") || "";
        if (!phone && !email) {
          alert("Téléphone ou email requis pour DigiGO.");
          window.location.reload();
          return;
        }

        const start2 = await fetch(`/api/signature/digigo/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoice_id: invoiceId,
            identity: { phone, email, national_id },
          }),
        });
        const d2 = await start2.json().catch(() => ({}));
        if (!start2.ok || d2?.ok === false) {
          alert(d2?.error || "Impossible de démarrer DigiGO.");
          return;
        }

        if (d2?.need_pin) {
          const pin = prompt("DigiGO : saisissez le PIN reçu (SMS/email)");
          if (!pin) {
            window.location.reload();
            return;
          }
          await continueDigigoWithPin(pin);
          return;
        }

        if (d2?.otp_required) {
          const otp = prompt("DigiGO : saisissez l’OTP reçu (SMS/email)");
          if (!otp) {
            window.location.reload();
            return;
          }
          await confirmDigigo(String(d2?.otp_id || ""), otp);
          return;
        }

        window.location.reload();
        return;
      }

      if (d1?.need_pin) {
        const pin = prompt("DigiGO : saisissez le PIN reçu (SMS/email)");
        if (!pin) {
          window.location.reload();
          return;
        }
        await continueDigigoWithPin(pin);
        return;
      }

      if (d1?.otp_required) {
        const otp = prompt("DigiGO : saisissez l’OTP reçu (SMS/email)");
        if (!otp) {
          window.location.reload();
          return;
        }
        await confirmDigigo(String(d1?.otp_id || ""), otp);
        return;
      }

      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Erreur réseau");
    } finally {
      setLoading(null);
    }
  }

  async function confirmDigigoLater() {
    const otpId = String(digigoOtpId || "").trim();
    if (!otpId) {
      alert("OTP DigiGO introuvable. Relancez la demande.");
      return;
    }
    const otp = prompt("DigiGO : saisissez l’OTP reçu (SMS/email)");
    if (!otp) return;

    setLoading("DigiGO");
    try {
      await confirmDigigo(otpId, otp);
    } finally {
      setLoading(null);
    }
  }

  async function declareManual() {
    if (!canDeclareManual) {
      alert("Action bloquée.");
      return;
    }
    const ref = window.prompt("Référence (optionnel) :") || "";
    const note = window.prompt("Note (optionnel) :") || "";
    await callWithBody(`/api/invoices/${invoiceId}/declaration`, "Déclaration manuelle", {
      status: "manual",
      ref,
      note,
    });
  }

  async function startSignatureAuto() {
    if (invoiceSigned) return;
    if (provider !== "usb_agent" && provider !== "digigo") {
      alert("Aucune méthode de signature configurée. Allez dans Paramètres TTN → Signature.");
      return;
    }
    if (provider === "usb_agent") {
      await startUsbSignature();
      return;
    }
    if (provider === "digigo") {
      await startDigigoSignature();
      return;
    }
  }

  const showSignButton = signatureRequired && !invoiceSigned;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Actions</h2>

      <p className="text-sm text-slate-600 mt-1">
        Téléchargements disponibles après l’enregistrement.
        {signatureRequired ? (
          <span className="ml-2">
            Signature&nbsp;: <b className={signatureUi.tone}>{signatureUi.label}</b>
          </span>
        ) : null}
        {signaturePending ? (
          <span className="ml-2">
            <b className="text-amber-700">Signature en attente</b>
          </span>
        ) : null}
      </p>

      <div className="mt-4 flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={loading !== null}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
          onClick={() => download(pdfUrl, "Téléchargement PDF", `facture-${invoiceId}.pdf`)}
        >
          {loading === "Téléchargement PDF" ? "Téléchargement..." : "Télécharger PDF (sans signature)"}
        </button>

        <button
          type="button"
          disabled={loading !== null}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
          onClick={() => download(xmlUrl, "Téléchargement XML", `facture-${invoiceId}.xml`)}
        >
          {loading === "Téléchargement XML" ? "Téléchargement..." : "Télécharger XML (TEIF)"}
        </button>

        <button
          type="button"
          disabled={loading !== null || !invoiceSigned}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
          onClick={() => download(xmlSignedUrl, "Téléchargement XML signé", `facture-${invoiceId}-signed.xml`)}
        >
          {loading === "Téléchargement XML signé" ? "Téléchargement..." : "Télécharger XML (signé)"}
        </button>

        {mustViewBeforeSignature ? (
          <div className="w-full mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="font-medium">Voir la facture avant signature</div>
            <div className="text-slate-600 mt-1">Le signataire doit consulter la facture avant de signer.</div>

            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100"
                onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}
              >
                Voir la facture (PDF)
              </button>

              {!viewConfirmed ? (
                <button
                  type="button"
                  disabled={viewLoading || loading !== null}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                  onClick={() => markViewed()}
                >
                  {viewLoading ? "Enregistrement..." : "J’ai consulté la facture"}
                </button>
              ) : (
                <span className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800">
                  Consultation enregistrée ✅
                </span>
              )}
            </div>
          </div>
        ) : null}

        {showSignButton ? (
          <>
            <button
              disabled={loading !== null}
              className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm hover:bg-violet-700 disabled:opacity-60"
              onClick={() => startSignatureAuto()}
            >
              {loading === "Signature" || loading === "DigiGO" ? "Signature..." : "Signer"}
            </button>

            {provider === "digigo" && (signaturePending || digigoOtpId) ? (
              <button
                disabled={loading !== null}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
                onClick={() => confirmDigigoLater()}
              >
                {loading === "DigiGO" ? "Validation..." : "Saisir OTP DigiGO"}
              </button>
            ) : null}
          </>
        ) : null}

        {!isQuote ? (
          <>
            <button
              disabled={!canSendTTNNow || loading !== null}
              className={`px-4 py-2 rounded-xl text-sm disabled:opacity-60 ${
                canSendTTNNow ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-200 text-slate-500"
              }`}
              onClick={() => call(`/api/invoices/${invoiceId}/ttn`, "TTN")}
              title={
                ttnLocked
                  ? "TTN bloqué (déjà envoyé / soumis / accepté / rejeté / programmé)"
                  : signatureRequired && !invoiceSigned
                  ? "Signature requise avant l’envoi"
                  : "Envoyer à TTN"
              }
            >
              {loading === "TTN" ? "Envoi à TTN..." : "Envoyer à TTN"}
            </button>

            <button
              disabled={loading !== null}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
              onClick={() => callGet(`/api/invoices/${invoiceId}/ttn/status`, "Actualiser TTN")}
            >
              {loading === "Actualiser TTN" ? "Actualisation..." : "Actualiser statut TTN"}
            </button>

            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                disabled={!canSendTTNNow || loading !== null}
              />
              <button
                disabled={!canSendTTNNow || loading !== null}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
                onClick={() =>
                  callWithBody(`/api/invoices/${invoiceId}/ttn/schedule`, "Programmer TTN", { scheduled_at: scheduleAt })
                }
              >
                {loading === "Programmer TTN" ? "Programmation..." : "Programmer l’envoi"}
              </button>
            </div>
          </>
        ) : null}

        {isManualMode && !isQuote ? (
          <button
            disabled={loading !== null || !canDeclareManual}
            className={`px-4 py-2 rounded-xl text-sm disabled:opacity-60 ${
              canDeclareManual ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-200 text-slate-500"
            }`}
            onClick={() => declareManual()}
            title={
              ttnLocked
                ? "TTN bloqué (déjà envoyé / soumis / accepté / rejeté / programmé)"
                : signatureRequired && !invoiceSigned
                ? "Télécharger d’abord le XML signé, puis déclarer"
                : "Déclaration manuelle"
            }
          >
            {loading === "Déclaration manuelle" ? "Déclaration..." : "Déclaration manuelle"}
          </button>
        ) : null}

        {showSubmitForValidation ? (
          <button
            disabled={loading !== null || invoiceSigned || ttnLocked}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
            onClick={() => call(`/api/invoices/${invoiceId}/submit`, "Soumettre")}
          >
            {loading === "Soumettre" ? "Soumission..." : "Soumettre pour validation"}
          </button>
        ) : null}

        {showValidate ? (
          <button
            disabled={loading !== null || invoiceSigned || ttnLocked || !canValidate}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
            onClick={() => call(`/api/invoices/${invoiceId}/validate`, "Valider")}
          >
            {loading === "Valider" ? "Validation..." : "Valider (comptable)"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
