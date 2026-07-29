import {
  Button,
  StickyActionBar,
} from '../../../components/ui/AdminUI';
import type { StaffDrawViewModel } from '../staffDrawViewModel';

type StaffActionBarProps = {
  onEndDisplay: () => void;
  onRedeem: () => void;
  onVoid: () => void;
  viewModel: StaffDrawViewModel;
};

export function StaffActionBar({
  onEndDisplay,
  onRedeem,
  onVoid,
  viewModel,
}: StaffActionBarProps) {
  return (
    <StickyActionBar>
      <p className="staff-action-note">
        “结束当前展示”只让大屏回到待机，不改变兑奖或作废状态。
      </p>
      <Button
        variant="secondary"
        disabled={!viewModel.canEndDisplay}
        loading={viewModel.action === 'END'}
        loadingLabel="正在结束展示…"
        onClick={onEndDisplay}
      >
        结束当前展示
      </Button>
      <Button
        variant="danger"
        disabled={!viewModel.canVoid}
        loading={viewModel.action === 'VOID'}
        loadingLabel="正在作废…"
        onClick={onVoid}
      >
        作废记录
      </Button>
      <Button
        disabled={!viewModel.canRedeem}
        loading={viewModel.action === 'REDEEM'}
        loadingLabel="正在确认兑奖…"
        onClick={onRedeem}
      >
        确认兑奖
      </Button>
    </StickyActionBar>
  );
}
