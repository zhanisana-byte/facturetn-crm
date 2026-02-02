import { digigoAspId, digigoAspIp, digigoBaseUrl, digigoCall } from "@/lib/signature/digigoClient";

export { digigoAspId, digigoAspIp, digigoBaseUrl, digigoCall };

function s(v: any) {
  return String(v ?? "").trim();
}

export async function digigoStartSession(): Promise<string> {
  const aspId = digigoAspId();
  const aspIp = digigoAspIp();

  const payload = { aspId, aspIp };

  const methods = [
    "createSession",
    "createOtpSession",
    "startSession",
    "initSession",
    "createSignatureSession",
  ];

  for (const m of methods) {
    const r = await digigoCall(m, payload);
    if (!r.ok) continue;
    const data: any = r.data ?? {};
    const id = s(data.sessionId || data.session_id || data.session || data.id || data.SessionId || data.SessionID);
    if (id) return id;
  }

  const r2 = await digigoCall("createSession", payload);
  if (r2.ok) {
    const d: any = r2.data ?? {};
    const id = s(d.sessionId || d.session_id || d.session || d.id);
    if (id) return id;
  }

  return "";
}
