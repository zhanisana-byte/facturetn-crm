// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isAuth = path.startsWith("/login") || path.startsWith("/register");
  const isProtected = path.startsWith("/dashboard") || path.startsWith("/pdg");

  if (!data.user && isProtected) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (data.user && isAuth) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/pdg/:path*", "/login", "/register"],
};
