import Stripe from 'stripe';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import {
  accountMemberships,
  accounts,
  auditLogs,
  billingEvents,
  billingPriceMappings,
  plans,
  subscriptions,
  users,
  type Plan,
} from '../db/schema.js';
import { CURRENT_VERSION } from '../releases.js';
import { planIsFree } from './commercial-plans.js';
import { notifyPlanSubscription } from './subscription-notifications.js';

export const stripeApiVersion = '2026-07-29.dahlia' as const;
export type BillingInterval = 'month' | 'year';

let stripeClient: Stripe | undefined;

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'billing_error',
  ) {
    super(message);
  }
}

export function stripeIsLivemode(): boolean {
  return config.STRIPE_MODE === 'live';
}

export function billingCheckoutAvailable(): boolean {
  return Boolean(config.STRIPE_CHECKOUT_ENABLED && config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET);
}

export function getStripe(): Stripe {
  if (!config.STRIPE_SECRET_KEY) {
    throw new BillingError('Stripe n’est pas encore configuré.', 503, 'stripe_not_configured');
  }
  stripeClient ??= new Stripe(config.STRIPE_SECRET_KEY, {
    apiVersion: stripeApiVersion,
    appInfo: { name: 'SonoRiva', version: CURRENT_VERSION, url: 'https://sonoriva.fr' },
  });
  return stripeClient;
}

export function stripeAccessStatus(status: Stripe.Subscription.Status, administrativelySuspended: boolean): 'trialing' | 'active' | 'grace_period' | 'read_only' | 'suspended' {
  if (administrativelySuspended) return 'suspended';
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';
  if (status === 'past_due') return 'grace_period';
  return 'read_only';
}

export function checkoutTrialSettings(input: {
  storedTrialEndsAt: Date | null;
  trialStartedAt: Date | null;
  planTrialDays: number;
  now?: Date;
}): { trial_end?: number; trial_period_days?: number } {
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const storedTrialEnd = input.storedTrialEndsAt ? Math.floor(input.storedTrialEndsAt.getTime() / 1000) : null;
  if (storedTrialEnd && storedTrialEnd >= nowSeconds + 48 * 60 * 60) return { trial_end: storedTrialEnd };
  if (input.trialStartedAt === null && input.planTrialDays > 0) {
    return { trial_period_days: input.planTrialDays };
  }
  return {};
}

