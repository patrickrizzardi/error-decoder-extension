import type { ExtensionStorage } from "@shared/types";

// Typed wrapper around chrome.storage.local
export const storage = {
  get: async <K extends keyof ExtensionStorage>(
    key: K
  ): Promise<ExtensionStorage[K] | undefined> => {
    const result = await chrome.storage.local.get(key);
    return result[key] as ExtensionStorage[K] | undefined;
  },

  set: async <K extends keyof ExtensionStorage>(
    key: K,
    value: ExtensionStorage[K]
  ): Promise<void> => {
    await chrome.storage.local.set({ [key]: value });
  },

  remove: async (key: keyof ExtensionStorage): Promise<void> => {
    await chrome.storage.local.remove(key);
  },

  clear: async (): Promise<void> => {
    await chrome.storage.local.clear();
  },
};

export const getApiKey = (): Promise<string | null> =>
  storage.get("apiKey").then((key) => key || null);

