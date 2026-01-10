import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card, Input, Select, Btn, Badge } from "@/components/ui";

type PageProps = {
  params: Promise<{ id: string }>;
};

function isFilled(v: any) {
  return typeof v === "string" ? v.trim().length > 0 : !!v;
}

export default async function CompanyTTNSettingsPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type,email")
    .eq("id", auth.user.id)
    .single();

  const accountType = (profile?.account_type as any) || undefined;

  const { data: company } = await supabase
    .from("companies")
    .select("id,company_name,tax_id")
    .eq("id", id)
    .single();

  if (!company) redirect("/companies");

  const { data: cred, error: ttnErr } = await supabase
    .from("ttn_credentials")
    .select(
      "company_id,ttn_key_name,ttn_public_key,ttn_secret,ttn_mode,connection_type,environment,public_ip,cert_serial_number,cert_email,provider_name,token_pack_ref,signer_full_name,signer_email,ttn_extra"
    )
    .eq("company_id", id)
    .maybeSingle();

  const c: any = cred ?? {};

  // ✅ Champs minimum "TTN-ready" (côté UX)
  const required = [
    { k: "ttn_mode", label: "Mode" },
    { k: "connection_type", label: "Connexion" },
    { k: "environment", label: "Environnement" },
    { k: "cert_serial_number", label: "N° série certificat" },
    { k: "cert_email", label: "Email certificat" },
  ];

  const missing = required.filter((r) => !isFilled(c[r.k]));
  const isOk = missing.length === 0;

  return (
    <AppShell
      title={`TTN • ${company.company_name}`}
      subtitle="Paramètres obligatoires par société (signature + mode + connexion)"
      accountType={accountType}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-slate-600">
          MF : <b>{company.tax_id}</b>
        </div>
        <div className="flex gap-2">
          <Link className="ftn-btn-ghost" href={`/companies/${company.id}`}>
            Retour société
          </Link>
        </div>
      </div>

      <Card
        title="État de conformité"
        subtitle="On valide ici les champs requis avant signature / envoi TTN"
        className="mt-4"
      >
        {ttnErr ? (
          <div className="ftn-alert mb-3">
            SQL TTN non appliqué / colonnes manquantes : {ttnErr.message}
            <div className="ftn-muted mt-2">
              Ajoute le SQL depuis <b>docs/SQL_ZIP6_PRO_TTN.md</b> puis reviens ici.
            </div>
          </div>
        ) : null}
        <div className="flex gap-2 flex-wrap">
          <Badge>{isOk ? "✅ Complet" : "⚠️ Incomplet"}</Badge>
          <Badge>Manquants: {missing.length}</Badge>
        </div>
        {!isOk ? (
          <div className="ftn-alert mt-3">
            Champs requis manquants : <b>{missing.map((m) => m.label).join(" • ")}</b>
          </div>
        ) : (
          <div className="ftn-muted mt-3">
            Parfait. Tu peux maintenant préparer la signature et l'envoi TTN quand l'API sera activée.
          </div>
        )}
      </Card>

      <Card
        title="Configuration TTN (par société)"
        subtitle="Ces infos seront utilisées pour la signature et l'intégration TTN"
        className="mt-4"
      >
        <form action="/companies/ttn/save" method="post" className="space-y-4">
          <input type="hidden" name="company_id" value={company.id} />

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <div className="ftn-label">Mode (obligatoire)</div>
              <Select name="ttn_mode" defaultValue={c.ttn_mode ?? "provider_facturetn"} required>
                <option value="provider_facturetn">Prestataire (ex: FactureTN)</option>
                <option value="direct_ttn_tokens">Jetons TTN (pack de factures)</option>
              </Select>
              <div className="ftn-muted mt-1">Choisis comment la société va déclarer ses factures.</div>
            </div>

            <div>
              <div className="ftn-label">Connexion (obligatoire)</div>
              <Select name="connection_type" defaultValue={c.connection_type ?? "webservice"} required>
                <option value="webservice">Webservice</option>
                <option value="sftp">SFTP</option>
              </Select>
              <div className="ftn-muted mt-1">Le guide TTN mentionne Webservice ou SFTP.</div>
            </div>

            <div>
              <div className="ftn-label">Environnement (obligatoire)</div>
              <Select name="environment" defaultValue={c.environment ?? "test"} required>
                <option value="test">Test</option>
                <option value="production">Production</option>
              </Select>
              <div className="ftn-muted mt-1">On commence en test, puis production après validation.</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="ftn-label">Prestataire (si mode prestataire)</div>
              <Input name="provider_name" placeholder="FactureTN / autre" defaultValue={c.provider_name ?? "FactureTN"} />
            </div>
            <div>
              <div className="ftn-label">Référence pack jetons (si mode jetons)</div>
              <Input name="token_pack_ref" placeholder="Ex: PACK-500" defaultValue={c.token_pack_ref ?? ""} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="ftn-label">N° série certificat (obligatoire)</div>
              <Input name="cert_serial_number" required placeholder="Numéro série (ANCE)" defaultValue={c.cert_serial_number ?? ""} />
            </div>
            <div>
              <div className="ftn-label">Email certificat (obligatoire)</div>
              <Input name="cert_email" required type="email" placeholder="email@domaine.tn" defaultValue={c.cert_email ?? ""} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="ftn-label">Nom du signataire</div>
              <Input name="signer_full_name" placeholder="Nom & prénom" defaultValue={c.signer_full_name ?? ""} />
            </div>
            <div>
              <div className="ftn-label">Email signataire</div>
              <Input name="signer_email" type="email" placeholder="signataire@domaine.tn" defaultValue={c.signer_email ?? ""} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="ftn-label">IP publique fixe (si demandée en test)</div>
              <Input name="public_ip" placeholder="x.x.x.x" defaultValue={c.public_ip ?? ""} />
            </div>
            <div>
              <div className="ftn-label">TTN Key Name</div>
              <Input name="ttn_key_name" placeholder="Nom clé (si applicable)" defaultValue={c.ttn_key_name ?? ""} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="ftn-label">TTN Public Key</div>
              <Input name="ttn_public_key" placeholder="-----BEGIN PUBLIC KEY-----" defaultValue={c.ttn_public_key ?? ""} />
            </div>
            <div>
              <div className="ftn-label">TTN Secret</div>
              <Input name="ttn_secret" placeholder="secret" defaultValue={c.ttn_secret ?? ""} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Btn type="submit">Enregistrer</Btn>
            <span className="ftn-muted">Les champs requis sont marqués “obligatoire”.</span>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
