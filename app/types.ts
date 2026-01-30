// app/types.ts

// ===============================
// Types canoniques
// ===============================
// DB (public.app_users.account_type) doit contenir UNIQUEMENT :
//   profil | entreprise | comptable | multi_societe | pdg
export type DbAccountType = "profil" | "entreprise" | "comptable" | "multi_societe" | "pdg";

// UI / Shell types (ce que AppShell utilise)
export type AccountType = "profil" | "entreprise" | "multi_societe" | "comptable";

// ===============================
// Map DB account_type → UI shell
// ===============================
export function mapDbAccountType(v?: string | null): AccountType {
  const t = String(v || "").toLowerCase().trim();

  if (t === "profil") return "profil";
  // PDG est un super-admin : on garde le shell "profil" (l'UI PDG est pilotée ailleurs).
  if (t === "pdg") return "profil";

  // canonique
  if (t === "entreprise") return "entreprise";
  if (t === "comptable") return "comptable";
  if (t === "multi_societe") return "multi_societe";

  // compat legacy (à nettoyer en DB)
  if (t === "client") return "entreprise";
  if (t === "cabinet") return "comptable";
  if (t === "groupe") return "multi_societe";

  // fallback safe
  return "profil";
}

// ===============================
// Decide FINAL shell type
// ===============================
// Règle: on respecte le type DB en priorité (sauf si DB dit "profil").
export function shellTypeFromUser(opts: {
  dbType?: string | null;
  planCode?: string | null;
  maxCompanies?: number | null;
}): AccountType {
  const dbType = String(opts.dbType || "").toLowerCase().trim();
  const plan = String(opts.planCode || "").toLowerCase().trim();
  const max = opts.maxCompanies;

  const base = mapDbAccountType(dbType);

  // ✅ si DB type n'est pas profil → on garde
  if (base !== "profil") return base;

  // ✅ cas profil gratuit (optionnel)
  if (plan === "pro_free" || plan === "pro") {
    if (max === 0 || max == null) return "profil";
  }

  return "profil";
}
