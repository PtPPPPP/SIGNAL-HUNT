import { AdminButton } from '../../../../components/ui/AdminUI';

type StrategyPresetPanelProps = {
  onBalancedRelease: () => void;
};

export function StrategyPresetPanel({ onBalancedRelease }: StrategyPresetPanelProps) {
  return (
    <section className="admin-panel strategy-preset-panel">
      <div className="admin-panel-header">
        <div>
          <p>快速策略</p>
          <h2>先给运营人员一个清晰入口</h2>
        </div>
      </div>
      <div className="strategy-preset-grid">
        <article>
          <strong>保守发放</strong>
          <span>适合大奖少、高价值礼品。</span>
        </article>
        <article>
          <strong>均匀发放</strong>
          <span>推荐默认，尽量让奖项按展会进度释放。</span>
          <AdminButton variant="secondary" onClick={onBalancedRelease}>
            预览均匀策略
          </AdminButton>
        </article>
        <article>
          <strong>快速引流</strong>
          <span>适合展会前期快速吸引人流。</span>
        </article>
        <article>
          <strong>自定义</strong>
          <span>需要时再进入智能或高级模式。</span>
        </article>
      </div>
    </section>
  );
}
