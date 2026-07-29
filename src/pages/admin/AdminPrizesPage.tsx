import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Button,
  Dialog,
  ErrorState,
  Feedback,
  LoadingState,
  PageShell,
} from '../../components/ui/AdminUI';
import {
  listDrawRecords,
  listPrizes,
  normalizeLegacyPrizeLabels,
  replacePrizes,
  resetPrizeState,
  savePrize,
} from '../../db/adminRepository';
import { getConfiguredActiveEvent } from '../../db/drawRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { calculatePrizePacing } from '../../domain/draw/prizePacing';
import type { DrawRecord, Event, Prize } from '../../domain/draw/types';
import {
  PrizeValidationError,
  type PrizeValidationIssues,
  validatePrize,
} from '../../domain/draw/prizeValidation';
import {
  ImportExportSection,
  InventorySection,
  PrizeDangerZone,
  PrizeEditor,
  PrizeList,
} from '../../features/admin/prizes/PrizeManagementSections';
import {
  createPrizeFromForm,
  defaultPrizeForm,
  type PrizeFormState,
} from '../../features/admin/prizes/prizeForm';
import {
  parsePrizeImport,
  stringifyPrizeExport,
} from '../../features/admin/prizeImport';
import { createDefaultPrizePool } from '../../features/display/displayBootstrap';
import { publishAppChange } from '../../features/sync/appSync';
import { getErrorMessage } from '../../lib/errorMessage';
import { AdminLayout } from './AdminLayout';

type AdminPrizesPageProps = {
  db?: SignalHuntDatabase;
};

type PendingDangerAction = 'RESTORE_DEFAULTS' | 'RESET' | undefined;

