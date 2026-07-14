import { AdminButton, StatusBadge } from '../../../../components/ui/AdminUI';
import type { Prize } from '../../../../domain/draw/types';
import { formatSigned } from '../format';
import type { PacingPreview, ProbabilityDraft } from '../types';

type AutoBalanceDialogProps = {
  currentDrafts: ProbabilityDraft[];
  preview?: PacingPreview;
  prizes: Prize[];
  onCancel: () => void;
  onConfirm: () => void;
};

export function AutoBalanceDialog({
  currentDrafts,
  preview,
  prizes,
  onCancel,
  onConfirm,
}: AutoBalanceDialogProps) {
  if (!preview) {
    return null;
  }

  return (
    <div className="pacing-dialog-backdrop">
      <section className="pacing-dialog" role="dialog" aria-label={preview.title} aria-modal="true">
        <div className="admin-panel-header">
          <div>
            <p>确认后才会应用</p>
            <h2>{preview.title}</h2>
          </div>
          <StatusBadge tone="brand">预览</StatusBadge>
        </div>

        <div className="probability-diff-grid">
          {preview.drafts.map((draft) => {
            const prize = prizes.find((item) => item.id === draft.prizeId);
            const current = currentDrafts.find((item) => item.prizeId === draft.prizeId)?.probability ?? 0;

            return (
              <div key={draft.prizeId}>
                <strong>{prize?.name ?? draft.prizeId}</strong>
                <span>
                  {current.toFixed(1)}% {'->'} {draft.probability.toFixed(1)}%
                </span>
                <StatusBadge tone={Math.abs(draft.probability - current) < 0.1 ? 'neutral' : 'brand'}>
                  {formatSigned(draft.probability - current)}%
                </StatusBadge>
              </div>
            );
          })}
        </div>

        <div className="pacing-dialog-actions">
          <AdminButton variant="secondary" onClick={onCancel}>
            取消
          </AdminButton>
          <AdminButton onClick={onConfirm}>确认应用</AdminButton>
        </div>
      </section>
    </div>
  );
}
