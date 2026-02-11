"use client";

import EditInvoiceClient from "./EditInvoiceClient";

export default function InlineInvoiceEditor({ invoice, items }: { invoice: any; items: any[] }) {
  return (
    <div className="ftn-card p-5 mt-4">
      <div className="ftn-section-title">Modifier</div>
      <div className="mt-3">
        <EditInvoiceClient invoice={invoice} items={items} />
      </div>
    </div>
  );
}
