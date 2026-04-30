/**
 * Popup 面板逻辑
 */
document.addEventListener('DOMContentLoaded', async () => {
  // ========== 标签页切换 ==========
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      // 切换到黑名单标签页时自动加载数据
      if (btn.dataset.tab === 'blacklist') {
        loadBlacklistTab();
      }
    });
  });

  // ========== 控制台 ==========
  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  const maxApplyInput = document.getElementById('maxApplyCount');

  const maxCountResult = await chrome.storage.local.get('boss_max_apply_count');
  if (maxCountResult.boss_max_apply_count) {
    maxApplyInput.value = maxCountResult.boss_max_apply_count;
  }

  maxApplyInput.addEventListener('change', async () => {
    const val = Math.max(1, Math.min(500, parseInt(maxApplyInput.value) || 50));
    maxApplyInput.value = val;
    await chrome.storage.local.set({ boss_max_apply_count: val });
  });

  btnStart.addEventListener('click', async () => {
    const maxCount = parseInt(maxApplyInput.value) || 50;
    await chrome.storage.local.set({ boss_max_apply_count: maxCount });
    const resp = await sendMsg({ type: 'start_auto_apply', data: { maxApplyCount: maxCount } });
    if (resp?.success) {
      btnStart.style.display = 'none';
      btnPause.style.display = 'inline-block';
      btnStop.style.display = 'inline-block';
      updateStatusUI('running');
    }
  });

  btnPause.addEventListener('click', async () => {
    await sendMsg({ type: 'pause_auto_apply' });
  });

  btnStop.addEventListener('click', async () => {
    await sendMsg({ type: 'stop_auto_apply' });
    btnStart.style.display = 'inline-block';
    btnPause.style.display = 'none';
    btnStop.style.display = 'none';
    updateStatusUI('idle');
  });

  // ========== 筛选条件 ==========
  const filterResult = await chrome.storage.local.get('boss_auto_filter');
  const filter = filterResult.boss_auto_filter || {};
  document.getElementById('minSalary').value = filter.minSalary || '';
  document.getElementById('maxSalary').value = filter.maxSalary || '';
  document.getElementById('excludeKeywords').value = (filter.excludeKeywords || []).join(', ');
  document.getElementById('includeKeywords').value = (filter.includeKeywords || []).join(', ');
  document.getElementById('onlyActiveHR').checked = filter.onlyActiveHR || false;

  document.getElementById('btnSaveFilter').addEventListener('click', async () => {
    const newFilter = {
      minSalary: parseInt(document.getElementById('minSalary').value) || 0,
      maxSalary: parseInt(document.getElementById('maxSalary').value) || 0,
      excludeKeywords: parseCommaList(document.getElementById('excludeKeywords').value),
      includeKeywords: parseCommaList(document.getElementById('includeKeywords').value),
      onlyActiveHR: document.getElementById('onlyActiveHR').checked,
      companySize: [],
      fundingStage: [],
      experience: [],
      education: [],
    };
    await sendMsg({ type: 'save_filter', data: newFilter });
    showToast('筛选条件已保存');
  });

  // 打开独立黑名单页面
  document.getElementById('btnOpenBlacklist').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('blacklist/blacklist.html') });
  });
  document.getElementById('btnGoBlacklist').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('blacklist/blacklist.html') });
  });

  // ========== 简历 ==========
  await loadResumeTab();
  document.getElementById('btnSaveApiKey').addEventListener('click', async () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    await chrome.storage.local.set({ boss_api_key: key });
    showToast('API Key 已保存');
  });
  document.getElementById('btnOpenDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });

  // ========== 投递记录 ==========
  await loadRecords();
  document.getElementById('btnExport').addEventListener('click', exportCSV);

  // ========== 监听状态更新 ==========
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'status_update') {
      updateStatusUI(msg.data.state);
      if (msg.data.stats) updateStats(msg.data);
      updateButtons(msg.data.state);
    }
    if (msg.type === 'progress_update') {
      updateStats(msg.data);
    }
  });

  await refreshStatus();
  setInterval(refreshStatus, 2000);
});

// ========== 辅助函数 ==========

async function refreshStatus() {
  const data = await chrome.storage.local.get([
    'boss_running_state', 'boss_daily_count', 'boss_daily_date',
  ]);
  const today = new Date().toISOString().split('T')[0];
  const dailyCount = (data.boss_daily_date === today) ? (data.boss_daily_count || 0) : 0;
  const state = data.boss_running_state || 'idle';
  updateStatusUI(state);
  updateButtons(state);
  document.getElementById('dailyCount').textContent = dailyCount;
}

