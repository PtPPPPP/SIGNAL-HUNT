import 'fake-indexeddb/auto';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as drawRepository from '../../db/drawRepository';
import {
  clearActiveDrawSession,
  commitPersistentDraw,
  redeemDrawRecord,
  seedEvent,
  seedPrizes,
  voidActiveDraw,
} from '../../db/drawRepository';
import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { Event, Prize } from '../../domain/draw/types';
import { DisplayPage } from './DisplayPage';

const event: Event = {
  id: 'event-1',
  name: 'SIGNAL HUNT Demo',
  code: 'SIGNAL-HUNT-DEMO',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

function prize(overrides: Partial<Prize> = {}): Prize {
  return {
    id: 'prize-1',
    name: '一等奖',
    shortName: '一等奖',
    level: 1,
    inventoryTotal: 3,
    inventoryRemaining: 3,
    weight: 1,
    enabled: true,
    ...overrides,
  };
}

describe('DisplayPage draw integration', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-display-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('commits a real draw on touch and decrements inventory once', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);

    render(<DisplayPage db={db} />);

    const touchTarget = await screen.findByRole('button', { name: /点亮好运/i });

    await act(async () => {
      fireEvent.click(touchTarget);
    });

    await waitFor(async () => {
      const first = await db.prizes.get('first');
      expect(first?.inventoryRemaining).toBe(1);
    });
    expect(await db.drawRecords.count()).toBe(1);
  });

  it('does not create a second draw when the same touch is repeated rapidly', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 5 })]);

    render(<DisplayPage db={db} />);

    const touchTarget = await screen.findByRole('button', { name: /点亮好运/i });

    await act(async () => {
      fireEvent.click(touchTarget);
      fireEvent.click(touchTarget);
      fireEvent.click(touchTarget);
    });

    await waitFor(async () => {
      const first = await db.prizes.get('first');
      expect(first?.inventoryRemaining).toBe(4);
    });
    expect(await db.drawRecords.count()).toBe(1);
  });

  it('recovers a committed-but-unrevealed draw on boot without drawing again', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);

    await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    render(<DisplayPage db={db} />);

    expect(await screen.findByRole('heading', { name: /恭喜，幸运降临/i })).toBeInTheDocument();
    expect(screen.getByText('一等奖')).toBeInTheDocument();
    expect(screen.getByText('请向现场工作人员领取你的奖品')).toBeInTheDocument();
    expect(await db.drawRecords.count()).toBe(1);
  });

  it('enters ERROR when no active prize is available', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'empty', inventoryRemaining: 0 })]);

    render(<DisplayPage db={db} />);

    const touchTarget = await screen.findByRole('button', { name: /点亮好运/i });

    await act(async () => {
      fireEvent.click(touchTarget);
    });

    expect(await screen.findByRole('heading', { name: /需要工作人员协助/i })).toBeInTheDocument();
  });

  it('keeps RESULT on screen instead of auto-resetting', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 5 })]);

    render(<DisplayPage db={db} />);

    const touchTarget = await screen.findByRole('button', { name: /点亮好运/i });
    await act(async () => {
      fireEvent.click(touchTarget);
    });

    // 结果出现（时间轴约 5s）
    await waitFor(() => expect(screen.getByText('一等奖')).toBeInTheDocument(), { timeout: 8000 });

    // 再等过旧的自动复位点（6500ms）之后，确认结果仍停留
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    });

    expect(screen.getByText('一等奖')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /下一位参与者/ })).toBeInTheDocument();
  }, 15000);

  it('exits RESULT via the 下一位参与者 button', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 5 })]);

    render(<DisplayPage db={db} />);

    const touchTarget = await screen.findByRole('button', { name: /点亮好运/i });
    await act(async () => {
      fireEvent.click(touchTarget);
    });

    await waitFor(() => expect(screen.getByText('一等奖')).toBeInTheDocument(), { timeout: 8000 });

    // 点「下一位参与者」→ 出现二次确认
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /下一位参与者/ }));
    });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // 确认并返回 → 回到 ATTRACT
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /确认并返回/ }));
    });

    await waitFor(
      () => expect(screen.getByRole('button', { name: /点亮好运/ })).toBeInTheDocument(),
      { timeout: 3000 },
    );
  }, 15000);

  it('does not exit RESULT when the result area is tapped repeatedly', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 5 })]);

    render(<DisplayPage db={db} />);

    const touchTarget = await screen.findByRole('button', { name: /点亮好运/i });
    await act(async () => {
      fireEvent.click(touchTarget);
    });

    await waitFor(() => expect(screen.getByText('一等奖')).toBeInTheDocument(), { timeout: 8000 });

    // 疯狂点击结果区域（非退出按钮）10 次
    const prizeText = screen.getByText('一等奖');
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(prizeText);
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    // 仍停留 RESULT，未出现确认框、未回到待机
    expect(screen.getByText('一等奖')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  }, 15000);

  it('returns to ATTRACT when an operator clears the session in another window', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 5 })]);
    await commitPersistentDraw(db, {
      eventId: event.id,
      random: () => 0,
      createId: (prefix) => `${prefix}-sync`,
    });

    render(<DisplayPage db={db} />);
    expect(await screen.findByText('一等奖')).toBeInTheDocument();

    await act(async () => {
      await clearActiveDrawSession(db, event.id);
    });

    expect(
      await screen.findByRole('button', { name: /点亮好运/i }, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('keeps the committed result visible when clearing the session fails', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 5 })]);
    await commitPersistentDraw(db, {
      eventId: event.id,
      random: () => 0,
      createId: (prefix) => `${prefix}-clear-failure`,
    });

    render(<DisplayPage db={db} />);
    expect(await screen.findByText('一等奖')).toBeInTheDocument();

    const pendingClear = createDeferred<void>();
    vi.spyOn(drawRepository, 'clearActiveDrawSession').mockReturnValueOnce(pendingClear.promise);
    fireEvent.click(screen.getByRole('button', { name: /下一位参与者/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /确认并返回/ }));
      pendingClear.reject(new Error('simulated storage failure'));
      await pendingClear.promise.catch(() => undefined);
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/结果尚未安全结束/);
    expect(screen.getByText('一等奖')).toBeInTheDocument();
    await expect(db.drawSessions.count()).resolves.toBe(1);
  });

  it('does not let the delayed reveal overwrite an early operator redemption', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 5 })]);
    render(<DisplayPage db={db} />);

    fireEvent.click(await screen.findByRole('button', { name: /点亮好运/i }));
    const record = await waitFor(async () => {
      const value = await db.drawRecords.toCollection().first();
      expect(value).toBeDefined();
      return value!;
    });

    await act(async () => {
      await redeemDrawRecord(db, record.id, () => '2026-07-06T01:02:00.000Z');
    });

    await waitFor(() => expect(screen.getByText('一等奖')).toBeInTheDocument(), { timeout: 8000 });
    await expect(db.drawRecords.get(record.id)).resolves.toMatchObject({
      status: 'REDEEMED',
      redeemedAt: '2026-07-06T01:02:00.000Z',
    });
  }, 12000);

  it('returns to ATTRACT when an operator voids before the delayed reveal', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 5 })]);
    render(<DisplayPage db={db} />);

    fireEvent.click(await screen.findByRole('button', { name: /点亮好运/i }));
    const record = await waitFor(async () => {
      const value = await db.drawRecords.toCollection().first();
      expect(value).toBeDefined();
      return value!;
    });

    await act(async () => {
      await voidActiveDraw(db, {
        eventId: event.id,
        recordId: record.id,
        reason: '动画中作废',
      });
    });

    expect(
      await screen.findByRole('button', { name: /点亮好运/i }, { timeout: 8000 }),
    ).toBeInTheDocument();
    await expect(db.drawRecords.get(record.id)).resolves.toMatchObject({ status: 'VOIDED' });
    expect(screen.queryByText('一等奖')).not.toBeInTheDocument();
  }, 12000);
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}
