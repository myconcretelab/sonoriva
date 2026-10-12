import { describe, expect, it } from 'vitest';
import { linkedVolumeForTotal } from '../src/client/lib/linked-volume';

describe('volumes liés', () => {
  it('compense la baisse d’un lecteur sur l’autre', () => {
    expect(linkedVolumeForTotal(1, .3)).toBeCloseTo(.7);
  });

  it('conserve le total initial sans dépasser les limites audio', () => {
    expect(linkedVolumeForTotal(1.6, .7)).toBeCloseTo(.9);
    expect(linkedVolumeForTotal(2, .4)).toBe(1);
    expect(linkedVolumeForTotal(.5, .8)).toBe(0);
  });
});
