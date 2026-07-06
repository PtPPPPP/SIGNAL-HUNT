import type { CommitDrawInput, CommitDrawResult, Prize } from './types';

const UINT32_RANGE = 0x100000000;

export function getActivePrizePool(prizes: readonly Prize[]): Prize[] {
  return prizes.filter((prize) => prize.enabled && prize.inventoryRemaining > 0 && prize.weight > 0);
}

export function createSecureRandom(): () => number {
  return createSeededSecureRandom(() => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] ?? 0;
  });
}

export function createSeededSecureRandom(nextUint32: () => number): () => number {
  return () => {
    const value = nextUint32();

    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new Error('Secure random integer must be a uint32 value.');
    }

    return value / UINT32_RANGE;
  };
}

export function selectWeightedPrize(prizes: readonly Prize[], random: () => number = createSecureRandom()): Prize {
  const activePrizes = getActivePrizePool(prizes);

  if (activePrizes.length === 0) {
    throw new Error('No active prize is available.');
  }

  const totalWeight = activePrizes.reduce((sum, prize) => sum + prize.weight, 0);
  const randomValue = random();

  if (randomValue < 0 || randomValue >= 1) {
    throw new Error('Random value must be greater than or equal to 0 and less than 1.');
  }

  let cursor = randomValue * totalWeight;

  for (const prize of activePrizes) {
    cursor -= prize.weight;
    if (cursor < 0) {
      return prize;
    }
  }

  return activePrizes[activePrizes.length - 1];
}

export function commitDraw(input: CommitDrawInput): CommitDrawResult {
  if (input.event.status !== 'ACTIVE') {
    throw new Error('Event is not active.');
  }

  const now = input.now ?? (() => new Date().toISOString());
  const createId = input.createId ?? createBrowserId;
  const committedAt = now();
  const prize = selectWeightedPrize(input.prizes, input.random);
  const sessionId = createId('session');
  const recordId = createId('record');

  const prizes = input.prizes.map((currentPrize) => {
    if (currentPrize.id !== prize.id) {
      return currentPrize;
    }

    return {
      ...currentPrize,
      inventoryRemaining: currentPrize.inventoryRemaining - 1,
    };
  });

  return {
    session: {
      id: sessionId,
      eventId: input.event.id,
      status: 'COMMITTED',
      committedRecordId: recordId,
      createdAt: committedAt,
      committedAt,
    },
    record: {
      id: recordId,
      eventId: input.event.id,
      sessionId,
      participantId: input.participantId,
      prizeId: prize.id,
      prizeNameSnapshot: prize.name,
      createdAt: committedAt,
      committedAt,
      redeemed: false,
      status: 'COMMITTED',
    },
    prizes,
  };
}

function createBrowserId(prefix: 'session' | 'record'): string {
  if (!crypto.randomUUID) {
    throw new Error('crypto.randomUUID is required to create draw identifiers.');
  }

  return `${prefix}-${crypto.randomUUID()}`;
}
