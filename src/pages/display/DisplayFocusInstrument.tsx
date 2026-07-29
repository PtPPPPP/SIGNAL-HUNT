import type { DrawState } from '../../features/display/displayStateMachine';
import { getDisplayFocusStage } from './displayFocusPresentation';

import './display-focus.css';

type DisplayFocusInstrumentProps = {
  status: DrawState;
};

export function DisplayFocusInstrument({ status }: DisplayFocusInstrumentProps) {
  const stage = getDisplayFocusStage(status);

  if (!stage) {
    return null;
  }

  return (
    <div
      className="display-focus-instrument"
      data-focus-phase={stage.phase}
      data-testid="display-focus-instrument"
      aria-hidden="true"
    >
      <div className="display-focus-aperture">
        <span className="display-focus-ticks" />
        <span className="display-focus-ring display-focus-ring--outer" />
        <span className="display-focus-ring display-focus-ring--middle" />
        <span className="display-focus-ring display-focus-ring--inner" />
        <span className="display-focus-reticle" />
        <span className="display-focus-point" />
      </div>
      <div className="display-focus-readout">
        <span>{stage.sequence} / 06</span>
        <span>OPTICAL SEQUENCE</span>
      </div>
    </div>
  );
}