function idOf(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function dateFromUnix(value: number | null | undefined): Date | null {
  return value === null || value === undefined ? null : new Date(value * 1000);
}

function firstSubscriptionItem(subscription: Stripe.Subscription): Stripe.SubscriptionItem {
  const item = subscription.items.data[0];
  if (!item) throw new BillingError('L’abonnement Stripe ne contient aucun tarif.', 422, 'stripe_subscription_without_price');
  return item;
}

function intervalOf(item: Stripe.SubscriptionItem): BillingInterval {
  const interval = item.price.recurring?.interval;
  if (interval !== 'month' && interval !== 'year') {
    throw new BillingError('La périodicité Stripe de cet abonnement n’est pas prise en charge.', 422, 'stripe_interval_unsupported');
  }
  return interval as BillingInterval;
}

async function billingAccountForUser(userId: string) {
  const [context] = await db.select({
    user: users,
    account: accounts,
    plan: plans,
    subscription: subscriptions,
    membershipRole: accountMemberships.role,
  }).from(accountMemberships)
    .innerJoin(users, eq(accountMemberships.userId, users.id))
    .innerJoin(accounts, eq(accountMemberships.accountId, accounts.id))
    .innerJoin(plans, eq(accounts.planCode, plans.code))
    .leftJoin(subscriptions, eq(subscriptions.accountId, accounts.id))
    .where(eq(accountMemberships.userId, userId))
    .orderBy(accountMemberships.createdAt)
    .limit(1);
  return context ?? null;
}

export async function billingSummaryForUser(userId: string) {
  const context = await billingAccountForUser(userId);
  if (!context) return null;
  return {
    membershipRole: context.membershipRole,
    provider: context.subscription?.provider ?? 'manual',
    status: context.subscription?.status ?? 'none',
    billingInterval: context.subscription?.billingInterval ?? null,
    currentPeriodEndsAt: context.subscription?.currentPeriodEndsAt ?? null,
    cancelAtPeriodEnd: context.subscription?.cancelAtPeriodEnd ?? false,
    checkoutAvailable: billingCheckoutAvailable(),
    customerPortalAvailable: billingCheckoutAvailable() && Boolean(context.subscription?.providerCustomerId),
  };
}

async function requireOwnerBillingContext(userId: string) {
  const context = await billingAccountForUser(userId);
  if (!context) throw new BillingError('Espace de travail introuvable.', 404, 'account_not_found');
  if (context.user.isDemo || context.account.isDemo) {
    throw new BillingError('La démonstration temporaire ne peut pas souscrire un abonnement.', 403, 'demo_account');
  }
  if (context.membershipRole !== 'owner') {
    throw new BillingError('Seul le propriétaire de cet espace peut gérer l’abonnement.', 403, 'account_owner_required');
  }
  return context;
}

async function activePriceMapping(planCode: string, billingInterval: BillingInterval) {
  const [mapping] = await db.select().from(billingPriceMappings).where(and(
    eq(billingPriceMappings.provider, 'stripe'),
    eq(billingPriceMappings.environment, config.STRIPE_MODE),
    eq(billingPriceMappings.planCode, planCode),
    eq(billingPriceMappings.billingInterval, billingInterval),
    eq(billingPriceMappings.activeForSales, true),
  )).orderBy(desc(billingPriceMappings.createdAt)).limit(1);
  return mapping ?? null;
}

export async function requirePublicPlan(planCode: string) {
  const [plan] = await db.select().from(plans).where(and(
    eq(plans.code, planCode),
    eq(plans.active, true),
    eq(plans.visibleOnWebsite, true),
  )).limit(1);
  if (!plan) throw new BillingError('Ce forfait n’est pas disponible.', 404, 'plan_not_available');
  return plan;
}

export async function requireCheckoutPlan(planCode: string, billingInterval: BillingInterval) {
  const plan = await requirePublicPlan(planCode);
  if (planIsFree(plan)) {
    throw new BillingError('Ce forfait gratuit ne nécessite pas de paiement Stripe.', 400, 'free_plan_without_checkout');
  }
  if (!billingCheckoutAvailable()) {
    throw new BillingError('Le paiement en ligne n’est pas encore activé.', 503, 'checkout_disabled');
  }

  const priceMapping = await activePriceMapping(plan.code, billingInterval);
  if (!priceMapping) {
    throw new BillingError('Ce tarif n’est pas encore synchronisé avec Stripe.', 503, 'stripe_price_missing');
  }
  return { plan, priceMapping };
}

export async function activateFreePlan(input: { userId: string; planCode: string }): Promise<void> {
  const context = await requireOwnerBillingContext(input.userId);
  const selectedPlan = await requirePublicPlan(input.planCode);
  if (!planIsFree(selectedPlan)) {
    throw new BillingError('Ce forfait nécessite un abonnement Stripe.', 400, 'paid_plan_requires_checkout');
  }
  if (context.subscription?.providerSubscriptionId) {
    throw new BillingError('Cet espace possède déjà un abonnement Stripe. Utilisez le portail de facturation.', 409, 'subscription_exists');
  }

  await db.transaction(async (transaction) => {
    await transaction.update(accounts).set({
      planCode: selectedPlan.code,
      accessStatus: context.account.suspendedAt ? 'suspended' : 'active',
      trialStartedAt: null,
      trialEndsAt: null,
      gracePeriodEndsAt: null,
      updatedAt: new Date(),
    }).where(eq(accounts.id, context.account.id));
    await transaction.insert(auditLogs).values({
      actorUserId: context.user.id,
      action: 'billing.free_plan_activated',
      entityType: 'account',
      entityId: context.account.id,
      details: {
        previousPlanCode: context.account.planCode,
        planCode: selectedPlan.code,
        previousAccessStatus: context.account.accessStatus,
        accessStatus: context.account.suspendedAt ? 'suspended' : 'active',
      },
    });
  });
  if (context.account.planCode !== selectedPlan.code || context.account.accessStatus !== 'active') {
    await notifyPlanSubscription({ dedupeKey: `free:${context.account.id}:${selectedPlan.code}:${Date.now()}`, accountId: context.account.id, planCode: selectedPlan.code, source: 'free' });
  }
}

async function ensureStripeCustomer(context: Awaited<ReturnType<typeof requireOwnerBillingContext>>): Promise<string> {
  if (context.subscription?.providerCustomerId) return context.subscription.providerCustomerId;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: context.user.email,
    name: context.user.displayName,
    metadata: {
      sonoriva_account_id: context.account.id,
      sonoriva_environment: config.STRIPE_MODE,
    },
  }, { idempotencyKey: `sonoriva:customer:${config.STRIPE_MODE}:${context.account.id}` });

  await db.insert(subscriptions).values({
    accountId: context.account.id,
    provider: 'stripe',
    providerCustomerId: customer.id,
  }).onConflictDoUpdate({
    target: subscriptions.accountId,
    set: { provider: 'stripe', providerCustomerId: customer.id, updatedAt: new Date() },
  });
  return customer.id;
}

