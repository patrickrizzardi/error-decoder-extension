import type { ModelName } from "@shared/types";

export type DecodeHistoryEntry = {
  id: string;
  decodeId?: string;
  errorPreview: string;
  markdown: string;
  model: ModelName;
  cached: boolean;
  timestamp: number;
  feedbackGiven?: "up" | "down";
};

const HISTORY_KEY = "decodeHistory";
const MAX_ENTRIES = 10;

export const loadHistory = async (): Promise<DecodeHistoryEntry[]> => {
  const result = await chrome.storage.session.get(HISTORY_KEY);
  return (result[HISTORY_KEY] as DecodeHistoryEntry[] | undefined) ?? [];
};

export const saveToHistory = async (entry: DecodeHistoryEntry): Promise<void> => {
  const history = await loadHistory();
  history.unshift(entry);
  if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;
  await chrome.storage.session.set({ [HISTORY_KEY]: history });
};

export const updateHistoryFeedback = async (id: string, feedback: "up" | "down"): Promise<void> => {
  const history = await loadHistory();
  const entry = history.find((e) => e.id === id);
  if (entry) {
    entry.feedbackGiven = feedback;
    await chrome.storage.session.set({ [HISTORY_KEY]: history });
  }
};
