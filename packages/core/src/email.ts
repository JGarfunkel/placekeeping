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

type EmailAttachment = { filename: string; content: string };
type Email = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

/**
 * EMAIL_PROVIDER=console (the default) logs instead of sending, so signup
 * and password reset work in local dev without a Resend account -- the
 * verification/reset link lands in the server console instead of an inbox.
 */
async function sendEmail({ to, subject, html, replyTo, attachments }: Email): Promise<void> {
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
      ...(replyTo ? { replyTo } : {}),
      ...(attachments ? { attachments } : {}),
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

/**
 * Relays a message received at an inbound address (see inboundEmail.ts) to a
 * human inbox. replyTo is set to the original sender so replying from that
 * inbox goes straight back to them, not to us.
 */
export async function sendForwardedInboundEmail(message: {
  to: string;
  from: string;
  subject: string;
  bodyHtml: string;
}): Promise<void> {
  await sendEmail({
    to: message.to,
    subject: `[Placekeeping] ${message.subject}`,
    html: `<p><b>From:</b> ${message.from}</p><hr>${message.bodyHtml}`,
    replyTo: message.from,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

export interface CareEventEmailDetails {
  title: string;
  whenText: string;
  locationText: string;
  whatToBring: string;
  notesForVolunteers: string;
  eventUrl: string;
  ics: string;
}

function eventSummaryHtml(d: CareEventEmailDetails): string {
  return [
    `<p><b>${escapeHtml(d.title)}</b><br>${escapeHtml(d.whenText)}`,
    d.locationText ? `<br>${escapeHtml(d.locationText)}` : "",
    "</p>",
    d.whatToBring ? `<p><b>What to bring:</b> ${escapeHtml(d.whatToBring)}</p>` : "",
    d.notesForVolunteers ? `<p>${escapeHtml(d.notesForVolunteers)}</p>` : "",
  ].join("");
}

/** Guest sign-up: confirm the address (which also lets them set a password). */
export async function sendCareEventConfirmationEmail(
  to: string,
  confirmUrl: string,
  d: CareEventEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Confirm your spot: ${d.title}`,
    html: `${eventSummaryHtml(d)}<p>Confirm your sign-up and set a password:</p><p><a href="${confirmUrl}">${confirmUrl}</a></p><p>If you didn't sign up, you can ignore this email; the sign-up expires in 48 hours.</p>`,
    attachments: [{ filename: "event.ics", content: d.ics }],
  });
}

/** Guest sign-up with an address that already has an account: no roster row is created. */
export async function sendCareEventSignInEmail(
  to: string,
  d: CareEventEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Sign in to join: ${d.title}`,
    html: `${eventSummaryHtml(d)}<p>Someone asked to sign up with this address. Sign in to join:</p><p><a href="${d.eventUrl}">${d.eventUrl}</a></p>`,
  });
}

export async function sendCareEventSignupEmail(
  to: string,
  d: CareEventEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `You're signed up: ${d.title}`,
    html: `${eventSummaryHtml(d)}<p><a href="${d.eventUrl}">${d.eventUrl}</a></p>`,
    attachments: [{ filename: "event.ics", content: d.ics }],
  });
}

export async function sendCareEventReminderEmail(
  to: string,
  d: CareEventEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Tomorrow: ${d.title}`,
    html: `<p>Reminder: you're signed up for tomorrow.</p>${eventSummaryHtml(d)}<p><a href="${d.eventUrl}">${d.eventUrl}</a></p>`,
  });
}

export async function sendCareEventCanceledEmail(
  to: string,
  d: CareEventEmailDetails,
  reason: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Canceled: ${d.title}`,
    html: `<p>This event was canceled.</p>${eventSummaryHtml(d)}<p><b>Reason:</b> ${escapeHtml(reason)}</p>`,
  });
}
