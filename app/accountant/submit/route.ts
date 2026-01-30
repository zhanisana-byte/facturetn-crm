import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // Auth
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const accountant_mf = String(body?.accountant_mf ?? "").trim();
    const accountant_patente = String(body?.accountant_patente ?? "").trim();

    if (!accountant_mf || !accountant_patente) {
      return NextResponse.json(
        { ok: false, error: "MF et Patente sont obligatoires." },
        { status: 400 }
      );
    }

    // Date indicative (2 mois max)
    const pendingUntil = new Date();
    pendingUntil.setMonth(pendingUntil.getMonth() + 2);

    // Update profile
    const { error: upErr } = await supabase
      .from("app_users")
      .update({
        accountant_mf,
        accountant_patente,
        accountant_status: "pending",
        accountant_verified_at: null,
        accountant_pending_until: pendingUntil.toISOString(),
        accountant_free_access: true, // accès cabinet activé même avant validation (selon votre besoin)
        updated_at: new Date().toISOString(),
      })
      .eq("id", auth.user.id);

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    // (Optionnel) Notification admin
    await supabase.from("notifications").insert({
      user_id: auth.user.id,
      type: "accountant_verification",
      title: "Nouvelle demande de vérification comptable",
      message: `MF: ${accountant_mf} • Patente: ${accountant_patente}`,
      is_read: false,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
