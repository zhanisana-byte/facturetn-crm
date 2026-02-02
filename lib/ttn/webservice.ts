export type TTNWebServiceConfig = {
  endpoint: string;
  login: string;
  password: string;
  matricule: string;
  soapAction?: string;
  serviceNs?: string;
};

function escXml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSaveEfactEnvelope(cfg: TTNWebServiceConfig, xmlB64: string) {
  const serviceNs = cfg.serviceNs || "http://service.ws.einvoice.finances.gov.tn/";
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

export async function ttnSaveEfact(cfg: TTNWebServiceConfig, xmlB64: string) {
  const envelope = buildSaveEfactEnvelope(cfg, xmlB64);

  const res = await fetch(cfg.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: cfg.soapAction || "saveEfact",
    },
    body: envelope,
    cache: "no-store",
  });

  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
