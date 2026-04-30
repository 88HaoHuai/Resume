// 浮动面板 — 可拖拽、可折叠的页面内控制面板

import type { ScannedJob, GreetingTemplate, ApplyState, ExtensionMessage } from '../shared/types';
import { sendToBackground } from '../shared/messages';
import { scanCurrentPage } from './scanner';
import { detectPageType } from './selectors';

const PANEL_ID = 'zhaopin-auto-apply-panel';
const POSITION_KEY = 'zhaopin_panel_position';

// ===== 状态 =====

let jobs: ScannedJob[] = [];
let selectedJobs = new Set<string>();
let templates: GreetingTemplate[] = [];
let selectedTemplateId = '';
let applyState: ApplyState | null = null;
let isRunning = false;
let isPaused = false;
let panelVisible = true;
let isMinimized = false;
let filterKeyword = loadKeyword('filter') || '';
let excludeKeyword = loadKeyword('exclude') || '';

function loadKeyword(type: string): string | null {
  try { return localStorage.getItem('zhaopin_' + type + '_kw'); } catch { return null; }
}
function saveKeywords(): void {
  try {
    localStorage.setItem('zhaopin_filter_kw', filterKeyword);
    localStorage.setItem('zhaopin_exclude_kw', excludeKeyword);
  } catch {}
}

// ===== 位置持久化 =====

interface PanelPosition {
  left: number;
  top: number;
}

function loadPosition(): PanelPosition {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { left: window.innerWidth - 440, top: 80 };
}

function savePosition(left: number, top: number): void {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ left, top }));
  } catch {}
}

const pos = loadPosition();

// ===== 面板 HTML =====

