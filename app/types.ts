

export type DbAccountType = "profil" | "entreprise" | "comptable" | "multi_societe" | "pdg";

export type AccountType = "profil" | "entreprise" | "multi_societe" | "comptable";

export function mapDbAccountType(v?: string | null): AccountType {
  const t = String(v || "").toLowerCase().trim();

  if (t === "profil") return "profil";
  
  if (t === "pdg") return "profil";

  if (t === "entreprise") return "entreprise";
  if (t === "comptable") return "comptable";
  if (t === "multi_societe") return "multi_societe";

  if (t === "client") return "entreprise";
  if (t === "cabinet") return "comptable";
  if (t === "groupe") return "multi_societe";

  return "profil";
}

export function shellTypeFromUser(opts: {
  dbType?: string | null;
  planCode?: string | null;
  maxCompanies?: number | null;
}): AccountType {
  const dbType = String(opts.dbType || "").toLowerCase().trim();
  const plan = String(opts.planCode || "").toLowerCase().trim();
  const max = opts.maxCompanies;

  const base = mapDbAccountType(dbType);

  if (base !== "profil") return base;

  if (plan === "pro_free" || plan === "pro") {
    if (max === 0 || max == null) return "profil";
  }

  return "profil";
}
