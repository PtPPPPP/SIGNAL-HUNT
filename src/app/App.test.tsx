import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App';

vi.mock('../pages/display/DisplayPage', () => ({
  DisplayPage: () => <h1>Display route ready</h1>,
}));

describe('App routing', () => {
  it('redirects the root route to the public display page', async () => {
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Display route ready' })).toBeInTheDocument();
  });
});
