import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AccountType } from "@/app/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// DB values for user_workspace.active_mode
export type ActiveMode = "profil" | "entreprise" | "comptable" | "multi_societe";

// Backward/forward compatibility alias
export type WorkspaceMode = ActiveMode;

export type WorkspaceRow = {
  user_id: string;
  active_mode: ActiveMode | null;
  active_company_id: string | null;
  active_group_id: string | null;
  updated_at: string | null;
};

/**
 * Map workspace active_mode → UI shell (AccountType)
 *
 * ✅ Supports BOTH call styles to avoid future build breaks:
 *   - shellTypeFromWorkspace("entreprise")
 *   - shellTypeFromWorkspace(workspaceRow)
 */
export function shellTypeFromWorkspace(arg?: ActiveMode | WorkspaceRow | null): AccountType {
  const mode: ActiveMode | null | undefined =
    typeof arg === "string" ? (arg as ActiveMode) : (arg as WorkspaceRow | null | undefined)?.active_mode;

  if (mode === "entreprise") return "entreprise";
  if (mode === "comptable") return "comptable";
  if (mode === "multi_societe") return "multi_societe";
  return "profil";
}

/**
 * Ensure a user_workspace row exists for the current authenticated user.
 * - returns existing row if present
 * - creates one if missing (ignores RLS errors)
 * - returns a safe fallback row if insert is blocked
 */
export async function ensureWorkspaceRow(
  supabase: SupabaseClient<Database>
): Promise<WorkspaceRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return null;

  // 1) Read
  const { data: ws } = await supabase
    .from("user_workspace")
    .select("user_id,active_mode,active_company_id,active_group_id,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (ws) {
    return {
      user_id: ws.user_id,
      active_mode: (ws.active_mode as ActiveMode | null) ?? "profil",
      active_company_id: ws.active_company_id ?? null,
      active_group_id: ws.active_group_id ?? null,
      updated_at: ws.updated_at ?? null,
    };
  }

  // 2) Create if missing
  try {
    const payload = {
      user_id: user.id,
      active_mode: "profil" as ActiveMode,
      active_company_id: null,
      active_group_id: null,
      updated_at: new Date().toISOString(),
    };

    const { data: inserted } = await supabase
      .from("user_workspace")
      .insert(payload)
      .select("user_id,active_mode,active_company_id,active_group_id,updated_at")
      .single();

    if (inserted) {
      return {
        user_id: inserted.user_id,
        active_mode: (inserted.active_mode as ActiveMode | null) ?? "profil",
        active_company_id: inserted.active_company_id ?? null,
        active_group_id: inserted.active_group_id ?? null,
        updated_at: inserted.updated_at ?? null,
      };
    }
  } catch {
    // ignore (RLS)
  }

  // 3) Fallback
  return {
    user_id: user.id,
    active_mode: "profil",
    active_company_id: null,
    active_group_id: null,
    updated_at: null,
  };
}
