import 'fake-indexeddb/auto';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App routing', () => {
  it('redirects the root route to the public display page', async () => {
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(await screen.findByRole('heading', { name: /发现你的幸运信号/i })).toBeInTheDocument();
  });
});
