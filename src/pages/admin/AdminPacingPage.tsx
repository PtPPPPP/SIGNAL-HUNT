import {
  Button,
  ErrorState,
  LoadingState,
  PageShell,
  SectionCard,
  StatusBadge,
} from '../../components/ui/AdminUI';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { AutoBalanceDialog } from '../../features/admin/pacing/components/AutoBalanceDialog';
import { EventEstimatePanel } from '../../features/admin/pacing/components/EventEstimatePanel';
import { PacingModeTabs } from '../../features/admin/pacing/components/PacingModeTabs';
import { ProbabilitySummary, SaveActionBar } from '../../features/admin/pacing/components/ProbabilitySummary';
import { ProbabilityTable } from '../../features/admin/pacing/components/ProbabilityTable';
import { StrategyPresetPanel } from '../../features/admin/pacing/components/StrategyPresetPanel';
import { usePacingConfig } from '../../features/admin/pacing/usePacingConfig';
import { AdminLayout } from './AdminLayout';
import '../../features/admin/pacing/pacing.css';

type AdminPacingPageProps = {
  db?: SignalHuntDatabase;
};

export function AdminPacingPage({ db = signalHuntDatabase }: AdminPacingPageProps) {
  const pacing = usePacingConfig(db);
  const canSave = pacing.totalStatus.state === 'valid' && pacing.prizes.length > 0 && !pacing.saving;

  return (
    <AdminLayout title="中奖概率与发放策略" db={db} hasUnsavedChanges={pacing.hasUnsavedChanges}>
      <PageShell>
      {pacing.isLoading ? (
        <LoadingState title="正在读取发放策略" />
      ) : pacing.loadError ? (
        <ErrorState
          title="发放策略读取失败"
          description={pacing.loadError}
          action={<Button onClick={() => void pacing.refresh()}>重新加载</Button>}
        />
      ) : (
      <>
      <SectionCard
        className="probability-hero"
        title="中奖概率与发放节奏"
        description="默认展示业务语言；高级算法参数只在高级模式中出现。"
        actions={
          <StatusBadge tone={pacing.hasUnsavedChanges ? 'warning' : 'success'}>
            {pacing.hasUnsavedChanges ? '有未保存修改' : '已同步'}
          </StatusBadge>
        }
      >
        <p className="admin-section-note">
          概率和保存语义保持不变，所有自动平衡结果仍需人工确认后应用。
        </p>
      </SectionCard>

      <EventEstimatePanel
        activeEvent={pacing.activeEvent}
        expectedParticipants={pacing.expectedParticipants}
        hasPrizes={pacing.prizes.length > 0}
        totalStatus={pacing.totalStatus}
        onExpectedParticipantsChange={pacing.setExpectedParticipants}
        onGenerateSuggestion={pacing.prepareInventorySuggestion}
      />

      <PacingModeTabs mode={pacing.mode} onChange={pacing.setMode} />

      {pacing.mode !== 'simple' ? (
        <StrategyPresetPanel onBalancedRelease={pacing.prepareAutoBalance} />
      ) : null}

      <ProbabilityTable
        activeEvent={pacing.activeEvent}
        drafts={pacing.drafts}
        expectedParticipants={pacing.expectedParticipants}
        mode={pacing.mode}
        prizes={pacing.prizes}
        records={pacing.records}
        risks={pacing.risks}
        onUpdateDraft={pacing.updateDraft}
      />

      <ProbabilitySummary risks={pacing.risks} totalStatus={pacing.totalStatus} />

      <SaveActionBar
        canSave={canSave}
        hasUnsavedChanges={pacing.hasUnsavedChanges}
        message={pacing.message}
        risks={pacing.risks}
        saving={pacing.saving}
        totalStatus={pacing.totalStatus}
        onAutoBalance={pacing.prepareAutoBalance}
        onReset={pacing.resetDrafts}
        onSave={() => void pacing.save()}
      />

      <AutoBalanceDialog
        currentDrafts={pacing.drafts}
        preview={pacing.preview}
        prizes={pacing.prizes}
        onCancel={() => pacing.setPreview(undefined)}
        onConfirm={pacing.applyPreview}
      />
      </>
      )}
      </PageShell>
    </AdminLayout>
  );
}
