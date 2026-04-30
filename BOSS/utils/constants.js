/**
 * 全局常量定义
 * BOSS 直聘自动投递插件
 */

// ========== 投递策略参数（激进模式）==========
const APPLY_CONFIG = {
  // 每日投递上限
  DAILY_LIMIT: 150,
  // 单轮投递上限（达到后进入冷却期）
  BATCH_LIMIT: 30,
  // 两次投递之间的最小间隔（毫秒）
  MIN_INTERVAL: 5000,
  // 两次投递之间的最大间隔（毫秒）
  MAX_INTERVAL: 15000,
  // 冷却期最小时长（毫秒）
  MIN_COOLDOWN: 120000,   // 2 分钟
  // 冷却期最大时长（毫秒）
  MAX_COOLDOWN: 300000,   // 5 分钟
  // 进入详情页后的最小停留时间（毫秒）
  MIN_PAGE_STAY: 2000,
  // 进入详情页后的最大停留时间（毫秒）
  MAX_PAGE_STAY: 5000,
  // 发送招呼语后等待发送图片简历的最小延迟（毫秒）
  MIN_RESUME_DELAY: 2000,
  // 发送招呼语后等待发送图片简历的最大延迟（毫秒）
  MAX_RESUME_DELAY: 5000,
};

// ========== 存储键名 ==========
const STORAGE_KEYS = {
  // 用户配置
  CONFIG: 'boss_auto_config',
  // 筛选条件
  FILTER: 'boss_auto_filter',
  // 投递记录
  APPLY_RECORDS: 'boss_apply_records',
  // 今日投递计数
  DAILY_COUNT: 'boss_daily_count',
  // 今日日期（用于重置计数）
  DAILY_DATE: 'boss_daily_date',
  // 公司黑名单
  BLACKLIST: 'boss_blacklist',
  // 黑名单命中次数
  BLACKLIST_HIT_COUNT: 'boss_blacklist_hit_count',
  // 招呼语模板
  TEMPLATES: 'boss_templates',
  // 图片简历 Base64 数据
  RESUME_IMAGE: 'boss_resume_image',
  // 图片简历开关
  RESUME_ENABLED: 'boss_resume_enabled',
  // 插件运行状态
  RUNNING_STATE: 'boss_running_state',
  // 聊天页面已发送图片的联系人列表
  CHAT_SENT_LIST: 'boss_chat_sent_list',

  // ========== 简历记忆系统 ==========
  // 基础简历
  BASE_RESUME: 'boss_base_resume',
  // 简历版本列表
  RESUME_VERSIONS: 'boss_resume_versions',
  // 当前使用的简历版本 ID
  ACTIVE_RESUME_VERSION: 'boss_active_resume_version',
  // 岗位详情（完整 JD）
  JOB_DETAILS: 'boss_job_details',
  // 优化记录
  OPTIMIZATION_RECORDS: 'boss_optimization_records',
  // DeepSeek API Key（加密存储）
  API_KEY: 'boss_api_key',
  // API 配置
  API_CONFIG: 'boss_api_config',
  // 回复追踪
  RESPONSE_TRACKING: 'boss_response_tracking',
};

// ========== 插件状态 ==========
const PLUGIN_STATE = {
  IDLE: 'idle',           // 空闲
  RUNNING: 'running',     // 运行中
  PAUSED: 'paused',       // 已暂停
  COOLING: 'cooling',     // 冷却中
  ERROR: 'error',         // 出错
};

// ========== 投递记录状态 ==========
const APPLY_STATUS = {
  APPLIED: 'applied',     // 已投递
  VIEWED: 'viewed',       // 已查看
  REPLIED: 'replied',     // 已回复
  REJECTED: 'rejected',   // 不合适
  SKIPPED: 'skipped',     // 已跳过
  IGNORED: 'ignored',     // 未回复（超过一定天数）
};

