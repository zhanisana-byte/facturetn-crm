'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function InvoiceSignaturePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();

  const invoiceId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<any>(null);

  useEffect(() => {
    if (!invoiceId) return;

    const loadInvoice = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          customer_name,
          total_ttc,
          stamp_amount,
          net_to_pay,
          ttn_status,
          signature_provider
        `)
        .eq('id', invoiceId)
        .single();

      if (error) {
        setError(error.message);
      } else {
        setInvoice(data);
      }

      setLoading(false);
    };

    loadInvoice();
  }, [invoiceId]);

  if (loading) {
    return <div className="p-8 text-sm">Chargement de la signature…</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-red-600 text-sm">
        Erreur : {error}
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8 text-sm">
        Facture introuvable.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="ftn-card p-6">
        <h1 className="text-xl font-semibold mb-2">
          Signature de la facture
        </h1>

        <div className="text-sm text-slate-600">
          Facture : {invoice.invoice_number || invoice.id}
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div><b>Client :</b> {invoice.customer_name}</div>
          <div><b>Total TTC :</b> {invoice.total_ttc} TND</div>
          <div><b>Timbre fiscal :</b> {invoice.stamp_amount} TND</div>
          <div><b>Net à payer :</b> {invoice.net_to_pay} TND</div>
          <div>
            <b>Statut TTN :</b>{' '}
            {invoice.ttn_status || 'non envoyé'}
          </div>
          <div>
            <b>Signature :</b>{' '}
            {invoice.signature_provider || 'selon société'}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            className="ftn-btn"
            onClick={() => {
              alert('Ici on branchera DigiGO / Clé USB / Agent local');
            }}
          >
            Lancer la signature
          </button>

          <button
            className="ftn-btn ftn-btn-ghost"
            onClick={() => router.push('/invoices')}
          >
            Retour factures
          </button>
        </div>
      </div>
    </div>
  );
}
