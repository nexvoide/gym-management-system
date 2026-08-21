import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export type SmtpEnvironment = Record<string, string | undefined>;

export function smtpConfigFrom(env: SmtpEnvironment) {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME"] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing SMTP configuration: ${missing.join(", ")}`);
  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT must be a valid TCP port.");
  return {
    host: env.SMTP_HOST!.trim(), port, secure: port === 465,
    auth: { user: env.SMTP_USER!.trim(), pass: env.SMTP_PASSWORD! },
    from: { address: env.SMTP_FROM_EMAIL!.trim(), name: env.SMTP_FROM_NAME!.trim() },
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function staffInvitationMessage(input: { to: string; name: string; gymName: string; role: string; setupUrl: string }) {
  const name = escapeHtml(input.name), gymName = escapeHtml(input.gymName), role = escapeHtml(input.role);
  const setupUrl = escapeHtml(input.setupUrl);
  return {
    to: input.to,
    subject: `You're invited to manage ${input.gymName}`,
    text: `Hi ${input.name},\n\nYou've been invited to join ${input.gymName} as a ${input.role}. Use the secure account setup link in this invitation to choose your password.\n\nThis invitation expires in 24 hours. If you weren't expecting it, you can safely ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px;margin:auto"><h1 style="font-size:24px">You're invited to join ${gymName}</h1><p>Hi ${name},</p><p>You've been invited to join <strong>${gymName}</strong> as a <strong>${role}</strong>.</p><p style="margin:28px 0"><a href="${setupUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Set Up Your Account</a></p><p>This invitation expires in 24 hours.</p><p style="color:#64748b">If you weren't expecting this invitation, you can safely ignore this email.</p></div>`,
  };
}

export type MailTransport = Pick<Transporter, "sendMail">;

export async function sendStaffInvitation(
  input: { to: string; name: string; gymName: string; role: string; setupUrl: string },
  transport?: MailTransport,
) {
  const config = smtpConfigFrom(process.env);
  const mailer = transport ?? nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.auth });
  await mailer.sendMail({ ...staffInvitationMessage(input), from: config.from });
}
