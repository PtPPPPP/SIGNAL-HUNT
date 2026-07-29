import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  getDisplayCopy,
  type DrawState,
} from '../../features/display/displayStateMachine';
import { DisplayFocusInstrument } from './DisplayFocusInstrument';
import { getDisplayFocusCopy } from './displayFocusPresentation';

describe('DisplayFocusInstrument', () => {
  it.each([
    ['ARMING', 'calibrating', '01 / 06'],
    ['COMMITTING', 'calibrating', '01 / 06'],
    ['SCANNING', 'scanning', '02 / 06'],
    ['SEARCHING', 'focusing', '03 / 06'],
    ['PEAK_DETECTED', 'acquired', '04 / 06'],
    ['LOCKING', 'locked', '05 / 06'],
    ['REVEALING', 'resolving', '06 / 06'],
  ] satisfies Array<[DrawState, string, string]>)(
    'maps %s to the %s optical phase',
    (status, phase, sequence) => {
      render(<DisplayFocusInstrument status={status} />);

      const instrument = screen.getByTestId('display-focus-instrument');
      expect(instrument).toHaveAttribute('data-focus-phase', phase);
      expect(instrument).toHaveTextContent(sequence);
      expect(instrument).toHaveTextContent('OPTICAL SEQUENCE');
    },
  );

  it.each(['BOOT', 'ATTRACT', 'RESULT', 'RESETTING', 'PAUSED', 'ERROR'] satisfies DrawState[])(
    'does not render an active instrument for %s',
    (status) => {
      render(<DisplayFocusInstrument status={status} />);

      expect(screen.queryByTestId('display-focus-instrument')).not.toBeInTheDocument();
    },
  );

  it.each([
    ['SCANNING', '正在校准观测区域', 'CALIBRATING FIELD'],
    ['SEARCHING', '正在聚焦目标信号', 'FOCUSING TARGET SIGNAL'],
    ['PEAK_DETECTED', '已捕获关键峰值', 'TARGET ACQUIRED'],
    ['LOCKING', '观测目标已锁定', 'TARGET LOCKED'],
    ['REVEALING', '观测结果即将确认', 'RESOLVING OBSERVATION'],
  ] satisfies Array<[DrawState, string, string]>)(
    'provides presentation copy for %s without changing the state machine',
    (status, title, subtitle) => {
      const copy = getDisplayFocusCopy(status, getDisplayCopy(status));

      expect(copy.title).toBe(title);
      expect(copy.subtitle).toBe(subtitle);
    },
  );
});
