
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Search = {
  ok?: string;
  error?: string;
};

function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

function isAllowedMime(mime: string) {
  const allowed = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
  ];
  return allowed.includes(mime);
}

export default async function AccountantSubscriptionPage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
}) {
  const sp = (await searchParams) ?? {};
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: ws } = await supabase
    .from("user_workspace")
    .select("active_group_id, active_mode")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const cabinetGroupId = ws?.active_group_id ?? null;
  if (!cabinetGroupId) redirect("/switch");

  const [{ data: g }, { data: myMember }] = await Promise.all([
    supabase
      .from("groups")
      .select("id, group_name, group_type, status")
      .eq("id", cabinetGroupId)
      .maybeSingle(),
    supabase
      .from("group_members")
      .select("role, is_active")
      .eq("group_id", cabinetGroupId)
      .eq("user_id", auth.user.id)
      .maybeSingle(),
  ]);

  const cabinetName = g?.group_name ?? "Cabinet";
  const cabinetStatus = String((g as any)?.status ?? "pending"); 
  const role = String((myMember as any)?.role ?? "");
  const canRequest = Boolean((myMember as any)?.is_active) && (role === "owner" || role === "admin");

  async function sendRequest(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login");

    const company_mf = clean(formData.get("company_mf"));
    const company_id = clean(formData.get("company_id"));

    const patenteFile = formData.get("company_patente_file");
    const file = patenteFile instanceof File ? patenteFile : null;

    if (!company_mf || !company_id || !file) {
      redirect("/accountant/subscription?error=missing");
    }

    const maxBytes = 5 * 1024 * 1024; 
    if (file.size <= 0 || file.size > maxBytes) {
      redirect("/accountant/subscription?error=file_size");
    }
    if (!isAllowedMime(file.type)) {
      redirect("/accountant/subscription?error=file_type");
    }

    const { data: ws } = await supabase
      .from("user_workspace")
      .select("active_group_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const cabinetGroupId = ws?.active_group_id ?? null;
    if (!cabinetGroupId) redirect("/switch");

    const { data: myMember } = await supabase
      .from("group_members")
      .select("role, is_active")
      .eq("group_id", cabinetGroupId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const role = String((myMember as any)?.role ?? "");
    const ok = Boolean((myMember as any)?.is_active) && (role === "owner" || role === "admin");
    if (!ok) redirect("/accountant/subscription?error=forbidden");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = safeName.includes(".") ? safeName.split(".").pop() : "file";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const objectPath = `cabinet/${cabinetGroupId}/patente_${stamp}_${auth.user.id}.${ext}`;

    const bytes = Buffer.from(await file.arrayBuffer());

    const uploadRes = await supabase.storage
      .from("cabinet-requests")
      .upload(objectPath, bytes, { contentType: file.type, upsert: false });

    if (uploadRes.error) {
      redirect("/accountant/subscription?error=upload_failed");
    }

    const { error } = await supabase.from("cabinet_free_company_requests").insert({
      cabinet_group_id: cabinetGroupId,
      company_id,
      company_mf,
      created_by: auth.user.id,
      status: "pending",

      patente_file_path: objectPath,
      patente_file_name: file.name,
      patente_file_size: file.size,
      patente_file_mime: file.type,
    });

    if (error) {
      
      await supabase.storage.from("cabinet-requests").remove([objectPath]);
      redirect("/accountant/subscription?error=submit_failed");
    }

    redirect("/accountant/subscription?ok=1");
  }

  return (
    <div className="space-y-6">
      <div className="ftn-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="ftn-h2">Abonnement Cabinet</div>
            <div className="ftn-muted">Cabinet : {cabinetName}</div>
          </div>

          <span className="ftn-pill ftn-pill-warning">
            {cabinetStatus === "validated" ? "Cabinet validé" : "Cabinet en attente"}
          </span>
        </div>

        <div className="mt-4 ftn-callout">
          Pour bénéficier d’une <b>société gratuite</b>, votre cabinet doit être validé.
        </div>
      </div>

      <div className="ftn-card">
        <div className="ftn-h3">Demande : société gratuite</div>
        <div className="ftn-muted mt-1">
          Renseignez votre MF, joignez la <b>Patente (pièce jointe)</b> et indiquez l’ID de la société.
        </div>

        {sp.error && sp.error !== "0" ? (
          <div className="ftn-alert ftn-alert-danger mt-4">
            {sp.error === "missing"
              ? "Veuillez remplir tous les champs et joindre la Patente."
              : sp.error === "forbidden"
                ? "Accès refusé : seuls Owner/Admin du cabinet peuvent envoyer une demande."
                : sp.error === "file_size"
                  ? "Fichier invalide : taille max 5MB."
                  : sp.error === "file_type"
                    ? "Format invalide : PDF, PNG, JPG, DOCX uniquement."
                    : sp.error === "upload_failed"
                      ? "Upload échoué. Vérifiez le bucket Storage et les policies."
                      : "Une erreur est survenue. Veuillez réessayer."}
          </div>
        ) : null}

        {sp.ok ? (
          <div className="ftn-alert ftn-alert-success mt-4">Demande envoyée </div>
        ) : null}

        <form action={sendRequest} className="mt-6" encType="multipart/form-data">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="ftn-label">MF (Matricule fiscal)</label>
              <input
                name="company_mf"
                className="ftn-input"
                placeholder="Ex. 1304544Z"
                required
                disabled={!canRequest}
              />
            </div>

            <div>
              <label className="ftn-label">Patente (pièce jointe)</label>
              <input
                name="company_patente_file"
                type="file"
                className="ftn-input"
                required
                disabled={!canRequest}
                accept=".pdf,.png,.jpg,.jpeg,.docx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              />
              <div className="ftn-muted mt-1">PDF/PNG/JPG/DOCX — 5MB max</div>
            </div>

            <div>
              <label className="ftn-label">ID de la société</label>
              <input
                name="company_id"
                className="ftn-input"
                placeholder="UUID de la société"
                required
                disabled={!canRequest}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <a className="ftn-link" href="/accountant">
              Retour
            </a>

            <button
              type="submit"
              className="ftn-btn ftn-btn-primary"
              disabled={!canRequest}
              title={!canRequest ? "Owner/Admin requis" : undefined}
            >
              Envoyer la demande
            </button>
          </div>

          <div className="ftn-muted mt-4">
            Astuce : l’ID de la société se trouve dans l’URL quand vous ouvrez la page de la société.
          </div>
        </form>
      </div>
    </div>
  );
}
