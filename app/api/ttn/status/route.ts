import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Statut simplifié: ...
export async function GET() {
  // Dans une implémentation réelle, vous peux:
  // - ping votre provider / TTN sandbox
  // - vérifier la disponibilité d'un job runner
  // - etc.

  return NextResponse.json({
    ok: true,
    message: "Service disponible (placeholder)",
    checked_at: new Date().toISOString(),
  });
}
