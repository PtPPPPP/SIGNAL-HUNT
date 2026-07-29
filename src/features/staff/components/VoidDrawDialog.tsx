import { useEffect, useState } from 'react';

import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
} from '../../../components/ui/AdminUI';

const VOID_REASON_OPTIONS = [
  '现场误触',
  '奖品配置异常',
  '重复操作',
  '其他',
] as const;

type VoidDrawDialogProps = {
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

export function VoidDrawDialog({
  loading,
  open,
  onClose,
  onConfirm,
}: VoidDrawDialogProps) {
  const [preset, setPreset] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) {
      setPreset('');
      setNotes('');
      setError(undefined);
    }
  }, [open]);

  const handleConfirm = () => {
    const trimmedNotes = notes.trim();
    if (!preset) {
      setError('请选择作废原因。');
      return;
    }
    if (preset === '其他' && !trimmedNotes) {
      setError('选择“其他”时必须填写补充说明。');
      return;
    }

    const reason = trimmedNotes ? `${preset}：${trimmedNotes}` : preset;
    setError(undefined);
    onConfirm(reason);
  };

  return (
    <Dialog
      open={open}
      role="alertdialog"
      onClose={loading ? () => undefined : onClose}
      title="确认作废当前记录"
      description="作废后不能兑奖，且不会恢复库存。请核对记录后再继续。"
      footer={
        <>
          <Button variant="secondary" disabled={loading} onClick={onClose}>
            取消
          </Button>
          <Button
            variant="danger"
            loading={loading}
            loadingLabel="正在作废…"
            onClick={handleConfirm}
          >
            确认作废
          </Button>
        </>
      }
    >
      <div className="staff-void-form">
        <Field label="作废原因" required error={error}>
          <Select
            aria-label="作废原因"
            value={preset}
            disabled={loading}
            onChange={(event) => {
              setPreset(event.target.value);
              setError(undefined);
            }}
          >
            <option value="">请选择原因</option>
            {VOID_REASON_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="补充说明"
          hint={preset === '其他' ? '选择“其他”时必填。' : '选填，用于补充现场情况。'}
        >
          <Input
            aria-label="补充说明"
            value={notes}
            disabled={loading}
            maxLength={120}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="输入简短说明"
          />
        </Field>
      </div>
    </Dialog>
  );
}
