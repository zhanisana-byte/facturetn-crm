import { NextResponse } from "next/server";
import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";

export const dynamic = "force-dynamic";

export async function GET() {
    const proxyUrl = process.env.TTN_PROXY_URL;
    const testUrl = "https://api.ipify.org?format=json";

    try {
        const fetchOptions: any = {
            timeout: 10000,
        };

        if (proxyUrl) {
            fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
        }

        const res = await fetch(testUrl, fetchOptions);
        const data = await res.json() as { ip: string };

        return NextResponse.json({
            ok: true,
            proxy_configured: !!proxyUrl,
            detected_ip: data.ip,
            is_using_proxy: proxyUrl ? data.ip === "54.37.230.4" : false,
            message: proxyUrl
                ? `Traffic is routed through ${data.ip}`
                : "No proxy configured, using Vercel dynamic IP."
        });

    } catch (error: any) {
        return NextResponse.json({
            ok: false,
            error: error.message,
            proxy_url_used: proxyUrl ? "HIDDEN" : "NONE"
        }, { status: 500 });
    }
}
