import { NextResponse } from "next/server";
import { testTTNApi } from "@/lib/ttn/ttn.service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Audit Protection: Disable in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({}, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  const environment = body.environment === "production" ? "production" : "test";
  const missing = [];

  if (!body.wsUrl && !process.env.TTN_WS_URL) missing.push("wsUrl");
  // etc. simplistic check, the service handles most logic

  const result = await testTTNApi({
    environment,
    missing: missing.length ? missing : undefined,
    wsUrl: body.wsUrl,
    wsLogin: body.wsLogin,
    wsPassword: body.wsPassword,
    wsMatricule: body.wsMatricule,
  });

  return NextResponse.json(result);
}
