import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // Auth
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return jsonError("Not authenticated", 401);
    }

    const body = await req.json().catch(() => ({} as any));

    // Règles:
    // - client  : 1 société max
    // - cabinet : 1 société (cabinet) max
    // - groupe  : illimité (peut lier à group_id)
    const { data: profile, error: profErr } = await supabase
      .from("app_users")
      .select("account_type")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (profErr || !profile?.account_type) {
      return jsonError("Type de compte introuvable.", 400);
    }

    const accountType = String(profile.account_type); // client | cabinet | groupe

    // ✅ Limite création société
    if (accountType === "client" || accountType === "cabinet") {
      const { count, error: cntErr } = await supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("owner_user", auth.user.id);

      if (cntErr) {
        return jsonError(cntErr.message, 400);
      }

      if ((count ?? 0) >= 1) {
        const label = accountType === "cabinet" ? "cabinet" : "société";
        return NextResponse.json(
          { ok: false, error: `Un compte ${accountType} peut créer une seule ${label}.` },
          { status: 403 }
        );
      }
    }

    const group_id = String(body.group_id ?? "").trim() || null;

    const company_name = String(body.company_name ?? "").trim();
    const tax_id = String(body.tax_id ?? "").trim();
    const email = String(body.email ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const address = String(body.address ?? "").trim();

    if (!company_name || !tax_id) {
      return jsonError("Nom société et Matricule fiscal requis.", 400);
    }

    // Create company
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        company_name,
        tax_id,
        email: email || null,
        phone: phone || null,
        address: address || null,
        owner_user: auth.user.id,
      })
      .select("*")
      .single();

    if (companyError || !company?.id) {
      return jsonError(companyError?.message || "Erreur création société", 400);
    }

    // Membership: owner
    const { error: memberError } = await supabase.from("memberships").insert({
      user_id: auth.user.id,
      company_id: company.id,
      role: "owner",
      is_active: true,
    });

    if (memberError) {
      return jsonError(memberError.message, 400);
    }

    // Optional: link company to group (multi-sociétés)
    if (group_id) {
      try {
        const { data: g } = await supabase
          .from("groups")
          .select("id,owner_user_id")
          .eq("id", group_id)
          .maybeSingle();

        if (g?.id) {
          // ✅ Dans ton SQL: group_companies a colonne "added_by" (pas added_by_user_id)
          await supabase.from("group_companies").insert({
            group_id,
            company_id: company.id,
            added_by: auth.user.id,
          });
        }
      } catch {
        // ignore link errors
      }
    }

    // Optional: TTN-ready settings
    let warning: string | null = null;
    try {
      const settingsPayload = {
        company_id: company.id,
        rc: String(body.rc ?? "").trim() || null,
        establishment_code: String(body.establishment_code ?? "").trim() || null,
        governorate: String(body.governorate ?? "").trim() || null,
        postal_code: String(body.postal_code ?? "").trim() || null,
        country: String(body.country ?? "").trim() || "Tunisie",
        vat_default: typeof body.vat_default === "number" ? body.vat_default : null,
        vat_regime: String(body.vat_regime ?? "").trim() || "standard",
        stamp_enabled_default: !!body.stamp_enabled_default,
        stamp_amount_default: typeof body.stamp_amount_default === "number" ? body.stamp_amount_default : 0,
        updated_at: new Date().toISOString(),
      };

      const { error: setErr } = await supabase
        .from("company_ttn_settings")
        .upsert(settingsPayload, { onConflict: "company_id" });

      if (setErr) {
        warning =
          "⚠️ Table company_ttn_settings non prête (ajoute le SQL) — la société est créée quand même.";
      }
    } catch {
      warning =
        "⚠️ Table company_ttn_settings non prête (ajoute le SQL) — la société est créée quand même.";
    }

    return NextResponse.json({ ok: true, company, warning });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
