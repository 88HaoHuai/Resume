/**
 * Background Service Worker - 精简版
 */

console.log('[SW] Started');

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {

    // ========== 投递控制 ==========
    case 'start_auto_apply': {
      const lic = await checkLicense();
      if (!lic) return { success: false, error: 'license_invalid' };
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false, error: '未找到活动标签页' };
      return await chrome.tabs.sendMessage(tab.id, {
        type: 'do_auto_apply',
        data: { maxApplyCount: message.data?.maxApplyCount || 50 },
      });
    }
    case 'stop_auto_apply':
    case 'pause_auto_apply': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false };
      return await chrome.tabs.sendMessage(tab.id, { type: message.type === 'stop_auto_apply' ? 'do_stop' : 'do_pause' });
    }

    // ========== 聊天发图 ==========
    case 'start_chat_resume': {
      const lic = await checkLicense();
      if (!lic) return { success: false, error: 'license_invalid' };
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false, error: '未找到活动标签页' };
      try {
        return await chrome.tabs.sendMessage(tab.id, { type: 'do_chat_resume' });
      } catch (e) {
        return { success: false, error: '请先打开 BOSS 直聘聊天页面' };
      }
    }
    case 'stop_chat_resume': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false };
      try { return await chrome.tabs.sendMessage(tab.id, { type: 'do_stop_chat_resume' }); } catch (e) { return { success: false }; }
    }
    case 'clear_chat_sent':
      await chrome.storage.local.set({ boss_chat_sent_list: [] });
      return { success: true };
    case 'get_chat_sent_count': {
      const r = await chrome.storage.local.get('boss_chat_sent_list');
      return { count: (r.boss_chat_sent_list || []).length };
    }

    // ========== 数据操作 ==========
    case 'get_status':
      return { state: (await chrome.storage.local.get('boss_running_state')).boss_running_state || 'idle' };
    case 'get_records':
      return { records: (await chrome.storage.local.get('boss_apply_records')).boss_apply_records || [] };
    case 'save_filter':
      await chrome.storage.local.set({ boss_auto_filter: message.data });
      return { success: true };
    case 'save_resume':
      await chrome.storage.local.set({ boss_resume_image: message.data?.imageData, boss_resume_enabled: message.data?.enabled });
      return { success: true };
    case 'request_resume':
      return { data: (await chrome.storage.local.get('boss_resume_image')).boss_resume_image || null };

    // ========== 简历 ==========
    case 'save_base_resume':
      await chrome.storage.local.set({ boss_base_resume: message.data });
      return { success: true };
    case 'get_base_resume':
      return { content: (await chrome.storage.local.get('boss_base_resume')).boss_base_resume || null };
    case 'save_resume_version': {
      const vr = await chrome.storage.local.get('boss_resume_versions');
      const versions = vr.boss_resume_versions || [];
      versions.unshift({ ...message.data, id: genId(), createdAt: Date.now() });
      await chrome.storage.local.set({ boss_resume_versions: versions });
      return { success: true };
    }
    case 'delete_resume_version': {
      const vr = await chrome.storage.local.get('boss_resume_versions');
      await chrome.storage.local.set({ boss_resume_versions: (vr.boss_resume_versions || []).filter(v => v.id !== message.data.id) });
      return { success: true };
    }
    case 'get_resume_versions':
      return { versions: (await chrome.storage.local.get('boss_resume_versions')).boss_resume_versions || [] };
    case 'set_active_version':
      await chrome.storage.local.set({ boss_active_resume_version: message.data.id });
      return { success: true };
    case 'get_active_version':
      return { id: (await chrome.storage.local.get('boss_active_resume_version')).boss_active_resume_version || 'base' };
    case 'save_api_key':
      await chrome.storage.local.set({ boss_api_key: message.data.key });
      return { success: true };
    case 'get_api_key':
      return { key: (await chrome.storage.local.get('boss_api_key')).boss_api_key || '' };
    case 'record_response': {
      const tr = await chrome.storage.local.get('boss_response_tracking');
      const tracking = tr.boss_response_tracking || {};
      tracking[message.data.jobId] = { status: message.data.status, note: message.data.note || '', resumeVersionId: message.data.resumeVersionId || 'base', updatedAt: Date.now() };
      await chrome.storage.local.set({ boss_response_tracking: tracking });
      return { success: true };
    }
    case 'get_analytics': {
      const tr = await chrome.storage.local.get('boss_response_tracking');
      const tracking = tr.boss_response_tracking || {};
      const rr = await chrome.storage.local.get('boss_apply_records');
      const records = rr.boss_apply_records || [];
      let replied = 0;
      for (const t of Object.values(tracking)) { if (t.status === 'replied') replied++; }
      return { totalApplied: records.length, replied, responseRate: records.length > 0 ? (replied / records.length * 100).toFixed(1) : '0.0' };
    }
    case 'get_optimization_records':
      return { records: (await chrome.storage.local.get('boss_optimization_records')).boss_optimization_records || [] };
    case 'get_job_details':
      return { details: (await chrome.storage.local.get('boss_job_details')).boss_job_details || {} };
    case 'get_job_detail': {
      const r = await chrome.storage.local.get('boss_job_details');
      return { detail: (r.boss_job_details || {})[message.data.jobId] || null };
    }

    // Status relay
    case 'status_update':
    case 'progress_update':
    case 'log_message':
      try { chrome.runtime.sendMessage(message); } catch (e) {}
      return { success: true };

    // License check (simplified)
    case 'check_license': {
      const s = await getSession();
      return { active: !!s, state: s ? 'active' : 'unactivated' };
    }

    default:
      return { success: false, error: '未知消息: ' + message.type };
  }
}

// ========== License 辅助 (与 popup 共享 boss_license_session) ==========

const API_BASE = 'http://localhost:3005/api';

async function getSession() {
  const r = await chrome.storage.local.get('boss_license_session');
  return r.boss_license_session || null;
}

async function checkLicense() {
  const session = await getSession();
  if (!session || !session.token) return false;
  try {
    const resp = await fetch(`${API_BASE}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: session.token, machineId: session.machineId }),
    });
    const r = await resp.json();
    return resp.ok && r.valid;
  } catch (_) {
    // 离线时信任缓存
    const days = session.lastCheck ? (Date.now() - session.lastCheck) / 86400000 : 999;
    return days <= 7;
  }
}

// ========== 工具 ==========

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// 安装初始化
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('boss_auto_filter');
  if (!existing.boss_auto_filter) {
    await chrome.storage.local.set({
      boss_auto_filter: {
        minSalary: 0, maxSalary: 0,
        companySize: [], fundingStage: [],
        includeKeywords: [],
        excludeKeywords: ['外包', '驻场', '实习'],
        onlyActiveHR: false,
        experience: [], education: [],
      },
    });
  }
});
