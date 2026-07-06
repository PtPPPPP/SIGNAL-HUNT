import { useEffect, useRef } from 'react';

import type { DrawState } from '../../features/display/displayStateMachine';
import { createSignalFrame } from './signalModel';
import { defaultSignalRenderColors, renderSignalFrame, type SignalRenderColors } from './signalRenderer';

type SignalCanvasProps = {
  status: DrawState;
};

/**
 * 从 CSS 主题变量读取信号颜色，让 Canvas 的红色高亮与全局品牌 Token 统一，
 * 避免在渲染器里散落硬编码红色。主题在运行时不变，初始化时读取一次即可。
 */
function readSignalColors(): SignalRenderColors {
  if (typeof window === 'undefined' || !document.documentElement) {
    return defaultSignalRenderColors;
  }

  const style = window.getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim();
    return value || fallback;
  };

  return {
    background: pick('--color-bg-primary', defaultSignalRenderColors.background),
    grid: pick('--color-grid', defaultSignalRenderColors.grid),
    signal: pick('--color-signal', defaultSignalRenderColors.signal),
    signalDim: pick('--color-signal-dim', defaultSignalRenderColors.signalDim),
    peak: pick('--color-signal-peak', defaultSignalRenderColors.peak),
    cursor: pick('--color-cursor', defaultSignalRenderColors.cursor),
  };
}

export function SignalCanvas({ status }: SignalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef(status);

  statusRef.current = status;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      return undefined;
    }

    const colors = readSignalColors();
    let animationFrameId = 0;
    let disposed = false;

    const render = (timeMs: number) => {
      if (disposed) {
        return;
      }

      const width = canvas.clientWidth || 1280;
      const height = canvas.clientHeight || 520;
      const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
      const targetWidth = Math.floor(width * pixelRatio);
      const targetHeight = Math.floor(height * pixelRatio);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      renderSignalFrame(
        context,
        createSignalFrame({
          status: statusRef.current,
          timeMs,
          width,
          height,
        }),
        colors,
      );

      animationFrameId = window.requestAnimationFrame(render);
    };

    animationFrameId = window.requestAnimationFrame(render);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="signal-canvas"
      aria-label="Signal waveform visualization"
      role="img"
    />
  );
}
