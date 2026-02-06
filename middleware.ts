import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".map")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicAsset(pathname)) return NextResponse.next();

  // ✅ IMPORTANT : kit DigiGo = redirectUri sur "/"
  // Si DigiGo revient sur /?token=...&state=... -> on redirige vers /digigo/redirect
  if (pathname === "/") {
    const token = req.nextUrl.searchParams.get("token");
    const state = req.nextUrl.searchParams.get("state");

    // (optionnel, par sécurité si un jour ils renvoient code/error)
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");

    if ((token && state) || (code && state) || error) {
      const url = req.nextUrl.clone();
      url.pathname = "/digigo/redirect";
      return NextResponse.redirect(url);
    }
  }

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password");

  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/mentions-legales") ||
    pathname.startsWith("/conditions-generales") ||
    pathname.startsWith("/help") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/digigo/redirect");

  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set({ name, value, ...options });
          });
        },
      },
    }
  );

  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (session && isAuthRoute) {
    const url = req.nextUrl.clone();
    url.pathname = "/switch";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isPublicRoute || isAuthRoute) return res;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/switch" || pathname.startsWith("/switch/")) return res;

  const area = pathname.startsWith("/companies")
    ? "companies"
    : pathname.startsWith("/groups")
    ? "groups"
    : pathname.startsWith("/accountant")
    ? "accountant"
    : pathname.startsWith("/pdg")
    ? "pdg"
    : "profil";

  const cachedUid = req.cookies.get("ftn_uid")?.value;
  const cachedType = req.cookies.get("ftn_account_type")?.value;

  let accountTypeRaw = "";

  if (cachedUid === session.user.id && cachedType) {
    accountTypeRaw = String(cachedType).toLowerCase().trim();
  } else {
    try {
      const { data: profile, error } = await supabase
        .from("app_users")
        .select("account_type")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        accountTypeRaw = "profil";
      } else {
        accountTypeRaw = String(profile?.account_type ?? "").toLowerCase().trim();
        if (!accountTypeRaw) accountTypeRaw = "profil";
      }
    } catch {
      accountTypeRaw = "profil";
    }

    const isProd = process.env.NODE_ENV === "production";
    res.cookies.set({
      name: "ftn_uid",
      value: session.user.id,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      maxAge: 60 * 30,
    });
    res.cookies.set({
      name: "ftn_account_type",
      value: accountTypeRaw,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      maxAge: 60 * 30,
    });
  }

  const accountType =
    accountTypeRaw === "cabinet"
      ? "comptable"
      : accountTypeRaw === "groupe"
      ? "multi_societe"
      : accountTypeRaw === "client"
      ? "entreprise"
      : accountTypeRaw;

  if (accountType === "profil") return res;

  if (area === "pdg") {
    if (accountTypeRaw !== "pdg")
      return NextResponse.redirect(new URL("/switch", req.url));
    return res;
  }

  if (accountType === "entreprise") {
    if (area !== "companies")
      return NextResponse.redirect(new URL("/switch", req.url));
    return res;
  }

  if (accountType === "multi_societe") {
    if (area !== "groups") return NextResponse.redirect(new URL("/switch", req.url));
    return res;
  }

  if (accountType === "comptable") {
    if (area !== "accountant")
      return NextResponse.redirect(new URL("/switch", req.url));
    return res;
  }

  return NextResponse.redirect(new URL("/switch", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|robots.txt|sitemap.xml).*)"],
};
