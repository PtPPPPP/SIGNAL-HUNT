import { AdminButton, StatusBadge } from '../../../../components/ui/AdminUI';
import type { InventoryRisk, ProbabilityTotalStatus } from '../../../../domain/draw/prizeProbability';
import { formatCount, labelForTotal } from '../format';

type ProbabilitySummaryProps = {
  risks: InventoryRisk[];
  totalStatus: ProbabilityTotalStatus;
};

type SaveActionBarProps = ProbabilitySummaryProps & {
  hasUnsavedChanges: boolean;
  message: string;
  saving: boolean;
  canSave: boolean;
  onAutoBalance: () => void;
  onReset: () => void;
  onSave: () => void;
};

export function ProbabilitySummary({ risks, totalStatus }: ProbabilitySummaryProps) {
  const warningRisks = risks.filter((risk) => risk.status === 'warning');

  return (
    <section className="admin-panel inventory-risk-panel">
      <div className="admin-panel-header">
        <div>
          <p>库存风险</p>
          <h2>预计中奖与库存关系</h2>
        </div>
        <StatusBadge tone={warningRisks.length > 0 ? 'warning' : 'success'}>
          {warningRisks.length > 0 ? '需要处理' : '库存正常'}
        </StatusBadge>
      </div>
      {warningRisks.length === 0 ? (
        <p className="admin-helper">当前概率与预计参与人数下，库存没有明显风险。</p>
      ) : (
        <div className="inventory-risk-list">
          {warningRisks.map((risk) => (
            <article key={risk.prizeId} className="inventory-risk-item">
              <strong>库存风险</strong>
              <p>{risk.message}</p>
              <p>
                预计需要约 {formatCount(risk.estimatedWins)} 件，当前仅剩 {risk.inventoryRemaining} 件。
              </p>
            </article>
          ))}
        </div>
      )}

      <div className="pacing-total-strip">
        <span>当前总概率</span>
        <strong>{totalStatus.total.toFixed(1)}%</strong>
        <StatusBadge tone={totalStatus.state === 'valid' ? 'success' : 'warning'}>
          {labelForTotal(totalStatus)}
        </StatusBadge>
      </div>
    </section>
  );
}

export function SaveActionBar({
  canSave,
  hasUnsavedChanges,
  message,
  saving,
  totalStatus,
  onAutoBalance,
  onReset,
  onSave,
}: SaveActionBarProps) {
  return (
    <section className="pacing-action-bar" aria-label="保存操作">
      <div>
        <strong>{hasUnsavedChanges ? '有未保存修改' : '当前没有未保存修改'}</strong>
        <span>{labelForTotal(totalStatus)}</span>
      </div>
      <div className="pacing-action-buttons">
        <AdminButton variant="secondary" onClick={onReset} disabled={!hasUnsavedChanges || saving}>
          放弃修改
        </AdminButton>
        <AdminButton variant="secondary" onClick={onAutoBalance} disabled={saving}>
          自动平衡到 100%
        </AdminButton>
        <AdminButton variant="secondary" onClick={() => undefined} disabled>
          保存草稿
        </AdminButton>
        <AdminButton onClick={onSave} disabled={!canSave || saving}>
          保存并应用
        </AdminButton>
      </div>
      {message ? <p className="admin-message">{message}</p> : null}
    </section>
  );
}
