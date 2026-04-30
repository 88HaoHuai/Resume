import type { Settings } from './types';

// ===== 默认设置 =====

export const DEFAULT_SETTINGS: Settings = {
  delayBetweenJobs: { min: 3000, max: 8000 },
  typingDelayMs: 50,
  maxRetries: 2,
  maxJobsPerSession: 80,
  autoScrollBeforeClick: true,
};

// ===== 操作时间配置 =====

export const TIMING = {
  BETWEEN_JOBS_MIN: 3000,
  BETWEEN_JOBS_MAX: 8000,
  MODAL_WAIT_MIN: 1500,
  MODAL_WAIT_MAX: 3000,
  AFTER_APPLY_MIN: 1000,
  AFTER_APPLY_MAX: 2500,
  TYPING_DELAY_MS: 50,
  PAGE_SCROLL_DELAY: 800,
  ELEMENT_WAIT_TIMEOUT: 10000,
  MODAL_WAIT_TIMEOUT: 5000,
  SUCCESS_WAIT_TIMEOUT: 5000,
} as const;

// ===== 智联招聘页面 URL 模式 =====

export const ZHAOPIN_URLS = {
  SEARCH: 'zhaopin.com/sou/',
  JOB_DETAIL: 'zhaopin.com/jobdetail/',
  COMPANY_DETAIL: 'zhaopin.com/companydetail/',
  PASSPORT: 'passport.zhaopin.com',
} as const;

// ===== 页面类型 =====

export type PageType = 'search' | 'job_detail' | 'company_detail' | 'passport' | 'unknown';

// ===== 默认招呼模板 =====

export const DEFAULT_TEMPLATES = [
  {
    id: 'default-1',
    name: '通用版',
    content: '您好，我对贵司的{职位名}岗位非常感兴趣。我有相关工作经验，希望能与您进一步沟通，谢谢！',
    isDefault: true,
  },
  {
    id: 'default-2',
    name: '应届生版',
    content: '您好，我是应届毕业生，对贵司的{职位名}岗位很感兴趣。我学习能力强，愿意从基础做起，期待能有机会面试！',
    isDefault: false,
  },
  {
    id: 'default-3',
    name: '有经验版',
    content: '您好，我有{我的优势}，看到贵司在招{职位名}，觉得我的经验和技能很匹配，期待与您详细沟通！',
    isDefault: false,
  },
];

// ===== 投递状态映射（中文显示） =====

export const APPLY_STATUS_TEXT: Record<string, string> = {
  success: '投递成功',
  already_applied: '已投递',
  verification_needed: '需要验证',
  skipped: '已跳过',
  error: '投递失败',
};

// ===== 分页信息 =====

export const JOBS_PER_PAGE = 20;
