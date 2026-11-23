type Mail = { to: string; subject: string; text: string };

export type MailEnv = {
  MAIL_FROM: string;
  BREVO_API_KEY?: string;
  RESEND_API_KEY?: string;
};

function parseFrom(from: string): { email: string; name?: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2] };
  return { email: from.trim() };
}

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
      throw new Error(`mail_failed:resend_${res.status}`);
    }
    return { sent: true };
  }

  return { sent: false };
}
