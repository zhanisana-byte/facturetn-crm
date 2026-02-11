"use client";

import Link from "next/link";

export default function InvoiceActions({
  invoiceId,
  invoiceSigned,
  signatureRequired,
}: {
  invoiceId: string;
  invoiceSigned: boolean;
  signatureRequired?: boolean;
}) {
  const back = `/invoices/${invoiceId}`;

  return (
    <div className="flex flex-wrap gap-2">
      {!invoiceSigned ? (
        <Link className="ftn-btn" href={`/invoices/${invoiceId}/signature?back=${encodeURIComponent(back)}`}>
          Signer
        </Link>
      ) : null}

      <a className="ftn-btn ftn-btn-ghost" href={`/api/invoices/${invoiceId}/xml`} target="_blank" rel="noreferrer">
        Télécharger XML
      </a>

      <a
        className={`ftn-btn ftn-btn-ghost ${invoiceSigned ? "" : "opacity-50 pointer-events-none"}`}
        href={`/api/invoices/${invoiceId}/xml-signed`}
        target="_blank"
        rel="noreferrer"
      >
        Télécharger XML signé
      </a>

      <a className="ftn-btn ftn-btn-ghost" href={`/api/invoices/${invoiceId}/pdf`} target="_blank" rel="noreferrer">
        Télécharger PDF
      </a>
    </div>
  );
}
