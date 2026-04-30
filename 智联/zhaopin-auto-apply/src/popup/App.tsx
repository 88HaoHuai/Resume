import React, { useState, useEffect, useCallback } from 'react';
import type {
  ScannedJob,
  GreetingTemplate,
  ApplyState,
  ExtensionMessage,
} from '../shared/types';
import { sendToBackground, sendToContentScript } from '../shared/messages';
import { getScannedJobs } from '../shared/storage';
import JobList from './components/JobList';
import ApplyControls from './components/ApplyControls';
import TemplateSelector from './components/TemplateSelector';
import ProgressBar from './components/ProgressBar';

export default function App() {
  const [jobs, setJobs] = useState<ScannedJob[]>([]);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [templates, setTemplates] = useState<GreetingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [applyState, setApplyState] = useState<ApplyState | null>(null);
  const [loading, setLoading] = useState(false);
  const [tabId, setTabId] = useState<number | null>(null);

  // 初始化
  useEffect(() => {
    loadInitialState();
    // 监听来自 background 的状态更新
    const listener = (message: ExtensionMessage) => {
      if (message.type === 'APPLY_PROGRESS') {
        setApplyState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            currentJobIndex: message.payload.current,
            totalJobs: message.payload.total,
          };
        });
      }
      if (message.type === 'STATE_UPDATE') {
        setApplyState(message.payload);
      }
      if (message.type === 'VERIFICATION_REQUIRED') {
        // 通知用户需要验证
        alert(`需要验证: ${message.payload.message}\n职位: ${message.payload.jobTitle}`);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function loadInitialState() {
    const [tabs, storedJobs, state] = await Promise.all([
      chrome.tabs.query({ active: true, currentWindow: true }),
      getScannedJobs(),
      chrome.runtime.sendMessage({ type: 'GET_STATE' }) as Promise<{
        templates: GreetingTemplate[];
        applyState: ApplyState | null;
        scannedJobs: ScannedJob[];
      }>,
    ]);

    if (tabs[0]?.id) setTabId(tabs[0].id);

    const allJobs = storedJobs.length > 0 ? storedJobs : state?.scannedJobs || [];
    setJobs(allJobs);

    const tmpls = state?.templates || [];
    setTemplates(tmpls);
    if (tmpls.length > 0 && !selectedTemplateId) {
      const defaultTmpl = tmpls.find((t) => t.isDefault) || tmpls[0];
      setSelectedTemplateId(defaultTmpl.id);
    }

    if (state?.applyState) setApplyState(state.applyState);
  }

  // 扫描职位
  const handleScan = useCallback(async () => {
    setLoading(true);
    try {
      const response = (await sendToContentScript({ type: 'SCAN_REQUEST' })) as {
        type: string;
        payload: { jobs: ScannedJob[]; pageNumber: number; totalPages: number; totalCount: number };
      };
      if (response?.payload?.jobs) {
        setJobs(response.payload.jobs);
      }
    } catch (err) {
      console.error('扫描失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 全选/取消全选
  const handleSelectAll = useCallback(
    (selected: boolean) => {
      if (selected) {
        setSelectedJobs(new Set(jobs.map((j) => j.id)));
      } else {
        setSelectedJobs(new Set());
      }
    },
    [jobs]
  );

  // 单个选择
  const handleToggleJob = useCallback((jobId: string) => {
    setSelectedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  // 开始批量投递
  const handleStartApply = useCallback(async () => {
    const selectedJobList = jobs.filter((j) => selectedJobs.has(j.id));
    if (selectedJobList.length === 0) {
      alert('请先选择要投递的职位');
      return;
    }
    if (!selectedTemplateId) {
      alert('请选择招呼语模板');
      return;
    }

    try {
      await sendToBackground({
        type: 'APPLY_BATCH',
        payload: {
          jobs: selectedJobList,
          templateId: selectedTemplateId,
        },
      });
    } catch (err) {
      console.error('投递启动失败:', err);
    }
  }, [jobs, selectedJobs, selectedTemplateId]);

  // 取消投递
  const handleCancel = useCallback(async () => {
    await sendToBackground({ type: 'CANCEL_APPLY' });
  }, []);

  // 暂停投递
  const handlePause = useCallback(async () => {
    await sendToBackground({ type: 'PAUSE_APPLY' });
  }, []);

  // 恢复投递
  const handleResume = useCallback(async () => {
    await sendToBackground({ type: 'RESUME_APPLY' });
  }, []);

  const isRunning = applyState?.isRunning ?? false;
  const isPaused = applyState?.isPaused ?? false;

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '18px', marginBottom: '12px', color: '#1a73e8' }}>
        智联招聘自动投递
      </h1>

      {/* 扫描按钮 */}
      <div style={{ marginBottom: '12px' }}>
        <button
          onClick={handleScan}
          disabled={loading || isRunning}
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: loading ? '#ccc' : '#1a73e8',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: loading || isRunning ? 'not-allowed' : 'pointer',
            fontSize: '14px',
          }}
        >
          {loading ? '扫描中...' : '扫描当前页职位'}
        </button>
        {jobs.length > 0 && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
            共 {jobs.length} 个职位，已选择 {selectedJobs.size} 个
          </div>
        )}
      </div>

      {/* 进度条 */}
      {applyState && isRunning && (
        <ProgressBar
          current={applyState.currentJobIndex}
          total={applyState.totalJobs}
          isPaused={isPaused}
          results={applyState.results}
        />
      )}

      {/* 模板选择 */}
      {!isRunning && (
        <>
          <TemplateSelector
            templates={templates}
            selectedId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
          />

          {/* 职位列表 */}
          <JobList
            jobs={jobs}
            selectedJobs={selectedJobs}
            onToggleJob={handleToggleJob}
            onSelectAll={handleSelectAll}
          />
        </>
      )}

      {/* 控制按钮 */}
      <ApplyControls
        isRunning={isRunning}
        isPaused={isPaused}
        hasSelection={selectedJobs.size > 0}
        onStart={handleStartApply}
        onCancel={handleCancel}
        onPause={handlePause}
        onResume={handleResume}
      />

      {/* 设置链接 */}
      <div style={{ marginTop: '12px', textAlign: 'center' }}>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{
            background: 'none',
            border: 'none',
            color: '#1a73e8',
            cursor: 'pointer',
            fontSize: '12px',
            textDecoration: 'underline',
          }}
        >
          管理模板和设置
        </button>
      </div>
    </div>
  );
}
