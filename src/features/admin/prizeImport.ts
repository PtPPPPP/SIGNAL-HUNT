import { z } from 'zod';

import type { Prize } from '../../domain/draw/types';

const prizeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    shortName: z.string().min(1),
    level: z.number().int().min(1),
    inventoryTotal: z.number().int().min(0),
    inventoryRemaining: z.number().int().min(0),
    weight: z.number().min(0),
    enabled: z.boolean(),
    imageUrl: z.string().url().optional(),
  })
  .refine((prize) => prize.inventoryRemaining <= prize.inventoryTotal, {
    message: 'inventoryRemaining must be less than or equal to inventoryTotal',
    path: ['inventoryRemaining'],
  });

const prizeImportSchema = z.array(prizeSchema);

export function parsePrizeImport(rawJson: string): Prize[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Prize import data is invalid.');
  }

  const result = prizeImportSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error('Prize import data is invalid.');
  }

  return result.data;
}

export function stringifyPrizeExport(prizes: readonly Prize[]): string {
  return JSON.stringify(prizes, null, 2);
}