function sendMsg(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

function parseCommaList(str) {
  return str.split(/[,，]/).map(s => s.trim()).filter(Boolean);
}

function updateStatusUI(state) {
  const map = { idle: '就绪', running: '运行中', paused: '已暂停', cooling: '冷却中', error: '出错' };
  document.getElementById('statusDot').className = 'status-dot ' + (state || 'idle');
  document.getElementById('statusText').textContent = map[state] || '未知';
}

function updateStats(data) {
  if (data.dailyCount !== undefined) document.getElementById('dailyCount').textContent = data.dailyCount;
  if (data.stats) {
    document.getElementById('appliedCount').textContent = data.stats.applied || 0;
    document.getElementById('skippedCount').textContent = data.stats.skipped || 0;
  }
}

function updateButtons(state) {
  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  if (state === 'running' || state === 'paused' || state === 'cooling') {
    btnStart.style.display = 'none';
    btnPause.style.display = 'inline-block';
    btnStop.style.display = 'inline-block';
    btnPause.textContent = state === 'paused' ? '▶ 恢复' : '⏸ 暂停';
  } else {
    btnStart.style.display = 'inline-block';
    btnPause.style.display = 'none';
    btnStop.style.display = 'none';
  }
}

async function loadRecords() {
  const resp = await sendMsg({ type: 'get_records' });
  const records = resp?.records || [];
  document.getElementById('recordsCount').textContent = `共 ${records.length} 条记录`;
  const list = document.getElementById('recordsList');
  list.innerHTML = records.slice(0, 100).map(r => `
    <div class="record-item">
      <div class="record-title">${r.jobTitle || '未知职位'}</div>
      <div class="record-company">${r.companyName || ''} · ${r.salary || ''}</div>
      <div class="record-meta">
        <span>${r.timeStr || ''}</span>
      </div>
    </div>
  `).join('') || '<div style="text-align:center;color:#555;padding:20px;">暂无记录</div>';
}

async function exportCSV() {
  const resp = await sendMsg({ type: 'get_records' });
  const records = resp?.records || [];
  if (!records.length) { showToast('暂无记录可导出'); return; }
  const header = '职位,公司,薪资,地点,HR,时间\n';
  const rows = records.map(r =>
    `"${r.jobTitle}","${r.companyName}","${r.salary}","${r.location || ''}","${r.hrName || ''}","${r.timeStr}"`
  ).join('\n');
  const csv = '﻿' + header + rows;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `boss_投递记录_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV 导出成功');
}

async function loadResumeTab() {
  const apiKeyResult = await chrome.storage.local.get('boss_api_key');
  const encryptedKey = apiKeyResult.boss_api_key;
  if (encryptedKey) {
    // Simple XOR decrypt (mirrors ApiKeyService._decrypt)
    try {
      const decoded = atob(encryptedKey);
      const seed = 'boss_resume_optimizer_2024';
      let key = '';
      for (let i = 0; i < decoded.length; i++) {
        key += String.fromCharCode(decoded.charCodeAt(i) ^ seed.charCodeAt(i % seed.length));
      }
      document.getElementById('apiKeyInput').value = key;
    } catch (_) {}
  }

  // Load resume versions for select
  const versionsResult = await chrome.storage.local.get('boss_resume_versions');
  const versions = versionsResult.boss_resume_versions || [];
  const activeIdResult = await chrome.storage.local.get('boss_active_resume_version');
  const activeId = activeIdResult.boss_active_resume_version || 'base';

  const select = document.getElementById('resumeVersionSelect');
  select.innerHTML = versions.map(v =>
    `<option value="${v.id}" ${v.id === activeId ? 'selected' : ''}>${v.isBase ? '⭐ ' : ''}${v.name} (投${v.applyCount || 0}/回${v.responseCount || 0})</option>`
  ).join('') || '<option value="">暂无版本</option>';

  select.addEventListener('change', async () => {
    await chrome.storage.local.set({ boss_active_resume_version: select.value });
    await updateResumePreview(select.value);
  });

  // Preview active version
  const activeVersion = versions.find(v => v.id === activeId);
  const previewEl = document.getElementById('resumePreview');
  if (activeVersion) {
    previewEl.textContent = activeVersion.content
      ? activeVersion.content.substring(0, 300) + (activeVersion.content.length > 300 ? '...' : '')
      : '（空）';
  } else {
    const baseResult = await chrome.storage.local.get('boss_base_resume');
    const base = baseResult.boss_base_resume;
    previewEl.textContent = base ? (base.substring(0, 300) + (base.length > 300 ? '...' : '')) : '未配置简历';
  }
}

async function updateResumePreview(versionId) {
  const versionsResult = await chrome.storage.local.get('boss_resume_versions');
  const versions = versionsResult.boss_resume_versions || [];
  const v = versions.find(v => v.id === versionId);
  const previewEl = document.getElementById('resumePreview');
  if (v && v.content) {
    previewEl.textContent = v.content.substring(0, 300) + (v.content.length > 300 ? '...' : '');
  }
}

function showToast(msg) {
  let toast = document.querySelector('.popup-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'popup-toast';
    toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);padding:8px 16px;background:rgba(0,212,170,0.9);color:#fff;border-radius:8px;font-size:12px;z-index:9999;transition:opacity 0.3s;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = 1;
  setTimeout(() => { toast.style.opacity = 0; }, 2000);
}
