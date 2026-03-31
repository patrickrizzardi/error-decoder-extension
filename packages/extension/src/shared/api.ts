import type {
  ApiResponse,
  DecodeRequest,
  DecodeResponse,
  UsageResponse,
  FeedbackRequest,
} from "@shared/types";
import { storage } from "./storage";

declare const __API_BASE__: string;
declare const __AUTH_URL__: string;

// In dev: localhost. In production: errordecoder.dev
// Set at build time via build.ts define
export const API_BASE =
  typeof __API_BASE__ !== "undefined"
    ? __API_BASE__
    : "http://localhost:4001/api";

export const AUTH_URL =
  typeof __AUTH_URL__ !== "undefined"
    ? __AUTH_URL__
    : "http://localhost:4000/auth";

const getHeaders = async (): Promise<HeadersInit> => {
  const apiKey = await storage.get("apiKey");
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
};

const request = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  return response.json();
};

export const api = {
  decode: (body: DecodeRequest) =>
    request<DecodeResponse>("/decode", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  usage: () => request<UsageResponse>("/usage"),

  feedback: (body: FeedbackRequest) =>
    request<{ saved: boolean }>("/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getApiKey: (supabaseJwt: string) =>
    request<{ apiKey: string; email: string; plan: string }>("/auth/key", {
      method: "POST",
      headers: { Authorization: `Bearer ${supabaseJwt}` },
    }),

  checkout: (interval: "month" | "year") =>
    request<{ url: string }>("/checkout", {
      method: "POST",
      body: JSON.stringify({ interval }),
    }),

  portal: () =>
    request<{ url: string }>("/portal", { method: "POST" }),

  deleteAccount: () =>
    request<{ deleted: boolean }>("/account", { method: "DELETE" }),
};
