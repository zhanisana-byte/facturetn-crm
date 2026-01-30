import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const phone = s((body as any).phone);
  const email = s((body as any).email);
  const national_id = s((body as any).national_id);

  // Règle: au moins tel OU email
  if (!phone && !email) {
    return NextResponse.json({ ok: false, error: "IDENTITY_INCOMPLETE", message: "Téléphone OU email requis (au moins un)." }, { status: 400 });
    }

  const { error } = await supabase
    .from("user_digigo_identities")
    .upsert(
      {
        user_id: auth.user.id,
        phone: phone || null,
        email: email || null,
        national_id: national_id || null,
      },
      { onConflict: "user_id" }
    );

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
