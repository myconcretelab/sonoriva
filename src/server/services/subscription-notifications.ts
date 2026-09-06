import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accountMemberships, accounts, notificationSettings, plans, planSubscriptionNotifications, users } from '../db/schema.js';
import { sendEmail } from './mail.js';

export interface SubscriptionNotificationSettings {
  emailEnabled: boolean;
  emailRecipient: string;
  telegramEnabled: boolean;
  telegramBotTokenConfigured: boolean;
  telegramChatId: string;
}

export async function getSubscriptionNotificationSettings(): Promise<SubscriptionNotificationSettings> {
  const [settings] = await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1)).limit(1);
  return {
    emailEnabled: settings?.emailEnabled ?? false,
    emailRecipient: settings?.emailRecipient ?? '',
    telegramEnabled: settings?.telegramEnabled ?? false,
    telegramBotTokenConfigured: Boolean(settings?.telegramBotToken),
    telegramChatId: settings?.telegramChatId ?? '',
  };
}

export async function saveSubscriptionNotificationSettings(input: {
  emailEnabled: boolean;
  emailRecipient: string;
  telegramEnabled: boolean;
  telegramBotToken?: string;
  clearTelegramBotToken?: boolean;
  telegramChatId: string;
}): Promise<SubscriptionNotificationSettings> {
  const [existing] = await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1)).limit(1);
  const telegramBotToken = input.clearTelegramBotToken ? null : input.telegramBotToken || existing?.telegramBotToken || null;
  await db.insert(notificationSettings).values({
    id: 1,
    emailEnabled: input.emailEnabled,
    emailRecipient: input.emailRecipient || null,
    telegramEnabled: input.telegramEnabled,
    telegramBotToken,
    telegramChatId: input.telegramChatId || null,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: notificationSettings.id,
    set: { emailEnabled: input.emailEnabled, emailRecipient: input.emailRecipient || null, telegramEnabled: input.telegramEnabled, telegramBotToken, telegramChatId: input.telegramChatId || null, updatedAt: new Date() },
  });
  return getSubscriptionNotificationSettings();
}

export async function notifyPlanSubscription(input: {
  dedupeKey: string;
  accountId: string;
  planCode: string;
  billingInterval?: string | null;
  source: 'free' | 'stripe';
}): Promise<void> {
  const inserted = await db.insert(planSubscriptionNotifications).values({ dedupeKey: input.dedupeKey, accountId: input.accountId, planCode: input.planCode })
    .onConflictDoNothing().returning({ id: planSubscriptionNotifications.id });
  if (!inserted.length) return;
  const [settings] = await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1)).limit(1);
  if (!settings) return;
  const [context] = await db.select({ accountName: accounts.name, planName: plans.name, userName: users.displayName, userEmail: users.email })
    .from(accounts)
    .innerJoin(plans, eq(plans.code, accounts.planCode))
    .innerJoin(accountMemberships, and(eq(accountMemberships.accountId, accounts.id), eq(accountMemberships.role, 'owner')))
    .innerJoin(users, eq(users.id, accountMemberships.userId))
    .where(eq(accounts.id, input.accountId)).limit(1);
  if (!context) return;
  const interval = input.billingInterval === 'year' ? 'annuel' : input.billingInterval === 'month' ? 'mensuel' : 'sans périodicité';
  const text = `Nouveau forfait souscrit\n\nForfait : ${context.planName} (${input.planCode})\nType : ${input.source === 'free' ? 'gratuit' : interval}\nCompte : ${context.accountName}\nUtilisateur : ${context.userName}\nE-mail : ${context.userEmail}`;
  let emailSent = false;
  let telegramSent = false;
  const errors: string[] = [];
  if (settings.emailEnabled && settings.emailRecipient) {
    try {
      await sendEmail({ to: settings.emailRecipient, subject: `Nouveau forfait SonoRiva : ${context.planName}`, text });
      emailSent = true;
    } catch (error) { errors.push(`E-mail: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: settings.telegramChatId, text }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
      telegramSent = true;
    } catch (error) { errors.push(`Telegram: ${error instanceof Error ? error.message : String(error)}`); }
  }
  await db.update(planSubscriptionNotifications).set({ emailSent, telegramSent, error: errors.join(' | ') || null }).where(eq(planSubscriptionNotifications.id, inserted[0].id));
  if (errors.length) console.error('Échec partiel de notification de souscription', { accountId: input.accountId, errors });
}
