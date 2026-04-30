import {
  getTemplates,
  getSettings,
  getScannedJobs,
  setApplyState,
  getApplyState,
  addApplyHistory,
} from '../shared/storage';
import type { ApplyHistoryItem } from '../shared/types';

// 记录结果并持久化
async function recordResult(state: ApplyState, item: ApplyHistoryItem): Promise<void> {
  state.results.push(item);
  await addApplyHistory(item);
}
import type { ExtensionMessage, ApplyState, ScannedJob, ApplyHistoryItem } from '../shared/types';

// ===== 工具函数 =====

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 获取当前所有 tab ID
async function getCurrentTabIds(): Promise<Set<number>> {
  const tabs = await chrome.tabs.query({});
  return new Set(tabs.map((t) => t.id!).filter(Boolean));
}

// 等待新 tab 出现并返回其 ID
async function waitForNewTab(existingIds: Set<number>, timeoutMs = 10000): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (t.id && !existingIds.has(t.id)) {
        return t.id;
      }
    }
    await sleep(300);
  }
  return null;
}

// 等待 tab 加载完成
async function waitForTabLoaded(tabId: number, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') return true;
    } catch {
      return false; // tab 已关闭
    }
    await sleep(500);
  }
  return false;
}

// ===== 消息路由 =====

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    switch (message.type) {
      case 'GET_STATE': {
        Promise.all([getTemplates(), getApplyState(), getScannedJobs()]).then(
          ([templates, state, jobs]) => {
            sendResponse({ templates, applyState: state, scannedJobs: jobs });
          }
        );
        return true;
      }

      case 'APPLY_BATCH': {
        sendResponse({ success: true });
        handleBatchApply(message.payload.jobs, message.payload.templateId).catch((err) => {
          console.error('[批量投递] 异常:', err);
        });
        return false;
      }

      case 'CANCEL_APPLY': {
        cancelBatch();
        sendResponse({ success: true });
        return false;
      }

      case 'PAUSE_APPLY': {
        isPaused = true;
        sendResponse({ success: true });
        return false;
      }

      case 'RESUME_APPLY': {
        isPaused = false;
        if (resumeResolve) resumeResolve();
        sendResponse({ success: true });
        return false;
      }

      default:
        return false;
    }
  }
);

// ===== 状态管理 =====

let isCancelled = false;
let isPaused = false;
let resumeResolve: (() => void) | null = null;

function cancelBatch(): void {
  isCancelled = true;
  isPaused = false;
  if (resumeResolve) resumeResolve();
}

// ===== 批量投递主流程 =====