function buildPanel(): HTMLElement {
  const container = document.createElement('div');
  container.id = PANEL_ID;
  container.innerHTML = `
    <style>
      #${PANEL_ID} {
        position: fixed;
        left: ${pos.left}px;
        top: ${pos.top}px;
        z-index: 2147483647;
        width: 380px;
        background: #fff;
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
        font-size: 13px;
        color: #333;
        user-select: none;
        transition: opacity 0.2s, transform 0.2s;
      }
      #${PANEL_ID}.minimized .panel-body { display: none; }
      #${PANEL_ID}.minimized { width: auto; }
      #${PANEL_ID}.hidden { opacity: 0; pointer-events: none; transform: scale(0.95); }

      .panel-header {
        display: flex;
        align-items: center;
        padding: 10px 14px;
        background: linear-gradient(135deg, #4361ee, #3aafe6);
        border-radius: 10px 10px 0 0;
        cursor: move;
        color: #fff;
        font-weight: 600;
        font-size: 14px;
      }
      .minimized .panel-header { border-radius: 10px; }

      .panel-header .title {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .panel-header .btn-icon {
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(255,255,255,0.2);
        color: #fff;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: 6px;
        transition: background 0.15s;
        flex-shrink: 0;
      }
      .panel-header .btn-icon:hover { background: rgba(255,255,255,0.35); }

      .panel-body {
        max-height: 420px;
        overflow-y: auto;
        padding: 12px 14px;
      }
      .panel-body::-webkit-scrollbar { width: 5px; }
      .panel-body::-webkit-scrollbar-thumb { background: #d0d0d0; border-radius: 3px; }

      .section { margin-bottom: 10px; }

      .btn {
        width: 100%;
        padding: 8px 14px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: background 0.15s, opacity 0.15s;
      }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-primary { background: #4361ee; color: #fff; }
      .btn-primary:hover:not(:disabled) { background: #3a56d4; }
      .btn-success { background: #27ae60; color: #fff; }
      .btn-success:hover:not(:disabled) { background: #219a52; }
      .btn-warning { background: #f39c12; color: #fff; }
      .btn-danger { background: #e74c3c; color: #fff; }

      .job-item {
        display: flex;
        align-items: flex-start;
        padding: 8px 0;
        border-bottom: 1px solid #f0f0f0;
        cursor: pointer;
        transition: background 0.1s;
      }
      .job-item:hover { background: #f8f9fa; }
      .job-item.applied { opacity: 0.45; pointer-events: none; }
      .job-item input[type=checkbox] { margin-right: 8px; margin-top: 2px; flex-shrink: 0; }

      .job-info { flex: 1; min-width: 0; }
      .job-title { font-size: 13px; font-weight: 500; margin-bottom: 2px; }
      .job-meta { font-size: 11px; color: #888; }
      .job-salary { color: #e74c3c; font-size: 12px; }

      .progress-wrap { margin-bottom: 8px; }
      .progress-bar {
        height: 6px;
        background: #eee;
        border-radius: 3px;
        overflow: hidden;
        margin-top: 4px;
      }
      .progress-fill {
        height: 100%;
        background: #27ae60;
        border-radius: 3px;
        transition: width 0.3s;
      }
      .progress-fill.paused { background: #f39c12; }

      .badge {
        display: inline-block;
        padding: 1px 6px;
        margin-right: 3px;
        background: #f0f0f0;
        border-radius: 3px;
        font-size: 10px;
        color: #888;
      }

      select {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 12px;
        background: #fff;
      }

      .stats { display: flex; gap: 12px; font-size: 11px; margin-top: 4px; }
      .stats .ok { color: #27ae60; }
      .stats .skip { color: #999; }
      .stats .err { color: #e74c3c; }
    </style>

    <div class="panel-header" id="panel-drag-handle">
      <span class="title">🤖 智联自动投递</span>
      <span id="panel-job-count" style="font-size:11px;opacity:0.85;margin-right:8px;white-space:nowrap;"></span>
      <button class="btn-icon" id="btn-minimize" title="折叠/展开">−</button>
      <button class="btn-icon" id="btn-toggle" title="隐藏面板" style="font-size:13px;">×</button>
    </div>

    <div class="panel-body">
      <!-- 进度条 -->
      <div class="section progress-wrap" id="progress-section" style="display:none;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#666;">
          <span id="progress-text">0/0</span>
          <span id="progress-percent">0%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
        <div id="progress-status" style="font-size:11px;color:#666;margin-top:2px;"></div>
        <div class="stats" id="progress-stats"></div>
      </div>

      <!-- 扫描按钮 -->
      <div class="section" id="scan-section">
        <button class="btn btn-primary" id="btn-scan">🔍 扫描当前页职位</button>
        <div id="scan-info" style="font-size:11px;color:#888;margin-top:4px;text-align:center;"></div>
      </div>

      <!-- 模板选择 -->
      <div class="section" id="template-section" style="display:none;">
        <div style="font-size:11px;color:#888;margin-bottom:4px;">招呼语模板：</div>
        <select id="template-select"></select>
      </div>

      <!-- 职位列表 -->
      <div class="section" id="job-list-section" style="display:none;">
        <!-- 关键字筛选 -->
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <input type="text" id="filter-input" placeholder="🔍 包含关键字..." style="flex:1;padding:6px 10px;border:1px solid #4caf50;border-radius:6px;font-size:12px;box-sizing:border-box;">
          <input type="text" id="exclude-input" placeholder="✕ 排除关键字..." style="flex:1;padding:6px 10px;border:1px solid #e74c3c;border-radius:6px;font-size:12px;box-sizing:border-box;">
        </div>
        <div style="display:flex;align-items:center;margin-bottom:6px;">
          <label style="font-size:11px;color:#888;cursor:pointer;">
            <input type="checkbox" id="select-all" style="margin-right:4px;"> 全选
          </label>
          <span style="flex:1;"></span>
          <span id="job-count" style="font-size:11px;color:#888;"></span>
        </div>
        <div id="job-list" style="max-height:220px;overflow-y:auto;"></div>
      </div>

      <!-- 控制按钮 -->
      <div class="section" id="controls-section" style="display:none;">
        <div id="controls-buttons" style="display:flex;gap:8px;"></div>
      </div>
    </div>
  `;

  return container;
}

// ===== 渲染函数 =====

