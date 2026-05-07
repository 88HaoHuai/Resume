/**
 * 简历优化中心 — 看板逻辑
 */
(function () {
  'use strict';

  // ========== State ==========
  let currentTab = 'resume';
  let selectedJobId = null;
  let currentAnalysis = null;
  let currentOptimizedResume = null;
  let editorChanged = false;

  // ========== Init ==========
  document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initSettings();
    await checkApiStatus();
    await loadCurrentTab();
  });

  // ========== Tab Switching ==========
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        currentTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('panel-' + currentTab).classList.add('active');
        await loadCurrentTab();
      });
    });
  }

  async function loadCurrentTab() {
    switch (currentTab) {
      case 'resume': await loadResumeTab(); break;
      case 'jobs': await loadJobsTab(); break;
      case 'stats': await loadStatsTab(); break;
    }
  }

  // ========== API Status ==========
  async function checkApiStatus() {
    const hasKey = await ApiKeyService.hasApiKey();
    const el = document.getElementById('apiStatus');
    if (hasKey) {
      el.textContent = '🟢 API 已配置';
      el.style.color = '#34d399';
    } else {
      el.textContent = '🔴 API 未配置';
      el.style.color = '#f87171';
    }
  }

  // ========== Settings Modal ==========
  function initSettings() {
    document.getElementById('btnSettings').addEventListener('click', async () => {
      const config = await ApiKeyService.getApiConfig();
      document.getElementById('apiBaseUrl').value = config.baseUrl || 'https://api.deepseek.com/v1';
      document.getElementById('apiModel').value = config.model || 'deepseek-chat';
      document.getElementById('apiKeyInput').value = (await ApiKeyService.getApiKey()) || '';
      document.getElementById('settingsModal').style.display = 'flex';
    });

    document.getElementById('btnCloseSettings').addEventListener('click', () => {
      document.getElementById('settingsModal').style.display = 'none';
    });

    document.getElementById('btnSaveApiConfig').addEventListener('click', async () => {
      const apiKey = document.getElementById('apiKeyInput').value.trim();
      const baseUrl = document.getElementById('apiBaseUrl').value.trim();
      const model = document.getElementById('apiModel').value;
      await ApiKeyService.saveApiKey(apiKey);
      await ApiKeyService.saveApiConfig({ baseUrl, model });
      await checkApiStatus();
      document.getElementById('settingsModal').style.display = 'none';
      showToast('API 配置已保存');
    });

    document.getElementById('btnValidateKey').addEventListener('click', async () => {
      const apiKey = document.getElementById('apiKeyInput').value.trim();
      if (!apiKey) { showToast('请先输入 API Key', true); return; }
      const resultEl = document.getElementById('apiValidationResult');
      resultEl.innerHTML = '<span style="color:#94a3b8;">验证中...</span>';
      const valid = await ApiKeyService.validateApiKey(apiKey);
      resultEl.innerHTML = valid
        ? '<span style="color:#34d399;">✅ API Key 有效</span>'
        : '<span style="color:#f87171;">❌ API Key 无效或网络错误</span>';
    });
  }

  // ==================== 简历管理 Tab ====================
  async function loadResumeTab() {
    let baseResume = await ResumeService.getBaseResume();

    // 首次使用：自动导入预设简历
    if (!baseResume && typeof PRESET_RESUME !== 'undefined' && PRESET_RESUME) {
      baseResume = PRESET_RESUME;
      await ResumeService.saveBaseResume(PRESET_RESUME);
      showToast('已自动导入简历，可编辑后重新保存');
    }

    const editor = document.getElementById('resumeEditor');
    if (baseResume && !editorChanged) {
      editor.value = baseResume;
    }
    await loadVersionList();

    // Save button
    const btnSave = document.getElementById('btnSaveResume');
    btnSave.onclick = async () => {
      const content = editor.value.trim();
      if (!content) { showToast('简历内容不能为空', true); return; }
      await ResumeService.saveBaseResume(content);
      editorChanged = false;
      showToast('基础简历已保存');
      await loadVersionList();
    };

    // Import button
    const btnImport = document.getElementById('btnImport');
    btnImport.onclick = () => {
      const input = document.createElement('textarea');
      input.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:500px;height:200px;z-index:9999;padding:12px;background:#1e293b;color:#e2e8f0;border:1px solid #38bdf8;border-radius:8px;font-size:13px;';
      input.placeholder = '在此粘贴简历内容，然后点击空白处确认...';
      document.body.appendChild(input);
      input.focus();
      input.addEventListener('blur', () => {
        const val = input.value.trim();
        if (val) {
          editor.value = val;
          editorChanged = true;
          showToast('简历已导入编辑器，请点击保存');
        }
        input.remove();
      });
    };

    // Track editor changes
    editor.oninput = () => { editorChanged = true; };
  }

  async function loadVersionList() {
    const versions = await ResumeService.getResumeVersions();
    const activeId = await ResumeService.getActiveVersionId();
    const container = document.getElementById('versionList');
    document.getElementById('versionCount').textContent = `${versions.length} 个版本`;

    if (!versions.length) {
      container.innerHTML = '<div class="empty-state">暂无版本，请先保存基础简历</div>';
      return;
    }

    container.innerHTML = versions.map(v => {
      const isActive = v.id === activeId;
      const isBase = v.isBase;
      const responseRate = v.applyCount > 0 ? ((v.responseCount / v.applyCount) * 100).toFixed(0) : '-';
      return `
        <div class="version-item ${isActive ? 'active' : ''} ${isBase ? 'base' : ''}" data-id="${v.id}">
          <div class="v-name" title="${escHtml(v.name)}">${isBase ? '⭐ ' : ''}${escHtml(v.name)}</div>
          <div class="v-meta">投${v.applyCount || 0} | 回${v.responseCount || 0} | ${responseRate}%</div>
          <div class="v-actions">
            ${!isActive ? `<button data-action="activate" data-id="${v.id}">激活</button>` : '<span style="font-size:11px;color:#34d399;">使用中</span>'}
            <button data-action="preview" data-id="${v.id}">预览</button>
            ${!isBase ? `<button data-action="delete" data-id="${v.id}" style="color:#f87171;">删除</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Event delegation
    container.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'activate') {
          await ResumeService.setActiveVersion(id);
          showToast('已切换激活版本');
          await loadVersionList();
        } else if (action === 'preview') {
          const v = versions.find(x => x.id === id);
          if (v) renderPreview(v.content);
        } else if (action === 'delete') {
          if (confirm('确定删除此版本？')) {
            await ResumeService.deleteVersion(id);
            showToast('版本已删除');
            await loadVersionList();
          }
        }
      });
    });

    // Click on version item to preview content
    container.querySelectorAll('.version-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        const v = versions.find(x => x.id === id);
        if (v) renderPreview(v.content);
      });
    });
  }

  function renderPreview(markdown) {
    const box = document.getElementById('previewBox');
    box.innerHTML = simpleMarkdown(markdown);
  }

  // ==================== 岗位分析 Tab ====================
  async function loadJobsTab() {
    await loadJobList();

    document.getElementById('jobSearch').oninput = debounce(async () => {
      await loadJobList(document.getElementById('jobSearch').value);
    }, 300);

    document.getElementById('btnBatchAnalyze').onclick = batchAnalyze;
    document.getElementById('btnGenerateResume').onclick = generateOptimizedVersion;
    document.getElementById('btnSaveOptimized').onclick = saveOptimizedVersion;
    document.getElementById('btnDiscardOptimized').onclick = discardOptimized;
  }

  async function loadJobList(query) {
    const container = document.getElementById('jobList');
    let jobs;

    if (query) {
      jobs = await JobMemoryService.searchJobs(query);
    } else {
      jobs = await JobMemoryService.getJobDetailList();
    }

    if (!jobs.length) {
      container.innerHTML = '<div class="empty-state">暂无投递记录<br><small>请先在 BOSS 直聘使用自动投递功能</small></div>';
      return;
    }

    container.innerHTML = jobs.map(j => {
      const tags = [];
      if (j.analyzed) tags.push('<span class="jc-tag analyzed">已分析</span>');
      else if (j.fullDescription) tags.push('<span class="jc-tag unanalyzed">待分析</span>');
      if (j.salary) tags.push(`<span class="jc-tag">${escHtml(j.salary)}</span>`);
      if (j.location) tags.push(`<span class="jc-tag">${escHtml(j.location)}</span>`);

      return `
        <div class="job-card ${j.jobId === selectedJobId ? 'selected' : ''}" data-jobid="${j.jobId}">
          <div class="jc-title">${escHtml(j.jobTitle || '未知职位')}</div>
          <div class="jc-company">${escHtml(j.companyName || '未知公司')}</div>
          <div class="jc-tags">${tags.join('')}</div>
        </div>
      `;
    }).join('');

    // Click handler
    container.querySelectorAll('.job-card').forEach(card => {
      card.addEventListener('click', async () => {
        const jobId = card.dataset.jobid;
        selectedJobId = jobId;
        // Highlight selection
        container.querySelectorAll('.job-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        await loadJobAnalysis(jobId);
      });
    });
  }

  async function loadJobAnalysis(jobId) {
    const detail = await StorageService.getJobDetail(jobId);
    const contentEl = document.getElementById('analysisContent');
    const btnGen = document.getElementById('btnGenerateResume');
    document.getElementById('optimizedResult').style.display = 'none';
    currentOptimizedResume = null;

    if (!detail) {
      contentEl.innerHTML = '<div class="empty-state">岗位详情未找到</div>';
      btnGen.style.display = 'none';
      return;
    }

    if (!detail.fullDescription) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <p>该岗位未保存详细描述</p>
          <p style="font-size:12px;margin-top:8px;">请在使用自动投递时确保右侧详情面板已加载</p>
        </div>
        <div style="margin-top:12px;">
          <div style="font-size:13px;font-weight:600;">基本信息</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
            <p>职位：${escHtml(detail.jobTitle || '-')}</p>
            <p>公司：${escHtml(detail.companyName || '-')}</p>
            <p>薪资：${escHtml(detail.salary || '-')}</p>
            <p>链接：${detail.jobUrl ? `<a href="${escHtml(detail.jobUrl)}" target="_blank" style="color:#38bdf8;">打开</a>` : '-'}</p>
          </div>
        </div>
      `;
      btnGen.style.display = 'none';
      return;
    }

    // Show job info + enable analyze
    const tracking = await StorageService.getResponseTracking();
    const t = tracking[jobId];
    const statusLabels = { pending: '待回复', viewed: '已查看', replied: '已回复', rejected: '不合适', ignored: '未回复' };

    contentEl.innerHTML = `
      <div style="margin-bottom:12px;">
        <div style="font-size:14px;font-weight:600;">${escHtml(detail.jobTitle)} @ ${escHtml(detail.companyName)}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${escHtml(detail.salary || '')} | ${escHtml(detail.location || '')}</div>
        <div style="margin-top:8px;font-size:12px;color:#94a3b8;">
          雇主状态：
          <span id="responseStatus" style="color:${t ? '#34d399' : '#94a3b8'};">${t ? (statusLabels[t.status] || t.status) : '未追踪'}</span>
        </div>
        <div class="response-btns">
          <button class="${t?.status==='replied'?'active':''}" data-status="replied">已回复</button>
          <button class="${t?.status==='viewed'?'active':''}" data-status="viewed">已查看</button>
          <button class="${t?.status==='pending'?'active':''}" data-status="pending">待回复</button>
          <button class="rejected ${t?.status==='rejected'?'active':''}" data-status="rejected">不合适</button>
          <button class="ignored ${t?.status==='ignored'?'active':''}" data-status="ignored">未回复</button>
        </div>
      </div>
      <div style="border-top:1px solid #475569;padding-top:10px;">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">点击下方按钮分析匹配度</div>
        <button class="btn btn-primary btn-small" id="btnAnalyzeThis">🔍 分析匹配度</button>
      </div>
    `;

    // Response tracking buttons
    contentEl.querySelectorAll('.response-btns button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const status = btn.dataset.status;
        await AnalyticsService.recordResponse(jobId, status);
        showToast(`已标记为: ${statusLabels[status]}`);
        await loadJobAnalysis(jobId);
      });
    });

    document.getElementById('btnAnalyzeThis').onclick = async () => {
      await doAnalyzeJob(detail, contentEl, btnGen);
    };

    btnGen.style.display = 'inline-block';
  }

  async function doAnalyzeJob(detail, contentEl, btnGen) {
    const resumeContent = await ResumeService.getActiveResumeContent();
    if (!resumeContent) {
      showToast('请先在「简历管理」中保存基础简历', true);
      return;
    }
    if (!(await ApiKeyService.hasApiKey())) {
      showToast('请先配置 DeepSeek API Key（点击右上角设置）', true);
      return;
    }

    contentEl.innerHTML = '<div class="analysis-loading"><div class="spinner"></div>分析中...</div>';

    try {
      const analysis = await OptimizationService.analyzeJobMatch(detail, resumeContent);
      currentAnalysis = analysis;
      contentEl.innerHTML = simpleMarkdown(analysis);
      btnGen.style.display = 'inline-block';
    } catch (e) {
      contentEl.innerHTML = `<div style="color:#f87171;">分析失败: ${escHtml(e.message)}</div>`;
    }
  }

  async function generateOptimizedVersion() {
    if (!selectedJobId) { showToast('请先选择岗位', true); return; }
    const detail = await StorageService.getJobDetail(selectedJobId);
    if (!detail) { showToast('岗位详情未找到', true); return; }

    const resumeContent = await ResumeService.getActiveResumeContent();
    if (!resumeContent) { showToast('请先保存基础简历', true); return; }

    const contentEl = document.getElementById('analysisContent');
    contentEl.innerHTML = '<div class="analysis-loading"><div class="spinner"></div>生成优化版简历中...</div>';

    try {
      const optimized = await OptimizationService.generateOptimizedResume(detail, resumeContent);
      currentOptimizedResume = optimized;
      document.getElementById('optimizedPreview').innerHTML = simpleMarkdown(optimized);
      document.getElementById('optimizedResult').style.display = 'block';
      showToast('优化版简历生成成功');
    } catch (e) {
      contentEl.innerHTML = `<div style="color:#f87171;">生成失败: ${escHtml(e.message)}</div>`;
    }
  }

  async function saveOptimizedVersion() {
    if (!currentOptimizedResume) return;
    const detail = await StorageService.getJobDetail(selectedJobId);
    const name = OptimizationService.generateVersionName(detail || {});
    await ResumeService.addVersion({
      name,
      content: currentOptimizedResume,
      baseVersionId: await ResumeService.getActiveVersionId(),
      keywords: detail ? JobMemoryService.extractKeywordsLocally(detail) : [],
      targetJobTypes: detail ? [detail.jobTitle] : [],
    });
    // Mark job as analyzed
    await JobMemoryService.markAsAnalyzed(selectedJobId, await ResumeService.getActiveVersionId());
    // Save optimization record
    await StorageService.addOptimizationRecord({
      jobId: selectedJobId,
      jobTitle: detail?.jobTitle || '',
      companyName: detail?.companyName || '',
      originalResumeId: await ResumeService.getActiveVersionId(),
      originalAnalysis: currentAnalysis || '',
    });
    showToast('优化版本已保存');
    document.getElementById('optimizedResult').style.display = 'none';
    currentOptimizedResume = null;
  }

  function discardOptimized() {
    document.getElementById('optimizedResult').style.display = 'none';
    currentOptimizedResume = null;
  }

  async function batchAnalyze() {
    if (!(await ApiKeyService.hasApiKey())) {
      showToast('请先配置 DeepSeek API Key', true);
      return;
    }
    const resumeContent = await ResumeService.getActiveResumeContent();
    if (!resumeContent) { showToast('请先保存基础简历', true); return; }

    const unanalyzed = await JobMemoryService.getUnanalyzedJobs();
    if (!unanalyzed.length) { showToast('没有待分析的岗位'); return; }

    const jobIds = unanalyzed.slice(0, 10).map(j => j.jobId);
    const contentEl = document.getElementById('analysisContent');
    contentEl.innerHTML = `
      <div class="analysis-loading">
        <div>
          <div class="spinner" style="margin:0 auto 8px;"></div>
          <div id="batchProgress">批量分析中 0/${jobIds.length}...</div>
          <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0;"></div></div>
        </div>
      </div>
    `;

    await OptimizationService.batchAnalyze(jobIds, resumeContent, (done, total, jobId) => {
      document.getElementById('batchProgress').textContent = `批量分析中 ${done}/${total}...`;
      document.getElementById('progressFill').style.width = `${(done / total) * 100}%`;
    });

    showToast(`批量分析完成 (${jobIds.length} 个岗位)`);
    await loadJobList();
    contentEl.innerHTML = `
      <div class="empty-state">
        ✅ 分析完成！已分析 ${jobIds.length} 个岗位<br>
        <small>点击左侧岗位查看详细分析结果</small>
      </div>
    `;
  }

  // ==================== 数据统计 Tab ====================
  async function loadStatsTab() {
    document.getElementById('btnRefreshStats').onclick = loadStatsTab;
    await loadOverviewStats();
    await loadVersionStats();
    await loadSuggestions();
    await loadKeywords();
  }

  async function loadOverviewStats() {
    const stats = await AnalyticsService.getOverallStats();
    document.getElementById('statTotalApplied').textContent = stats.totalApplied;
    document.getElementById('statReplied').textContent = stats.replied;
    document.getElementById('statResponseRate').textContent = stats.responseRate + '%';
    document.getElementById('statPending').textContent = stats.pending;

    const versions = await ResumeService.getResumeVersions();
    document.getElementById('statVersionCount').textContent = versions.length;
  }

  async function loadVersionStats() {
    const stats = await AnalyticsService.getVersionStats();
    const tbody = document.getElementById('versionStatsBody');

    if (!stats.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">暂无数据</td></tr>';
      return;
    }

    tbody.innerHTML = stats.map(s => `
      <tr>
        <td>${s.isBase ? '⭐ ' : ''}${escHtml(s.name)}</td>
        <td>${s.isBase ? '基础版' : '优化版'}</td>
        <td>${s.applied}</td>
        <td>${s.responded}</td>
        <td>${s.replied}</td>
        <td style="color:${parseFloat(s.responseRate) > 0 ? '#34d399' : '#94a3b8'};font-weight:600;">${s.responseRate}%</td>
        <td style="font-size:12px;color:#94a3b8;">${s.createdAt ? new Date(s.createdAt).toLocaleDateString('zh-CN') : '-'}</td>
      </tr>
    `).join('');
  }

  async function loadSuggestions() {
    const suggestions = await AnalyticsService.suggestNextOptimization();
    const container = document.getElementById('optimizationSuggestions');
    container.innerHTML = suggestions.map(s => `<div style="margin-bottom:6px;">• ${escHtml(s)}</div>`).join('');
  }

  async function loadKeywords() {
    const keywords = await AnalyticsService.getTopKeywords(1);
    const container = document.getElementById('keywordCloud');

    if (!keywords.length) {
      container.innerHTML = '<div class="empty-state">请先积累回复数据</div>';
      return;
    }

    container.innerHTML = keywords.slice(0, 15).map(k =>
      `<span class="keyword-tag ${parseFloat(k.replyRate) > 30 ? 'hot' : ''}" title="投递${k.total}次, 回复${k.replied}次">${escHtml(k.keyword)} ${k.replyRate}%</span>`
    ).join('');
  }

  // ==================== Helpers ====================
  function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.background = isError ? '#f87171' : '#34d399';
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2000);
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Simple Markdown-to-HTML renderer
   */
  function simpleMarkdown(md) {
    if (!md) return '';
    let html = escHtml(md);

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr>');

    // Unordered list items
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered list items
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Paragraphs: double newlines
    html = html.replace(/\n\n+/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>\s*<\/p>/g, '');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }
})();