export async function createCheckoutSession(input: {
  userId: string;
  planCode: string;
  billingInterval: BillingInterval;
  requestId: string;
}): Promise<string> {
  const context = await requireOwnerBillingContext(input.userId);
  const { plan: selectedPlan, priceMapping } = await requireCheckoutPlan(input.planCode, input.billingInterval);

  if (context.subscription?.providerSubscriptionId && ['trialing', 'active', 'past_due', 'unpaid'].includes(context.subscription.status)) {
    throw new BillingError('Cet espace possède déjà un abonnement Stripe. Utilisez le portail de facturation.', 409, 'subscription_exists');
  }

  const customerId = await ensureStripeCustomer(context);
  const trialSettings = checkoutTrialSettings({
    storedTrialEndsAt: context.account.trialEndsAt,
    trialStartedAt: context.account.trialStartedAt,
    planTrialDays: selectedPlan.trialDays,
  });
  const baseUrl = config.PUBLIC_URL.replace(/\/$/, '');
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: context.account.id,
    line_items: [{ price: priceMapping.providerPriceId, quantity: 1 }],
    payment_method_collection: 'always',
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    tax_id_collection: { enabled: true },
    automatic_tax: { enabled: config.STRIPE_AUTOMATIC_TAX },
    locale: 'fr',
    success_url: `${baseUrl}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?billing=cancelled`,
    metadata: {
      sonoriva_account_id: context.account.id,
      sonoriva_plan_code: selectedPlan.code,
      sonoriva_environment: config.STRIPE_MODE,
    },
    subscription_data: {
      ...trialSettings,
      metadata: {
        sonoriva_account_id: context.account.id,
        sonoriva_plan_code: selectedPlan.code,
        sonoriva_environment: config.STRIPE_MODE,
      },
    },
  }, { idempotencyKey: `sonoriva:checkout:${config.STRIPE_MODE}:${context.account.id}:${input.requestId}` });
  if (!session.url) throw new BillingError('Stripe n’a pas retourné de page de paiement.', 502, 'stripe_checkout_url_missing');
  return session.url;
}

