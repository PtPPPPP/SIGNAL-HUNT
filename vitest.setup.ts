import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement['getContext'];
