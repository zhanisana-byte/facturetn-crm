
export type ActiveMode = "profil" | "entreprise" | "comptable" | "multi_societe";

const KEY = "ftn_active_mode";

export function getActiveModeFromUrl(searchParams?: URLSearchParams): ActiveMode | null {
  if (!searchParams) return null;
  const raw = (searchParams.get("mode") || "").toLowerCase();
  
  const m = raw === "societe" ? "entreprise" : raw === "cabinet" ? "comptable" : raw === "groupe" ? "multi_societe" : raw;
  if (m === "profil" || m === "entreprise" || m === "comptable" || m === "multi_societe") return m;
  return null;
}

export function getStoredActiveMode(): ActiveMode | null {
  if (typeof window === "undefined") return null;
  const raw = (localStorage.getItem(KEY) || "").toLowerCase();
  const m = raw === "societe" ? "entreprise" : raw === "cabinet" ? "comptable" : raw === "groupe" ? "multi_societe" : raw;
  if (m === "profil" || m === "entreprise" || m === "comptable" || m === "multi_societe") return m;
  return null;
}

export function setStoredActiveMode(mode: ActiveMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, mode);
}
