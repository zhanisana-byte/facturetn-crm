import { NextResponse } from "next/server"
import { digigoAuthorizeUrl, sha256Base64Utf8 } from "@/lib/digigo/client"
import { createClient } from "@supabase/supabase-js"
import { v4 as uuidv4 } from "uuid"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const { invoiceId } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, company_id")
    .eq("id", invoiceId)
    .single()

  if (!invoice) {
    return NextResponse.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 })
  }

  const { data: company } = await supabase
    .from("companies")
    .select("digigo_credential_id")
    .eq("id", invoice.company_id)
    .single()

  if (!company?.digigo_credential_id) {
    return NextResponse.json({ error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 })
  }

  const env = (process.env.DIGIGO_ENV as "test" | "production") || "test"
  const clientId = process.env.DIGIGO_CLIENT_ID!
  const redirectUri = process.env.DIGIGO_REDIRECT_URI!

  const state = uuidv4()

  const hash = sha256Base64Utf8(invoice.id)

  const authorizeUrl = digigoAuthorizeUrl({
    env,
    clientId,
    redirectUri,
    state,
    credentialId: company.digigo_credential_id,
    hashBase64: hash,
    numSignatures: 1,
  })

  await supabase.from("digigo_sign_sessions").insert({
    invoice_id: invoice.id,
    state,
    status: "pending",
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    company_id: invoice.company_id,
    environment: env,
  })

  return NextResponse.json({ authorizeUrl })
}
