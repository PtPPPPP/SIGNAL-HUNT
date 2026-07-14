import type { PacingMode } from '../types';

type PacingModeTabsProps = {
  mode: PacingMode;
  onChange: (mode: PacingMode) => void;
};

const modes: ReadonlyArray<{ value: PacingMode; label: string; description: string }> = [
  { value: 'simple', label: '简单模式', description: '只配置基础概率和库存锁定，适合快速调整。' },
  { value: 'smart', label: '智能模式', description: '增加发放方式、中奖间隔和闭展前追赶。' },
  { value: 'advanced', label: '高级模式', description: '在智能模式基础上开放算法响应参数。' },
];

export function PacingModeTabs({ mode, onChange }: PacingModeTabsProps) {
  return (
    <section className="admin-panel pacing-mode-panel" aria-labelledby="pacing-mode-title">
      <div className="admin-panel-header probability-section-heading">
        <div>
          <p>策略模式选择</p>
          <h2 id="pacing-mode-title">选择本次需要配置的复杂度</h2>
        </div>
      </div>
      <div className="pacing-mode-grid" role="group" aria-label="设置模式">
        {modes.map((option) => (
          <button
            className={`pacing-mode-card${mode === option.value ? ' selected' : ''}`}
            type="button"
            aria-label={option.label}
            aria-pressed={mode === option.value}
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
