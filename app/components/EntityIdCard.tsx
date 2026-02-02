"use client";

import { useState } from "react";

export default function EntityIdCard({
  title,
  entityId,
}: {
  title: string;
  entityId: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(entityId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="ftn-card p-4">
      <div className="text-sm font-semibold mb-2">{title}</div>

      <div className="flex items-center justify-between gap-3">
        <code className="text-xs bg-slate-100 border px-2 py-1 rounded">
          {entityId}
        </code>

        <button
          type="button"
          onClick={copy}
          className="ftn-btn ftn-btn-ghost text-xs"
        >
          {copied ? "Copié " : "Copier"}
        </button>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        Identifiant technique utilisé pour les invitations et le support.
      </div>
    </div>
  );
}
