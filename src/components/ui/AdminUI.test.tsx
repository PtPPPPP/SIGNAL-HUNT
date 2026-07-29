import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  Button,
  DangerZone,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Switch,
} from './AdminUI';

describe('shared UI controls', () => {
  it('associates field labels and disables a loading button', () => {
    render(
      <>
        <Field label="活动名称">
          <Input />
        </Field>
        <Switch label="启用活动" checked={false} onChange={() => undefined} />
        <Button loading>保存</Button>
      </>,
    );

    expect(screen.getByLabelText('活动名称')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '启用活动' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '处理中…' })).toBeDisabled();
  });

  it('focuses the safe close action and closes a dialog with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog
        open
        title="危险确认"
        onClose={onClose}
        footer={<Button variant="danger">确认删除</Button>}
      >
        <p>操作不可撤销。</p>
      </Dialog>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '关闭对话框' }),
      ).toHaveFocus(),
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('traps forward and backward keyboard focus inside the dialog', async () => {
    const user = userEvent.setup();
    const trigger = document.createElement('button');
    trigger.textContent = '打开';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <Dialog
        open
        title="焦点测试"
        onClose={() => undefined}
        footer={
          <>
            <Button variant="secondary">取消</Button>
            <Button variant="danger">确认删除</Button>
          </>
        }
      >
        <Input aria-label="原因" />
      </Dialog>,
    );

    const close = await screen.findByRole('button', { name: '关闭对话框' });
    const confirm = screen.getByRole('button', { name: '确认删除' });
    expect(close).toHaveFocus();
    expect(close).toHaveClass('ui-dialog__initial-focus');

    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('does not steal focus when dialog form state changes', async () => {
    const user = userEvent.setup();

    function DialogForm() {
      const [value, setValue] = useState('');
      return (
        <Dialog open title="填写原因" onClose={() => undefined}>
          <Input
            aria-label="原因"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Dialog>
      );
    }

    render(<DialogForm />);
    const input = screen.getByRole('textbox', { name: '原因' });
    await user.click(input);
    await user.type(input, '现场误触');

    expect(input).toHaveFocus();
    expect(input).toHaveValue('现场误触');
  });

  it('renders unified loading, empty, error and danger states', () => {
    render(
      <>
        <LoadingState title="正在读取" />
        <EmptyState title="暂无数据" />
        <ErrorState title="读取失败" />
        <DangerZone title="危险操作">将替换全部数据。</DangerZone>
      </>,
    );

    expect(screen.getByText('正在读取')).toBeInTheDocument();
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('读取失败');
    expect(
      screen.getByRole('heading', { name: '危险操作' }),
    ).toBeInTheDocument();
  });
});
