import { z } from 'zod';

// Only small, raster JPEG data URLs produced by the image picker are accepted.
export const backgroundImageSchema = z.string().max(110_000)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/)
  .refine((value) => {
    const bytes = Buffer.from(value.slice('data:image/jpeg;base64,'.length), 'base64');
    return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8
      && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }, 'Image JPEG invalide.').nullable();
