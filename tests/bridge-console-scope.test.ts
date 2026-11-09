import { expect, it } from 'vitest';
import { bridgeConsoleRouteAllowed } from '../src/server/services/bridge-auth';
it('limite le jeton natif aux routes de régie, sans extension par préfixe ni traversée', () => {
  expect(bridgeConsoleRouteAllowed('GET', '/api/auth/me')).toBe(true);
  expect(bridgeConsoleRouteAllowed('PATCH', '/api/tracks/sound')).toBe(true);
  for (const path of ['/api/tracks-admin', '/api/projects/../admin/users', '/api/projects/%2e%2e/admin', '/api/admin/overview', '/api/billing/portal', '/api/account/members', '/api/auth/login']) expect(bridgeConsoleRouteAllowed('POST', path)).toBe(false);
});
