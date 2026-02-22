"use client";

import { useEffect, useMemo, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function RedirectUi() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = s(params.get("token"));

  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function run() {
      if (!token) {
        setError("MISSING_TOKEN");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(s(data?.error) || "ERROR");
          setLoading(false);
          return;
        }

        const backUrl = s(data?.back_url);
        const invoiceId = s(data?.invoice_id);

        window.location.replace(backUrl || (invoiceId ? `/invoices/${invoiceId}` : "/invoices"));
      } catch {
        setError("ERROR");
        setLoading(false);
      }
    }

    run();
  }, [token]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: 520, padding: 24, borderRadius: 16, background: "white" }}>
        {loading ? (
          <div style={{ fontWeight: 600 }}>Connexion DigiGo...</div>
        ) : (
          <div style={{ color: "red", fontWeight: 700 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
