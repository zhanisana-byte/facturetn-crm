import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();

    // V24 rules:
    // - entreprise (client): 1 société max
    // - comptable: 1 cabinet (1 société) max
    // - multi_societe: illimité, mais peut lier à un groupe (group_id)
    const { data: profile, error: profErr } = await supabase
      .from("app_users")
      .select("account_type")
      .eq("id", auth.user.id)
      .maybeSingle();

    const accountType = String(profile?.account_type || "entreprise");

    if (profErr) {
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 400 });
    }

    if (accountType === "entreprise" || accountType === "comptable") {
      const { count, error: cntErr } = await supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("owner_user", auth.user.id);

      if (cntErr) {
        return NextResponse.json({ ok: false, error: cntErr.message }, { status: 400 });
      }

      if ((count ?? 0) >= 1) {
        const label = accountType === "comptable" ? "cabinet" : "société";
        return NextResponse.json(
          { ok: false, error: `Règle V24: un compte ${accountType} peut créer une seule ${label}.` },
          { status: 400 }
        );
      }
    }

    const group_id = (body.group_id ?? "").trim() || null;

    const company_name = (body.company_name ?? "").trim();
    const tax_id = (body.tax_id ?? "").trim();
    const email = (body.email ?? "").trim();
    const phone = (body.phone ?? "").trim();
    const address = (body.address ?? "").trim();

    if (!company_name || !tax_id) {
      return NextResponse.json(
        { ok: false, error: "Nom société et Matricule fiscal requis." },
        { status: 400 }
      );
    }

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

    if (companyError) {
      return NextResponse.json({ ok: false, error: companyError.message }, { status: 400 });
    }

    // Membership: owner
    const { error: memberError } = await supabase.from("memberships").insert({
      user_id: auth.user.id,
      company_id: company.id,
      role: "owner",
      is_active: true,
    });

    if (memberError) {
      return NextResponse.json({ ok: false, error: memberError.message }, { status: 400 });
    }


    // Optional: link company to group (multi-sociétés)
    if (group_id) {
      try {
        // Ensure the group exists and belongs to the user (or PDG / later policies)
        const { data: g } = await supabase.from("groups").select("id,owner_user_id").eq("id", group_id).maybeSingle();
        if (g?.id) {
          await supabase.from("group_companies").insert({
            group_id,
            company_id: company.id,
            added_by_user_id: auth.user.id,
          });
        }
      } catch {
        // ignore link errors (company still created)
      }
    }

    // Optional: TTN-ready settings (safe upsert if table exists)
    // User said they will add SQL manually. If table doesn't exist yet, we return ok with warning.
    let warning: string | null = null;
    try {
      const settingsPayload = {
        company_id: company.id,
        rc: (body.rc ?? "").trim() || null,
        establishment_code: (body.establishment_code ?? "").trim() || null,
        governorate: (body.governorate ?? "").trim() || null,
        postal_code: (body.postal_code ?? "").trim() || null,
        country: (body.country ?? "").trim() || "Tunisie",
        vat_default: typeof body.vat_default === "number" ? body.vat_default : null,
        vat_regime: (body.vat_regime ?? "").trim() || "standard",
        stamp_enabled_default: !!body.stamp_enabled_default,
        stamp_amount_default: typeof body.stamp_amount_default === "number" ? body.stamp_amount_default : 0,
        updated_at: new Date().toISOString(),
      };

      const { error: setErr } = await supabase
        .from("company_ttn_settings")
        .upsert(settingsPayload, { onConflict: "company_id" });

      if (setErr) {
        warning = "⚠️ Table company_ttn_settings non prête (ajoute le SQL) — la société est créée quand même.";
      }
    } catch {
      warning = "⚠️ Table company_ttn_settings non prête (ajoute le SQL) — la société est créée quand même.";
    }

    return NextResponse.json({ ok: true, company, warning });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
