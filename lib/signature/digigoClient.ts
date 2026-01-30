import https from "https";

export type DigigoResponse = {
  ok: boolean;
  data?: any;
  error?: string;
  status?: number;
};

function env(name: string, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

/**
 * Base URL DigiGO
 * Exemple:
 * https://193.95.63.244:8443/tunsign-proxy-webapp/services/rest/tunsign-proxy
 */
export function digigoBaseUrl() {
  const raw = env("DIGIGO_BASE_URL");
  return raw.replace(/\/$/, "");
}

export function digigoAspId() {
  return env("DIGIGO_ASP_ID");
}

export function digigoAspIp() {
  return env("DIGIGO_ASP_IP");
}

export function digigoInsecureAllowed() {
  return env("DIGIGO_ALLOW_INSECURE", "true").toLowerCase() === "true";
}

/**
 * Appel DigiGO robuste.
 *
 * IMPORTANT (réalité terrain Tuntrust):
 * - Certaines plateformes exposent:
 *     POST {base}/{method}
 * - D'autres exigent:
 *     POST {base}?method={method}
 *
 * 👉 On tente les DEUX automatiquement.
 */
export async function digigoCall(
  methodName: string,
  payload: any
): Promise<DigigoResponse> {
  const base = digigoBaseUrl();
  if (!base) {
    return { ok: false, error: "DIGIGO_BASE_URL manquante" };
  }

  const agent = digigoInsecureAllowed()
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

  const headers = { "Content-Type": "application/json" };

  const attempts = [
    // Tentative 1: /methodName
    `${base}/${methodName}`,
    // Tentative 2: ?method=methodName (proxy Tuntrust)
    `${base}?method=${encodeURIComponent(methodName)}`,
  ];

  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload ?? {}),
        // @ts-ignore (Node runtime)
        agent,
      });

      const txt = await res.text();
      let data: any = txt;
      try {
        data = JSON.parse(txt);
      } catch {}

      if (res.ok) {
        return { ok: true, status: res.status, data };
      }

      // Si 404 → on tente l'autre forme
      if (res.status === 404) continue;

      return {
        ok: false,
        status: res.status,
        error:
          (data && (data.error || data.message)) || `HTTP_${res.status}`,
        data,
      };
    } catch (e: any) {
      // on tente la prochaine variante
      continue;
    }
  }

  return {
    ok: false,
    error: "DIGIGO_ENDPOINT_NOT_FOUND",
  };
}
