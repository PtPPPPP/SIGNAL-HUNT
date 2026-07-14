import { useCallback, useEffect, useState } from 'react';

import { listEvents, activateEvent, createEvent, endEvent, pauseEvent } from '../../db/eventRepository';
import { EventRepositoryError } from '../../db/eventRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { Event } from '../../domain/draw/types';
import { getEventValidationIssues, type EventValidationIssues } from '../../domain/draw/eventValidation';
import { EVENT_STATUS_LABELS, formatAdminDateTime } from '../../features/admin/statusLabels';
import { publishAppChange } from '../../features/sync/appSync';
import { AdminLayout } from './AdminLayout';

type AdminEventPageProps = {
  db?: SignalHuntDatabase;
};

type EventFormState = {
  id: string;
  name: string;
  code: string;
  startAt: string;
  endAt: string;
};

const defaultForm: EventFormState = {
  id: '',
  name: '',
  code: '',
  startAt: '',
  endAt: '',
};

export function AdminEventPage({ db = signalHuntDatabase }: AdminEventPageProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [form, setForm] = useState<EventFormState>(defaultForm);
  const [issues, setIssues] = useState<EventValidationIssues>({});
  const [message, setMessage] = useState('');
  const [pendingActivateId, setPendingActivateId] = useState<string | null>(null);
  const [pendingActivateName, setPendingActivateName] = useState('');

  const refresh = useCallback(async () => {
    setEvents(await listEvents(db));
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeEvent = events.find((event) => event.status === 'ACTIVE');
  const hasUnsavedChanges = Object.values(form).some((value) => value.trim() !== '');

  const handleCreate = async () => {
    const draft: Event = {
      id: form.id.trim() || `event-${crypto.randomUUID()}`,
      name: form.name,
      code: form.code,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      startAt: form.startAt || undefined,
      endAt: form.endAt || undefined,
    };

    const fieldIssues = getEventValidationIssues(draft);

    if (Object.keys(fieldIssues).length > 0) {
      setIssues(fieldIssues);
      return;
    }

    setIssues({});

    try {
      await createEvent(db, {
        name: draft.name,
        code: draft.code,
        startAt: draft.startAt,
        endAt: draft.endAt,
        id: draft.id,
      });
      publishAppChange('CONFIG_UPDATED', draft.id);
      setMessage(`活动「${draft.name}」已创建（草稿）。`);
      setForm(defaultForm);
      await refresh();
    } catch (error) {
      if (error instanceof EventRepositoryError && error.code === 'EVENT_CODE_TAKEN') {
        setIssues({ code: '活动代码已被占用。' });
      } else {
        setMessage(toErrorMessage(error));
      }
    }
  };

  const handleActivate = async (eventId: string, pauseExisting = false) => {
    try {
      await activateEvent(db, eventId, { pauseExisting });
      publishAppChange('EVENT_ACTIVATED', eventId);
      setMessage('活动已激活。');
      setPendingActivateId(null);
      await refresh();
    } catch (error) {
      if (error instanceof EventRepositoryError && error.code === 'ACTIVE_EVENT_EXISTS') {
        const target = events.find((event) => event.id === eventId);
        setPendingActivateId(eventId);
        setPendingActivateName(target?.name ?? '该活动');
        return;
      }

      if (error instanceof EventRepositoryError && error.code === 'EVENT_ALREADY_ENDED') {
        setMessage('活动已结束，不能重新激活。');
        return;
      }

      setMessage(toErrorMessage(error));
    }
  };

  const handlePause = async (eventId: string) => {
    try {
      await pauseEvent(db, eventId);
      publishAppChange('EVENT_PAUSED', eventId);
      setMessage('活动已暂停。展示页已同步进入暂停状态，已提交的中奖结果仍会保留。');
      await refresh();
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  };

  const handleEnd = async (eventId: string) => {
    try {
      await endEvent(db, eventId);
      publishAppChange('EVENT_ENDED', eventId);
      setMessage('活动已结束。展示页已同步，历史记录与库存快照已保留。');
      await refresh();
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  };

  return (
    <AdminLayout title="活动管理" db={db} hasUnsavedChanges={hasUnsavedChanges}>
      {activeEvent ? (
        <section className="admin-placeholder" aria-label="当前激活活动">
          <p>
            当前激活活动：<strong>{activeEvent.name}</strong>（代码 {activeEvent.code}）
          </p>
        </section>
      ) : (
        <section className="admin-placeholder" aria-label="当前激活活动">
          <p>当前没有激活中的活动，展示页处于待机/未配置状态。</p>
        </section>
      )}

      <section className="admin-grid-two">
        <form className="admin-form" onSubmit={(event) => event.preventDefault()}>
          <h2>创建活动</h2>
          <label>
            编号（留空自动生成）
            <input value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} />
          </label>
          <label>
            活动名称
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            {issues.name ? <span className="admin-field-error">{issues.name}</span> : null}
          </label>
          <label>
            活动代码
            <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
            {issues.code ? <span className="admin-field-error">{issues.code}</span> : null}
          </label>
          <div className="admin-form-row">
            <label>
              开始时间（可选）
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={(event) => setForm({ ...form, startAt: event.target.value })}
              />
              {issues.startAt ? <span className="admin-field-error">{issues.startAt}</span> : null}
            </label>
            <label>
              结束时间（可选）
              <input
                type="datetime-local"
                value={form.endAt}
                onChange={(event) => setForm({ ...form, endAt: event.target.value })}
              />
              {issues.endAt ? <span className="admin-field-error">{issues.endAt}</span> : null}
            </label>
          </div>
          <div className="admin-actions">
            <button className="admin-button" type="button" onClick={handleCreate}>
              创建活动（草稿）
            </button>
          </div>
        </form>

        <section className="admin-form">
          <h2>活动生命周期</h2>
          <p className="admin-message">
            新活动默认进入「草稿」。激活时同一终端只允许一个激活中的活动；若已有激活活动，会要求确认后暂停旧活动。
          </p>
        </section>
      </section>

      <section className="admin-table-wrap">
        <h2>活动列表</h2>
        <table className="admin-table">
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
            {events.map((event) => (
              <tr key={event.id}>
                <td>{event.name}</td>
                <td>{event.code}</td>
                <td>{EVENT_STATUS_LABELS[event.status]}</td>
                <td>{formatWindow(event)}</td>
                <td>
                  <div className="admin-actions admin-actions-inline">
                    {event.status === 'ENDED' ? (
                      <span className="admin-message">活动已结束，不能重新激活</span>
                    ) : (
                      <button
                        className="admin-button"
                        type="button"
                        disabled={event.status === 'ACTIVE'}
                        onClick={() => void handleActivate(event.id)}
                      >
                        激活
                      </button>
                    )}
                    <button
                      className="admin-button secondary"
                      type="button"
                      disabled={event.status !== 'ACTIVE' && event.status !== 'DRAFT'}
                      onClick={() => void handlePause(event.id)}
                    >
                      暂停
                    </button>
                    <button
                      className="admin-button secondary"
                      type="button"
                      disabled={event.status === 'ENDED'}
                      onClick={() => void handleEnd(event.id)}
                    >
                      结束
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {pendingActivateId ? (
        <div className="confirm-card" role="alertdialog" aria-label="确认暂停旧活动">
          <p>
            已存在激活中的活动。确认暂停旧活动并激活「{pendingActivateName}」？
            <br />
            展示页将在下次进入时进入暂停/激活态，已提交的中奖结果不受影响。
          </p>
          <div className="confirm-card-actions">
            <button
              className="confirm-button-cancel"
              type="button"
              onClick={() => setPendingActivateId(null)}
            >
              取消
            </button>
            <button
              className="confirm-button-ok"
              type="button"
              onClick={() => void handleActivate(pendingActivateId, true)}
            >
              确认并激活
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="admin-message">{message}</p> : null}
    </AdminLayout>
  );
}

function formatWindow(event: Event): string {
  if (!event.startAt && !event.endAt) {
    return '—';
  }

  return [formatAdminDateTime(event.startAt), formatAdminDateTime(event.endAt)].join(' → ');
}

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
