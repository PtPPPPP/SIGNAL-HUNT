export type EventFormState = {
  id: string;
  name: string;
  code: string;
  startAt: string;
  endAt: string;
};

export const emptyEventForm: EventFormState = {
  id: '',
  name: '',
  code: '',
  startAt: '',
  endAt: '',
};
