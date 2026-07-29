import { useCallback, useEffect, useMemo, useState } from 'react';

import { signalHuntDatabase, type SignalHuntDatabase } from '../../../db/database';
import { EventRepositoryError, listEvents } from '../../../db/eventRepository';
import type { Event } from '../../../domain/draw/types';
import type { EventValidationIssues } from '../../../domain/draw/eventValidation';
import { getErrorMessage } from '../../../lib/errorMessage';
import { EventManagementApplicationService } from './EventManagementApplicationService';
import { emptyEventForm, type EventFormState } from './eventForm';

export type { EventFormState } from './eventForm';

/**
 * Owns the activity-management use cases used by the admin page. Repository
 * calls, validation and renderer invalidation stay outside the page layout.
 */
export function useEventManagement(db: SignalHuntDatabase = signalHuntDatabase) {
  const [events, setEvents] = useState<Event[]>([]);
  const [form, setForm] = useState<EventFormState>(emptyEventForm);
  const [issues, setIssues] = useState<EventValidationIssues>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pendingActivateId, setPendingActivateId] = useState<string | null>(null);
  const [pendingActivateName, setPendingActivateName] = useState('');
  const service = useMemo(() => new EventManagementApplicationService(db), [db]);

  const refresh = useCallback(async () => {
    try {
      setEvents(await listEvents(db));
      setLoadError('');
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeEvent = events.find((event) => event.status === 'ACTIVE');
  const hasUnsavedChanges = Object.values(form).some((value) => value.trim() !== '');

  const createDraft = async () => {
    setIssues({});
    try {
      const outcome = await service.createDraft(form);
      if (outcome.type === 'VALIDATION_FAILED') {
        setIssues(outcome.issues);
        return;
      }
      setMessage(`活动「${outcome.event.name}」已创建（草稿）。`);
      setForm(emptyEventForm);
      await refresh();
    } catch (error) {
      if (error instanceof EventRepositoryError && error.code === 'EVENT_CODE_TAKEN') {
        setIssues({ code: '活动代码已被占用。' });
        return;
      }
      setMessage(getErrorMessage(error));
    }
  };

  const activate = async (eventId: string, pauseExisting = false) => {
    try {
      await service.activate(eventId, pauseExisting);
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
      setMessage(getErrorMessage(error));
    }
  };

  const pause = async (eventId: string) => {
    try {
      await service.pause(eventId);
      setMessage('活动已暂停。展示页已同步进入暂停状态，已提交的中奖结果仍会保留。');
      await refresh();
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const endEventManagement = async (eventId: string) => {
    try {
      await service.end(eventId);
      setMessage('活动已结束。展示页已同步，历史记录与库存快照已保留。');
      await refresh();
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  return {
    activeEvent,
    activate,
    createDraft,
    endEvent: endEventManagement,
    events,
    form,
    hasUnsavedChanges,
    issues,
    loading,
    loadError,
    message,
    pause,
    pendingActivateId,
    pendingActivateName,
    setForm,
    setPendingActivateId,
  };
}
