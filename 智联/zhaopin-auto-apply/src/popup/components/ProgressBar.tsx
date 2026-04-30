import React, { useMemo } from 'react';
import type { ApplyHistoryItem } from '../../shared/types';

interface ProgressBarProps {
  current: number;
  total: number;
  isPaused: boolean;
  results: ApplyHistoryItem[];
}

export default function ProgressBar({ current, total, isPaused, results }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  const stats = useMemo(() => {
    return {
      success: results.filter((r) => r.status === 'success').length,
      alreadyApplied: results.filter((r) => r.status === 'already_applied').length,
      error: results.filter((r) => r.status === 'error').length,
    };
  }, [results]);

  return (
    <div style={{ marginBottom: '12px' }}>
      {/* 进度条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: '#666' }}>{current}/{total}</span>
        <div
          style={{
            flex: 1,
            height: '8px',
            backgroundColor: '#eee',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${percent}%`,
              backgroundColor: isPaused ? '#f39c12' : '#27ae60',
              borderRadius: '4px',
              transition: 'width 0.3s',
            }}
          />
        </div>
        <span style={{ fontSize: '12px', color: '#666' }}>{percent}%</span>
      </div>

      {/* 状态文字 */}
      <div style={{ fontSize: '12px', color: isPaused ? '#f39c12' : '#666' }}>
        {isPaused ? '已暂停 — 点击继续按钮恢复' : '投递中...'}
      </div>

      {/* 统计 */}
      <div style={{ marginTop: '4px', display: 'flex', gap: '12px', fontSize: '11px' }}>
        <span style={{ color: '#27ae60' }}>成功 {stats.success}</span>
        <span style={{ color: '#999' }}>已投递 {stats.alreadyApplied}</span>
        <span style={{ color: '#e74c3c' }}>失败 {stats.error}</span>
      </div>
    </div>
  );
}
