type Mail = { to: string; subject: string; text: string };

export type MailEnv = {
  MAIL_FROM: string;
  // Free transactional provider (300/day, no domain required). Preferred when set.
  BREVO_API_KEY?: string;
  // Alternative provider; used when Brevo is not configured.
  RESEND_API_KEY?: string;
};

// Parses `Name <addr@host>` or a bare `addr@host` into Brevo's sender shape.
function parseFrom(from: string): { email: string; name?: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2] };
  return { email: from.trim() };
}

// Sends through Brevo if a key is set, else Resend, else no-op (local dev and tests).
// The caller still succeeds when no provider is configured; `sent` reports what happened.
export async function sendMail(env: MailEnv, mail: Mail): Promise<{ sent: boolean }> {
  if (env.BREVO_API_KEY) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: parseFrom(env.MAIL_FROM),
        to: [{ email: mail.to }],
        subject: mail.subject,
        textContent: mail.text,
      }),
    });
    if (!res.ok) {
      // Provider bodies can contain contact data. Keep only the status in errors/logs.
      throw new Error(`mail_failed:brevo_${res.status}`);
    }
    return { sent: true };
  }

  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: env.MAIL_FROM, ...mail }),
    });
    if (!res.ok) {
      // Do not parse or log provider bodies, which can contain contact data or OTPs.
      throw new Error(`mail_failed:resend_${res.status}`);
    }
    return { sent: true };
  }

  return { sent: false };
}
