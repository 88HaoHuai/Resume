import type {
  GreetingTemplate,
  ApplyHistoryItem,
  ScannedJob,
  ApplyState,
  Settings,
} from './types';
import { STORAGE_KEYS } from './types';
import { DEFAULT_SETTINGS, DEFAULT_TEMPLATES } from './constants';

// ===== 通用 get/set =====

export async function getStorage<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

export async function setStorage<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function removeStorage(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}

// ===== 模板 =====

export async function getTemplates(): Promise<GreetingTemplate[]> {
  const templates = await getStorage<GreetingTemplate[]>(STORAGE_KEYS.TEMPLATES);
  if (!templates || templates.length === 0) {
    const defaults = DEFAULT_TEMPLATES.map((t) => ({
      ...t,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    await setStorage(STORAGE_KEYS.TEMPLATES, defaults);
    return defaults;
  }
  return templates;
}

export async function saveTemplates(templates: GreetingTemplate[]): Promise<void> {
  await setStorage(STORAGE_KEYS.TEMPLATES, templates);
}

// ===== 投递历史 =====

export async function getApplyHistory(): Promise<ApplyHistoryItem[]> {
  return (await getStorage<ApplyHistoryItem[]>(STORAGE_KEYS.APPLY_HISTORY)) || [];
}

export async function addApplyHistory(item: ApplyHistoryItem): Promise<void> {
  const history = await getApplyHistory();
  history.unshift(item);
  // 只保留最近 500 条
  await setStorage(STORAGE_KEYS.APPLY_HISTORY, history.slice(0, 500));
}

export async function clearApplyHistory(): Promise<void> {
  await removeStorage(STORAGE_KEYS.APPLY_HISTORY);
}

// ===== 扫描的职位 =====

export async function getScannedJobs(): Promise<ScannedJob[]> {
  return (await getStorage<ScannedJob[]>(STORAGE_KEYS.SCANNED_JOBS)) || [];
}

export async function setScannedJobs(jobs: ScannedJob[]): Promise<void> {
  await setStorage(STORAGE_KEYS.SCANNED_JOBS, jobs);
}

// ===== 投递状态 =====

export async function getApplyState(): Promise<ApplyState | null> {
  return (await getStorage<ApplyState>(STORAGE_KEYS.APPLY_STATE)) || null;
}

export async function setApplyState(state: ApplyState | null): Promise<void> {
  if (state === null) {
    await removeStorage(STORAGE_KEYS.APPLY_STATE);
  } else {
    await setStorage(STORAGE_KEYS.APPLY_STATE, state);
  }
}

// ===== 设置 =====

export async function getSettings(): Promise<Settings> {
  const settings = await getStorage<Settings>(STORAGE_KEYS.SETTINGS);
  if (!settings) {
    await setStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setStorage(STORAGE_KEYS.SETTINGS, settings);
}