export async function createCustomerPortalSession(userId: string): Promise<string> {
  const context = await requireOwnerBillingContext(userId);
  const customerId = context.subscription?.providerCustomerId;
  if (!customerId) throw new BillingError('Aucun compte de facturation Stripe n’est associé à cet espace.', 409, 'stripe_customer_missing');
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.PUBLIC_URL.replace(/\/$/, '')}/`,
    ...(config.STRIPE_PORTAL_CONFIGURATION_ID ? { configuration: config.STRIPE_PORTAL_CONFIGURATION_ID } : {}),
  });
  return session.url;
}

async function deactivateMapping(mapping: typeof billingPriceMappings.$inferSelect): Promise<void> {
  await getStripe().prices.update(mapping.providerPriceId, { active: false });
  await db.update(billingPriceMappings).set({ activeForSales: false, updatedAt: new Date() })
    .where(eq(billingPriceMappings.id, mapping.id));
}

async function synchronizeInterval(plan: Plan, productId: string, billingInterval: BillingInterval, unitAmountCents: number | null) {
  const currentMappings = await db.select().from(billingPriceMappings).where(and(
    eq(billingPriceMappings.provider, 'stripe'),
    eq(billingPriceMappings.environment, config.STRIPE_MODE),
    eq(billingPriceMappings.planCode, plan.code),
    eq(billingPriceMappings.billingInterval, billingInterval),
    eq(billingPriceMappings.activeForSales, true),
  )).orderBy(desc(billingPriceMappings.createdAt));
  const matching = currentMappings.find((mapping) => mapping.unitAmountCents === unitAmountCents);
  if (matching && unitAmountCents !== null) return matching;
  if (unitAmountCents === null) {
    for (const mapping of currentMappings) await deactivateMapping(mapping);
    return null;
  }

  const stripe = getStripe();
  const price = await stripe.prices.create({
    product: productId,
    currency: 'eur',
    unit_amount: unitAmountCents,
    recurring: { interval: billingInterval },
    nickname: `${plan.name} — ${billingInterval === 'month' ? 'mensuel' : 'annuel'}`,
    metadata: {
      sonoriva_plan_code: plan.code,
      sonoriva_environment: config.STRIPE_MODE,
      sonoriva_billing_interval: billingInterval,
    },
  }, { idempotencyKey: `sonoriva:price:${config.STRIPE_MODE}:${plan.code}:${billingInterval}:${unitAmountCents}:${plan.updatedAt.getTime()}` });
  const [mapping] = await db.insert(billingPriceMappings).values({
    planCode: plan.code,
    environment: config.STRIPE_MODE,
    billingInterval,
    providerProductId: productId,
    providerPriceId: price.id,
    unitAmountCents,
  }).returning();
  for (const previous of currentMappings) await deactivateMapping(previous);
  return mapping;
}

export async function synchronizeStripePlan(planCode: string) {
  const stripe = getStripe();
  const [plan] = await db.select().from(plans).where(eq(plans.code, planCode)).limit(1);
  if (!plan) throw new BillingError('Forfait introuvable.', 404, 'plan_not_found');
  if (plan.isDemoPlan) throw new BillingError('Le forfait de démonstration ne peut pas être synchronisé avec Stripe.', 400, 'demo_plan_not_billable');
  const [previousMapping] = await db.select().from(billingPriceMappings).where(and(
    eq(billingPriceMappings.provider, 'stripe'),
    eq(billingPriceMappings.environment, config.STRIPE_MODE),
    eq(billingPriceMappings.planCode, plan.code),
  )).orderBy(desc(billingPriceMappings.createdAt)).limit(1);
  let productId = previousMapping?.providerProductId;
  if (!productId) {
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description || undefined,
      active: plan.active,
      metadata: { sonoriva_plan_code: plan.code, sonoriva_environment: config.STRIPE_MODE },
    }, { idempotencyKey: `sonoriva:product:${config.STRIPE_MODE}:${plan.code}` });
    productId = product.id;
  } else {
    await stripe.products.update(productId, {
      name: plan.name,
      description: plan.description || '',
      active: plan.active,
      metadata: { sonoriva_plan_code: plan.code, sonoriva_environment: config.STRIPE_MODE },
    });
  }
  const [monthly, annual] = await Promise.all([
    synchronizeInterval(plan, productId, 'month', plan.monthlyPriceCents),
    synchronizeInterval(plan, productId, 'year', plan.annualPriceCents),
  ]);
  return {
    environment: config.STRIPE_MODE,
    productId,
    monthlyPriceId: monthly?.providerPriceId ?? null,
    annualPriceId: annual?.providerPriceId ?? null,
  };
}

async function findAccountId(subscription: Stripe.Subscription): Promise<string> {
  const metadataId = subscription.metadata.sonoriva_account_id;
  if (z.string().uuid().safeParse(metadataId).success) return metadataId;
  const customerId = idOf(subscription.customer);
  const [stored] = await db.select({ accountId: subscriptions.accountId }).from(subscriptions).where(
    subscription.id
      ? eq(subscriptions.providerSubscriptionId, subscription.id)
      : eq(subscriptions.providerCustomerId, customerId ?? ''),
  ).limit(1);
  if (stored) return stored.accountId;
  if (customerId) {
    const [byCustomer] = await db.select({ accountId: subscriptions.accountId }).from(subscriptions)
      .where(eq(subscriptions.providerCustomerId, customerId)).limit(1);
    if (byCustomer) return byCustomer.accountId;
  }
  throw new BillingError('Impossible de relier cet abonnement Stripe à un compte SonoRiva.', 422, 'stripe_account_mapping_missing');
}

async function synchronizeSubscription(subscription: Stripe.Subscription, event: Stripe.Event): Promise<void> {
  const item = firstSubscriptionItem(subscription);
  const priceId = item.price.id;
  const [mapping] = await db.select().from(billingPriceMappings).where(and(
    eq(billingPriceMappings.provider, 'stripe'),
    eq(billingPriceMappings.environment, config.STRIPE_MODE),
    eq(billingPriceMappings.providerPriceId, priceId),
  )).limit(1);
  if (!mapping) throw new BillingError(`Tarif Stripe inconnu : ${priceId}.`, 422, 'stripe_price_mapping_missing');
  const accountId = await findAccountId(subscription);
  const providerCreatedAt = new Date(event.created * 1000);
  const customerId = idOf(subscription.customer);
  const currentPeriodStartsAt = dateFromUnix(item.current_period_start);
  const currentPeriodEndsAt = dateFromUnix(item.current_period_end);

  let shouldNotify = false;
  await db.transaction(async (transaction) => {
    const [current] = await transaction.select({
      account: accounts,
      subscription: subscriptions,
    }).from(accounts).leftJoin(subscriptions, eq(subscriptions.accountId, accounts.id))
      .where(eq(accounts.id, accountId)).limit(1);
    if (!current) throw new BillingError('Compte SonoRiva introuvable pour cet abonnement.', 404, 'account_not_found');
    if (current.subscription?.lastProviderEventCreatedAt && current.subscription.lastProviderEventCreatedAt > providerCreatedAt) return;
    shouldNotify = current.account.planCode !== mapping.planCode || current.subscription?.providerSubscriptionId !== subscription.id;

    await transaction.insert(subscriptions).values({
      accountId,
      provider: 'stripe',
      providerCustomerId: customerId,
      providerSubscriptionId: subscription.id,
      providerPriceId: priceId,
      status: subscription.status,
      billingInterval: intervalOf(item),
      currentPeriodStartsAt,
      currentPeriodEndsAt,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      lastProviderEventCreatedAt: providerCreatedAt,
      lastProviderEventId: event.id,
    }).onConflictDoUpdate({
      target: subscriptions.accountId,
      set: {
        provider: 'stripe',
        providerCustomerId: customerId,
        providerSubscriptionId: subscription.id,
        providerPriceId: priceId,
        status: subscription.status,
        billingInterval: intervalOf(item),
        currentPeriodStartsAt,
        currentPeriodEndsAt,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        lastProviderEventCreatedAt: providerCreatedAt,
        lastProviderEventId: event.id,
        updatedAt: new Date(),
      },
    });

    const nextAccessStatus = stripeAccessStatus(subscription.status, Boolean(current.account.suspendedAt));
    const gracePeriodEndsAt = nextAccessStatus === 'grace_period'
      ? current.account.gracePeriodEndsAt ?? new Date(Date.now() + config.BILLING_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
      : null;
    await transaction.update(accounts).set({
      planCode: mapping.planCode,
      accessStatus: nextAccessStatus,
      trialStartedAt: subscription.status === 'trialing' ? current.account.trialStartedAt ?? new Date() : current.account.trialStartedAt,
      trialEndsAt: subscription.status === 'trialing' ? dateFromUnix(subscription.trial_end) : null,
      gracePeriodEndsAt,
      updatedAt: new Date(),
    }).where(eq(accounts.id, accountId));
    await transaction.insert(auditLogs).values({
      action: 'billing.subscription_synchronized',
      entityType: 'account',
      entityId: accountId,
      details: {
        eventId: event.id,
        eventType: event.type,
        subscriptionId: subscription.id,
        priceId,
        planCode: mapping.planCode,
        previousBillingStatus: current.subscription?.status ?? 'none',
        billingStatus: subscription.status,
        previousAccessStatus: current.account.accessStatus,
        accessStatus: nextAccessStatus,
      },
    });
  });
  if (shouldNotify) {
    await notifyPlanSubscription({ dedupeKey: `stripe:${subscription.id}:${mapping.planCode}`, accountId, planCode: mapping.planCode, billingInterval: intervalOf(item), source: 'stripe' });
  }
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const value = invoice.parent?.subscription_details?.subscription;
  return idOf(value ?? null);
}

async function synchronizeEventObject(event: Stripe.Event): Promise<void> {
  const stripe = getStripe();
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId = idOf(session.subscription);
    if (subscriptionId) await synchronizeSubscription(await stripe.subscriptions.retrieve(subscriptionId), event);
    return;
  }
  if (event.type.startsWith('customer.subscription.')) {
    const subscription = event.data.object as Stripe.Subscription;
    await synchronizeSubscription(await stripe.subscriptions.retrieve(subscription.id), event);
    return;
  }
  if (['invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required'].includes(event.type)) {
    const subscriptionId = subscriptionIdFromInvoice(event.data.object as Stripe.Invoice);
    if (subscriptionId) await synchronizeSubscription(await stripe.subscriptions.retrieve(subscriptionId), event);
  }
}

export function constructStripeEvent(rawBody: Buffer, signature: string): Stripe.Event {
  if (!config.STRIPE_WEBHOOK_SECRET) {
    throw new BillingError('Le webhook Stripe n’est pas configuré.', 503, 'stripe_webhook_not_configured');
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
}

export async function processStripeEvent(event: Stripe.Event): Promise<{ duplicate: boolean }> {
  if (event.livemode !== stripeIsLivemode()) {
    throw new BillingError('Le mode de cet événement Stripe ne correspond pas à celui de SonoRiva.', 400, 'stripe_mode_mismatch');
  }
  const [existing] = await db.select().from(billingEvents).where(eq(billingEvents.providerEventId, event.id)).limit(1);
  if (existing?.status === 'processed') return { duplicate: true };
  if (existing) {
    await db.update(billingEvents).set({
      status: 'processing',
      attempts: sql`${billingEvents.attempts} + 1`,
      lastError: null,
    }).where(eq(billingEvents.providerEventId, event.id));
  } else {
    await db.insert(billingEvents).values({
      providerEventId: event.id,
      type: event.type,
      livemode: event.livemode,
      status: 'processing',
      providerCreatedAt: new Date(event.created * 1000),
    });
  }
  try {
    await synchronizeEventObject(event);
    await db.update(billingEvents).set({ status: 'processed', processedAt: new Date(), lastError: null })
      .where(eq(billingEvents.providerEventId, event.id));
    return { duplicate: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur Stripe inconnue';
    await db.update(billingEvents).set({ status: 'failed', lastError: message.slice(0, 2000) })
      .where(eq(billingEvents.providerEventId, event.id));
    throw error;
  }
}

export async function reconcileStripeAccount(accountId: string): Promise<void> {
  const [stored] = await db.select().from(subscriptions).where(eq(subscriptions.accountId, accountId)).limit(1);
  if (!stored?.providerSubscriptionId) throw new BillingError('Ce compte ne possède pas d’abonnement Stripe.', 404, 'stripe_subscription_missing');
  const subscription = await getStripe().subscriptions.retrieve(stored.providerSubscriptionId);
  const event = {
    id: `reconcile_${crypto.randomUUID()}`,
    object: 'event',
    api_version: stripeApiVersion,
    created: Math.floor(Date.now() / 1000),
    data: { object: subscription },
    livemode: subscription.livemode,
    pending_webhooks: 0,
    request: null,
    type: 'customer.subscription.updated',
  } as Stripe.Event;
  await synchronizeSubscription(subscription, event);
}

export async function reconcileStripeSubscriptions(): Promise<{ checked: number; failed: number }> {
  if (!config.STRIPE_SECRET_KEY) return { checked: 0, failed: 0 };
  const rows = await db.select({ accountId: subscriptions.accountId }).from(subscriptions).where(and(
    eq(subscriptions.provider, 'stripe'),
    sql`${subscriptions.providerSubscriptionId} is not null`,
  )).limit(1000);
  let failed = 0;
  for (const row of rows) {
    try {
      await reconcileStripeAccount(row.accountId);
    } catch {
      failed += 1;
    }
  }
  return { checked: rows.length, failed };
}