function getFilteredJobs(): ScannedJob[] {
  let result = jobs;

  // 包含筛选
  const includeKw = filterKeyword.trim().toLowerCase();
  if (includeKw) {
    const kws = includeKw.split(/\s+/);
    result = result.filter(j =>
      kws.every(kw =>
        j.title.toLowerCase().includes(kw) ||
        j.company.toLowerCase().includes(kw) ||
        j.location.toLowerCase().includes(kw) ||
        j.tags.some(t => t.toLowerCase().includes(kw))
      )
    );
  }

  // 排除筛选
  const excludeKw = excludeKeyword.trim().toLowerCase();
  if (excludeKw) {
    const kws = excludeKw.split(/\s+/);
    result = result.filter(j =>
      !kws.some(kw =>
        j.title.toLowerCase().includes(kw) ||
        j.company.toLowerCase().includes(kw) ||
        j.location.toLowerCase().includes(kw) ||
        j.tags.some(t => t.toLowerCase().includes(kw))
      )
    );
  }

  return result;
}

// 高亮匹配的关键字
function highlightMatch(text: string, keyword: string): string {
  if (!keyword.trim()) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const kw = escapeHtml(keyword.trim());
  const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(regex, '<mark style="background:#fff3b0;color:#333;padding:0 1px;border-radius:2px;">$1</mark>');
}

