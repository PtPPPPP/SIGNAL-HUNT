import { AdminButton } from '../../../../components/ui/AdminUI';
import type { PacingMode } from '../types';

type PacingModeTabsProps = {
  mode: PacingMode;
  onChange: (mode: PacingMode) => void;
};

export function PacingModeTabs({ mode, onChange }: PacingModeTabsProps) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <div>
          <p>配置模式</p>
          <h2>按运营复杂度切换</h2>
        </div>
        <div className="pacing-mode-tabs" aria-label="设置模式">
          <AdminButton variant={mode === 'simple' ? 'primary' : 'secondary'} onClick={() => onChange('simple')}>
            简单模式
          </AdminButton>
          <AdminButton variant={mode === 'smart' ? 'primary' : 'secondary'} onClick={() => onChange('smart')}>
            智能模式
          </AdminButton>
          <AdminButton variant={mode === 'advanced' ? 'primary' : 'secondary'} onClick={() => onChange('advanced')}>
            高级模式
          </AdminButton>
        </div>
      </div>
    </section>
  );
}
