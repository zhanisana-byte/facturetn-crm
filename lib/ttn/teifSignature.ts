import { injectDsSignatureIntoTeif } from "./teif-inject";

function s(v: any) {
  return String(v ?? "").trim();
}

export function injectSignatureIntoTeifXml(unsignedXml: string, signatureValueOrBlock: string) {
  const val = s(signatureValueOrBlock);
  if (!val) throw new Error("SIGNATURE_EMPTY");

  if (val.includes("<ds:Signature")) {
    return injectDsSignatureIntoTeif(unsignedXml, val);
  }

  const dsBlock = [
    `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">`,
    `  <ds:SignatureValue>${val}</ds:SignatureValue>`,
    `</ds:Signature>`,
  ].join("\n");

  return injectDsSignatureIntoTeif(unsignedXml, dsBlock);
}