function escapeHtml(str: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

function renderJobList(): void {
  const listEl = document.getElementById('job-list');
  const countEl = document.getElementById('job-count');
  if (!listEl || !countEl) return;

  const filtered = getFilteredJobs();
  const totalSelectedInFilter = filtered.filter(j => selectedJobs.has(j.id)).length;

  const hasFilter = filterKeyword || excludeKeyword;
  countEl.textContent = hasFilter
    ? `筛选 ${filtered.length}/${jobs.length}，选 ${totalSelectedInFilter} 个`
    : `共 ${jobs.length} 个，选 ${selectedJobs.size} 个`;

  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#999;font-size:12px;">无匹配职位</div>';
    return;
  }

  listEl.innerHTML = filtered.map(job => `
    <div class="job-item${job.alreadyApplied ? ' applied' : ''}" data-job-id="${job.id}">
      <input type="checkbox" ${selectedJobs.has(job.id) ? 'checked' : ''} ${job.alreadyApplied ? 'disabled' : ''}>
      <div class="job-info">
        <div class="job-title">
          ${highlightMatch(job.title, filterKeyword)}
          ${job.alreadyApplied ? '<span style="color:#999;font-size:10px;margin-left:4px;">已投递</span>' : ''}
        </div>
        <div class="job-meta">${highlightMatch(job.company, filterKeyword)}</div>
        <div style="font-size:12px;">
          <span class="job-salary">${job.salary}</span>
          ${job.location ? `<span class="badge">${highlightMatch(job.location, filterKeyword)}</span>` : ''}
          ${job.experience ? `<span class="badge">${job.experience}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');

  // 绑定点击事件
  listEl.querySelectorAll('.job-item').forEach(item => {
    const jobId = item.getAttribute('data-job-id')!;
    const checkbox = item.querySelector('input[type=checkbox]') as HTMLInputElement;
    item.addEventListener('click', (e) => {
      if (e.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
      toggleJob(jobId);
    });
    checkbox.addEventListener('change', () => toggleJob(jobId));
  });
}

function renderTemplateSelect(): void {
  const sel = document.getElementById('template-select') as HTMLSelectElement;
  if (!sel) return;
  sel.innerHTML = templates.map(t =>
    `<option value="${t.id}" ${t.id === selectedTemplateId ? 'selected' : ''}>${t.name}${t.isDefault ? ' (默认)' : ''}</option>`
  ).join('');
  sel.addEventListener('change', () => {
    selectedTemplateId = sel.value;
  });
}

function renderProgress(): void {
  const section = document.getElementById('progress-section');
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  const percent = document.getElementById('progress-percent');
  const status = document.getElementById('progress-status');
  const stats = document.getElementById('progress-stats');

  if (!applyState || !isRunning) {
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = 'block';
  const current = applyState.currentJobIndex;
  const total = applyState.totalJobs;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  if (text) text.textContent = `${current}/${total}`;
  if (percent) percent.textContent = `${pct}%`;
  if (fill) {
    fill.style.width = `${pct}%`;
    fill.className = 'progress-fill' + (isPaused ? ' paused' : '');
  }

  const suc = applyState.results.filter(r => r.status === 'success').length;
  const skip = applyState.results.filter(r => r.status === 'already_applied').length;
  const err = applyState.results.filter(r => r.status === 'error').length;
  if (stats) stats.innerHTML = `<span class="ok">✓ ${suc}</span><span class="skip">− ${skip}</span><span class="err">✗ ${err}</span>`;
}

function renderControls(): void {
  const container = document.getElementById('controls-buttons');
  const scanSection = document.getElementById('scan-section');
  const templateSection = document.getElementById('template-section');
  const jobListSection = document.getElementById('job-list-section');
  const controlsSection = document.getElementById('controls-section');

  if (!container) return;

  if (isRunning) {
    if (scanSection) scanSection.style.display = 'none';
    if (templateSection) templateSection.style.display = 'none';
    if (jobListSection) jobListSection.style.display = 'none';
    if (controlsSection) controlsSection.style.display = 'block';

    if (isPaused) {
      container.innerHTML = `
        <button class="btn btn-success" id="btn-resume" style="flex:1;">▶ 继续</button>
        <button class="btn btn-danger" id="btn-cancel">✕ 取消</button>
      `;
    } else {
      container.innerHTML = `
        <button class="btn btn-warning" id="btn-pause" style="flex:1;">⏸ 暂停</button>
        <button class="btn btn-danger" id="btn-cancel">✕ 取消</button>
      `;
    }
  } else {
    if (scanSection) scanSection.style.display = 'block';
    if (templateSection) templateSection.style.display = templates.length > 0 ? 'block' : 'none';
    if (jobListSection) jobListSection.style.display = jobs.length > 0 ? 'block' : 'none';
    if (controlsSection) controlsSection.style.display = jobs.length > 0 ? 'block' : 'none';

    container.innerHTML = `
      <button class="btn btn-success" id="btn-apply" style="flex:1;" ${selectedJobs.size === 0 ? 'disabled' : ''}>
        🚀 一键投递 (${selectedJobs.size})
      </button>
    `;
  }
}

function updateUI(): void {
  renderJobList();
  renderTemplateSelect();
  renderProgress();
  renderControls();
}

// ===== 业务逻辑 =====

function toggleJob(jobId: string): void {
  const next = new Set(selectedJobs);
  if (next.has(jobId)) next.delete(jobId);
  else next.add(jobId);
  selectedJobs = next;
  renderJobList();
  renderControls();
}

async function handleScan(): Promise<void> {
  const btn = document.getElementById('btn-scan');
  const info = document.getElementById('scan-info');
  if (btn) { btn.textContent = '⏳ 扫描中...'; (btn as HTMLButtonElement).disabled = true; }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'SCAN_REQUEST' }); // goes to content script via bg... no, content script receives directly
    // Actually, we're IN the content script. Let's import scan directly.
  } catch {}

  // Fallback: send to self (content script handles SCAN_REQUEST)
  const response = await new Promise<any>((resolve) => {
    chrome.runtime.onMessage.addListener(function handler(msg: any) {
      // This won't work; we need to call scanCurrentPage directly
    });
  });

  if (info) info.textContent = '';
  if (btn) { btn.textContent = '🔍 扫描当前页职位'; (btn as HTMLButtonElement).disabled = false; }
}

// ===== 拖拽 =====

function setupDrag(panel: HTMLElement): void {
  const header = panel.querySelector('.panel-header') as HTMLElement;
  if (!header) return;

  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  header.addEventListener('mousedown', (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // 不拖拽按钮
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = panel.offsetLeft;
    startTop = panel.offsetTop;
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newLeft = startLeft + dx;
    let newTop = startTop + dy;

    // 限制在视口内
    newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, newLeft));
    newTop = Math.max(0, Math.min(window.innerHeight - 40, newTop));

    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    header.style.cursor = 'move';
    savePosition(panel.offsetLeft, panel.offsetTop);
  });
}

// ===== 消息监听 + 存储监听 =====

let batchCompleted = false;

function onBatchComplete(): void {
  batchCompleted = true;
  isRunning = false;
  isPaused = false;
  updateUI();
  setTimeout(refreshJobStates, 1500);
}

