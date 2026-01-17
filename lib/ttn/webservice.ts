// v11 - TTN El Fatoora Webservice (SOAP) client
// Based on "Spécifications web services v5.pdf" found in technique sana.zip
// WSDL: https://elfatoora.tn/ElfatouraServices/EfactService?wsdl
// Operations: saveEfact, consultEfact, verifyQrCode

export type TTNWebserviceConfig = {
  url: string; // SOAP endpoint base (without ?wsdl)
  login: string;
  password: string;
  matricule: string;
};

export type TTNSaveEfactResult = {
  ok: boolean;
  status: number;
  raw: string;
  /** Numéro unique généré par l'opération saveEfact avant traitement noyau (idSaveEfact) */
  idSaveEfact?: string | null;
  /** Numéro unique généré par TTN (generatedRef) – peut arriver via consultEfact */
  generatedRef?: string | null;
};

function escXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function saveEfactSOAP(cfg: TTNWebserviceConfig, teifXml: string) {
  // According to TTN WS spec, documentEfact is a byte[] (SOAP base64).
  // We send base64 of UTF-8 bytes.
  const xmlB64 = Buffer.from(teifXml, "utf8").toString("base64");

  const envelope = `<?xml version="1.0" encoding="utf-8"?>` +
`<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.elfatoura.tradenet.com.tn/">` +
`<soapenv:Header/>` +
`<soapenv:Body>` +
`<ser:saveEfact>` +
`<login>${escXml(cfg.login)}</login>` +
`<password>${escXml(cfg.password)}</password>` +
`<matricule>${escXml(cfg.matricule)}</matricule>` +
`<documentEfact>${xmlB64}</documentEfact>` +
`</ser:saveEfact>` +
`</soapenv:Body>` +
`</soapenv:Envelope>`;

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "",
    },
    body: envelope,
    cache: "no-store",
  });

  const text = await res.text();

  // saveEfact returns a string (often a numeric idSaveEfact). We try to extract it.
  const idMatch = text.match(/<return>([^<]+)<\/return>/i);
  const idSaveEfact = idMatch ? idMatch[1] : null;

  return { ok: res.ok, status: res.status, raw: text, idSaveEfact } satisfies TTNSaveEfactResult;
}

export type TTNConsultCriteria = {
  documentNumber?: string;
  idSaveEfact?: string;
  generatedRef?: string;
  documentType?: string;
};

/** consultEfact(login,password,matricule,efactCriteria) */
export async function consultEfactSOAP(cfg: TTNWebserviceConfig, criteria: TTNConsultCriteria) {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>` +
`<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.elfatoura.tradenet.com.tn/">` +
`<soapenv:Header/>` +
`<soapenv:Body>` +
`<ser:consultEfact>` +
`<login>${escXml(cfg.login)}</login>` +
`<password>${escXml(cfg.password)}</password>` +
`<matricule>${escXml(cfg.matricule)}</matricule>` +
`<efactCriteria>` +
(criteria.documentNumber ? `<documentNumber>${escXml(criteria.documentNumber)}</documentNumber>` : ``) +
(criteria.idSaveEfact ? `<idSaveEfact>${escXml(criteria.idSaveEfact)}</idSaveEfact>` : ``) +
(criteria.generatedRef ? `<generatedRef>${escXml(criteria.generatedRef)}</generatedRef>` : ``) +
(criteria.documentType ? `<documentType>${escXml(criteria.documentType)}</documentType>` : ``) +
`</efactCriteria>` +
`</ser:consultEfact>` +
`</soapenv:Body>` +
`</soapenv:Envelope>`;

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "",
    },
    body: envelope,
    cache: "no-store",
  });

  const text = await res.text();
  return { ok: res.ok, status: res.status, raw: text };
}
