import { Resend } from "resend";

type Mail = { to: string; subject: string; text: string };

// Without a key (local dev and tests) mail is not sent; the caller still succeeds.
export async function sendMail(env: { RESEND_API_KEY?: string; MAIL_FROM: string }, mail: Mail) {
  if (!env.RESEND_API_KEY) return { sent: false as const };
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: env.MAIL_FROM, ...mail });
  if (error) throw new Error(`mail_failed:${error.name}`);
  return { sent: true as const };
}
