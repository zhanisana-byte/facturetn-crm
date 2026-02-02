

export type TTNSignatureConfig = {
  
  dss_url?: string | null;
  
  dss_token?: string | null;
  
  dss_profile?: string | null;
  
  require_signature?: boolean | null;
};

export async function signTeifXmlIfNeeded(
  teifXml: string,
  cfg: TTNSignatureConfig
): Promise<{ xml: string; signed: boolean; provider: string | null }> {
  const requireSig = Boolean(cfg.require_signature);

  if (!cfg.dss_url) {
    return { xml: teifXml, signed: false, provider: null };
  }

  const res = await fetch(cfg.dss_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cfg.dss_token ? { Authorization: `Bearer ${cfg.dss_token}` } : {}),
    },
    body: JSON.stringify({ xml: teifXml, profile: cfg.dss_profile || undefined }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    if (requireSig) {
      throw new Error(`DSS signature error (${res.status}): ${text}`);
    }
    
    return { xml: teifXml, signed: false, provider: "dss" };
  }

  let signedXml = text;
  try {
    const j = JSON.parse(text);
    if (typeof j?.xml === "string") signedXml = j.xml;
  } catch {
    
  }

  if (!signedXml.includes("Signature")) {
    if (requireSig) throw new Error("DSS returned a response but signature is missing.");
    return { xml: teifXml, signed: false, provider: "dss" };
  }

  return { xml: signedXml, signed: true, provider: "dss" };
}
