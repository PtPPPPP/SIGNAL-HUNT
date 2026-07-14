import { AdminButton, StatusBadge } from '../../../../components/ui/AdminUI';
import type { Event } from '../../../../domain/draw/types';
import { formatEventWindow, labelForTotal } from '../format';
import type { ProbabilityTotalStatus } from '../../../../domain/draw/prizeProbability';
import { EVENT_STATUS_LABELS } from '../../statusLabels';

type EventEstimatePanelProps = {
  activeEvent?: Event;
  expectedParticipants: number;
  hasPrizes: boolean;
  totalStatus: ProbabilityTotalStatus;
  onExpectedParticipantsChange: (value: string) => void;
  onGenerateSuggestion: () => void;
};

export function EventEstimatePanel({
  activeEvent,
  expectedParticipants,
  hasPrizes,
  totalStatus,
  onExpectedParticipantsChange,
  onGenerateSuggestion,
}: EventEstimatePanelProps) {
  return (
    <section className="admin-panel pacing-context-panel">
      <div className="admin-panel-header">
        <div>
          <p>当前活动上下文</p>
          <h2>{activeEvent?.name ?? '未找到活动'}</h2>
        </div>
        <StatusBadge tone={activeEvent?.status === 'ACTIVE' ? 'success' : 'warning'}>
          {activeEvent ? EVENT_STATUS_LABELS[activeEvent.status] : '没有活动'}
        </StatusBadge>
      </div>

      <div className="pacing-context-grid">
        <label>
          预计参与人数
          <input
            aria-label="预计参与人数"
            type="number"
            min={1}
            step={1}
            value={expectedParticipants}
            onChange={(event) => onExpectedParticipantsChange(event.target.value)}
          />
        </label>
        <div>
          <span>活动时间</span>
          <strong>{formatEventWindow(activeEvent)}</strong>
        </div>
        <div>
          <span>合计概率</span>
          <strong>{totalStatus.total.toFixed(1)}%</strong>
        </div>
        <div>
          <span>状态</span>
          <StatusBadge tone={totalStatus.state === 'valid' ? 'success' : 'warning'}>
            {labelForTotal(totalStatus)}
          </StatusBadge>
        </div>
      </div>

      <div className="pacing-context-actions">
        <AdminButton variant="secondary" onClick={onGenerateSuggestion} disabled={!hasPrizes}>
          根据库存生成建议方案
        </AdminButton>
      </div>
    </section>
  );
}
