export type TTNWebserviceConfig = {
  endpoint?: string;
  url?: string;
  login: string;
  password: string;
  matricule: string;
  soapAction?: string;
  serviceNs?: string;
  timeoutMs?: number;
};

export type TTNWsResult = {
  ok: boolean;
  status: number;
  text: string;
  idSaveEfact?: string | null;
  uuidEfact?: string | null;
};

function escXml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeServiceNs(ns?: string) {
  const v = String(ns || "").trim();
  return v || "http://service.ws.einvoice.finances.gov.tn/";
}

function normalizeEndpoint(cfg: TTNWebserviceConfig) {
  const a = String(cfg.endpoint || "").trim();
  if (a) return a;
  const b = String(cfg.url || "").trim();
  return b;
}

function pickTag(text: string, tag: string) {
  const t = String(text || "");
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i");
  const m = t.match(re);
  if (!m) return null;
  const v = String(m[1] ?? "").trim();
  return v || null;
}

function parseSaveId(text: string) {
  return pickTag(text, "idSaveEfact") ?? pickTag(text, "saveEfactResult") ?? null;
}

function parseUuid(text: string) {
  return pickTag(text, "uuidEfact") ?? pickTag(text, "uuid") ?? null;
}

export function buildSaveEfactEnvelope(cfg: TTNWebserviceConfig, xmlB64: string) {
  const serviceNs = normalizeServiceNs(cfg.serviceNs);
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${escXml(serviceNs)}">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
    `<ser:saveEfact>` +
    `<login>${escXml(cfg.login)}</login>` +
    `<password>${escXml(cfg.password)}</password>` +
    `<matricule>${escXml(cfg.matricule)}</matricule>` +
    `<documentEfact>${escXml(xmlB64)}</documentEfact>` +
    `</ser:saveEfact>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

export function buildConsultEfactEnvelope(cfg: TTNWebserviceConfig, uuid: string) {
  const serviceNs = normalizeServiceNs(cfg.serviceNs);
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${escXml(serviceNs)}">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
    `<ser:consultEfact>` +
    `<login>${escXml(cfg.login)}</login>` +
    `<password>${escXml(cfg.password)}</password>` +
    `<matricule>${escXml(cfg.matricule)}</matricule>` +
    `<uuidEfact>${escXml(uuid)}</uuidEfact>` +
    `</ser:consultEfact>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<TTNWsResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

export async function ttnSaveEfact(cfg: TTNWebserviceConfig, xmlB64: string): Promise<TTNWsResult> {
  const endpoint = normalizeEndpoint(cfg);
  if (!endpoint) return { ok: false, status: 0, text: "Missing TTN endpoint", idSaveEfact: null };

  const envelope = buildSaveEfactEnvelope(cfg, xmlB64);

  const base = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: cfg.soapAction || "saveEfact",
      },
      body: envelope,
    },
    cfg.timeoutMs || 45000
  );

  const idSaveEfact = base.ok ? parseSaveId(base.text) : null;
  return { ...base, idSaveEfact };
}

export async function ttnConsultEfact(cfg: TTNWebserviceConfig, uuid: string): Promise<TTNWsResult> {
  const endpoint = normalizeEndpoint(cfg);
  if (!endpoint) return { ok: false, status: 0, text: "Missing TTN endpoint", uuidEfact: null };

  const envelope = buildConsultEfactEnvelope(cfg, uuid);

  const base = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: cfg.soapAction || "consultEfact",
      },
      body: envelope,
    },
    cfg.timeoutMs || 45000
  );

  const uuidEfact = base.ok ? parseUuid(base.text) : null;
  return { ...base, uuidEfact };
}

export async function saveEfactSOAP(cfg: TTNWebserviceConfig, xmlB64: string) {
  return ttnSaveEfact(cfg, xmlB64);
}

export async function consultEfactSOAP(cfg: TTNWebserviceConfig, uuid: string) {
  return ttnConsultEfact(cfg, uuid);
}
