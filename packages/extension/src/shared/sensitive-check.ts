// Scans text for potential secrets, PII, and sensitive data before sending to API

type SensitiveMatch = {
  type: string;
  preview: string; // redacted preview showing what was found
};

const patterns: { type: string; regex: RegExp }[] = [
  // Cloud provider keys
  { type: "AWS Access Key", regex: /AKIA[A-Z0-9]{16}/ },
  { type: "AWS Secret Key", regex: /aws.{0,10}secret.{0,10}[=:]\s*["']?[A-Za-z0-9/+=]{40}/i },

  // API keys by provider
  { type: "Stripe Key", regex: /(sk|pk|rk)_(live|test)_[a-zA-Z0-9]{10,}/ },
  { type: "Anthropic Key", regex: /sk-ant-[a-zA-Z0-9_-]{20,}/ },
  { type: "OpenAI Key", regex: /sk-[a-zA-Z0-9]{20,}/ },
  { type: "GitHub Token", regex: /(ghp|gho|ghs|ghr)_[a-zA-Z0-9]{36}/ },
  { type: "GitLab Token", regex: /glpat-[a-zA-Z0-9_-]{20}/ },
  { type: "Slack Token", regex: /xox[bpas]-[a-zA-Z0-9-]{10,}/ },
  { type: "npm Token", regex: /npm_[a-zA-Z0-9]{36}/ },
  { type: "Supabase Key", regex: /sbp_[a-zA-Z0-9]{20,}/ },

  // PII
  { type: "Social Security Number", regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { type: "Credit Card (Visa)", regex: /\b4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
  { type: "Credit Card (Mastercard)", regex: /\b5[1-5]\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
  { type: "Credit Card (Amex)", regex: /\b3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}\b/ },
  { type: "Credit Card (Discover)", regex: /\b6(?:011|5\d{2})[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
  { type: "Bank Account/Routing Number", regex: /\b(routing|account)[_\s-]?(number|num|no)?[=:]\s*["']?\d{8,17}/i },
  { type: "Date of Birth", regex: /\b(dob|date.of.birth|birthday)[=:]\s*["']?\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/i },
  { type: "Passport Number", regex: /passport[_\s-]?(number|num|no)?[=:]\s*["']?[A-Z0-9]{6,12}/i },
  { type: "Driver's License", regex: /driver.?s?.?licen[sc]e[_\s-]?(number|num|no)?[=:]\s*["']?[A-Z0-9]{5,15}/i },

  // Generic secrets
  { type: "Private Key", regex: /-----BEGIN[\s\w]*PRIVATE KEY-----/ },
  { type: "JWT Token", regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/ },
  { type: "Bearer Token", regex: /Bearer\s+[a-zA-Z0-9._\-]{20,}/ },
  { type: "Connection String", regex: /(postgres|mysql|mongodb|redis|amqp):\/\/[^\s]{10,}/ },
  { type: "Password", regex: /password[=:]\s*["']?[^\s"']{4,}/i },
  { type: "API Key (generic)", regex: /api[_-]?key[=:]\s*["']?[a-zA-Z0-9_-]{16,}/i },
  { type: "Secret (generic)", regex: /secret[_-]?key[=:]\s*["']?[a-zA-Z0-9_-]{16,}/i },
];

const redact = (match: string): string => {
  if (match.length <= 12) return match.slice(0, 4) + "***";
  return match.slice(0, 6) + "..." + match.slice(-4);
};

// Keyword indicators — if none are present, skip the full 27-pattern scan
const QUICK_INDICATORS = [
  "AKIA", "sk-", "sk_", "ghp_", "gho_", "ghs_", "ghr_", "glpat-", "xox",
  "npm_", "sbp_", "password", "secret", "Bearer", "-----BEGIN", "eyJ",
  "postgres://", "mysql://", "mongodb://", "redis://", "amqp://",
  "SSN", "credit", "passport", "driver",
];

export const checkSensitiveData = (text: string): SensitiveMatch[] => {
  // Quick preflight: check keyword indicators first
  const lowerText = text.toLowerCase();
  const hasKeywordIndicator = QUICK_INDICATORS.some((ind) =>
    lowerText.includes(ind.toLowerCase())
  );

  // Also check for number patterns that keywords won't catch (SSN, credit cards)
  const hasNumberPattern = /\d{3}[-\s]\d{2}[-\s]\d{4}|\d{4}[-\s]\d{4}[-\s]\d{4}/.test(text);

  if (!hasKeywordIndicator && !hasNumberPattern) return [];

  // Full 27-pattern regex scan — only runs when indicators are present
  const matches: SensitiveMatch[] = [];
  const seen = new Set<string>();

  for (const { type, regex } of patterns) {
    const match = text.match(regex);
    if (match && !seen.has(type)) {
      seen.add(type);
      matches.push({ type, preview: redact(match[0]) });
    }
  }

  return matches;
};

export const formatSensitiveWarning = (matches: SensitiveMatch[]): string => {
  const list = matches.map((m) => `• ${m.type}: ${m.preview}`).join("\n");
  return `Sensitive data detected:\n\n${list}\n\nThis text will be sent to our API for AI processing. Remove secrets and credentials before sending.`;
};
