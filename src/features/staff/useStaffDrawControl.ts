import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';

import {
  readDisplayDatabaseSnapshot,
  type DisplayDatabaseSnapshot,
} from '../../db/drawRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { getErrorMessage } from '../../lib/errorMessage';
import { StaffDrawApplicationService, type StaffDrawOperationResult } from './StaffDrawApplicationService';
import {
  createStaffDrawViewModel,
  getStaffDrawOperationMessage,
  type StaffDrawAction,
} from './staffDrawViewModel';

type StaffActionRunner = (nextAction: Exclude<StaffDrawAction, undefined>, work: () => Promise<StaffDrawOperationResult>) => Promise<void>;

/**
 * Keeps staff-side database reads, mutations and display invalidation together.
 * The page remains responsible for rendering the current result and collecting
 * the operator's input.
 */
export function useStaffDrawControl(db: SignalHuntDatabase = signalHuntDatabase) {
  const [snapshot, setSnapshot] = useState<DisplayDatabaseSnapshot>();
  const [loadError, setLoadError] = useState<string>();
  const [action, setAction] = useState<StaffDrawAction>();
  const [message, setMessage] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [voidReason, setVoidReason] = useState('');
  const service = useMemo(
    () => new StaffDrawApplicationService(db, () => window.signalHuntDesktop?.control.requestDisplaySync() ?? Promise.resolve()),
    [db],
  );

  useEffect(() => {
    let mounted = true;
    const loadSnapshot = () => {
      void readDisplayDatabaseSnapshot(db).then(
        (next) => {
          if (!mounted) return;
          setSnapshot(next);
          setLoadError(undefined);
        },
        (error: unknown) => {
          if (mounted) setLoadError(getErrorMessage(error));
        },
      );
    };

    // The control renderer can be created after a result is committed. Reading
    // once avoids depending on a later cross-window Dexie notification.
    loadSnapshot();
    const subscription = liveQuery(() => readDisplayDatabaseSnapshot(db)).subscribe({
      next: (next) => {
        setSnapshot(next);
        setLoadError(undefined);
      },
      error: (error: unknown) => setLoadError(getErrorMessage(error)),
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [db]);

  const viewModel = createStaffDrawViewModel({ snapshot, action, loadError, message, operationError, voidReason });

  const runAction: StaffActionRunner = async (nextAction, work) => {
    if (!viewModel.canOperate) return;

    setAction(nextAction);
    setMessage(undefined);
    setOperationError(undefined);
    try {
      setMessage(getStaffDrawOperationMessage(await work()));
    } catch (error) {
      setOperationError(getErrorMessage(error));
    } finally {
      setAction(undefined);
    }
  };

  const redeem = () => {
    if (!viewModel.canRedeem || !viewModel.currentRecord || !viewModel.currentSession) return;
    void runAction('REDEEM', () => service.redeem(viewModel.currentRecord!, viewModel.currentSession!));
  };

  const voidRecord = (reasonOverride?: string) => {
    if (!viewModel.canVoid || !viewModel.currentRecord || !viewModel.currentSession) return;
    const reason = (reasonOverride ?? voidReason).trim();
    if (!reason) {
      setOperationError('请填写作废原因。');
      return;
    }
    setVoidReason(reason);
    void runAction('VOID', () => service.void(viewModel.currentRecord!, viewModel.currentSession!, reason));
  };

  const endDisplay = () => {
    if (!viewModel.canEndDisplay || !viewModel.currentRecord || !viewModel.currentSession) return;
    void runAction('END', () => service.endDisplay(viewModel.currentRecord!, viewModel.currentSession!));
  };

  return {
    actions: { endDisplay, redeem, setVoidReason, voidRecord },
    viewModel,
  };
}
