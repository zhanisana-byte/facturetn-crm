import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function extractInvoiceIdFromState(state: string) {
  const st = s(state);
  if (!st) return "";
  const m = st.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i
  );
  return m ? m[1] : "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const token = s(body?.token);
    const code = s(body?.code);
    const state = s(body?.state);
    let invoiceId = s(body?.invoice_id);

    if (!token && !code) {
      return NextResponse.json(
        { ok: false, message: "Retour DigiGo invalide (token/code manquant)." },
        { status: 400 }
      );
    }

    if (!invoiceId && state) {
      invoiceId = extractInvoiceIdFromState(state);
    }

    if (!invoiceId) {
      return NextResponse.json(
        { ok: false, message: "Contexte introuvable (invoice_id manquant). Relance la signature depuis la facture." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // (Optionnel) Vérifier que l'utilisateur est connecté
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { ok: false, message: "Session expirée. Reconnecte-toi puis relance la signature." },
        { status: 401 }
      );
    }

    // Vérifier que la facture existe et appartient au bon périmètre (à adapter à ton schéma)
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, company_id")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invErr || !invoice) {
      return NextResponse.json(
        { ok: false, message: "Facture introuvable." },
        { status: 404 }
      );
    }

    // TODO: ici tu mets TA logique réelle :
    // - échanger code->token si tu utilises code
    // - appeler endpoint DigiGo pour finaliser la signature
    // - enregistrer le résultat (signature, statut, token, etc.)
    //
    // IMPORTANT: ne bloque pas si state est vide.
    // Si tu veux, tu peux juste le log/stocke.

    // Exemple minimal: marquer facture comme "signed_pending" ou "signed"
    await supabase
      .from("invoices")
      .update({
        signature_provider: "digigo",
        signature_status: "signed",
        digigo_token: token || null,
        digigo_state: state || null,
        signed_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    return NextResponse.json({
      ok: true,
      redirect: `/invoices/${invoiceId}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: s(e?.message || "Erreur serveur.") },
      { status: 500 }
    );
  }
}
