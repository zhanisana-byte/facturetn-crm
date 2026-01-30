import { DROITS_PAR_ROLE, PageType, PageRole, Droit } from "./droits";

export function hasDroit(pageType: PageType, role: PageRole, droit: Droit) {
  return DROITS_PAR_ROLE[pageType][role]?.includes(droit) ?? false;
}
