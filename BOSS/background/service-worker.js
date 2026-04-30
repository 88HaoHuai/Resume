/**
 * Background Service Worker
 * 消息中继、后台调度
 */

// 监听来自 Popup 和 Content Script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // 保持异步响应通道
});

async function handleMessage(message, sender) {
  switch (message.type) {
    // ========== Popup → Background → Content Script ==========
    case 'start_auto_apply': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false, error: '未找到活动标签页' };
      const maxApplyCount = message.data?.maxApplyCount || 50;
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'do_auto_apply',
        data: { maxApplyCount },
      });
      return resp;
    }
    case 'stop_auto_apply': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false };
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'do_stop' });
      return resp;
    }
    case 'pause_auto_apply': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false };
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'do_pause' });
      return resp;
    }

    // ========== 聊天批量发图 ==========
    case 'start_chat_resume': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false, error: '未找到活动标签页' };
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, { type: 'do_chat_resume' });
        return resp;
      } catch (e) {
        return { success: false, error: '请先打开 BOSS 直聘聊天页面' };
      }
    }
    case 'stop_chat_resume': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false };
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, { type: 'do_stop_chat_resume' });
        return resp;
      } catch (e) {
        return { success: false };
      }
    }
    case 'clear_chat_sent': {
      await chrome.storage.local.set({ boss_chat_sent_list: [] });
      return { success: true };
    }
    case 'get_chat_sent_count': {
      const sentResult = await chrome.storage.local.get('boss_chat_sent_list');
      const list = sentResult.boss_chat_sent_list || [];
      return { count: list.length };
    }

    // ========== 数据操作 ==========
    case 'get_status': {
      const state = await getFromStorage('boss_running_state');
      const dailyCount = await getDailyCount();
      return { state: state || 'idle', dailyCount };
    }
    case 'get_records': {
      const records = await getFromStorage('boss_apply_records');
      return { records: records || [] };
    }
    case 'save_config': {
      await chrome.storage.local.set({ boss_auto_config: message.data });
      return { success: true };
    }
    case 'save_filter': {
      await chrome.storage.local.set({ boss_auto_filter: message.data });
      return { success: true };
    }
    case 'save_templates': {
      await chrome.storage.local.set({ boss_templates: message.data });
      return { success: true };
    }
    case 'save_resume': {
      await chrome.storage.local.set({
        boss_resume_image: message.data.imageData,
        boss_resume_enabled: message.data.enabled,
      });
      return { success: true };
    }

    // ========== Content Script → Background ==========
    case 'request_resume': {
      const result = await chrome.storage.local.get('boss_resume_image');
      return { data: result.boss_resume_image || null };
    }
    case 'status_update':
    case 'progress_update':
    case 'log_message': {
      // 转发给 Popup（如果打开的话）
      try {
        chrome.runtime.sendMessage(message);
      } catch (e) { /* Popup 可能未打开 */ }
      return { success: true };
    }

    // ========== 简历记忆系统 ==========
    case 'save_base_resume': {
      await chrome.storage.local.set({ boss_base_resume: message.data });
      return { success: true };
    }
    case 'get_base_resume': {
      const result = await chrome.storage.local.get('boss_base_resume');
      return { content: result.boss_base_resume || null };
    }
    case 'save_resume_version': {
      const versionsResult = await chrome.storage.local.get('boss_resume_versions');
      const versions = versionsResult.boss_resume_versions || [];
      versions.unshift({ ...message.data, id: generateId(), createdAt: Date.now() });
      await chrome.storage.local.set({ boss_resume_versions: versions });
      return { success: true };
    }
    case 'delete_resume_version': {
      const versionsResult = await chrome.storage.local.get('boss_resume_versions');
      const versions = (versionsResult.boss_resume_versions || []).filter(v => v.id !== message.data.id);
      await chrome.storage.local.set({ boss_resume_versions: versions });
      return { success: true };
    }
    case 'get_resume_versions': {
      const result = await chrome.storage.local.get('boss_resume_versions');
      return { versions: result.boss_resume_versions || [] };
    }
    case 'set_active_version': {
      await chrome.storage.local.set({ boss_active_resume_version: message.data.id });
      return { success: true };
    }
    case 'get_active_version': {
      const result = await chrome.storage.local.get('boss_active_resume_version');
      return { id: result.boss_active_resume_version || 'base' };
    }
    case 'save_api_key': {
      await chrome.storage.local.set({ boss_api_key: message.data.key });
      return { success: true };
    }
    case 'get_api_key': {
      const result = await chrome.storage.local.get('boss_api_key');
      return { key: result.boss_api_key || '' };
    }
    case 'analyze_job': {
      // 分析请求由 Dashboard 直接调用 OptimizationService
      return { success: true, note: 'analysis is handled by dashboard' };
    }
    case 'generate_resume': {
      return { success: true, note: 'generation is handled by dashboard' };
    }
    case 'get_job_details': {
      const result = await chrome.storage.local.get('boss_job_details');
      return { details: result.boss_job_details || {} };
    }
    case 'get_job_detail': {
      const result = await chrome.storage.local.get('boss_job_details');
      const details = result.boss_job_details || {};
      return { detail: details[message.data.jobId] || null };
    }
    case 'record_response': {
      const trackingResult = await chrome.storage.local.get('boss_response_tracking');
      const tracking = trackingResult.boss_response_tracking || {};
      tracking[message.data.jobId] = {
        status: message.data.status,
        note: message.data.note || '',
        resumeVersionId: message.data.resumeVersionId || 'base',
        updatedAt: Date.now(),
      };
      await chrome.storage.local.set({ boss_response_tracking: tracking });
      return { success: true };
    }
    case 'get_analytics': {
      const trackingResult = await chrome.storage.local.get('boss_response_tracking');
      const tracking = trackingResult.boss_response_tracking || {};
      const recordsResult = await chrome.storage.local.get('boss_apply_records');
      const records = recordsResult.boss_apply_records || [];
      let replied = 0;
      for (const t of Object.values(tracking)) {
        if (t.status === 'replied') replied++;
      }
      return {
        totalApplied: records.length,
        replied,
        responseRate: records.length > 0 ? (replied / records.length * 100).toFixed(1) : '0.0',
      };
    }
    case 'get_optimization_records': {
      const result = await chrome.storage.local.get('boss_optimization_records');
      return { records: result.boss_optimization_records || [] };
    }

    default:
      return { success: false, error: '未知消息类型: ' + message.type };
  }
}

// 辅助函数
async function getFromStorage(key) {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

async function getDailyCount() {
  const today = new Date().toISOString().split('T')[0];
  const result = await chrome.storage.local.get(['boss_daily_count', 'boss_daily_date']);
  if (result.boss_daily_date !== today) {
    await chrome.storage.local.set({ boss_daily_count: 0, boss_daily_date: today });
    return 0;
  }
  return result.boss_daily_count || 0;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// 安装时初始化默认数据
chrome.runtime.onInstalled.addListener(async () => {
  console.log('🤖 BOSS 直聘助手已安装');
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