function setupMessageListener(): void {
  // 监听进度消息（更新进度条和结果累积）
  chrome.runtime.onMessage.addListener((message: any) => {
    if (message.type === 'APPLY_PROGRESS') {
      const { current, total, currentJob, status, message: msg } = message.payload;

      // 忽略完成的旧批次消息（等待 storage 信号真正结束）
      if (batchCompleted) return;

      // 保持本地 applyState 同步
      if (!applyState) {
        applyState = {
          isRunning: true, isPaused: false,
          currentJobIndex: current, totalJobs: total,
          results: [], startedAt: Date.now(),
        };
      } else if (current >= applyState.currentJobIndex) {
        applyState.currentJobIndex = current;
        applyState.totalJobs = total;
      }

      // 累计结果
      if (status && currentJob && currentJob !== '准备' && currentJob !== '完成') {
        const exists = applyState.results.some(
          r => r.jobTitle === currentJob && r.timestamp > Date.now() - 120000
        );
        if (!exists) {
          applyState.results.push({
            jobId: '', companyName: '', jobTitle: currentJob,
            templateUsed: '', greetingSent: '', detailUrl: '',
            status: status, timestamp: Date.now(),
          });
        }
      }

      isRunning = true;
      isPaused = false;

      const statusText = document.getElementById('progress-status');
      if (statusText) {
        statusText.textContent = msg || currentJob || '';
      }
      updateUI();
    }
    if (message.type === 'VERIFICATION_REQUIRED') {
      alert(`验证码提示: ${message.payload.message}\n职位: ${message.payload.jobTitle}`);
    }
  });

  // 监听 storage 变化：apply_state.isRunning 变为 false 即批次真正结束
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.apply_state) {
      const newState = changes.apply_state.newValue as ApplyState | null;
      if (newState && !newState.isRunning && !batchCompleted) {
        applyState = newState;
        onBatchComplete();
      }
      // 如果状态被清除（null），也结束
      if (!newState && !batchCompleted) {
        onBatchComplete();
      }
    }
  });
}

async function refreshJobStates(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'SCAN_REQUEST' });
    if (response?.payload?.jobs) {
      // Only update applied states, don't replace the list
    }
  } catch {}
}

// ===== 按钮事件绑定 =====

function setupButtons(): void {
  document.getElementById('btn-minimize')?.addEventListener('click', () => {
    isMinimized = !isMinimized;
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.className = isMinimized ? 'minimized' : '';
      (document.getElementById('btn-minimize') as HTMLElement).textContent = isMinimized ? '+' : '−';
    }
  });

  document.getElementById('btn-toggle')?.addEventListener('click', () => {
    panelVisible = !panelVisible;
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.className = panelVisible ? (isMinimized ? 'minimized' : '') : 'hidden';
    }
    // 显示一个小圆点用于重新打开
    showToggleDot(!panelVisible);
  });

  // 扫描按钮 — 直接调用扫描函数（浮动面板在 content script 上下文中）
  document.getElementById('btn-scan')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-scan') as HTMLButtonElement;
    const info = document.getElementById('scan-info');
    btn.textContent = '⏳ 扫描中...';
    btn.disabled = true;

    try {
      if (detectPageType() !== 'search') {
        if (info) info.textContent = '请在智联招聘搜索页使用此功能';
        btn.textContent = '🔍 扫描当前页职位';
        btn.disabled = false;
        return;
      }

      const result = scanCurrentPage();
      jobs = result.jobs;
      selectedJobs = new Set();
      filterKeyword = '';
      excludeKeyword = '';
      saveKeywords();
      const filterInput = document.getElementById('filter-input') as HTMLInputElement;
      const excludeInput = document.getElementById('exclude-input') as HTMLInputElement;
      if (filterInput) filterInput.value = '';
      if (excludeInput) excludeInput.value = '';
      updateUI();

      if (info) {
        info.textContent = `已扫描 ${jobs.length} 个职位（第 ${result.pageNumber}/${result.totalPages} 页）`;
      }
    } catch (e) {
      if (info) info.textContent = '扫描失败，请刷新页面重试';
    }

    btn.textContent = '🔍 重新扫描';
    btn.disabled = false;
  });

  // 一键投递
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.id === 'btn-apply') {
      const selected = jobs.filter(j => selectedJobs.has(j.id));
      if (selected.length === 0) return;
      try {
        // 重置本地状态
        batchCompleted = false;
        applyState = {
          isRunning: true,
          isPaused: false,
          currentJobIndex: 0,
          totalJobs: selected.length,
          results: [],
          startedAt: Date.now(),
        };
        isRunning = true;
        isPaused = false;
        updateUI();
        await sendToBackground({
          type: 'APPLY_BATCH',
          payload: { jobs: selected, templateId: selectedTemplateId },
        });
      } catch (err) {
        console.error('投递启动失败:', err);
      }
    }
    if (target.id === 'btn-cancel') {
      await sendToBackground({ type: 'CANCEL_APPLY' });
      isRunning = false;
      isPaused = false;
      updateUI();
    }
    if (target.id === 'btn-pause') {
      await sendToBackground({ type: 'PAUSE_APPLY' });
      isPaused = true;
      updateUI();
    }
    if (target.id === 'btn-resume') {
      await sendToBackground({ type: 'RESUME_APPLY' });
      isPaused = false;
      updateUI();
    }
  });

  // 全选 — 只影响筛选后的职位
  document.getElementById('select-all')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    const filtered = getFilteredJobs().filter(j => !j.alreadyApplied);
    const next = new Set(selectedJobs);
    if (checked) {
      filtered.forEach(j => next.add(j.id));
    } else {
      filtered.forEach(j => next.delete(j.id));
    }
    selectedJobs = next;
    updateUI();
  });

  // 关键字筛选
  document.getElementById('filter-input')?.addEventListener('input', (e) => {
    filterKeyword = (e.target as HTMLInputElement).value;
    saveKeywords();
    updateUI();
  });

  // 排除关键字
  document.getElementById('exclude-input')?.addEventListener('input', (e) => {
    excludeKeyword = (e.target as HTMLInputElement).value;
    saveKeywords();
    updateUI();
  });
}

