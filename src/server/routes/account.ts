import type { FastifyInstance } from 'fastify';
import { accountUsage } from '../services/accounts.js';
import { requireUser } from '../services/auth.js';
import { billingSummaryForUser } from '../services/billing.js';
import { accountCanUseBridge, planFeatures } from '../services/commercial-plans.js';
import { demoLimitsForPlan } from '../services/demo.js';

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/account', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const [result, billing] = await Promise.all([accountUsage(user.id), billingSummaryForUser(user.id)]);
    if (!result) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    const { account, plan, storageQuotaBytes, usedBytes } = result;
    return {
      account: {
        id: account.id,
        name: account.name,
        planCode: account.planCode,
        planName: plan.name,
        accessStatus: account.accessStatus,
        storageQuotaBytes,
        storageUsedBytes: usedBytes,
        trialEndsAt: account.trialEndsAt,
        gracePeriodEndsAt: account.gracePeriodEndsAt,
        bridgeAvailable: accountCanUseBridge({
          ...plan,
          accessStatus: account.accessStatus,
          isDemo: account.isDemo,
        }),
        features: planFeatures(plan),
        maxUsers: plan.maxUsers,
        demoLimits: account.isDemo ? demoLimitsForPlan(plan) : null,
        billing,
      },
    };
  });
}
