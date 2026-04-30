import React from 'react';
import type { ScannedJob } from '../../shared/types';

interface JobListProps {
  jobs: ScannedJob[];
  selectedJobs: Set<string>;
  onToggleJob: (jobId: string) => void;
  onSelectAll: (selected: boolean) => void;
}

const tagStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  marginRight: '4px',
  backgroundColor: '#f0f0f0',
  borderRadius: '3px',
  fontSize: '11px',
  color: '#666',
};

export default function JobList({ jobs, selectedJobs, onToggleJob, onSelectAll }: JobListProps) {
  if (jobs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px', color: '#999', fontSize: '13px' }}>
        暂无职位数据，请打开智联招聘搜索页并点击"扫描"
      </div>
    );
  }

  const allSelected = selectedJobs.size === jobs.length;

  return (
    <div style={{ marginBottom: '12px', maxHeight: '300px', overflowY: 'auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '8px',
          padding: '4px 0',
          borderBottom: '1px solid #eee',
        }}
      >
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onSelectAll(e.target.checked)}
          style={{ marginRight: '8px' }}
        />
        <span style={{ fontSize: '12px', color: '#666' }}>全选</span>
      </div>

      {jobs.map((job) => (
        <div
          key={job.id}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            padding: '8px 0',
            borderBottom: '1px solid #f5f5f5',
            opacity: job.alreadyApplied ? 0.5 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={selectedJobs.has(job.id)}
            onChange={() => onToggleJob(job.id)}
            disabled={job.alreadyApplied}
            style={{ marginRight: '8px', marginTop: '2px', flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>
              {job.title}
              {job.alreadyApplied && (
                <span style={{ color: '#999', fontSize: '11px', marginLeft: '6px' }}>已投递</span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '2px' }}>
              {job.company}
            </div>
            <div style={{ fontSize: '12px' }}>
              <span style={{ color: '#e74c3c' }}>{job.salary}</span>
            </div>
            <div style={{ marginTop: '4px' }}>
              {job.location && <span style={tagStyle}>{job.location}</span>}
              {job.experience && <span style={tagStyle}>{job.experience}</span>}
              {job.education && <span style={tagStyle}>{job.education}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
