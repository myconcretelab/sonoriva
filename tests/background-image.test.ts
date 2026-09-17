import { describe, expect, it } from 'vitest';
import { backgroundImageSchema } from '../src/server/services/background-image';

describe('background image validation', () => {
  it('allows removing the image', () => {
    expect(backgroundImageSchema.parse(null)).toBeNull();
  });

  it('rejects external URLs, SVG, malformed JPEGs and oversized images', () => {
    for (const image of [
      'https://example.com/image.jpg',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:image/jpeg;base64,aGVsbG8=',
      'data:image/jpeg;base64,' + 'a'.repeat(110_000),
      'data:image/jpeg;base64,',
    ]) expect(backgroundImageSchema.safeParse(image).success).toBe(false);
  });

  it('accepts a bounded JPEG payload with its start and end markers', () => {
    const image = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]).toString('base64');
    expect(backgroundImageSchema.parse(image)).toBe(image);
  });
});
