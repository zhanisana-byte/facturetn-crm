import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Helper: redirect vers /blocked
  const block = (reason: string) => {
    const url = new URL("/blocked", req.url);
    url.searchParams.set("reason", reason);
    url.searchParams.set("next", "/switch");
    return NextResponse.redirect(url);
  };

  // ===============================
  // 1) Legacy redirects (boutons anciens)
  // ===============================
  if (path === "/cabinet" || path.startsWith("/cabinet/")) {
    return NextResponse.redirect(new URL("/accountant/cabinet", req.url));
  }
  if (path === "/company/select") {
    return NextResponse.redirect(new URL("/switch", req.url));
  }

  // ===============================
  // 2) Facturation interdite hors Profil
  // ===============================
  if (
    path.startsWith("/accountant/invoices") ||
    path.startsWith("/accountant/recurring") ||
    path.startsWith("/accountant/declaration")
  ) {
    return block("cabinet_facturation");
  }

  if (/^\/companies\/[^\/]+\/(invoices|recurring)(\/|$)/.test(path)) {
    return block("societe_facturation");
  }

  if (/^\/groups\/[^\/]+\/(invoices|recurring)(\/|$)/.test(path)) {
    return block("groupe_facturation");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
