import { Button } from '../../../components/ui/AdminUI';
import { BrandMark } from '../../brand/BrandMark';

export function StaffHeader({ onReturn }: { onReturn: () => void }) {
  return (
    <header className="staff-console-header">
      <div className="staff-console-header__brand">
        <BrandMark variant="on-dark" />
        <div>
          <p>现场工作人员 · SIGNAL HUNT</p>
          <h1>发奖控制台</h1>
        </div>
      </div>
      <Button variant="secondary" onClick={onReturn}>
        返回展会大屏
      </Button>
    </header>
  );
}
