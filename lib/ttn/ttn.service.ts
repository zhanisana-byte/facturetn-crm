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
      };
    }
  | {
      ok: false;
      mode: "mock" | "real";
      code: "AUTH_FAILED" | "TIMEOUT" | "BAD_REQUEST" | "SERVER_ERROR" | "NOT_ENABLED";
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
  // NEXT_PUBLIC_TTN_ENABLED est aussi lisible côté server.
  return process.env.NEXT_PUBLIC_TTN_ENABLED === "1";
}

export function getTTNMode(): "mock" | "real" {
  const m = String(process.env.TTN_MODE || "mock").toLowerCase();
  return m === "real" ? "real" : "mock";
}

async function mockTTNTest(environment: "test" | "production"): Promise<TTNTestResult> {
  // Simuler une latence réseau réaliste
  const latency = 250 + Math.floor(Math.random() * 700);
  await sleep(latency);

  // Simuler quelques erreurs typiques (faible taux)
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
  // Les identifiants réels seront utilisés quand TTN_MODE=real
  wsUrl?: string;
  wsLogin?: string;
  wsPassword?: string;
  wsMatricule?: string;
})
  : Promise<TTNTestResult> {
  if (!isTTNEnabled()) {
    return {
      ok: false,
      mode: getTTNMode(),
      code: "NOT_ENABLED",
      message: "TTN en attente d’activation (flag global OFF).",
    };
  }

  if (opts.missing?.length) {
    return {
      ok: false,
      mode: getTTNMode(),
      code: "BAD_REQUEST",
      message: `Paramètres manquants: ${opts.missing.join(", ")}`,
      details: { missing: opts.missing },
    };
  }

  const mode = getTTNMode();
  if (mode === "mock") {
    return mockTTNTest(opts.environment);
  }

  // Mode réel: implémentation branchée dans app/api/companies/[id]/ttn/test-api/route.ts
  // (on garde le code existant consultEfactSOAP). Ici, on renvoie un message clair.
  return {
    ok: false,
    mode: "real",
    code: "NOT_ENABLED",
    message:
      "TTN_MODE=real est activé, mais le connecteur réel n’est pas encore configuré dans cet environnement.",
  };
}
