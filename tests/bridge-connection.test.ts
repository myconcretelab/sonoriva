import { describe, expect, it } from 'vitest';
import { bridgeConnectionView } from '../src/client/lib/bridge-connection.js';

describe('Bridge connection indicator', () => {
  it.each([
    [{ available: undefined, detected: true, associated: true, mode: 'bridge' as const }, 'active', 'deactivate'],
    [{ available: undefined, detected: false, associated: true, mode: 'browser' as const }, 'offline', 'open'],
    [{ available: false, detected: undefined, associated: false, mode: 'browser' as const }, 'unavailable', 'none'],
    [{ available: true, detected: undefined, associated: false, mode: 'browser' as const }, 'checking', 'none'],
    [{ available: true, detected: false, associated: false, mode: 'browser' as const }, 'offline', 'pair'],
    [{ available: true, detected: false, associated: true, mode: 'browser' as const }, 'offline', 'open'],
    [{ available: true, detected: true, associated: false, mode: 'browser' as const }, 'detected', 'pair'],
    [{ available: true, detected: true, associated: true, mode: 'browser' as const }, 'ready', 'activate'],
    [{ available: true, detected: true, associated: true, mode: 'bridge' as const }, 'active', 'deactivate'],
  ])('projette %o vers l’état %s et l’action %s', (input, state, action) => {
    expect(bridgeConnectionView(input)).toMatchObject({ state, action });
  });
});
