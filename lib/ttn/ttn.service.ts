import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";

export type TTNTestResult =
  | {
    ok: true;
    mode: "mock" | "real";
    code: "OK";
    message: string;
    payload: {
      ttn_request_id: string;
      server_time: string;
      environment: "TEST" | "PROD";
      latency_ms: number;
      response_preview?: string;
    };
  }
  | {
    ok: false;
    mode: "mock" | "real";
    code: "AUTH_FAILED" | "TIMEOUT" | "BAD_REQUEST" | "SERVER_ERROR" | "NOT_ENABLED" | "PROD_BLOCK";
    message: string;
    details?: any;
  };

function nowIso() {
  return new Date().toISOString();
}

function randId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isTTNEnabled() {
  return process.env.NEXT_PUBLIC_TTN_ENABLED === "1";
}

export function getTTNMode(): "mock" | "real" {
  if (process.env.NODE_ENV === "production") {
    // In production, we NEVER default to mock.
    const m = String(process.env.TTN_MODE || "").toLowerCase();
    if (m === "real") return "real";
    // If not explicitly real, we consider it invalid or default to real but block if missing?
    // User asked: "Si TTN_MODE === 'mock' -> refuser (throw) en prod."
    // So if it's set to "mock" (or anything else/empty that would fall back to mock), we must handle it.
    // For now, let's return "real" if set, otherwise throw error if logic demands it.
    // However, this function returns a string. The checking logic needs to be in the usage side OR here.
    // Let's make this return "real" strictly, or error out if we can't.
    // Actually, following the spec strictly: "En production (NODE_ENV === "production"), interdire le mode mock"
    if (m === "mock") {
      throw new Error("TTN_MODE cannot be 'mock' in production!");
    }
    // If empty, user said "throw error / refuser".
    if (!m) {
      throw new Error("TTN_MODE is required in production (must be 'real').");
    }
    return "real";
  }

  const m = String(process.env.TTN_MODE || "mock").toLowerCase();
  return m === "real" ? "real" : "mock";
}

async function mockTTNTest(environment: "test" | "production"): Promise<TTNTestResult> {
  // DOUBLE CHECK: This should never be called in prod due to safeguards, but just in case.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mock TTN execution prevented in production.");
  }

  const latency = 250 + Math.floor(Math.random() * 700);
  await sleep(latency);

  const roll = Math.random();
  if (roll < 0.06) {
    return {
      ok: false,
      mode: "mock",
      code: "AUTH_FAILED",
      message: "Échec d’authentification TTN (simulé) : identifiants invalides ou expirés.",
      details: { hint: "Vérifier ws_login/ws_password/ws_matricule ou certificat" },
    };
  }
  if (roll < 0.09) {
    return {
      ok: false,
      mode: "mock",
      code: "TIMEOUT",
      message: "Timeout TTN (simulé) : le service ne répond pas dans le délai imparti.",
      details: { timeout_ms: 8000 },
    };
  }

  return {
    ok: true,
    mode: "mock",
    code: "OK",
    message:
      "Connexion TTN test OK (simulé). Le connecteur est prêt — activation TTN en attente.",
    payload: {
      ttn_request_id: randId("TTNREQ"),
      server_time: nowIso(),
      environment: environment === "production" ? "PROD" : "TEST",
      latency_ms: latency,
    },
  };
}

export async function testTTNApi(opts: {
  environment: "test" | "production";
  missing?: string[];

  wsUrl?: string;
  wsLogin?: string;
  wsPassword?: string;
  wsMatricule?: string;
})
  : Promise<TTNTestResult> {
  if (!isTTNEnabled()) {
    return {
      ok: false,
      mode: process.env.NODE_ENV === "production" ? "real" : getTTNMode(),
      code: "NOT_ENABLED",
      message: "TTN en attente d’activation (flag global OFF).",
    };
  }

  if (opts.missing?.length) {
    return {
      ok: false,
      mode: process.env.NODE_ENV === "production" ? "real" : getTTNMode(),
      code: "BAD_REQUEST",
      message: `Paramètres manquants: ${opts.missing.join(", ")}`,
      details: { missing: opts.missing },
    };
  }

  let mode: "mock" | "real";
  try {
    mode = getTTNMode();
  } catch (e: any) {
    return {
      ok: false,
      mode: "real",
      code: "PROD_BLOCK",
      message: e.message || "TTN misconfiguration in production",
    };
  }

  if (mode === "mock") {
    // Audit protection
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        mode: "real",
        code: "PROD_BLOCK",
        message: "Mock mode is strictly disabled in production.",
      };
    }
    return mockTTNTest(opts.environment);
  }

  // IMPLEMENTATION RÉELLE VIA PROXY
  const proxyUrl = process.env.TTN_PROXY_URL;
  const targetUrl = opts.wsUrl || "";

  if (!targetUrl) {
    return {
      ok: false,
      mode: "real",
      code: "BAD_REQUEST",
      message: "URL du service TTN manquante (wsUrl).",
    };
  }

  try {
    const fetchOptions: any = {
      method: "POST", // On suppose un POST pour l'API SOAP/REST généralement
      headers: {
        "Content-Type": "application/json", // Default, à ajuster si SOAP
      },
      timeout: 10000,
    };

    if (proxyUrl) {
      console.log(`[TTN] 使用 Proxy: ${proxyUrl.replace(/:[^:@]+@/, ":***@")}`); // Log safe
      fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
    }

    // Tentative de connexion (Handshake simple)
    // Note: Sans le payload SOAP/REST exact, on teste surtout la connectivité réseau (IP)
    const t0 = Date.now();
    const res = await fetch(targetUrl, fetchOptions);
    const latency = Date.now() - t0;

    const text = await res.text();
    const isSuccess = res.ok; // 200-299

    // Si on reçoit une réponse du serveur gouv (même 4xx/500), c'est que l'IP passe (souvent)
    // Mais on veut idéalement un 200.

    // Pour le test "Is IP Whitelisted?", si on a un 403 Forbidden du serveur distant, 
    // ça peut vouloir dire IP refusée OU Auth refusée.

    if (isSuccess) {
      return {
        ok: true,
        mode: "real",
        code: "OK",
        message: "Connexion établie avec succès via Proxy.",
        payload: {
          ttn_request_id: randId("TTN_REAL"),
          server_time: nowIso(),
          environment: opts.environment === "production" ? "PROD" : "TEST",
          latency_ms: latency,
          response_preview: text.slice(0, 200),
        },
      };
    }

    return {
      ok: false,
      mode: "real",
      code: "SERVER_ERROR",
      message: `Le serveur a répondu: ${res.status} ${res.statusText}`,
      details: {
        status: res.status,
        response_preview: text.slice(0, 200),
      },
    };

  } catch (error: any) {
    console.error("[TTN] Fetch Error:", error);
    return {
      ok: false,
      mode: "real",
      code: "TIMEOUT", // Ou NETWORK_ERROR
      message: `Erreur de connexion: ${error.message}`,
      details: {
        proxy_used: !!proxyUrl,
        cause: error.cause,
      },
    };
  }
}

