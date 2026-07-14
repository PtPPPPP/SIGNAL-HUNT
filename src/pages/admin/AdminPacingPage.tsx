import { StatusBadge } from '../../components/ui/AdminUI';
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
      <section className="admin-panel probability-hero">
        <div className="admin-panel-header">
          <div>
            <p>概率配置</p>
            <h2>让运营人员直接配置概率和发放节奏</h2>
          </div>
          <StatusBadge tone={pacing.hasUnsavedChanges ? 'warning' : 'success'}>
            {pacing.hasUnsavedChanges ? '有未保存修改' : '已同步'}
          </StatusBadge>
        </div>
        <p className="admin-helper">
          默认只展示业务语言：中奖概率、库存、预计中奖人数和发放方式。高级算法参数只在高级模式中出现。
        </p>
      </section>

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
    </AdminLayout>
  );
}
