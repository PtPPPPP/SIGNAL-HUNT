import 'fake-indexeddb/auto';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as drawRepository from '../../db/drawRepository';
import { commitPersistentDraw, seedEvent, seedPrizes } from '../../db/drawRepository';
import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { Event, Prize } from '../../domain/draw/types';
import { StaffPage } from './StaffPage';

const event: Event = {
  id: 'event-1',
  name: 'SIGNAL HUNT Demo',
  code: 'SIGNAL-HUNT-DEMO',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

const prize: Prize = {
  id: 'first',
  name: '一等奖',
  shortName: '一等奖',
  level: 1,
  inventoryTotal: 2,
  inventoryRemaining: 2,
  weight: 1,
  enabled: true,
};

describe('StaffPage', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-staff-page-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete();
  });

  it('shows active draw details and redeems the prize without ending display', async () => {
    const user = userEvent.setup();
    await seedEvent(db, event);
    await seedPrizes(db, [prize]);
    const committed = await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    render(<StaffPage db={db} />);

    expect(await screen.findByText(committed.record.id)).toBeInTheDocument();
    expect(screen.getByText('一等奖')).toBeInTheDocument();
    expect(screen.getByText('展示中')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认兑奖' }));

    expect(await screen.findByText(/兑奖成功/)).toBeInTheDocument();
    expect(await screen.findByText(/完成兑奖/)).toBeInTheDocument();
    await expect(db.drawSessions.count()).resolves.toBe(1);
  });

  it('shows an explicit duplicate redemption message', async () => {
    const user = userEvent.setup();
    await seedEvent(db, event);
    await seedPrizes(db, [prize]);
    await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    render(<StaffPage db={db} />);

    const button = await screen.findByRole('button', { name: '确认兑奖' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await screen.findByText(/兑奖成功/);
    await waitFor(() => expect(screen.getByRole('button', { name: '确认兑奖' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '确认兑奖' }));

    expect(await screen.findByText(/该奖项已经完成兑奖/)).toBeInTheDocument();
    await waitFor(async () => {
      await expect(db.drawRecords.toArray()).resolves.toHaveLength(1);
    });
  });

  it('serializes rapid duplicate redemption clicks while the first request is pending', async () => {
    const user = userEvent.setup();
    const pendingRedeem = createDeferred<void>();
    const originalRedeemDrawRecord = drawRepository.redeemDrawRecord;
    const redeemSpy = vi.spyOn(drawRepository, 'redeemDrawRecord').mockImplementation(async (...args) => {
      await pendingRedeem.promise;
      return originalRedeemDrawRecord(...args);
    });

    await seedEvent(db, event);
    await seedPrizes(db, [prize]);
    await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    render(<StaffPage db={db} />);

    const button = await screen.findByRole('button', { name: '确认兑奖' });
    await waitFor(() => expect(button).toBeEnabled());
    const firstClick = user.click(button);
    const secondClick = user.click(button);

    expect(await screen.findByRole('button', { name: '正在确认...' })).toBeDisabled();

    pendingRedeem.resolve();

    await firstClick;
    await secondClick;
    await waitFor(() => expect(redeemSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/兑奖成功/)).toBeInTheDocument();
    await waitFor(async () => {
      const records = await db.drawRecords.toArray();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ redeemed: true, status: 'REDEEMED' });
    });
  });

  it('reports already redeemed when the recovered record was redeemed before staff clicks', async () => {
    const user = userEvent.setup();
    await seedEvent(db, event);
    await seedPrizes(db, [prize]);
    const committed = await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });
    await drawRepository.redeemDrawRecord(db, committed.record.id, () => '2026-07-06T01:05:00.000Z');

    render(<StaffPage db={db} />);

    await user.click(await screen.findByRole('button', { name: '确认兑奖' }));

    expect(await screen.findByText(/该奖项已经完成兑奖/)).toBeInTheDocument();
    await expect(db.drawRecords.get(committed.record.id)).resolves.toMatchObject({
      redeemed: true,
      redeemedAt: '2026-07-06T01:05:00.000Z',
    });
  });

  it('recovers from a failed redemption request and allows retry', async () => {
    const user = userEvent.setup();
    const originalRedeemDrawRecord = drawRepository.redeemDrawRecord;
    const redeemSpy = vi
      .spyOn(drawRepository, 'redeemDrawRecord')
      .mockRejectedValueOnce(new Error('network interrupted'))
      .mockImplementationOnce(originalRedeemDrawRecord);

    await seedEvent(db, event);
    await seedPrizes(db, [prize]);
    await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    render(<StaffPage db={db} />);

    await user.click(await screen.findByRole('button', { name: '确认兑奖' }));

    expect(await screen.findByText('network interrupted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认兑奖' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '确认兑奖' }));

    expect(redeemSpy).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/兑奖成功/)).toBeInTheDocument();
  });
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
