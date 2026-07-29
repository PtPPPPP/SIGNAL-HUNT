import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Feedback,
  LoadingState,
} from '../../components/ui/AdminUI';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { CurrentDrawCard } from '../../features/staff/components/CurrentDrawCard';
import { StaffActionBar } from '../../features/staff/components/StaffActionBar';
import { StaffHeader } from '../../features/staff/components/StaffHeader';
import { VoidDrawDialog } from '../../features/staff/components/VoidDrawDialog';
import { useStaffDrawControl } from '../../features/staff/useStaffDrawControl';
import './staff.css';

type StaffPageProps = {
  db?: SignalHuntDatabase;
};

type ConfirmationKind = 'REDEEM' | 'END' | undefined;

export function StaffPage({ db = signalHuntDatabase }: StaffPageProps) {
  const navigate = useNavigate();
  const { actions, viewModel } = useStaffDrawControl(db);
  const [confirmation, setConfirmation] = useState<ConfirmationKind>();
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);

  useEffect(() => {
    if (!viewModel.currentRecord) {
      setConfirmation(undefined);
      setVoidDialogOpen(false);
    }
  }, [viewModel.currentRecord]);

  const returnToDisplay = () => {
    if (window.signalHuntDesktop) {
      void window.signalHuntDesktop.control.focusDisplay();
      return;
    }
    navigate('/display');
  };

  const confirmAction = () => {
    if (confirmation === 'REDEEM') actions.redeem();
    if (confirmation === 'END') actions.endDisplay();
    setConfirmation(undefined);
  };

  const confirmationCopy =
    confirmation === 'REDEEM'
      ? {
          title: '确认已完成兑奖？',
          description: '确认后记录进入“已兑奖”终态，不能再作废。',
          action: '确认兑奖',
        }
      : {
          title: '结束当前展示？',
          description: '大屏将返回待机；记录的兑奖或作废状态不会改变。',
          action: '结束展示',
        };

  return (
    <main className="staff-console">
      <StaffHeader onReturn={returnToDisplay} />

      <div className="staff-console__feedback" aria-live="polite">
        {viewModel.loadError ? (
          <Feedback tone="danger">数据读取失败：{viewModel.loadError}</Feedback>
        ) : null}
        {viewModel.operationError ? (
          <Feedback tone="danger">操作未完成：{viewModel.operationError}</Feedback>
        ) : null}
        {viewModel.message ? (
          <Feedback tone="success">{viewModel.message}</Feedback>
        ) : null}
      </div>

      <div className="staff-console__content">
        {viewModel.loading ? (
          <LoadingState
            title="正在读取当前结果"
            description="正在与本机抽奖记录同步。"
          />
        ) : viewModel.loadError && !viewModel.currentRecord ? (
          <ErrorState
            title="无法读取当前结果"
            description="请检查数据库状态后重试。"
          />
        ) : !viewModel.currentRecord || !viewModel.currentSession ? (
          <EmptyState
            title="当前没有待处理结果"
            description="请等待大屏产生中奖结果。这里不会创建新的抽奖。"
          />
        ) : (
          <>
            <CurrentDrawCard record={viewModel.currentRecord} />
            <StaffActionBar
              viewModel={viewModel}
              onRedeem={() => setConfirmation('REDEEM')}
              onVoid={() => setVoidDialogOpen(true)}
              onEndDisplay={() => setConfirmation('END')}
            />
          </>
        )}
      </div>

      <Dialog
        open={Boolean(confirmation)}
        onClose={() => setConfirmation(undefined)}
        title={confirmationCopy.title}
        description={confirmationCopy.description}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmation(undefined)}>
              取消
            </Button>
            <Button
              variant={confirmation === 'REDEEM' ? 'primary' : 'secondary'}
              onClick={confirmAction}
            >
              {confirmationCopy.action}
            </Button>
          </>
        }
      >
        <p className="staff-confirmation-note">
          请确认现场奖品与屏幕记录一致。
        </p>
      </Dialog>

      <VoidDrawDialog
        open={voidDialogOpen}
        loading={viewModel.action === 'VOID'}
        onClose={() => setVoidDialogOpen(false)}
        onConfirm={(reason) => {
          actions.voidRecord(reason);
          setVoidDialogOpen(false);
        }}
      />
    </main>
  );
}
