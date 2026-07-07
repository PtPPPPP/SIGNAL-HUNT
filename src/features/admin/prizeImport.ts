import type { Prize } from '../../domain/draw/types';
import { validatePrizes } from '../../domain/draw/prizeValidation';

export function parsePrizeImport(rawJson: string): Prize[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Prize import data is invalid.');
  }

  try {
    return validatePrizes(parsed);
  } catch {
    throw new Error('Prize import data is invalid.');
  }
}

export function stringifyPrizeExport(prizes: readonly Prize[]): string {
  return JSON.stringify(prizes, null, 2);
}
