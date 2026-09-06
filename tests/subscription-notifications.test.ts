import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const admin = readFileSync(new URL('../src/client/admin/AdminApp.tsx', import.meta.url), 'utf8');
const billing = readFileSync(new URL('../src/server/services/billing.ts', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../src/server/routes/auth.ts', import.meta.url), 'utf8');

describe('notifications de souscription', () => {
  it('expose la configuration e-mail, Telegram et chatID au super-admin', () => {
    expect(admin).toContain("label: 'Notifications'");
    expect(admin).toContain('name="emailRecipient"');
    expect(admin).toContain('name="telegramBotToken"');
    expect(admin).toContain('name="telegramChatId"');
  });

  it('couvre les activations gratuites et les abonnements Stripe', () => {
    expect(auth).toContain('notifyPlanSubscription');
    expect(billing.match(/notifyPlanSubscription/g)?.length).toBeGreaterThanOrEqual(3);
    expect(billing).toContain('stripe:${subscription.id}:${mapping.planCode}');
  });
});
