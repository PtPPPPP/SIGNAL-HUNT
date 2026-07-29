import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Dialog, Feedback } from './AdminUI';

type ReturnToDisplayButtonProps = {
  hasUnsavedChanges?: boolean;
};

export function ReturnToDisplayButton({
  hasUnsavedChanges = false,
}: ReturnToDisplayButtonProps) {
  const navigate = useNavigate();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState('');

  const returnToDisplay = async () => {
    setConfirmLeave(false);
    setError('');

    try {
      if (window.signalHuntDesktop) {
        await window.signalHuntDesktop.control.focusDisplay();
      } else {
        navigate('/display');
      }
    } catch {
      setError('无法切换到展会大屏，请重试。');
    }
  };

  const handleClick = () => {
    if (hasUnsavedChanges) {
      setConfirmLeave(true);
      return;
    }
    void returnToDisplay();
  };

  return (
    <>
      <div className="return-display-control">
        <Button variant="secondary" onClick={handleClick}>
          返回展会大屏
        </Button>
        {error ? <Feedback tone="danger">{error}</Feedback> : null}
      </div>
      <Dialog
        open={confirmLeave}
        role="alertdialog"
        onClose={() => setConfirmLeave(false)}
        title="确认放弃未保存修改"
        description="当前修改尚未保存。离开后，这些修改将丢失。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
              继续编辑
            </Button>
            <Button variant="danger" onClick={() => void returnToDisplay()}>
              放弃修改并返回
            </Button>
          </>
        }
      >
        <p>请确认是否返回展会大屏。</p>
      </Dialog>
    </>
  );
}