// ========== 消息类型（组件间通信）==========
const MSG_TYPE = {
  // Popup → Background
  START_AUTO_APPLY: 'start_auto_apply',
  STOP_AUTO_APPLY: 'stop_auto_apply',
  PAUSE_AUTO_APPLY: 'pause_auto_apply',
  GET_STATUS: 'get_status',
  GET_RECORDS: 'get_records',
  SAVE_CONFIG: 'save_config',
  SAVE_FILTER: 'save_filter',
  SAVE_TEMPLATES: 'save_templates',
  SAVE_RESUME: 'save_resume',

  // Background → Content Script
  DO_AUTO_APPLY: 'do_auto_apply',
  DO_STOP: 'do_stop',
  DO_PAUSE: 'do_pause',
  DO_CHAT_RESUME: 'do_chat_resume',
  DO_STOP_CHAT_RESUME: 'do_stop_chat_resume',

  // Content Script → Background
  APPLY_RESULT: 'apply_result',
  STATUS_UPDATE: 'status_update',
  LOG_MESSAGE: 'log_message',
  REQUEST_RESUME: 'request_resume',

  // Background → Popup
  STATE_CHANGED: 'state_changed',
  PROGRESS_UPDATE: 'progress_update',

  // ========== 简历记忆系统消息 ==========
  // 简历版本管理
  SAVE_BASE_RESUME: 'save_base_resume',
  GET_BASE_RESUME: 'get_base_resume',
  SAVE_RESUME_VERSION: 'save_resume_version',
  DELETE_RESUME_VERSION: 'delete_resume_version',
  GET_RESUME_VERSIONS: 'get_resume_versions',
  SET_ACTIVE_VERSION: 'set_active_version',
  GET_ACTIVE_VERSION: 'get_active_version',

  // API Key 管理
  SAVE_API_KEY: 'save_api_key',
  GET_API_KEY: 'get_api_key',

  // AI 优化
  ANALYZE_JOB: 'analyze_job',
  GENERATE_RESUME: 'generate_resume',
  BATCH_ANALYZE: 'batch_analyze',

  // 岗位详情
  GET_JOB_DETAILS: 'get_job_details',
  GET_JOB_DETAIL: 'get_job_detail',

  // 回复追踪
  RECORD_RESPONSE: 'record_response',
  GET_ANALYTICS: 'get_analytics',

  // 优化记录
  GET_OPTIMIZATION_RECORDS: 'get_optimization_records',
};

// ========== BOSS 直聘页面 URL 模式 ==========
const PAGE_PATTERNS = {
  // 职位搜索/列表页
  JOB_LIST: /zhipin\.com\/web\/geek\/job/,
  // 职位详情页
  JOB_DETAIL: /zhipin\.com\/job_detail\//,
  // 聊天页
  CHAT: /zhipin\.com\/web\/geek\/chat/,
  // 推荐页
  RECOMMEND: /zhipin\.com\/web\/geek\/recommend/,
};

// ========== 默认筛选配置 ==========
const DEFAULT_FILTER = {
  // 薪资范围（单位：K）
  minSalary: 0,
  maxSalary: 0,       // 0 表示不限
  // 公司规模
  companySize: [],     // 空数组表示不限
  // 融资阶段
  fundingStage: [],
  // 必须包含关键词
  includeKeywords: [],
  // 排除关键词
  excludeKeywords: ['外包', '驻场', '实习'],
  // 只投递活跃 HR
  onlyActiveHR: false,
  // 工作经验
  experience: [],
  // 学历要求
  education: [],
};

// ========== 图片简历配置 ==========
const RESUME_CONFIG = {
  // 最大文件大小（字节）：2MB
  MAX_FILE_SIZE: 2 * 1024 * 1024,
  // 压缩质量（0-1）
  COMPRESS_QUALITY: 0.85,
  // 支持的图片格式
  ACCEPTED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  // 压缩后最大宽度
  MAX_WIDTH: 1200,
};
