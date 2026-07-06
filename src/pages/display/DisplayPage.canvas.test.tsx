import 'fake-indexeddb/auto';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DisplayPage } from './DisplayPage';

describe('DisplayPage signal canvas', () => {
  it('mounts a signal canvas for the display visual engine', () => {
    render(<DisplayPage />);

    expect(screen.getByLabelText('Signal waveform visualization')).toBeInTheDocument();
  });
});
