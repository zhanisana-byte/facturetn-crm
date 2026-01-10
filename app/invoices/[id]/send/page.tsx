"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function SendInvoiceEmailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;
  const router = useRouter();

  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("Facture - FactureTN");
  const [message, setMessage] = useState(
    "Bonjour,\n\nVeuillez trouver ci-joint la facture.\n\nCordialement."
  );

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function onSend() {
    setErr(null);
    setOkMsg(null);

    if (!toEmail.trim()) {
      setErr("Email destinataire obligatoire.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail, subject, message }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setErr(data?.error || "Erreur envoi email");
        return;
      }

      setOkMsg("✅ Email enregistré (mode test).");
      // Option: retourner à la facture après 1s
      setTimeout(() => router.push(`/invoices/${invoiceId}`), 900);
    } catch (e: any) {
      setErr(e?.message || "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Envoyer la facture par email</h1>
        <button
          onClick={() => router.push(`/invoices/${invoiceId}`)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
        >
          ← Retour
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <label className="text-sm font-medium">Destinataire</label>
          <input
            className="mt-1 w-full border border-slate-200 rounded-xl p-3"
            placeholder="ex: client@email.com"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Sujet</label>
          <input
            className="mt-1 w-full border border-slate-200 rounded-xl p-3"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Message</label>
          <textarea
            className="mt-1 w-full border border-slate-200 rounded-xl p-3 min-h-[160px]"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
        {okMsg && <div className="text-sm text-emerald-600">{okMsg}</div>}

        <div className="flex gap-2">
          <button
            disabled={loading}
            onClick={onSend}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Envoi..." : "Envoyer"}
          </button>

          <a
            href={`/api/invoices/${invoiceId}/pdf`}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
          >
            Télécharger PDF
          </a>

          <a
            href={`/api/invoices/${invoiceId}/xml`}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
          >
            Télécharger XML
          </a>
        </div>

        <p className="text-xs text-slate-500">
          Mode test : on enregistre un log. Ensuite on branche Resend/SMTP pour envoyer vraiment.
        </p>
      </div>
    </div>
  );
}
