import React from 'react';

interface ApplyControlsProps {
  isRunning: boolean;
  isPaused: boolean;
  hasSelection: boolean;
  onStart: () => void;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
}

const btnBase: React.CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500,
};

export default function ApplyControls({
  isRunning,
  isPaused,
  hasSelection,
  onStart,
  onCancel,
  onPause,
  onResume,
}: ApplyControlsProps) {
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
      {!isRunning && (
        <button
          onClick={onStart}
          disabled={!hasSelection}
          style={{
            ...btnBase,
            flex: 1,
            backgroundColor: hasSelection ? '#27ae60' : '#ccc',
            color: '#fff',
            cursor: hasSelection ? 'pointer' : 'not-allowed',
          }}
        >
          一键投递
        </button>
      )}

      {isRunning && !isPaused && (
        <>
          <button
            onClick={onPause}
            style={{ ...btnBase, backgroundColor: '#f39c12', color: '#fff' }}
          >
            暂停
          </button>
          <button
            onClick={onCancel}
            style={{ ...btnBase, backgroundColor: '#e74c3c', color: '#fff' }}
          >
            取消
          </button>
        </>
      )}

      {isRunning && isPaused && (
        <>
          <button
            onClick={onResume}
            style={{ ...btnBase, flex: 1, backgroundColor: '#27ae60', color: '#fff' }}
          >
            继续投递
          </button>
          <button
            onClick={onCancel}
            style={{ ...btnBase, backgroundColor: '#e74c3c', color: '#fff' }}
          >
            取消
          </button>
        </>
      )}
    </div>
  );
}
