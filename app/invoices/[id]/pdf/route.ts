import { NextRequest, NextResponse } from "next/server";

// ✅ Compat route: certains écrans pointaient /invoices/[id]/pdf
// Le vrai PDF est généré via /api/invoices/[id]/pdf (Puppeteer).
// On redirige donc ici pour éviter le téléchargement HTML.

export async function GET(req: NextRequest, ctx: { params: Promise<{id: string}> }) {
  const { id } = await ctx.params;
  const url = new URL(`/api/invoices/${id}/pdf`, req.url);
  return NextResponse.redirect(url);
}
