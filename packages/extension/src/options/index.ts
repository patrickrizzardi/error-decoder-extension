// Options page — account settings

import { storage } from "../shared/storage";
import { copyToClipboard } from "../shared/ui";

const loadProfile = async () => {
  const email = await storage.get("userEmail");
  const plan = await storage.get("userPlan");
  const apiKey = await storage.get("apiKey");

  document.getElementById("email")!.textContent = email ?? "Not signed in";
  document.getElementById("plan")!.textContent = plan === "pro" ? "Pro" : "Free";
  document.getElementById("api-key")!.textContent = apiKey
    ? `${apiKey.slice(0, 8)}••••••••`
    : "Not set";

  // Hide manual key input if already has a key
  const manualSection = document.getElementById("manual-key-section")!;
  if (apiKey) {
    manualSection.style.display = "none";
  }
};

// Save manually entered API key
document.getElementById("save-key")?.addEventListener("click", async () => {
  const input = document.getElementById("manual-key-input") as HTMLInputElement;
  const key = input.value.trim();
  if (!key) return;

  await storage.set("apiKey", key);
  document.getElementById("save-status")!.textContent = "Saved!";
  input.value = "";
  setTimeout(() => {
    document.getElementById("save-status")!.textContent = "";
  }, 2000);
  loadProfile();
});

document.getElementById("copy-key")?.addEventListener("click", async () => {
  const apiKey = await storage.get("apiKey");
  if (apiKey) {
    const btn = document.getElementById("copy-key")!;
    copyToClipboard(btn, () => apiKey, "Copy Key");
  }
});

document.getElementById("logout")?.addEventListener("click", async () => {
  await storage.clear();
  loadProfile();
});

document.getElementById("delete-account")?.addEventListener("click", async () => {
  if (!confirm("Delete your account and all data? This cannot be undone.")) return;

  const { api } = await import("../shared/api");
  await api.deleteAccount();
  await storage.clear();
  loadProfile();
});

loadProfile();
