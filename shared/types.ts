// ============================================
// Error Decoder — Shared Types
// Used by: API, Extension, Web
// ============================================

// --- Decode Request/Response ---

export type PageContext = {
  url?: string;
  domain?: string;
  framework?: string;
  isDev?: boolean;
  isMinified?: boolean;
  consoleErrors?: string[];
  networkFailures?: string[];
};

export type DecodeRequest = {
  errorText: string;
  pageContext?: PageContext;
  model?: "haiku" | "sonnet";
};

export type DecodeResponse = {
  markdown: string;
  model: "haiku" | "sonnet";
  cached: boolean;
  decodeId?: string;
};

// --- Usage ---

export type UsageResponse = {
  email: string;
  used: number;
  limit: number;
  plan: UserPlan;
  resetsAt: string;
  sonnetUsed: number;
  sonnetLimit: number;
};

// --- User ---

export const userPlans = {
  free: "free",
  pro: "pro",
} as const;
export type UserPlan = (typeof userPlans)[keyof typeof userPlans];

export type UserProfile = {
  id: string;
  email: string;
  plan: UserPlan;
  createdAt: string;
};

// --- API Response Envelope ---

export type ApiSuccess<T> = {
  data: T;
};

export type ApiError = {
  error: {
    message: string;
    code: string;
  };
  upgradeUrl?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// --- API Error Codes ---

export const errorCodes = {
  authRequired: "AUTH_REQUIRED",
  authInvalid: "AUTH_INVALID",
  rateLimited: "RATE_LIMITED",
  inputTooLong: "INPUT_TOO_LONG",
  sonnetLimitReached: "SONNET_LIMIT_REACHED",
  validationError: "VALIDATION_ERROR",
  aiUnavailable: "AI_UNAVAILABLE",
  serverError: "SERVER_ERROR",
  notFound: "NOT_FOUND",
  webhookSignatureFailed: "WEBHOOK_SIGNATURE_FAILED",
} as const;
export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

// --- Feedback ---

export type FeedbackRequest = {
  decodeId: string;
  thumbsUp: boolean;
};

// --- Extension Storage ---

export type ExtensionStorage = {
  apiKey?: string;
  userEmail?: string;
  userPlan?: UserPlan;
};

// --- Captured Error (console/network interceptors) ---

export type CapturedError = {
  text: string;
  level: string;
  timestamp: number;
  url?: string;
  domain?: string;
  source?: string;
  tabId: number;
};

// --- Stripe Setup Config ---

export type StripeProductConfig = {
  name: string;
  description: string;
  prices: StripePriceConfig[];
};

export type StripePriceConfig = {
  nickname: string;
  amount: number;
  currency: string;
  interval: "month" | "year";
};
