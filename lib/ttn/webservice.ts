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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
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

export async function ttnSaveEfact(cfg: TTNWebserviceConfig, xmlB64: string) {
  const endpoint = normalizeEndpoint(cfg);
  if (!endpoint) return { ok: false, status: 0, text: "Missing TTN endpoint" };

  const envelope = buildSaveEfactEnvelope(cfg, xmlB64);

  return fetchWithTimeout(
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
}

export async function ttnConsultEfact(cfg: TTNWebserviceConfig, uuid: string) {
  const endpoint = normalizeEndpoint(cfg);
  if (!endpoint) return { ok: false, status: 0, text: "Missing TTN endpoint" };

  const envelope = buildConsultEfactEnvelope(cfg, uuid);

  return fetchWithTimeout(
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
}

export async function saveEfactSOAP(cfg: TTNWebserviceConfig, xmlB64: string) {
  return ttnSaveEfact(cfg, xmlB64);
}

export async function consultEfactSOAP(cfg: TTNWebserviceConfig, uuid: string) {
  return ttnConsultEfact(cfg, uuid);
}
