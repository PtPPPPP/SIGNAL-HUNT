import { useState } from 'react';

import {
  Button,
  DangerZone,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Feedback,
  Field,
  Input,
  LoadingState,
  PageShell,
  SectionCard,
  StatusBadge,
} from '../../components/ui/AdminUI';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { Event } from '../../domain/draw/types';
import { useEventManagement } from '../../features/admin/events/useEventManagement';
import {
  EVENT_STATUS_LABELS,
  formatAdminDateTime,
} from '../../features/admin/statusLabels';
import { AdminLayout } from './AdminLayout';

type AdminEventPageProps = {
  db?: SignalHuntDatabase;
};

export function AdminEventPage({
  db = signalHuntDatabase,
}: AdminEventPageProps) {
  const management = useEventManagement(db);
  const [pendingEndEvent, setPendingEndEvent] = useState<Event>();

  return (
    <AdminLayout
      title="活动配置"
      db={db}
      hasUnsavedChanges={management.hasUnsavedChanges}
    >
      <PageShell>
        {management.message ? (
          <Feedback tone="info">{management.message}</Feedback>
        ) : null}

        <SectionCard
          title="当前活动"
          actions={
            <StatusBadge tone={management.activeEvent ? 'success' : 'warning'}>
              {management.activeEvent
                ? EVENT_STATUS_LABELS[management.activeEvent.status]
                : '未激活'}
            </StatusBadge>
          }
        >
          {management.activeEvent ? (
            <div className="admin-current-event">
              <strong>{management.activeEvent.name}</strong>
              <span>代码 {management.activeEvent.code}</span>
            </div>
          ) : (
            <EmptyState
              title="当前没有激活活动"
              description="展示页处于待机或未配置状态。"
            />
          )}
        </SectionCard>

        <SectionCard
          title="创建活动"
          description="普通保存只创建草稿，不会自动激活活动。"
        >
          <form
            className="admin-form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void management.createDraft();
            }}
          >
            <Field label="编号" hint="留空时自动生成">
              <Input
                value={management.form.id}
                onChange={(event) =>
                  management.setForm({
                    ...management.form,
                    id: event.target.value,
                  })
                }
              />
            </Field>
            <Field
              label="活动名称"
              required
              error={management.issues.name}
            >
              <Input
                value={management.form.name}
                onChange={(event) =>
                  management.setForm({
                    ...management.form,
                    name: event.target.value,
                  })
                }
              />
            </Field>
            <Field
              label="活动代码"
              required
              error={management.issues.code}
            >
              <Input
                value={management.form.code}
                onChange={(event) =>
                  management.setForm({
                    ...management.form,
                    code: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="开始时间" error={management.issues.startAt}>
              <Input
                type="datetime-local"
                value={management.form.startAt}
                onChange={(event) =>
                  management.setForm({
                    ...management.form,
                    startAt: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="结束时间" error={management.issues.endAt}>
              <Input
                type="datetime-local"
                value={management.form.endAt}
                onChange={(event) =>
                  management.setForm({
                    ...management.form,
                    endAt: event.target.value,
                  })
                }
              />
            </Field>
            <div className="admin-form-actions">
              <Button type="submit">创建活动草稿</Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="活动生命周期"
          description="激活、暂停和结束会影响展示端可参与状态。"
        >
          {management.loading ? (
            <LoadingState title="正在读取活动" />
          ) : management.loadError ? (
            <ErrorState
              title="活动读取失败"
              description={management.loadError}
            />
          ) : management.events.length ? (
            <DataTable label="活动列表" minWidth="64rem">
              <table>
                <thead>
                  <tr>
                    <th>活动名称</th>
                    <th>代码</th>
                    <th>状态</th>
                    <th>窗口</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {management.events.map((event) => (
                    <tr key={event.id}>
                      <td>{event.name}</td>
                      <td data-nowrap>{event.code}</td>
                      <td data-nowrap>
                        <StatusBadge tone={toneForEvent(event)}>
                          {EVENT_STATUS_LABELS[event.status]}
                        </StatusBadge>
                      </td>
                      <td data-nowrap>{formatWindow(event)}</td>
                      <td data-nowrap>
                        <div className="admin-table-actions">
                          {event.status === 'ENDED' ? (
                            <span>活动已结束，不能重新激活</span>
                          ) : (
                            <Button
                              variant="secondary"
                              disabled={event.status === 'ACTIVE'}
                              onClick={() => void management.activate(event.id)}
                            >
                              激活
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            disabled={
                              event.status !== 'ACTIVE' &&
                              event.status !== 'DRAFT'
                            }
                            onClick={() => void management.pause(event.id)}
                          >
                            暂停
                          </Button>
                          <Button
                            variant="danger"
                            disabled={event.status === 'ENDED'}
                            onClick={() => setPendingEndEvent(event)}
                          >
                            结束
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          ) : (
            <EmptyState title="暂无活动" />
          )}
        </SectionCard>

        <DangerZone
          title="结束活动"
          action={
            <Button
              variant="danger"
              disabled={!management.activeEvent}
              onClick={() => setPendingEndEvent(management.activeEvent)}
            >
              结束当前活动
            </Button>
          }
        >
          结束后不能重新激活。历史记录和库存快照会保留。
        </DangerZone>
      </PageShell>

      <Dialog
        open={Boolean(management.pendingActivateId)}
        onClose={() => management.setPendingActivateId(null)}
        title="确认切换激活活动"
        description={`已存在激活活动。将暂停旧活动并激活“${management.pendingActivateName}”。`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => management.setPendingActivateId(null)}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                if (management.pendingActivateId) {
                  void management.activate(management.pendingActivateId, true);
                }
              }}
            >
              确认并激活
            </Button>
          </>
        }
      >
        <p>已提交的中奖结果不受此次切换影响。</p>
      </Dialog>

      <Dialog
        open={Boolean(pendingEndEvent)}
        onClose={() => setPendingEndEvent(undefined)}
        title="确认结束活动"
        description={`“${pendingEndEvent?.name ?? ''}”结束后不能重新激活。`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setPendingEndEvent(undefined)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingEndEvent) {
                  void management.endEvent(pendingEndEvent.id);
                  setPendingEndEvent(undefined);
                }
              }}
            >
              确认结束
            </Button>
          </>
        }
      >
        <p>历史抽奖记录和库存快照会保留。</p>
      </Dialog>
    </AdminLayout>
  );
}

function toneForEvent(event: Event) {
  if (event.status === 'ACTIVE') return 'success';
  if (event.status === 'PAUSED') return 'warning';
  if (event.status === 'ENDED') return 'neutral';
  return 'info';
}

function formatWindow(event: Event): string {
  if (!event.startAt && !event.endAt) return '—';
  return [formatAdminDateTime(event.startAt), formatAdminDateTime(event.endAt)].join(
    ' → ',
  );
}
