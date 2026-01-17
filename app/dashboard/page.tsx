// app/dashboard/page.tsx
import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import type { DbAccountType, AccountType } from "@/app/types";
import { shellTypeFromUser } from "@/app/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/* =========================
   Types (FIX Vercel TS)
========================= */
type AccountantStatus = "pending" | "verified" | "rejected" | null;

type AppUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  account_type: DbAccountType | null;

  accountant_status: AccountantStatus;
  accountant_mf: string | null;
  accountant_patente: string | null;
  accountant_pending_until: string | null;
  accountant_free_access: boolean | null;

  max_companies: number | null;
  plan_code: string | null;
  subscription_status: string | null;
};

/* =========================
   Helpers
========================= */
function formatDateFR(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR");
}
function cn(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

/* =========================
   Local UI (luxe + anim)
========================= */
function LuxCard({
  title,
  subtitle,
  icon,
  right,
  children,
  className,
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={cn("ftn-card-lux ftn-reveal", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="ftn-card-head">
        <div className="ftn-card-titleRow">
          {icon ? <div className="ftn-ic">{icon}</div> : null}
          <div>
            <div className="ftn-card-title">{title}</div>
            {subtitle ? <div className="ftn-card-sub">{subtitle}</div> : null}
          </div>
        </div>
        {right ? <div className="ftn-card-right">{right}</div> : null}
      </div>
      <div className="ftn-card-body">{children}</div>
      <div className="ftn-card-glow" aria-hidden="true" />
    </div>
  );
}

function Pill({
  tone = "neutral",
  children,
  pulse = false,
}: {
  tone?: "neutral" | "warning" | "success" | "info";
  children: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <span className={cn("ftn-pill", `ftn-pill-${tone}`, pulse && "ftn-pill-pulse")}>
      {children}
    </span>
  );
}

function ButtonLink({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: "primary" | "ghost" | "soft" | "success";
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn("ftn-btn-lux", `ftn-btn-${variant}`)}>
      <span className="ftn-btn-shine" aria-hidden="true" />
      <span className="ftn-btn-text">{children}</span>
    </Link>
  );
}

function Divider() {
  return <div className="ftn-divider" />;
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="ftn-statrow">
      <div className="ftn-statlabel">{label}</div>
      <div className="ftn-statvalue">{value}</div>
    </div>
  );
}

/* =========================
   Page
========================= */
export default async function DashboardPage() {
  const supabase = await createClient();

  // Auth
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Profile
  const { data: profileRaw, error } = await supabase
    .from("app_users")
    .select(
      [
        "id",
        "email",
        "full_name",
        "account_type",
        "accountant_status",
        "accountant_mf",
        "accountant_patente",
        "accountant_pending_until",
        "accountant_free_access",
        "max_companies",
        "plan_code",
        "subscription_status",
      ].join(",")
    )
    .eq("id", auth.user.id)
    .maybeSingle();

  const profile = (profileRaw ?? null) as unknown as AppUser | null;

  if (error || !profile) {
    return (
      <AppShell title="Dashboard" subtitle="" accountType={undefined}>
        <div className="ftn-alert">{error?.message || "Profil introuvable."}</div>
      </AppShell>
    );
  }

  // ✅ dbType (utile pour compat legacy: cabinet/groupe)
  const dbType = (profile.account_type ?? "client") as DbAccountType;

  // ✅ shellType (IMPORTANT pour AppShell menu)
  const shellType: AccountType = shellTypeFromUser({
    dbType: profile.account_type,
    planCode: profile.plan_code,
    maxCompanies: profile.max_companies,
  });

  // ✅ flags legacy
  const isCabinet = dbType === "cabinet" || dbType === "comptable";
  const isGroupe = dbType === "groupe" || dbType === "multi_societe";

  const welcomeName =
    (profile.full_name && profile.full_name.trim()) ||
    (profile.email ? profile.email.split("@")[0] : "Bienvenue");

  // liens utiles
  const recapHref = "/recap";
  const invitationsHref = "/invitations";
  const profileHref = "/profile";

  // cabinet pending helpers
  const pendingUntil = formatDateFR(profile.accountant_pending_until);

  let progressPct = 42;
  if (profile.accountant_status === "pending" && profile.accountant_pending_until) {
    const now = Date.now();
    const end = new Date(profile.accountant_pending_until).getTime();
    const start = end - 60 * 24 * 60 * 60 * 1000;
    if (!Number.isNaN(end) && end > start) {
      const p = ((now - start) / (end - start)) * 100;
      progressPct = Math.max(6, Math.min(96, Math.round(p)));
    }
  }

  const LuxeCSS = (
    <style>{`
/* =========================================================
   DASHBOARD LUXE + ANIM (local)
========================================================= */
.ftn-wrap{ display:flex; flex-direction:column; gap:18px; }

/* HERO */
.ftn-hero{
  border-radius: 26px;
  padding: 22px 22px;
  background:
    radial-gradient(1200px 400px at 10% 0%, rgba(186,134,52,.18), transparent 55%),
    radial-gradient(900px 300px at 85% 30%, rgba(126,231,205,.10), transparent 55%),
    linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.72));
  border: 1px solid rgba(148,163,184,.26);
  box-shadow: 0 18px 55px rgba(2,6,23,.10);
  position: relative;
  overflow:hidden;
}
.ftn-hero::before{
  content:"";
  position:absolute; inset:-2px;
  background:
    radial-gradient(420px 220px at 10% 25%, rgba(186,134,52,.18), transparent 60%),
    radial-gradient(380px 240px at 90% 10%, rgba(59,130,246,.10), transparent 62%);
  filter: blur(2px);
  opacity:.9;
  pointer-events:none;
}
.ftn-hero::after{
  content:"";
  position:absolute; inset:-50%;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.18) 40%, transparent 70%);
  transform: rotate(10deg);
  animation: ftn-sweep 8s linear infinite;
  opacity:.55;
  pointer-events:none;
}
@keyframes ftn-sweep{
  0%{ transform: translateX(-22%) rotate(10deg); }
  100%{ transform: translateX(22%) rotate(10deg); }
}
.ftn-heroTop{
  position: relative;
  display:flex; gap:14px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap;
}
.ftn-heroTitle{
  font-size: 32px; line-height: 1.1; font-weight: 850; letter-spacing: -0.02em;
  color: var(--ink, #0b1220);
  margin: 0;
}
.ftn-heroSub{
  margin-top: 8px;
  color: rgba(102,112,133,.95);
  font-size: 14.5px;
  max-width: 760px;
}
.ftn-heroActions{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.ftn-heroBadgeRow{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top: 12px; }

/* Grid */
.ftn-grid2{
  display:grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap:14px;
}
@media (max-width: 980px){
  .ftn-grid2{ grid-template-columns: 1fr; }
  .ftn-heroTitle{ font-size: 26px; }
}

/* Card */
.ftn-card-lux{
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255,255,255,.90), rgba(255,255,255,.72));
  border: 1px solid rgba(148,163,184,.26);
  box-shadow: 0 14px 45px rgba(2,6,23,.08);
  position: relative;
  overflow:hidden;
  transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
}
.ftn-card-glow{
  position:absolute;
  inset:-120px -120px auto auto;
  width: 220px; height: 220px;
  background: radial-gradient(circle at 30% 30%, rgba(186,134,52,.22), transparent 60%);
  filter: blur(2px);
  opacity:.85;
  pointer-events:none;
}
.ftn-card-lux:hover{
  border-color: rgba(186,134,52,.30);
  box-shadow: 0 18px 60px rgba(2,6,23,.12);
  transform: translateY(-2px);
}
.ftn-card-head{
  display:flex; justify-content:space-between; align-items:flex-start; gap:10px;
  padding: 16px 16px 10px 16px;
}
.ftn-card-titleRow{ display:flex; gap:10px; align-items:flex-start; }
.ftn-ic{
  width: 38px; height: 38px; border-radius: 14px;
  background: rgba(186,134,52,.12);
  border: 1px solid rgba(186,134,52,.25);
  display:flex; align-items:center; justify-content:center;
  flex:0 0 auto;
}
.ftn-card-title{ font-weight: 780; letter-spacing: -0.01em; font-size: 16px; color: var(--ink, #0b1220); }
.ftn-card-sub{ font-size: 12.5px; color: rgba(102,112,133,.95); margin-top: 2px; }
.ftn-card-right{ display:flex; align-items:center; gap:8px; }
.ftn-card-body{ padding: 0 16px 16px 16px; color: rgba(11,18,32,.92); }

/* Reveal animation */
.ftn-reveal{
  opacity: 0;
  transform: translateY(10px) scale(.99);
  animation: ftn-reveal .55s cubic-bezier(.2,.8,.2,1) forwards;
}
@keyframes ftn-reveal{
  to{ opacity:1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce){
  .ftn-reveal{ animation:none; opacity:1; transform:none; }
  .ftn-hero::after{ animation:none; }
  .ftn-pill-pulse::before{ animation:none; }
  .ftn-btn-shine{ display:none; }
  .ftn-barFill::after{ animation:none; }
}

/* Pill */
.ftn-pill{
  display:inline-flex; align-items:center; gap:6px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid rgba(148,163,184,.28);
  background: rgba(255,255,255,.55);
  color: rgba(11,18,32,.88);
  white-space:nowrap;
  position:relative;
}
.ftn-pill-warning{
  border-color: rgba(245,158,11,.30);
  background: rgba(245,158,11,.10);
  color: rgba(120,53,15,.95);
}
.ftn-pill-success{
  border-color: rgba(16,185,129,.30);
  background: rgba(16,185,129,.10);
  color: rgba(6,95,70,.95);
}
.ftn-pill-info{
  border-color: rgba(59,130,246,.25);
  background: rgba(59,130,246,.10);
  color: rgba(30,64,175,.95);
}
.ftn-pill-pulse::before{
  content:"";
  position:absolute;
  inset:-4px;
  border-radius:999px;
  background: radial-gradient(circle at 50% 50%, rgba(245,158,11,.18), transparent 60%);
  animation: ftn-pulse 1.6s ease-in-out infinite;
  pointer-events:none;
}
@keyframes ftn-pulse{
  0%,100%{ transform: scale(.96); opacity:.55; }
  50%{ transform: scale(1.06); opacity:.95; }
}

/* Buttons */
.ftn-btn-lux{
  position:relative;
  display:inline-flex; align-items:center; justify-content:center;
  gap:8px;
  padding: 10px 14px;
  border-radius: 14px;
  font-weight: 700;
  font-size: 13.5px;
  border: 1px solid rgba(148,163,184,.28);
  transition: transform .12s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease;
  text-decoration:none;
  user-select:none;
  overflow:hidden;
}
.ftn-btn-lux:hover{ transform: translateY(-1px); box-shadow: 0 14px 34px rgba(2,6,23,.12); }
.ftn-btn-primary{
  background: linear-gradient(180deg, rgba(186,134,52,1), rgba(161,110,34,1));
  color: white;
  border-color: rgba(186,134,52,.45);
}
.ftn-btn-success{
  background: linear-gradient(180deg, rgba(16,185,129,1), rgba(5,150,105,1));
  color: white;
  border-color: rgba(16,185,129,.40);
}
.ftn-btn-soft{
  background: rgba(186,134,52,.10);
  border-color: rgba(186,134,52,.25);
  color: rgba(120,53,15,.95);
}
.ftn-btn-ghost{
  background: rgba(255,255,255,.55);
  color: rgba(11,18,32,.90);
}
.ftn-btn-text{ position:relative; z-index:2; }
.ftn-btn-shine{
  position:absolute; inset:-40%;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.22) 40%, transparent 70%);
  transform: rotate(12deg) translateX(-30%);
  opacity:.0;
  transition: opacity .2s ease;
}
.ftn-btn-lux:hover .ftn-btn-shine{
  opacity:.95;
  animation: ftn-shine 1.2s ease forwards;
}
@keyframes ftn-shine{
  0%{ transform: rotate(12deg) translateX(-30%); }
  100%{ transform: rotate(12deg) translateX(30%); }
}

/* Divider */
.ftn-divider{ height:1px; background: rgba(148,163,184,.22); margin: 12px 0; }

/* KV / lists */
.ftn-kv{ display:flex; flex-direction:column; gap:10px; color: rgba(102,112,133,.98); font-size: 13.5px; }
.ftn-kv b{ color: rgba(11,18,32,.92); }

/* Status row */
.ftn-statrow{
  display:flex; align-items:center; justify-content:space-between;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(148,163,184,.22);
  background: rgba(255,255,255,.55);
}
.ftn-statlabel{ font-size: 12.8px; color: rgba(102,112,133,.98); }
.ftn-statvalue{ font-size: 13.5px; font-weight: 750; color: rgba(11,18,32,.92); }

/* Progress */
.ftn-progress{
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(148,163,184,.22);
  background: rgba(255,255,255,.55);
}
.ftn-progressTop{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
.ftn-progressLabel{ font-size: 12.8px; color: rgba(102,112,133,.98); }
.ftn-progressPct{ font-size: 12.8px; font-weight: 800; color: rgba(11,18,32,.92); }
.ftn-bar{
  margin-top: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(148,163,184,.18);
  overflow:hidden;
  position:relative;
}
.ftn-barFill{
  height:100%;
  border-radius: 999px;
  width: var(--pct, 40%);
  background: linear-gradient(90deg, rgba(186,134,52,1), rgba(245,158,11,1));
  box-shadow: 0 10px 30px rgba(186,134,52,.24);
  position:relative;
  animation: ftn-barIn .75s cubic-bezier(.2,.8,.2,1) forwards;
}
@keyframes ftn-barIn{
  from{ width: 6%; }
  to{ width: var(--pct, 40%); }
}
.ftn-barFill::after{
  content:"";
  position:absolute; inset:-40%;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.20) 45%, transparent 70%);
  transform: rotate(10deg);
  animation: ftn-barShine 3s ease-in-out infinite;
  opacity:.7;
}
@keyframes ftn-barShine{
  0%{ transform: translateX(-30%) rotate(10deg); }
  100%{ transform: translateX(30%) rotate(10deg); }
}
    `}</style>
  );

  /* =========================
     CABINET PENDING (garde ton bloc)
  ========================= */
  if (isCabinet && profile.accountant_status === "pending") {
    return (
      <AppShell
        title="Validation Cabinet"
        subtitle={`Bienvenue ${welcomeName} — votre cabinet est bien créé. La vérification professionnelle est en cours.`}
        accountType={shellType}
      >
        {LuxeCSS}

        <div className="ftn-wrap">
          <div className="ftn-hero ftn-reveal" style={{ animationDelay: "0ms" }}>
            <div className="ftn-heroTop">
              <div>
                <h1 className="ftn-heroTitle">Validation Cabinet</h1>
                <div className="ftn-heroSub">
                  Votre espace cabinet est <b>déjà utilisable</b>. La vérification sert uniquement à activer le{" "}
                  <b>bonus “Accès gratuit Cabinet”</b>.
                </div>

                <div className="ftn-heroBadgeRow">
                  <Pill tone="warning" pulse>
                    ⏳ Vérification en cours
                  </Pill>
                  <Pill tone={profile.accountant_free_access ? "success" : "neutral"}>
                    🎁 Bonus gratuit : {profile.accountant_free_access ? "actif" : "en attente"}
                  </Pill>
                </div>
              </div>

              <div className="ftn-heroActions">
                <ButtonLink href="/help" variant="soft">
                  Contacter le support
                </ButtonLink>
                <ButtonLink href="/accountant/cabinet" variant="ghost">
                  Modifier mes informations
                </ButtonLink>
              </div>
            </div>
          </div>

          <div className="ftn-grid2">
            <LuxCard
              title="État de votre cabinet"
              subtitle="Statut & délais"
              right={
                <Pill tone="warning" pulse>
                  ⏳ En vérification
                </Pill>
              }
              icon={<span>🛡️</span>}
              delay={80}
            >
              <StatRow label="Statut actuel" value={<span>En vérification</span>} />
              <div style={{ height: 10 }} />
              <StatRow
                label="Délai de traitement"
                value={
                  <span>
                    Jusqu’à <b>2 mois</b>
                    {pendingUntil ? (
                      <>
                        {" "}
                        — date indicative : <b>{pendingUntil}</b>
                      </>
                    ) : null}
                  </span>
                }
              />

              <div className="ftn-progress" style={{ marginTop: 12 }}>
                <div className="ftn-progressTop">
                  <div className="ftn-progressLabel">Avancement estimatif</div>
                  <div className="ftn-progressPct">{progressPct}%</div>
                </div>
                <div className="ftn-bar">
                  <div className="ftn-barFill" style={{ ["--pct" as any]: `${progressPct}%` }} />
                </div>
              </div>

              <Divider />

              <div className="ftn-kv">
                <div>
                  Le délai “2 mois” est un <b>délai administratif maximum</b>.
                </div>
              </div>
            </LuxCard>

            <LuxCard
              title="Disponible dès maintenant"
              subtitle="Aucun blocage"
              right={<Pill tone="success">✅ Actif</Pill>}
              icon={<span>✅</span>}
              delay={140}
            >
              <div className="ftn-kv">
                <div>Vous pouvez travailler normalement : factures, clients, organisation.</div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <ButtonLink href="/accountant/invoices" variant="primary">
                  + Nouvelle facture
                </ButtonLink>
                <ButtonLink href="/accountant/clients" variant="ghost">
                  Mes clients
                </ButtonLink>
              </div>
            </LuxCard>
          </div>
        </div>
      </AppShell>
    );
  }

  /* =========================
     DASHBOARD SIMPLIFIÉ (onboarding + accès)
  ========================= */
  const topBadge =
    shellType === "profil" ? (
      <Pill tone="info">👤 Profil</Pill>
    ) : isCabinet ? (
      <Pill tone="success">✅ Cabinet</Pill>
    ) : isGroupe ? (
      <Pill tone="info">🏢 Multi-sociétés</Pill>
    ) : (
      <Pill tone="neutral">🏭 Société</Pill>
    );

  const spaceTitle =
    shellType === "profil"
      ? "Créer une page"
      : isCabinet
      ? "Mon cabinet"
      : isGroupe
      ? "Mon groupe"
      : "Ma société";

  const spaceSubtitle =
    shellType === "profil"
      ? "Créez une page Cabinet ou Multi-société pour commencer."
      : isCabinet
      ? "Complétez les infos cabinet et suivez la validation."
      : isGroupe
      ? "Gérez plusieurs sociétés dans un seul espace."
      : "Créez/modifiez votre société pour commencer.";

  const spacePrimaryHref =
    shellType === "profil" ? "/pages/new" : isCabinet ? "/accountant/cabinet" : isGroupe ? "/groups" : "/companies";

  return (
    <AppShell
      title="Dashboard"
      subtitle={`Bienvenue ${welcomeName} — votre espace est prêt.`}
      accountType={shellType}
    >
      {LuxeCSS}

      <div className="ftn-wrap">
        {/* HERO */}
        <div className="ftn-hero ftn-reveal" style={{ animationDelay: "0ms" }}>
          <div className="ftn-heroTop">
            <div>
              <h1 className="ftn-heroTitle">Dashboard</h1>
              <div className="ftn-heroSub">
                Gérez les accès, invitations et la création de votre espace.
                <div className="ftn-heroBadgeRow">{topBadge}</div>
              </div>
            </div>

            <div className="ftn-heroActions">
              <ButtonLink href={recapHref} variant="primary">
                Récap accès
              </ButtonLink>
              <ButtonLink href={invitationsHref} variant="ghost">
                Invitations
              </ButtonLink>
              {shellType === "profil" ? (
                <ButtonLink href="/switch" variant="soft">
                  Switch
                </ButtonLink>
              ) : null}
            </div>
          </div>
        </div>

        {/* 2 cartes */}
        <div className="ftn-grid2">
          <LuxCard
            title="Mon profil"
            subtitle="Informations du compte"
            right={topBadge}
            icon={<span>👤</span>}
            delay={90}
          >
            <div className="ftn-kv">
              <div>
                <b>Email :</b> {profile.email || "—"}
              </div>
              <div>
                <b>Type :</b>{" "}
                {shellType === "profil"
                  ? "Profil"
                  : isCabinet
                  ? "Cabinet"
                  : isGroupe
                  ? "Multi-sociétés"
                  : "Société"}
              </div>
              {isCabinet ? (
                <div>
                  <b>Statut cabinet :</b> {profile.accountant_status || "—"}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <ButtonLink href={profileHref} variant="soft">
                Compléter mon profil
              </ButtonLink>
              {isCabinet ? (
                <ButtonLink href="/accountant/cabinet/validation" variant="ghost">
                  Validation cabinet
                </ButtonLink>
              ) : null}
              {shellType === "profil" ? (
                <ButtonLink href="/pages/new" variant="ghost">
                  Créer une page
                </ButtonLink>
              ) : null}
            </div>
          </LuxCard>

          <LuxCard title={spaceTitle} subtitle={spaceSubtitle} icon={<span>🏷️</span>} delay={140}>
            <div className="ftn-kv">
              <div>
                Action recommandée : <b>Créer / compléter</b> votre espace pour éviter les pages vides.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <ButtonLink href={spacePrimaryHref} variant="success">
                Ouvrir / Créer
              </ButtonLink>
              <ButtonLink href={recapHref} variant="ghost">
                Voir les accès
              </ButtonLink>
            </div>
          </LuxCard>
        </div>

        {/* Accès & Collaboration */}
        <LuxCard
          title="Accès & Collaboration"
          subtitle="Invitations, rôles et permissions"
          icon={<span>🔐</span>}
          delay={200}
          className="ftn-reveal"
        >
          <div className="ftn-kv">
            <div>
              Gérez <b>qui a accès</b> à votre compte, révoquez, acceptez/refusez les invitations.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <ButtonLink href={recapHref} variant="primary">
              Récap accès
            </ButtonLink>
            <ButtonLink href={invitationsHref} variant="ghost">
              Invitations
            </ButtonLink>
            <ButtonLink href="/access" variant="soft">
              Accès & permissions
            </ButtonLink>
          </div>
        </LuxCard>
      </div>
    </AppShell>
  );
}
