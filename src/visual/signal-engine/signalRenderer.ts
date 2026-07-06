import type { SignalFrame } from './signalModel';

export type SignalRenderColors = {
  background: string;
  grid: string;
  signal: string;
  signalDim: string;
  peak: string;
  cursor: string;
};

export const defaultSignalRenderColors: SignalRenderColors = {
  background: '#f7f7f5',
  grid: 'rgba(0, 0, 0, 0.06)',
  signal: 'rgba(90, 90, 90, 0.9)',
  signalDim: 'rgba(90, 90, 90, 0.16)',
  peak: 'rgba(208, 0, 0, 0.95)',
  cursor: 'rgba(0, 0, 0, 0.38)',
};

export function renderSignalFrame(
  context: CanvasRenderingContext2D,
  frame: SignalFrame,
  colors: SignalRenderColors = defaultSignalRenderColors,
): void {
  context.clearRect(0, 0, frame.width, frame.height);
  context.fillStyle = colors.background;
  context.fillRect(0, 0, frame.width, frame.height);

  drawGrid(context, frame, colors);
  drawWave(context, frame, colors.signalDim, 5);
  drawWave(context, frame, colors.signal, 2);
  drawCursor(context, frame, colors);
  drawPeaks(context, frame, colors);
}

function drawGrid(context: CanvasRenderingContext2D, frame: SignalFrame, colors: SignalRenderColors): void {
  const step = 80;

  context.save();
  context.strokeStyle = colors.grid;
  context.lineWidth = 1;

  for (let x = 0; x <= frame.width; x += step) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, frame.height);
    context.stroke();
  }

  for (let y = 0; y <= frame.height; y += step) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(frame.width, y);
    context.stroke();
  }

  context.restore();
}

function drawWave(context: CanvasRenderingContext2D, frame: SignalFrame, strokeStyle: string, lineWidth: number): void {
  const [firstPoint, ...restPoints] = frame.points;

  if (!firstPoint) {
    return;
  }

  context.save();
  context.globalAlpha = frame.opacity;
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);

  for (const point of restPoints) {
    context.lineTo(point.x, point.y);
  }

  context.stroke();
  context.restore();
}

function drawCursor(context: CanvasRenderingContext2D, frame: SignalFrame, colors: SignalRenderColors): void {
  context.save();
  context.strokeStyle = colors.cursor;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(frame.cursorX, frame.height * 0.16);
  context.lineTo(frame.cursorX, frame.height * 0.84);
  context.stroke();
  context.restore();
}

function drawPeaks(context: CanvasRenderingContext2D, frame: SignalFrame, colors: SignalRenderColors): void {
  context.save();

  for (const peak of frame.peaks) {
    context.globalAlpha = peak.opacity;
    context.strokeStyle = colors.peak;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(peak.x, peak.y, peak.radius, 0, Math.PI * 2);
    context.stroke();
  }

  context.restore();
}
