// app/types.ts

// ===============================
// DB values (schema actuel)
// ===============================
// NB: public.app_users.account_type contient:
// profil | entreprise | comptable | multi_societe | client | cabinet | groupe
export type DbAccountType =
  | "profil"
  | "entreprise"
  | "comptable"
  | "multi_societe"
  | "client"
  | "cabinet"
  | "groupe";

// ===============================
// UI / Shell types
// ===============================
export type AccountType = "profil" | "entreprise" | "multi_societe" | "comptable";

// ===============================
// Map DB account_type → UI shell
// ===============================
export function mapDbAccountType(v?: string | null): AccountType {
  const t = String(v || "").toLowerCase().trim();

  if (t === "profil") return "profil";
  if (t === "entreprise" || t === "client") return "entreprise";
  if (t === "comptable" || t === "cabinet") return "comptable";
  if (t === "multi_societe" || t === "groupe") return "multi_societe";

  // fallback safe
  return "entreprise";
}

// ===============================
// Decide FINAL shell type
// ===============================
// Règle: on respecte le type DB en priorité (sauf si DB dit "profil").
// Ainsi une entreprise ne redevient jamais "profil" à cause de plan/max null.
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

  // ✅ cas profil gratuit (optionnel: garder ta logique)
  if (plan === "pro_free" || plan === "pro") {
    if (max === 0 || max == null) return "profil";
  }

  return "profil";
}
