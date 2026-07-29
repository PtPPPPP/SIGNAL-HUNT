import type {
  Prize,
  PrizeProbabilityMode,
  PrizeReleasePoint,
} from '../../../domain/draw/types';

export type PrizeFormState = {
  id: string;
  name: string;
  shortName: string;
  level: string;
  inventoryTotal: string;
  inventoryRemaining: string;
  weight: string;
  enabled: boolean;
  probabilityMode: PrizeProbabilityMode;
  minMultiplier: string;
  maxMultiplier: string;
  sensitivity: string;
  minIntervalMinutes: string;
  catchUpEnabled: boolean;
  catchUpStartBeforeEndMinutes: string;
  catchUpMaxMultiplier: string;
  releaseScheduleText: string;
};

export const defaultPrizeForm: PrizeFormState = {
  id: '',
  name: '',
  shortName: '',
  level: '1',
  inventoryTotal: '1',
  inventoryRemaining: '1',
  weight: '1',
  enabled: true,
  probabilityMode: 'FIXED',
  minMultiplier: '0.2',
  maxMultiplier: '3',
  sensitivity: '0.5',
  minIntervalMinutes: '0',
  catchUpEnabled: false,
  catchUpStartBeforeEndMinutes: '60',
  catchUpMaxMultiplier: '4',
  releaseScheduleText: '',
};

export function createPrizeFromForm(form: PrizeFormState): Prize {
  const id = form.id.trim() || `prize-${crypto.randomUUID()}`;
  const name = form.name.trim();
  const releaseSchedule = parseReleaseSchedule(form.releaseScheduleText);
  const pacing =
    form.probabilityMode === 'FIXED'
      ? undefined
      : {
          minMultiplier: toNumber(form.minMultiplier),
          maxMultiplier: toNumber(form.maxMultiplier),
          sensitivity: toNumber(form.sensitivity),
          minIntervalMinutes: toNumber(form.minIntervalMinutes),
          catchUpEnabled: form.catchUpEnabled,
          catchUpStartBeforeEndMinutes: toNumber(
            form.catchUpStartBeforeEndMinutes,
          ),
          catchUpMaxMultiplier: toNumber(form.catchUpMaxMultiplier),
          releaseSchedule,
        };

  return {
    id,
    name,
    shortName: form.shortName.trim() || name,
    level: toNumber(form.level),
    inventoryTotal: toNumber(form.inventoryTotal),
    inventoryRemaining: toNumber(form.inventoryRemaining),
    weight: toNumber(form.weight),
    enabled: form.enabled,
    probabilityMode: form.probabilityMode,
    pacing,
  };
}

export function toPrizeFormState(prize: Prize): PrizeFormState {
  return {
    ...defaultPrizeForm,
    id: prize.id,
    name: prize.name,
    shortName: prize.shortName,
    level: String(prize.level),
    inventoryTotal: String(prize.inventoryTotal),
    inventoryRemaining: String(prize.inventoryRemaining),
    weight: String(prize.weight),
    enabled: prize.enabled,
    probabilityMode: prize.probabilityMode ?? 'FIXED',
    minMultiplier: String(
      prize.pacing?.minMultiplier ?? defaultPrizeForm.minMultiplier,
    ),
    maxMultiplier: String(
      prize.pacing?.maxMultiplier ?? defaultPrizeForm.maxMultiplier,
    ),
    sensitivity: String(
      prize.pacing?.sensitivity ?? defaultPrizeForm.sensitivity,
    ),
    minIntervalMinutes: String(
      prize.pacing?.minIntervalMinutes ?? defaultPrizeForm.minIntervalMinutes,
    ),
    catchUpEnabled: Boolean(prize.pacing?.catchUpEnabled),
    catchUpStartBeforeEndMinutes: String(
      prize.pacing?.catchUpStartBeforeEndMinutes ??
        defaultPrizeForm.catchUpStartBeforeEndMinutes,
    ),
    catchUpMaxMultiplier: String(
      prize.pacing?.catchUpMaxMultiplier ??
        defaultPrizeForm.catchUpMaxMultiplier,
    ),
    releaseScheduleText: (prize.pacing?.releaseSchedule ?? [])
      .map((point) => `${point.time},${point.maxCumulativeWins}`)
      .join('\n'),
  };
}

function parseReleaseSchedule(
  text: string,
): PrizeReleasePoint[] | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return undefined;

  return lines.map((line) => {
    const [time, count] = line.split(',').map((part) => part.trim());
    return {
      time: time ?? '',
      maxCumulativeWins: Number(count),
    };
  });
}

function toNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}
