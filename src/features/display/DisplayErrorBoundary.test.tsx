import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readStructuredLog } from '../diagnostics/errorLog';
import { DisplayErrorBoundary } from './DisplayErrorBoundary';

function BrokenDisplay(): never {
  throw new Error('sensitive renderer detail');
}

describe('DisplayErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a stable onsite error screen when display rendering crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <DisplayErrorBoundary>
        <BrokenDisplay />
      </DisplayErrorBoundary>,
    );

    expect(screen.getByRole('main')).toHaveAttribute('data-state', 'ERROR');
    expect(screen.getByRole('heading', { name: '系统暂时不可用' })).toBeInTheDocument();
    expect(screen.getByText('错误编号：DISPLAY_RENDER_FAILED')).toBeInTheDocument();
    expect(screen.queryByText('sensitive renderer detail')).not.toBeInTheDocument();
    expect(readStructuredLog()[0]).toMatchObject({
      type: 'UNCAUGHT_ERROR',
      details: {
        code: 'DISPLAY_RENDER_FAILED',
        message: 'sensitive renderer detail',
      },
    });
  });
});
