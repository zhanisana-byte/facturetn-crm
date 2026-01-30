import { NextResponse } from "next/server";
export const dynamic = "force-static";

export async function GET(request: Request) {
  const target = new URL("/agent/FactureTN_Agent_Windows_Extension.zip", request.url);
  return NextResponse.redirect(target);
}
