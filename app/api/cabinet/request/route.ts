import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();

  const mf = String(form.get("mf") || "").trim();
  const city = String(form.get("city") || "").trim();
  const cabinet_name = String(form.get("cabinet_name") || "").trim();
  const message = String(form.get("message") || "").trim();
  const file = form.get("patente") as File | null;

  if (!mf || !file) {
    return NextResponse.json({ error: "MF et Patente sont obligatoires." }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const safeExt = ["pdf", "png", "jpg", "jpeg", "webp"].includes(ext) ? ext : "pdf";
  const path = `user_${auth.user.id}/${Date.now()}.${safeExt}`;

  const buf = await file.arrayBuffer();
  const { error: upErr } = await supabase.storage
    .from("cabinet-docs")
    .upload(path, new Uint8Array(buf), { contentType: file.type || "application/octet-stream", upsert: true });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: pub } = supabase.storage.from("cabinet-docs").getPublicUrl(path);

  const { data: existing } = await supabase
    .from("cabinet_requests")
    .select("id,status")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const row = existing?.[0] ?? null;

  if (row?.id) {
    if (row.status === "accepted") {
      return NextResponse.json({ error: "Cabinet déjà validé." }, { status: 400 });
    }

    const { error } = await supabase
      .from("cabinet_requests")
      .update({
        mf,
        city: city || null,
        cabinet_name: cabinet_name || null,
        message: message || null,
        patente_path: path,
        patente_url: pub?.publicUrl ?? null,
        status: "pending",
        admin_note: null,
        reviewed_at: null,
      })
      .eq("id", row.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: row.id });
  }

  const { data: created, error } = await supabase
    .from("cabinet_requests")
    .insert({
      user_id: auth.user.id,
      mf,
      city: city || null,
      cabinet_name: cabinet_name || null,
      message: message || null,
      patente_path: path,
      patente_url: pub?.publicUrl ?? null,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: created?.id });
}
