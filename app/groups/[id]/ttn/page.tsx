import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = { params?: Promise<{ id: string }> };

function isBlank(v: any) {
  return typeof v !== "string" || v.trim().length === 0;
}

function ttnComplete(cred: any | null | undefined) {
  if (!cred) return false;
  const connection = String(cred.connection_type ?? "webservice");
  if (connection === "webservice") {
    return (
      !isBlank(cred.environment) &&
      !isBlank(cred.ws_url) &&
      !isBlank(cred.ws_login) &&
      !isBlank(cred.ws_password) &&
      !isBlank(cred.ws_matricule)
    );
  }
  return !isBlank(cred.environment);
}

function pill(ok: boolean) {
  const cls = ok ? "ftn-pill ftn-pill-ok" : "ftn-pill ftn-pill-warn";
  return <span className={cls}>{ok ? "Complet" : "Incomplet"}</span>;
}

export default async function GroupTTNListPage({ params }: Props) {
  const p = (await params) ?? ({ id: "" } as any);
  const groupId = String((p as any).id ?? "");
  if (!groupId) redirect("/groups/select");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const userId = auth.user.id;

  const { data: group } = await supabase
    .from("groups")
    .select("id,owner_user_id,group_name")
    .eq("id", groupId)
    .maybeSingle();

  if (!group?.id) redirect("/groups/select");

  const isOwner = group.owner_user_id === userId;
  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    const isAdmin = !!gm?.is_active && String(gm.role) === "admin";
    if (!isAdmin) redirect(`/groups/${groupId}`);
  }

  const { data: links } = await supabase
    .from("group_companies")
    .select("company_id,link_type")
    .eq("group_id", groupId);

  const companyIds = (links ?? []).map((l: any) => l.company_id).filter(Boolean);

  if (companyIds.length === 0) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-semibold">TTN (lecture)</h1>
        <p className="text-sm text-slate-600">
          Aucune société n’est encore liée à ce groupe.
        </p>
        <div className="flex gap-2">
          <Link className="btn" href={`/groups/${groupId}/clients`}>
            Voir mes sociétés
          </Link>
          <Link className="btn btn-ghost" href={`/groups/${groupId}`}>
            Retour dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("id,company_name,tax_id")
    .in("id", companyIds);

  const { data: creds } = await supabase
    .from("ttn_credentials")
    .select("company_id,connection_type,environment,ws_url,ws_login,ws_password,ws_matricule,updated_at")
    .in("company_id", companyIds)
    .order("updated_at", { ascending: false });

  const credByCompany = new Map<string, any>();
  for (const c of creds ?? []) {
    const cid = String((c as any).company_id ?? "");
    if (!cid) continue;
    if (!credByCompany.has(cid)) credByCompany.set(cid, c);
  }

  const typeByCompany = new Map<string, "external" | "managed">();
  for (const l of links ?? []) {
    const cid = String((l as any).company_id ?? "");
    const lt = String((l as any).link_type ?? "external");
    typeByCompany.set(cid, lt === "managed" ? "managed" : "external");
  }

  const rows = (companies ?? [])
    .map((c: any) => {
      const cred = credByCompany.get(String(c.id)) ?? null;
      const ok = ttnComplete(cred);
      const linkType = typeByCompany.get(String(c.id)) ?? "external";
      return {
        id: String(c.id),
        name: String(c.company_name ?? "Société"),
        taxId: c.tax_id ? String(c.tax_id) : "—",
        ok,
        linkType,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">TTN (lecture)</h1>
          <p className="text-sm text-slate-600">
            Dans l’espace Groupe, vous pouvez seulement consulter l’état des paramètres TTN.  
            Pour modifier, ouvrez la société.
          </p>
        </div>
        <Link className="btn btn-ghost" href={`/groups/${groupId}`}>
          Retour
        </Link>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b">
              <th className="py-2 px-2">Société</th>
              <th className="py-2 px-2">MF</th>
              <th className="py-2 px-2">Type</th>
              <th className="py-2 px-2">TTN</th>
              <th className="py-2 px-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 px-2 font-semibold">{r.name}</td>
                <td className="py-2 px-2 text-slate-600">{r.taxId}</td>
                <td className="py-2 px-2">
                  <span className="ftn-pill">
                    {r.linkType === "managed" ? "Gérée" : "Externe"}
                  </span>
                </td>
                <td className="py-2 px-2">{pill(r.ok)}</td>
                <td className="py-2 px-2 text-right">
                  <Link className="btn" href={`/companies/${encodeURIComponent(r.id)}/ttn`}>
                    Ouvrir TTN (Société)
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">
        Rappel : le paramétrage TTN se fait uniquement dans la société.
      </div>
    </div>
  );
}
