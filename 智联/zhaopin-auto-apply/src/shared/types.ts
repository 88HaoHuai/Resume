// ===== 职位相关 =====

export interface ScannedJob {
  id: string;
  title: string;
  salary: string;
  company: string;
  location: string;
  experience: string;
  education: string;
  tags: string[];
  detailUrl: string;
  alreadyApplied: boolean;
  scannedAt: number;
}

// ===== 模板相关 =====

export interface GreetingTemplate {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// ===== 投递相关 =====

export type ApplyStatus = 'success' | 'already_applied' | 'verification_needed' | 'skipped' | 'error';

export interface ApplyHistoryItem {
  jobId: string;
  companyName: string;
  jobTitle: string;
  detailUrl: string;
  templateUsed: string;
  greetingSent: string;
  status: ApplyStatus;
  errorMessage?: string;
  timestamp: number;
}

export interface ApplyState {
  isRunning: boolean;
  isPaused: boolean;
  currentJobIndex: number;
  totalJobs: number;
  results: ApplyHistoryItem[];
  startedAt: number;
  pauseReason?: 'verification' | 'user' | 'error';
}

// ===== 设置 =====

export interface Settings {
  delayBetweenJobs: {
    min: number;
    max: number;
  };
  typingDelayMs: number;
  maxRetries: number;
  maxJobsPerSession: number;
  autoScrollBeforeClick: boolean;
}

// ===== 消息通信 =====

export type MessageType =
  | 'SCAN_REQUEST'
  | 'SCAN_RESPONSE'
  | 'APPLY_BATCH'
  | 'APPLY_SINGLE'
  | 'CANCEL_APPLY'
  | 'PAUSE_APPLY'
  | 'RESUME_APPLY'
  | 'GET_STATE'
  | 'STATE_UPDATE'
  | 'CDP_CLICK'
  | 'CDP_FILL_INPUT'
  | 'VERIFICATION_REQUIRED'
  | 'APPLY_PROGRESS'
  | 'NAVIGATE_TO_JOB';

export interface BaseMessage {
  type: MessageType;
}

export interface ScanRequestMessage extends BaseMessage {
  type: 'SCAN_REQUEST';
}

export interface ScanResponseMessage extends BaseMessage {
  type: 'SCAN_RESPONSE';
  payload: {
    jobs: ScannedJob[];
    pageNumber: number;
    totalPages: number;
    totalCount: number;
  };
}

export interface ApplyBatchMessage extends BaseMessage {
  type: 'APPLY_BATCH';
  payload: {
    jobs: ScannedJob[];
    templateId: string;
  };
}

export interface ApplySingleMessage extends BaseMessage {
  type: 'APPLY_SINGLE';
  payload: {
    job: ScannedJob;
    templateContent: string;
  };
}

export interface CancelApplyMessage extends BaseMessage {
  type: 'CANCEL_APPLY';
}

export interface PauseApplyMessage extends BaseMessage {
  type: 'PAUSE_APPLY';
}

export interface ResumeApplyMessage extends BaseMessage {
  type: 'RESUME_APPLY';
}

export interface GetStateMessage extends BaseMessage {
  type: 'GET_STATE';
}

export interface StateUpdateMessage extends BaseMessage {
  type: 'STATE_UPDATE';
  payload: ApplyState;
}

export interface CdpClickMessage extends BaseMessage {
  type: 'CDP_CLICK';
  payload: {
    x: number;
    y: number;
    clickCount?: number;
  };
}

export interface CdpFillInputMessage extends BaseMessage {
  type: 'CDP_FILL_INPUT';
  payload: {
    selector: string;
    value: string;
  };
}

export interface VerificationRequiredMessage extends BaseMessage {
  type: 'VERIFICATION_REQUIRED';
  payload: {
    message: string;
    jobTitle: string;
  };
}

export interface ApplyProgressMessage extends BaseMessage {
  type: 'APPLY_PROGRESS';
  payload: {
    current: number;
    total: number;
    currentJob: string;
    status: ApplyStatus;
    message?: string;
  };
}

export interface NavigateToJobMessage extends BaseMessage {
  type: 'NAVIGATE_TO_JOB';
  payload: {
    url: string;
  };
}

export type ExtensionMessage =
  | ScanRequestMessage
  | ScanResponseMessage
  | ApplyBatchMessage
  | ApplySingleMessage
  | CancelApplyMessage
  | PauseApplyMessage
  | ResumeApplyMessage
  | GetStateMessage
  | StateUpdateMessage
  | CdpClickMessage
  | CdpFillInputMessage
  | VerificationRequiredMessage
  | ApplyProgressMessage
  | NavigateToJobMessage;

// ===== 存储 key =====

export const STORAGE_KEYS = {
  TEMPLATES: 'greeting_templates',
  APPLY_HISTORY: 'apply_history',
  SCANNED_JOBS: 'scanned_jobs',
  APPLY_STATE: 'apply_state',
  SETTINGS: 'settings',
} as const;
