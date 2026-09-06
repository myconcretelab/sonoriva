import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

let transporter: Transporter | null | undefined;

function mailTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  if (config.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      ...(config.SMTP_USER && config.SMTP_PASSWORD
        ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
        : {}),
    });
    return transporter;
  }
  if (config.isProduction) {
    transporter = nodemailer.createTransport({
      sendmail: true,
      newline: 'unix',
      path: config.SENDMAIL_PATH,
    });
    return transporter;
  }
  transporter = null;
  return transporter;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function passwordResetUrl(token: string): string {
  const url = new URL('/reset-password', config.PUBLIC_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

export function passwordResetMessage(displayName: string, resetUrl: string) {
  const safeName = escapeHtml(displayName);
  const safeUrl = escapeHtml(resetUrl);
  const logoUrl = escapeHtml(new URL('/icon.png', config.PUBLIC_URL).toString());
  return {
    subject: 'Réinitialisation de votre mot de passe SonoRiva',
    text: `Bonjour ${displayName},\n\nUne demande de réinitialisation du mot de passe de votre compte SonoRiva a été reçue.\n\nDéfinir un nouveau mot de passe : ${resetUrl}\n\nCe lien expire dans 30 minutes et ne peut être utilisé qu’une fois. Si vous n’êtes pas à l’origine de cette demande, aucune action n’est nécessaire.\n\nSonoRiva`,
    html: `<div style="margin:0;padding:32px;background:#09090b;color:#f4f4f5;font-family:Inter,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px;border:1px solid #27272a;border-radius:16px;background:#111113"><img src="${logoUrl}" alt="SonoRiva" width="56" height="56" style="display:block;width:56px;height:56px;margin:0 0 24px"><h1 style="margin:0 0 16px;font-size:26px">Réinitialisation du mot de passe</h1><p style="margin:0 0 16px;color:#d4d4d8;line-height:1.6">Bonjour ${safeName},</p><p style="margin:0 0 24px;color:#d4d4d8;line-height:1.6">Une demande de réinitialisation du mot de passe de votre compte SonoRiva a été reçue.</p><a href="${safeUrl}" style="display:inline-block;padding:13px 18px;border-radius:9px;background:#DBEDF7;color:#18181b;text-decoration:none;font-weight:700">Définir un nouveau mot de passe</a><p style="margin:24px 0 0;color:#a1a1aa;font-size:14px;line-height:1.6">Ce lien expire dans 30 minutes et ne peut être utilisé qu’une fois. Si vous n’êtes pas à l’origine de cette demande, aucune action n’est nécessaire.</p></div></div>`,
  };
}

export async function sendPasswordResetEmail(input: { email: string; displayName: string; token: string }): Promise<void> {
  const currentTransporter = mailTransporter();
  if (!currentTransporter) throw new Error('Transport e-mail non configuré.');
  const message = passwordResetMessage(input.displayName, passwordResetUrl(input.token));
  await currentTransporter.sendMail({
    from: config.MAIL_FROM,
    to: input.email,
    ...message,
  });
}

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const currentTransporter = mailTransporter();
  if (!currentTransporter) throw new Error('Transport e-mail non configuré.');
  await currentTransporter.sendMail({ from: config.MAIL_FROM, ...input });
}