async function handleBatchApply(jobs: ScannedJob[], templateId: string): Promise<void> {
  // 获取搜索页 tab
  const [searchTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!searchTab?.id) {
    console.error('[批量投递] 未找到活动标签页');
    return;
  }
  const searchTabId = searchTab.id;

  isCancelled = false;
  isPaused = false;

  const settings = await getSettings();

  const state: ApplyState = {
    isRunning: true,
    isPaused: false,
    currentJobIndex: 0,
    totalJobs: jobs.length,
    results: [],
    startedAt: Date.now(),
  };
  await setApplyState(state);
  notifyProgress(0, jobs.length, '准备', 'success', '开始批量投递...');

  // 已点击过的职位 ID（本批次内去重）
  const clickedJobIds = new Set<string>();

  for (let i = 0; i < jobs.length; i++) {
    if (isCancelled) break;

    // 暂停等待
    if (isPaused) {
      state.isPaused = true;
      await setApplyState(state);
      await new Promise<void>((resolve) => { resumeResolve = resolve; });
      resumeResolve = null;
      state.isPaused = false;
      isPaused = false;
    }

    const job = jobs[i];

    // 跳过已投递的（扫描时标记的 + 本批次已点击的）
    if (job.alreadyApplied || clickedJobIds.has(job.id)) {
      await recordResult(state, {
        jobId: job.id, companyName: job.company, jobTitle: job.title, detailUrl: job.detailUrl,
        templateUsed: '', greetingSent: '', status: 'already_applied', timestamp: Date.now(),
      });
      state.currentJobIndex = i + 1;
      await setApplyState(state);
      notifyProgress(i + 1, jobs.length, job.title, 'already_applied');
      continue;
    }

    notifyProgress(i + 1, jobs.length, job.title, 'success', '点击投递...');

    try {
      // 1. 记录当前所有 tab
      const existingTabIds = await getCurrentTabIds();

      // 2. 通知 content script 点击按钮
      const clickResult = await chrome.tabs.sendMessage(searchTabId, {
        type: 'APPLY_SINGLE',
        payload: { job, templateContent: '' },
      });

      if (!clickResult?.clicked) {
        await recordResult(state, {
          jobId: job.id, companyName: job.company, jobTitle: job.title, detailUrl: job.detailUrl,
          templateUsed: '', greetingSent: '',
          status: 'error',
          errorMessage: clickResult?.error || '点击失败',
          timestamp: Date.now(),
        });
        state.currentJobIndex = i + 1;
        await setApplyState(state);
        notifyProgress(i + 1, jobs.length, job.title, 'error', clickResult?.error || '点击失败');
        continue;
      }

      // 3. 等待新 tab 打开
      const newTabId = await waitForNewTab(existingTabIds, 10000);
      if (!newTabId) {
        // 可能没有新tab（已经在当前窗口投递过了）
        clickedJobIds.add(job.id);
        await recordResult(state, {
          jobId: job.id, companyName: job.company, jobTitle: job.title, detailUrl: job.detailUrl,
          templateUsed: '', greetingSent: '', status: 'success', timestamp: Date.now(),
        });
        state.currentJobIndex = i + 1;
        await setApplyState(state);
        notifyProgress(i + 1, jobs.length, job.title, 'success');
        continue;
      }

      // 4. 等待新 tab 加载完成
      const loaded = await waitForTabLoaded(newTabId, 15000);
      if (loaded) {
        // 额外等一小会确保投递成功展示
        await sleep(1500);
      }

      // 5. 关闭新 tab
      try {
        await chrome.tabs.remove(newTabId);
      } catch {
        // tab 可能已经被关闭
      }

      // 6. 标记已点击
      clickedJobIds.add(job.id);
      await recordResult(state, {
        jobId: job.id, companyName: job.company, jobTitle: job.title, detailUrl: job.detailUrl,
        templateUsed: '', greetingSent: '', status: 'success', timestamp: Date.now(),
      });
      state.currentJobIndex = i + 1;
      await setApplyState(state);
      notifyProgress(i + 1, jobs.length, job.title, 'success');

    } catch (err) {
      await recordResult(state, {
        jobId: job.id, companyName: job.company, jobTitle: job.title, detailUrl: job.detailUrl,
        templateUsed: '', greetingSent: '',
        status: 'error',
        errorMessage: err instanceof Error ? err.message : '未知错误',
        timestamp: Date.now(),
      });
      state.currentJobIndex = i + 1;
      await setApplyState(state);
      notifyProgress(i + 1, jobs.length, job.title, 'error',
        err instanceof Error ? err.message : '未知错误');
    }

    // 间隔延迟
    const delay =
      Math.floor(
        Math.random() * (settings.delayBetweenJobs.max - settings.delayBetweenJobs.min + 1)
      ) + settings.delayBetweenJobs.min;
    await sleep(delay);
  }

  state.isRunning = false;
  state.isPaused = false;
  await setApplyState(state);
  notifyProgress(jobs.length, jobs.length, '完成', 'success', '批量投递已完成');
}

function notifyProgress(
  current: number,
  total: number,
  currentJob: string,
  status: string,
  message?: string
): void {
  chrome.runtime.sendMessage({
    type: 'APPLY_PROGRESS',
    payload: { current, total, currentJob, status, message },
  }).catch(() => {});
}

console.log('[智联自动投递] Background service worker started');
