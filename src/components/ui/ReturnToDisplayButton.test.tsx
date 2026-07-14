import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReturnToDisplayButton } from './ReturnToDisplayButton';

describe('ReturnToDisplayButton', () => {
  afterEach(() => {
    delete window.signalHuntDesktop;
  });

  it('protects unsaved changes before returning in the browser', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/pacing']}>
        <Routes>
          <Route path="/admin/pacing" element={<ReturnToDisplayButton hasUnsavedChanges />} />
          <Route path="/display" element={<h1>展会大屏</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /返回展会大屏/ }));
    expect(screen.getByRole('alertdialog', { name: '确认放弃未保存修改' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '放弃修改并返回' }));
    expect(await screen.findByRole('heading', { name: '展会大屏' })).toBeInTheDocument();
  });

  it('uses the safe desktop API instead of changing renderer routes', async () => {
    const user = userEvent.setup();
    const focusDisplay = vi.fn().mockResolvedValue(undefined);
    window.signalHuntDesktop = { control: { focusDisplay } } as unknown as Window['signalHuntDesktop'];

    render(
      <MemoryRouter>
        <ReturnToDisplayButton />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /返回展会大屏/ }));
    expect(focusDisplay).toHaveBeenCalledOnce();
  });
});
