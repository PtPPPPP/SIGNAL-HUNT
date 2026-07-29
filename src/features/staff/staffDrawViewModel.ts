import type { DisplayDatabaseSnapshot } from '../../db/drawRepository';

export type StaffDrawAction = 'REDEEM' | 'VOID' | 'END' | undefined;

export type StaffDrawViewModel = {
  action: StaffDrawAction;
  canEndDisplay: boolean;
  canOperate: boolean;
  canRedeem: boolean;
  canVoid: boolean;
  currentRecord: DisplayDatabaseSnapshot['record'];
  currentSession: DisplayDatabaseSnapshot['session'];
  loading: boolean;
  loadError?: string;
  message?: string;
  operationError?: string;
  voidReason: string;
};

export function createStaffDrawViewModel(input: {
  snapshot?: DisplayDatabaseSnapshot;
  action: StaffDrawAction;
  loadError?: string;
  message?: string;
  operationError?: string;
  voidReason: string;
}): StaffDrawViewModel {
  const currentRecord = input.snapshot?.record;
  const currentSession = input.snapshot?.session;
  const hasCurrentDraw = Boolean(currentRecord && currentSession);
  const idle = !input.action;
  const status = currentRecord?.status;

  return {
    action: input.action,
    canEndDisplay: hasCurrentDraw && idle,
    canOperate: hasCurrentDraw && idle,
    canRedeem:
      hasCurrentDraw &&
      idle &&
      status !== 'REDEEMED' &&
      status !== 'VOIDED',
    canVoid:
      hasCurrentDraw &&
      idle &&
      status !== 'REDEEMED' &&
      status !== 'VOIDED',
    currentRecord,
    currentSession,
    loading: input.snapshot === undefined && !input.loadError,
    loadError: input.loadError,
    message: input.message,
    operationError: input.operationError,
    voidReason: input.voidReason,
  };
}

export function getStaffDrawOperationMessage(result: {
  operation: Exclude<StaffDrawAction, undefined>;
  alreadyCompleted: boolean;
}): string {
  if (result.operation === 'REDEEM') {
    return result.alreadyCompleted
      ? '该记录已兑奖，无需重复操作。'
      : '已确认兑奖。';
  }
  if (result.operation === 'VOID') {
    return result.alreadyCompleted
      ? '该记录已作废，无需重复操作。'
      : '结果已作废，当前展示已结束。';
  }
  return result.alreadyCompleted
    ? '当前展示已经结束。'
    : '已结束当前展示，大屏已返回待机。';
}
