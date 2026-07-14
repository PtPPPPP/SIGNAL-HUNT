import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

type ReturnToDisplayButtonProps = {
  hasUnsavedChanges?: boolean;
};

export function ReturnToDisplayButton({ hasUnsavedChanges = false }: ReturnToDisplayButtonProps) {
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
      <button className="return-display-button" type="button" onClick={handleClick}>
        ← 返回展会大屏
      </button>
      {error ? <p className="admin-field-error" role="alert">{error}</p> : null}
      {confirmLeave ? (
        <div className="confirm-card" role="alertdialog" aria-label="确认放弃未保存修改">
          <p>当前修改尚未保存，是否离开？</p>
          <div className="confirm-card-actions">
            <button className="confirm-button-cancel" type="button" onClick={() => setConfirmLeave(false)}>
              继续编辑
            </button>
            <button className="confirm-button-ok" type="button" onClick={() => void returnToDisplay()}>
              放弃修改并返回
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