// 显示/隐藏小圆点（面板隐藏时提供恢复入口）
function showToggleDot(show: boolean): void {
  let dot = document.getElementById('zhaopin-toggle-dot');
  if (show) {
    if (!dot) {
      dot = document.createElement('div');
      dot.id = 'zhaopin-toggle-dot';
      dot.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
        width: 40px; height: 40px; border-radius: 50%;
        background: linear-gradient(135deg, #4361ee, #3aafe6);
        box-shadow: 0 4px 16px rgba(67,97,238,0.4);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 18px; color: #fff; transition: transform 0.2s;
      `;
      dot.textContent = '🤖';
      dot.title = '显示自动投递面板';
      dot.addEventListener('click', () => {
        panelVisible = true;
        const panel = document.getElementById(PANEL_ID);
        if (panel) panel.className = isMinimized ? 'minimized' : '';
        showToggleDot(false);
      });
      document.body.appendChild(dot);
    }
    dot.style.display = 'flex';
  } else if (dot) {
    dot.style.display = 'none';
  }
}

// ===== 初始化 =====

async function init(): Promise<void> {
  const panel = buildPanel();
  document.body.appendChild(panel);

  setupDrag(panel);
  setupButtons();
  setupMessageListener();

  // 加载初始数据
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (state?.templates) {
      templates = state.templates;
      if (templates.length > 0) {
        const def = templates.find(t => t.isDefault) || templates[0];
        selectedTemplateId = def.id;
      }
    }
    if (state?.scannedJobs) jobs = state.scannedJobs;
    if (state?.applyState) {
      applyState = state.applyState;
      isRunning = applyState.isRunning;
      isPaused = applyState.isPaused;
      if (!isRunning) batchCompleted = true;
    }
    updateUI();
  } catch {}

  // 恢复已保存的关键字
  const filterInput = document.getElementById('filter-input') as HTMLInputElement;
  const excludeInput = document.getElementById('exclude-input') as HTMLInputElement;
  if (filterInput && filterKeyword) filterInput.value = filterKeyword;
  if (excludeInput && excludeKeyword) excludeInput.value = excludeKeyword;

  console.log('[智联自动投递] 浮动面板已就绪');
}

// 在 DOM ready 后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
