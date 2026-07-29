import { Component, type ErrorInfo, type ReactNode } from 'react';

import { logStructured } from '../diagnostics/errorLog';

type DisplayErrorBoundaryProps = {
  children: ReactNode;
};

type DisplayErrorBoundaryState = {
  failed: boolean;
};

export class DisplayErrorBoundary extends Component<
  DisplayErrorBoundaryProps,
  DisplayErrorBoundaryState
> {
  state: DisplayErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): DisplayErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logStructured('UNCAUGHT_ERROR', {
      code: 'DISPLAY_RENDER_FAILED',
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <main
          className="display-screen"
          data-state="ERROR"
          aria-labelledby="display-fatal-error-title"
        >
          <section className="display-panel">
            <p className="display-eyebrow">SYSTEM RECOVERY REQUIRED</p>
            <h1 id="display-fatal-error-title">系统暂时不可用</h1>
            <p className="display-copy">请联系现场工作人员处理。</p>
            <p className="display-copy">错误编号：DISPLAY_RENDER_FAILED</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
