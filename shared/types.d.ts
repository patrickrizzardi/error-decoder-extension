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
export type CodeExample = {
    before?: string;
    after: string;
    language?: string;
};
export type DecodeResponse = {
    whatHappened: string;
    why: string[];
    howToFix: string[];
    codeExample?: CodeExample;
    errorCategory?: string;
    confidence: "high" | "medium" | "low";
    model: "haiku" | "sonnet";
    cached: boolean;
};
export type UsageResponse = {
    email: string;
    used: number;
    limit: number;
    plan: UserPlan;
    resetsAt: string;
    sonnetUsed: number;
    sonnetLimit: number;
};
export declare const userPlans: {
    readonly free: "free";
    readonly pro: "pro";
};
export type UserPlan = (typeof userPlans)[keyof typeof userPlans];
export type UserProfile = {
    id: string;
    email: string;
    plan: UserPlan;
    createdAt: string;
};
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
export declare const errorCodes: {
    readonly authRequired: "AUTH_REQUIRED";
    readonly authInvalid: "AUTH_INVALID";
    readonly rateLimited: "RATE_LIMITED";
    readonly inputTooLong: "INPUT_TOO_LONG";
    readonly sonnetLimitReached: "SONNET_LIMIT_REACHED";
    readonly validationError: "VALIDATION_ERROR";
    readonly aiUnavailable: "AI_UNAVAILABLE";
    readonly serverError: "SERVER_ERROR";
    readonly notFound: "NOT_FOUND";
};
export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];
export type FeedbackRequest = {
    decodeId: string;
    thumbsUp: boolean;
};
export type ExtensionStorage = {
    apiKey?: string;
    userEmail?: string;
    userPlan?: UserPlan;
};
export type CapturedError = {
    text: string;
    level: string;
    timestamp: number;
    url?: string;
    domain?: string;
    source?: string;
    tabId?: number;
};
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
//# sourceMappingURL=types.d.ts.map