export type CompanyAction = "manage_customers" | "create_invoices" | "validate_invoices" | "submit_ttn";

export async function canCompanyAction(
  supabase: any,
  userId: string,
  companyId: string,
  action: CompanyAction
): Promise<boolean> {
  
  try {
    const { data: membership, error: mErr } = await supabase
      .from("memberships")
      .select("role,is_active,can_manage_customers,can_create_invoices,can_validate_invoices,can_submit_ttn")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!mErr && membership?.is_active) {
      if (membership.role === "owner") return true;
      if (membership.role === "admin") {
        
        return true;
      }
      const map: Record<CompanyAction, string> = {
        manage_customers: "can_manage_customers",
        create_invoices: "can_create_invoices",
        validate_invoices: "can_validate_invoices",
        submit_ttn: "can_submit_ttn",
      };
      const field = map[action];
      return membership?.[field] === true;
    }
  } catch {
    
  }

  const { data: links, error: lErr } = await supabase
    .from("group_companies")
    .select("group_id")
    .eq("company_id", companyId);

  if (lErr || !links || links.length === 0) return false;

  const groupIds = new Set((links as any[]).map((x) => String(x.group_id)));

  const { data: gms, error: gmErr } = await supabase
    .from("group_members")
    .select("group_id,permissions,is_active")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (gmErr || !gms) return false;

  for (const gm of gms as any[]) {
    const gid = String(gm.group_id || "");
    if (!groupIds.has(gid)) continue;

    const perm = gm.permissions || {};
    const companyPerm = perm?.companies?.[companyId];
    if (companyPerm && companyPerm[action] === true) return true;
  }

  return false;
}
