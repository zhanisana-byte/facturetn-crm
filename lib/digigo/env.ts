export function digigoBaseUrl() {
  return String(process.env.DIGIGO_BASE_URL || "").trim();
}

export function digigoProxyBaseUrl() {
  return String(process.env.TTN_PROXY_URL || "").trim();
}

export function digigoClientId() {
  return String(process.env.DIGIGO_CLIENT_ID || "").trim();
}

export function digigoClientSecret() {
  return String(process.env.DIGIGO_CLIENT_SECRET || "").trim();
}
