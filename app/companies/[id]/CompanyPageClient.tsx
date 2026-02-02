"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LuxCard, ButtonLink, Pill, StatRow } from "@/app/components/lux/Lux";

type Company = {
  id: string;
  company_name: string | null;
  tax_id: string | null;
};

type TtnRow = { id: string } | null;

export default function CompanyPageClient({ companyId }: { companyId: string }) {
  const router = useRouter();

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const [company, setCompany] = useState<Company | null>(null);
  const [ttnOk, setTtnOk] = useState<boolean | null>(null);
  const [invoiceCount, setInvoiceCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);

    if (!supabase) {
      setErr(
        "Configuration Supabase manquante. Vérifiez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sur Vercel puis redeploy."
      );
      setLoading(false);
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setLoading(false);
      router.push("/login");
      return;
    }

    const { data: c, error: cErr } = await supabase
      .from("companies")
      .select("id, company_name, tax_id")
      .eq("id", companyId)
      .single();

    if (cErr) {
      setErr(cErr.message);
      setCompany(null);
      setLoading(false);
      return;
    }

    setCompany(c as Company);

    const { data: ttn, error: ttnErr } = await supabase
      .from("company_ttn_settings")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();

    const ttnRow = (ttn as TtnRow) ?? null;
    if (!ttnErr) setTtnOk(Boolean(ttnRow?.id));
    else setTtnOk(null);

    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    setInvoiceCount(typeof count === "number" ? count : null);

    setLoading(false);
  }

  useEffect(() => {
    load();
    
  }, [companyId]);

  if (err) return <div className="ftn-alert">{err}</div>;
  if (loading) return <div className="ftn-muted">Chargement...</div>;
  if (!company) return <div className="ftn-muted">Société introuvable.</div>;

  return (
    <div className="ftn-grid">
      <div className="ftn-grid-3">
        <LuxCard
          title={company.company_name || "Société"}
          subtitle={company.tax_id ? `Matricule: ${company.tax_id}` : "Matricule: —"}
          right={
            ttnOk === null ? (
              <Pill tone="info">TTN: —</Pill>
            ) : ttnOk ? (
              <Pill tone="success">TTN: OK</Pill>
            ) : (
              <Pill tone="warning">TTN: manquant</Pill>
            )
          }
          delay={0}
        >
          <StatRow label="Factures" value={invoiceCount ?? "—"} />
          <StatRow label="Accès" value={<span className="ftn-badge">gérés via Rôles</span>} />
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href={`/companies/edit/${company.id}`} variant="primary">
              Modifier
            </ButtonLink>
            <ButtonLink href={`/companies/${company.id}/droits`} variant="ghost">
              Rôles
            </ButtonLink>
          </div>
        </LuxCard>

        <LuxCard title="TTN" subtitle="Paramètres TTN" delay={60}>
          <div className="text-sm text-slate-600">
            Configurez les champs TTN (TEST/PROD), requis pour l’envoi et la conformité.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href={`/companies/${company.id}/ttn`} variant={ttnOk ? "ghost" : "primary"}>
              {ttnOk ? "Voir TTN" : "Configurer TTN"}
            </ButtonLink>
          </div>
        </LuxCard>

        <LuxCard title="Facturation" subtitle="Disponible depuis le Profil" delay={120}>
          <div className="text-sm text-slate-600">
            La facturation est exécutée uniquement depuis le Profil. Utilisez Switch pour revenir au Profil.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href="/switch" variant="primary">
              Aller au Switch
            </ButtonLink>
          </div>
        </LuxCard>
      </div>

      <div className="ftn-card-lux ftn-reveal" style={{ animationDelay: "180ms" }}>
        <div className="ftn-card-head">
          <div>
            <div className="ftn-card-title">Navigation rapide</div>
            <div className="ftn-card-sub">Pages de gestion de la société</div>
          </div>
        </div>
        <div className="ftn-card-body">
          <div className="flex flex-wrap gap-2">
            <Link className="ftn-btn-lux ftn-btn-ghost" href={`/companies/${company.id}/droits`}>
              <span className="ftn-btn-shine" aria-hidden="true" />
              <span className="ftn-btn-text">Rôles & accès</span>
            </Link>
            <Link className="ftn-btn-lux ftn-btn-ghost" href={`/companies/${company.id}/invitations`}>
              <span className="ftn-btn-shine" aria-hidden="true" />
              <span className="ftn-btn-text">Invitations</span>
            </Link>
            <Link className="ftn-btn-lux ftn-btn-ghost" href={`/subscription`}>
              <span className="ftn-btn-shine" aria-hidden="true" />
              <span className="ftn-btn-text">Abonnement</span>
            </Link>
            <Link className="ftn-btn-lux ftn-btn-ghost" href={`/switch`}>
              <span className="ftn-btn-shine" aria-hidden="true" />
              <span className="ftn-btn-text">Switch</span>
            </Link>
          </div>
        </div>
        <div className="ftn-card-glow" aria-hidden="true" />
      </div>
    </div>
  );
}