export function AdminPrizesPage({
  db = signalHuntDatabase,
}: AdminPrizesPageProps) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [records, setRecords] = useState<DrawRecord[]>([]);
  const [activeEvent, setActiveEvent] = useState<Event>();
  const [form, setForm] = useState<PrizeFormState>(defaultPrizeForm);
  const [formErrors, setFormErrors] = useState<PrizeValidationIssues>({});
  const [jsonText, setJsonText] = useState('[]');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pendingDangerAction, setPendingDangerAction] =
    useState<PendingDangerAction>();

  const exportText = useMemo(() => stringifyPrizeExport(prizes), [prizes]);
  const previewPrize = useMemo(() => createPrizeFromForm(form), [form]);
  const preview = useMemo(
    () => calculatePrizePacing({ prize: previewPrize, event: activeEvent, records }),
    [activeEvent, previewPrize, records],
  );
  const totalEffectiveWeight = useMemo(
    () =>
      prizes.reduce(
        (sum, prize) =>
          sum +
          calculatePrizePacing({ prize, event: activeEvent, records })
            .effectiveWeight,
        preview.effectiveWeight,
      ),
    [activeEvent, preview.effectiveWeight, prizes, records],
  );
  const estimatedShare =
    totalEffectiveWeight > 0
      ? (preview.effectiveWeight / totalEffectiveWeight) * 100
      : 0;
  const hasUnsavedChanges =
    JSON.stringify(form) !== JSON.stringify(defaultPrizeForm) ||
    jsonText !== exportText;

  const refresh = useCallback(
    async (options: { syncJsonText: boolean | 'ifEmpty' }) => {
      await normalizeLegacyPrizeLabels(db);
      const [nextPrizes, nextRecords, event] = await Promise.all([
        listPrizes(db),
        listDrawRecords(db),
        getConfiguredActiveEvent(db),
      ]);
      setPrizes(nextPrizes);
      setRecords(nextRecords);
      setActiveEvent(event);
      setLoadError('');
      if (options.syncJsonText === true) {
        setJsonText(stringifyPrizeExport(nextPrizes));
      } else if (options.syncJsonText === 'ifEmpty') {
        setJsonText((current) =>
          current === '[]' ? stringifyPrizeExport(nextPrizes) : current,
        );
      }
    },
    [db],
  );

  useEffect(() => {
    let disposed = false;
    void refresh({ syncJsonText: 'ifEmpty' })
      .catch((cause: unknown) => {
        if (!disposed) setLoadError(getErrorMessage(cause));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [refresh]);

  const handleSavePrize = async () => {
    try {
      const prize = validatePrize(createPrizeFromForm(form));
      await savePrize(db, prize);
      publishAppChange('PRIZES_UPDATED', activeEvent?.id);
      setFormErrors({});
      setMessage('奖品已保存。');
      setForm(defaultPrizeForm);
      await refresh({ syncJsonText: true });
    } catch (error) {
      if (error instanceof PrizeValidationError) {
        setFormErrors(error.issues);
        setMessage('请修正奖品字段。');
        return;
      }
      setMessage('奖品保存失败，请检查数据后重试。');
    }
  };

  const handleImport = async () => {
    try {
      await replacePrizes(db, parsePrizeImport(jsonText));
      publishAppChange('PRIZES_UPDATED', activeEvent?.id);
      setMessage('奖品 JSON 已导入。');
      await refresh({ syncJsonText: true });
    } catch {
      setMessage('奖品 JSON 无效，请检查字段。');
    }
  };

  const handleDangerAction = async () => {
    const action = pendingDangerAction;
    setPendingDangerAction(undefined);
    try {
      if (action === 'RESET') {
        await resetPrizeState(db, activeEvent?.id);
        setMessage('奖品库存和当前活动抽奖记录已重置。');
      }
      if (action === 'RESTORE_DEFAULTS') {
        await replacePrizes(db, createDefaultPrizePool());
        await resetPrizeState(db, activeEvent?.id);
        setMessage('默认奖池已恢复：一等奖、二等奖、三等奖、谢谢参与。');
      }
      if (!action) return;
      publishAppChange('PRIZES_UPDATED', activeEvent?.id);
      await refresh({ syncJsonText: true });
    } catch {
      setMessage(
        action === 'RESET'
          ? '重置失败，请检查数据后重试。'
          : '恢复默认奖池失败，请检查数据后重试。',
      );
    }
  };

  const dangerCopy =
    pendingDangerAction === 'RESET'
      ? {
          title: '确认重置奖品？',
          description: '这会重置奖品库存并清空当前活动抽奖记录。',
          action: '确认重置',
        }
      : {
          title: '确认恢复默认奖池？',
          description:
            '这会重建默认奖池，并清空当前活动抽奖记录。',
          action: '确认恢复',
        };

  return (
    <AdminLayout
      title="奖池管理"
      db={db}
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <PageShell>
        {message ? <Feedback tone="info">{message}</Feedback> : null}
        {loading ? (
          <LoadingState title="正在读取奖品" />
        ) : loadError ? (
          <ErrorState title="奖池读取失败" description={loadError} />
        ) : (
          <>
            <div className="admin-page-actions">
              <Button onClick={() => setForm(defaultPrizeForm)}>新增奖品</Button>
            </div>
            <PrizeEditor
              form={form}
              setForm={setForm}
              issues={formErrors}
              preview={preview}
              estimatedShare={estimatedShare}
              onSave={() => void handleSavePrize()}
            />
            <InventorySection
              form={form}
              issues={formErrors}
              setForm={setForm}
            />
            <PrizeList
              activeEvent={activeEvent}
              prizes={prizes}
              records={records}
              onEdit={setForm}
            />
            <ImportExportSection
              exportText={exportText}
              jsonText={jsonText}
              onChange={setJsonText}
              onExport={() => setJsonText(exportText)}
              onImport={() => void handleImport()}
            />
            <PrizeDangerZone
              onRestoreDefaults={() => setPendingDangerAction('RESTORE_DEFAULTS')}
              onReset={() => setPendingDangerAction('RESET')}
            />
          </>
        )}
      </PageShell>

      <Dialog
        open={Boolean(pendingDangerAction)}
        role="alertdialog"
        onClose={() => setPendingDangerAction(undefined)}
        title={dangerCopy.title}
        description={dangerCopy.description}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setPendingDangerAction(undefined)}
            >
              取消
            </Button>
            <Button variant="danger" onClick={() => void handleDangerAction()}>
              {dangerCopy.action}
            </Button>
          </>
        }
      >
        <p>操作完成前请不要关闭应用。</p>
      </Dialog>
    </AdminLayout>
  );
}
