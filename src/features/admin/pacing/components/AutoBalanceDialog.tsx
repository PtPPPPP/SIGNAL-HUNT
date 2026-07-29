import { Button, Dialog, StatusBadge } from '../../../../components/ui/AdminUI';
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
  return (
    <Dialog
      open={Boolean(preview)}
      title={preview?.title ?? '自动平衡预览'}
      description="确认后才会应用到当前草稿，保存前不会写入真实配置。"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button onClick={onConfirm}>确认应用</Button>
        </>
      }
    >
      {preview ? (
        <>
        <div className="admin-panel-header">
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

        </>
      ) : null}
    </Dialog>
  );
}
