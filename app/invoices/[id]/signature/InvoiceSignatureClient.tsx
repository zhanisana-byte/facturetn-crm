// app/invoices/[id]/signature/InvoiceSignatureClient.tsx
async function start() {
  if (loading) return;

  setErr("");
  setLoading(true);

  try {
    const inv = String(invoiceId ?? "").trim();
    if (!inv) {
      setErr("INVOICE_ID_MISSING");
      return;
    }

    const safeBackUrl = String(backUrl ?? "").trim() || `/invoices/${encodeURIComponent(inv)}`;

    const r = await fetch("/api/digigo/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoice_id: inv, back_url: safeBackUrl }),
      credentials: "include",
      cache: "no-store",
    });

    const raw = await r.text().catch(() => "");
    let j: any = {};
    try {
      j = raw ? JSON.parse(raw) : {};
    } catch {
      j = {};
    }

    if (!r.ok || !j?.ok || !j?.authorize_url) {
      const msg = String(j?.message || j?.error || raw || `HTTP_${r.status}`).trim();
      setErr(msg);
      return;
    }

    const authorizeUrl = String(j.authorize_url).trim();
    const state = String(j.state || "").trim();
    const invoice_id = String(j.invoice_id || "").trim();
    const back_url = String(j.back_url || "").trim();

    sessionStorage.setItem("digigo_state", state);
    sessionStorage.setItem("digigo_invoice_id", invoice_id);
    sessionStorage.setItem("digigo_back_url", back_url);

    window.location.href = authorizeUrl;
  } catch (e: any) {
    setErr(String(e?.message || "NETWORK_ERROR").trim());
  } finally {
    setLoading(false);
  }
}
