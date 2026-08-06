import { Resend } from "resend";
import { logRemoteCall } from "./remoteLog";

export type EmailProvider = "console" | "resend";

export function getEmailProvider(): EmailProvider {
  const value = process.env.EMAIL_PROVIDER ?? "console";
  if (value === "console" || value === "resend") return value;
  throw new Error(
    `EMAIL_PROVIDER must be "console" or "resend" — got ${JSON.stringify(value)}`,
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

let resendClient: Resend;

function getResendClient(): Resend {
  if (resendClient) return resendClient;
  resendClient = new Resend(requireEnv("RESEND_API_KEY"));
  return resendClient;
}

type Email = { to: string; subject: string; html: string };

/**
 * EMAIL_PROVIDER=console (the default) logs instead of sending, so signup
 * and password reset work in local dev without a Resend account -- the
 * verification/reset link lands in the server console instead of an inbox.
 */
async function sendEmail({ to, subject, html }: Email): Promise<void> {
  const provider = getEmailProvider();
  if (provider === "console") {
    console.log(`[email] to=${to} subject=${JSON.stringify(subject)}\n${html}`);
    return;
  }

  const { error } = await logRemoteCall("resend", "emails.send", () =>
    getResendClient().emails.send({
      from: requireEnv("EMAIL_FROM"),
      to,
      subject,
      html,
    }),
  );
  if (error) {
    throw new Error(`Resend failed to send to ${to}: ${error.message}`);
  }
}

export async function sendVerificationEmail(to: string, link: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Verify your email",
    html: `<p>Confirm your email address for Atlas:</p><p><a href="${link}">${link}</a></p><p>If you didn't create an account, you can ignore this email.</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your password",
    html: `<p>Reset your Atlas password:</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
  });
}

export async function sendStewardVerificationEmail(to: string, link: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Verify your steward contact",
    html: `<p>Confirm this address as the contact for your steward record on Atlas:</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
  });
}
