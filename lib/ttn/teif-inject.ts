export function injectDsSignatureIntoTeif(unsignedXml: string, dsSignatureBlock: string) {
  const sig = String(dsSignatureBlock ?? "").trim();
  if (!sig) throw new Error("SIGNATURE_BLOCK_EMPTY");

  // Si on a reçu un XML complet, extraire uniquement <ds:Signature>...</ds:Signature>
  const m = sig.match(/<ds:Signature[\s\S]*?<\/ds:Signature>/);
  const signatureOnly = (m?.[0] || sig).trim();

  if (!signatureOnly.includes("<ds:Signature")) {
    throw new Error("SIGNATURE_BLOCK_INVALID");
  }
  if (!unsignedXml.includes("</InvoiceBody>") || !unsignedXml.includes("</TEIF>")) {
    throw new Error("TEIF_STRUCTURE_INVALID");
  }

  // Injection à la fin: </InvoiceBody> puis <ds:Signature> puis </TEIF>
  return unsignedXml.replace(
    /<\/InvoiceBody>\s*<\/TEIF>/,
    `</InvoiceBody>\n  ${signatureOnly}\n</TEIF>`
  );
}
