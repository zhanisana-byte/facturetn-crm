
export type EmailAttachment = {
  filename: string;
  content: Uint8Array | Buffer;
  contentType?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  from?: string;
  attachments?: EmailAttachment[];
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

function toBase64(content: Uint8Array | Buffer) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return buf.toString("base64");
}

export async function sendEmailResend(input: SendEmailInput) {
  const apiKey = requireEnv("RESEND_API_KEY");
  const fromDefault = requireEnv("RESEND_FROM");

  const from =
    input.from && input.from.trim()
      ? input.from
      : fromDefault;

  const attachments =
    input.attachments?.map((a) => ({
      filename: a.filename,
      content: toBase64(a.content),
      content_type: a.contentType || "application/octet-stream",
    })) ?? [];

  const payload: any = {
    from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
  };

  if (attachments.length) {
    payload.attachments = attachments;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(
      json?.message ||
      json?.error ||
      `RESEND_SEND_FAILED (${resp.status})`
    );
  }

  return { id: json?.id ?? null };
}
