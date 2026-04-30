/**
 * 公司黑名单独立页面
 */
(function () {
  'use strict';

  let blList = [];
  let addTimestamps = {}; // name → timestamp

  document.addEventListener('DOMContentLoaded', async () => {
    await loadAll();
    initEvents();
  });

  async function loadAll() {
    // 加载黑名单
    const result = await chrome.storage.local.get(['boss_blacklist', 'boss_blacklist_timestamps', 'boss_blacklist_hit_count', 'boss_apply_records']);
    blList = result.boss_blacklist || [];
    addTimestamps = result.boss_blacklist_timestamps || {};

    // 统计
    document.getElementById('statBlocked').textContent = blList.length;
    document.getElementById('statHitCount').textContent = result.boss_blacklist_hit_count || 0;
    document.getElementById('headerCount').textContent = blList.length + ' 家';

    // 24h内的命中次数（粗略统计：从 apply records 中过滤）
    const dayAgo = Date.now() - 86400000;
    const records = result.boss_apply_records || [];
    const recentHits = records.filter(r =>
      r.status === 'skipped' && r.timestamp && r.timestamp > dayAgo
    ).length;
    document.getElementById('statRecentHit').textContent = recentHits;

    renderTable();
  }

  function initEvents() {
    // 添加
    const addInput = document.getElementById('blAddInput');
    document.getElementById('btnAdd').addEventListener('click', () => addCompany(addInput));
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addCompany(addInput);
    });

    // 搜索
    document.getElementById('blSearch').addEventListener('input', renderTable);

    // 清空
    document.getElementById('btnClearAll').addEventListener('click', async () => {
      if (blList.length === 0) return;
      if (confirm(`确定清空全部 ${blList.length} 家公司？`)) {
        await saveList([]);
      }
    });

    // 批量导入展开/收起
    document.getElementById('bulkToggle').addEventListener('click', () => {
      const body = document.getElementById('bulkBody');
      const toggle = document.getElementById('bulkToggle');
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      toggle.textContent = isHidden ? '📋 批量导入 / 从近期投递添加 ▴' : '📋 批量导入 / 从近期投递添加 ▾';
      if (isHidden) loadRecentCompanies();
    });

    // 批量添加
    document.getElementById('btnBulkAdd').addEventListener('click', async () => {
      const raw = document.getElementById('blBulkInput').value;
      const names = raw.split(/[\n,，、]+/).map(s => s.trim()).filter(Boolean);
      if (!names.length) { toast('请输入公司名', true); return; }
      let added = 0;
      for (const name of names) {
        if (!blList.some(b => normalize(b) === normalize(name))) {
          blList.push(name);
          addTimestamps[name] = Date.now();
          added++;
        }
      }
      await saveList(blList);
      document.getElementById('blBulkInput').value = '';
      toast(`已添加 ${added} 家（跳过 ${names.length - added} 家重复）`);
    });

    // 刷新近期
    document.getElementById('btnRefreshRecent').addEventListener('click', loadRecentCompanies);

    // 导入JSON
    document.getElementById('btnImport').addEventListener('click', importJSON);

    // 导出
    document.getElementById('btnExport').addEventListener('click', exportList);
  }

  function addCompany(input) {
    const name = input.value.trim();
    if (!name) return;
    if (blList.some(b => normalize(b) === normalize(name))) {
      toast('已在黑名单中', true);
      input.value = '';
      return;
    }
    blList.push(name);
    addTimestamps[name] = Date.now();
    saveList(blList);
    input.value = '';
    input.focus();
  }

  async function saveList(list) {
    blList = [...new Set(list.map(s => s.trim()).filter(Boolean))];
    await chrome.storage.local.set({
      boss_blacklist: blList,
      boss_blacklist_timestamps: addTimestamps,
    });
    await loadAll();
  }

  function renderTable() {
    const query = (document.getElementById('blSearch')?.value || '').toLowerCase();
    const filtered = query
      ? blList.filter(name => normalize(name).includes(query))
      : [...blList];

    const tbody = document.getElementById('blTableBody');
    if (!filtered.length) {
      tbody.innerHTML = query
        ? '<tr><td colspan="4" class="empty-cell">未找到匹配的公司</td></tr>'
        : '<tr><td colspan="4" class="empty-cell">黑名单为空，在上方输入公司名开始添加</td></tr>';
      return;
    }

    // 按添加时间倒序
    filtered.sort((a, b) => (addTimestamps[b] || 0) - (addTimestamps[a] || 0));

    tbody.innerHTML = filtered.map((name, i) => {
      const ts = addTimestamps[name];
      const timeStr = ts ? new Date(ts).toLocaleDateString('zh-CN') : '-';
      return `
        <tr>
          <td class="bl-row-idx">${i + 1}</td>
          <td>${escHtml(name)}</td>
          <td class="bl-row-time">${timeStr}</td>
          <td><button class="bl-row-del" data-name="${escHtml(name)}">✕</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.bl-row-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        blList = blList.filter(b => b !== name);
        delete addTimestamps[name];
        await saveList(blList);
        toast(`已移除: ${name}`);
      });
    });
  }

  async function loadRecentCompanies() {
    const result = await chrome.storage.local.get('boss_apply_records');
    const records = result.boss_apply_records || [];
    const seen = new Set();
    const companies = [];
    for (const r of records) {
      const name = (r.companyName || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      companies.push({ name, count: records.filter(x => x.companyName === name).length });
    }

    const container = document.getElementById('recentList');
    if (!companies.length) {
      container.innerHTML = '<div class="empty-state">暂无投递记录</div>';
      return;
    }

    container.innerHTML = companies.slice(0, 30).map(c => {
      const blocked = blList.some(b => normalize(b) === normalize(c.name));
      return `
        <div class="recent-item">
          <span class="recent-item-name" title="${escHtml(c.name)}">${escHtml(c.name)}</span>
          <span class="recent-item-count">${c.count}次</span>
          ${blocked
            ? '<span class="recent-item-add blocked">已屏蔽</span>'
            : `<button class="recent-item-add" data-name="${escHtml(c.name)}">+ 屏蔽</button>`
          }
        </div>
      `;
    }).join('');

    container.querySelectorAll('.recent-item-add:not(.blocked)').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        blList.push(name);
        addTimestamps[name] = Date.now();
        await saveList(blList);
        toast(`已屏蔽: ${name}`);
      });
    });
  }

  function importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        let names = [];
        // Try JSON array
        try {
          const arr = JSON.parse(text);
          if (Array.isArray(arr)) names = arr.map(String);
        } catch {
          // Plain text: one per line or comma-separated
          names = text.split(/[\n,，、]+/).map(s => s.trim()).filter(Boolean);
        }
        let added = 0;
        for (const name of names) {
          if (!blList.some(b => normalize(b) === normalize(name))) {
            blList.push(name);
            addTimestamps[name] = Date.now();
            added++;
          }
        }
        await saveList(blList);
        toast(`导入 ${added} 家（跳过 ${names.length - added} 家重复）`);
      } catch (err) {
        toast('文件格式错误', true);
      }
    };
    input.click();
  }

  function exportList() {
    if (!blList.length) { toast('黑名单为空', true); return; }
    const json = JSON.stringify(blList, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boss_黑名单_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('导出成功');
  }

  function normalize(text) {
    return (text || '').replace(/[\s（）()【】\[\]·•\-_/\\]+/g, '').toLowerCase();
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.background = isError ? '#f87171' : '#34d399';
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2000);
  }
})();
