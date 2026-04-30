/**
 * UI 注入器 — 页面浮动日志面板
 * BOSS 直聘禁用了 F12，通过注入 DOM 面板来查看运行状态
 */
const UIInjector = {
  _panel: null,
  _logList: null,
  _logs: [],
  _maxLogs: 200,
  _minimized: false,

  /**
   * 注入浮动面板到页面
   */
  inject() {
    if (this._panel) return;

    const panel = document.createElement('div');
    panel.id = 'boss-log-panel';
    panel.innerHTML = `
      <div id="boss-log-header">
        <span id="boss-log-title">🤖 BOSS助手 运行日志</span>
        <span id="boss-log-stats"></span>
        <div id="boss-log-actions">
          <button id="boss-log-clear" title="清空">🗑</button>
          <button id="boss-log-toggle" title="最小化">−</button>
        </div>
      </div>
      <div id="boss-log-list"></div>
    `;
    panel.style.cssText = `
      position: fixed; bottom: 12px; right: 12px; z-index: 99999;
      width: 420px; max-height: 320px;
      background: rgba(15,23,42,0.95); color: #e2e8f0;
      border: 1px solid #38bdf8; border-radius: 10px;
      font-family: 'PingFang SC','Microsoft YaHei',monospace; font-size: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      display: flex; flex-direction: column;
      backdrop-filter: blur(8px);
      transition: all 0.2s;
    `;

    // Header style
    const header = panel.querySelector('#boss-log-header');
    header.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      padding: 6px 12px;
      background: rgba(56,189,248,0.1);
      border-radius: 9px 9px 0 0;
      border-bottom: 1px solid rgba(56,189,248,0.2);
      cursor: move;
      user-select: none;
    `;
    panel.querySelector('#boss-log-title').style.cssText = 'font-weight:600; font-size:13px; flex:1;';
    panel.querySelector('#boss-log-stats').style.cssText = 'font-size:10px; color:#94a3b8; margin-right:4px;';
    panel.querySelector('#boss-log-actions').style.cssText = 'display:flex; gap:4px;';

    // Buttons
    const btnClear = panel.querySelector('#boss-log-clear');
    const btnToggle = panel.querySelector('#boss-log-toggle');
    [btnClear, btnToggle].forEach(b => {
      b.style.cssText = `
        background: rgba(255,255,255,0.1); border: none; color: #e2e8f0;
        cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 4px; line-height: 1;
      `;
    });

    // Log list
    const logList = panel.querySelector('#boss-log-list');
    logList.style.cssText = `
      flex: 1; overflow-y: auto; padding: 6px 0;
      min-height: 60px; max-height: 260px;
    `;

    document.body.appendChild(panel);
    this._panel = panel;
    this._logList = logList;

    // Events
    btnClear.onclick = () => {
      this._logs = [];
      this._logList.innerHTML = '';
    };
    btnToggle.onclick = () => {
      this._minimized = !this._minimized;
      this._logList.style.display = this._minimized ? 'none' : 'block';
      panel.style.maxHeight = this._minimized ? 'none' : '320px';
      btnToggle.textContent = this._minimized ? '+' : '−';
    };

    // Drag
    let dragging = false, offX = 0, offY = 0;
    header.onmousedown = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      offX = e.clientX - panel.offsetLeft;
      offY = e.clientY - panel.offsetTop;
    };
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = (e.clientX - offX) + 'px';
      panel.style.right = 'auto';
      panel.style.top = (e.clientY - offY) + 'px';
      panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    // 输出初始信息
    this.addLog('🚀 日志面板已就绪');
    this.addLog('💡 黑名单状态检查中...');
  },

  /**
   * 添加一条日志
   */
  addLog(message) {
    if (!this._panel) this.inject();
    if (!this._logList) return;

    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    this._logs.push({ time, message });

    if (this._logs.length > this._maxLogs) {
      this._logs.shift();
      // 清理 DOM 中的旧条目
      while (this._logList.children.length > this._maxLogs) {
        this._logList.firstChild.remove();
      }
    }

    const entry = document.createElement('div');
    entry.style.cssText = `
      padding: 2px 12px; line-height: 1.5;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      font-size: 11px;
    `;
    const color = message.startsWith('❌') ? '#f87171'
      : message.startsWith('⚠') ? '#fbbf24'
      : message.includes('⏭') ? '#f87171'
      : message.includes('✅') ? '#34d399'
      : message.includes('黑名单') ? '#38bdf8'
      : '#94a3b8';
    entry.innerHTML = `<span style="color:#64748b;">${time}</span> <span style="color:${color};">${escHtmlLog(message)}</span>`;
    this._logList.appendChild(entry);
    this._logList.scrollTop = this._logList.scrollHeight;
  },

  /**
   * 更新面板统计信息
   */
  updateStats(stats) {
    const el = this._panel?.querySelector('#boss-log-stats');
    if (el && stats) {
      el.textContent = `投${stats.applied || 0} | 跳${stats.skipped || 0} | 败${stats.failed || 0}`;
    }
  },

  /**
   * 更新黑名单状态显示
   */
  showBlacklistStatus(count, sample) {
    this.addLog(`🛡 黑名单: ${count} 家${sample ? ' (' + sample + ')' : ''}`);
  },
};

function escHtmlLog(str) {
  if (!str) return '';
  return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
