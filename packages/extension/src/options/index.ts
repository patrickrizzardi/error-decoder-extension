// Options page — account settings

import { storage } from "../shared/storage";
import { copyToClipboard } from "../shared/ui";
import { showConfirmModal } from "../shared/modal";
import { API_BASE, SITE_URL } from "../shared/api";

// Set legal links from SITE_URL — no hardcoded domains
document.getElementById("privacy-link")?.setAttribute("href", `${SITE_URL}/privacy`);
document.getElementById("terms-link")?.setAttribute("href", `${SITE_URL}/terms`);

const loadProfile = async () => {
  const email = await storage.get("userEmail");
  const plan = await storage.get("userPlan");
  const apiKey = await storage.get("apiKey");

  const emailEl = document.getElementById("email");
  if (!emailEl) throw new Error("Missing #email element");
  emailEl.textContent = email ?? "Not signed in";
  const planEl = document.getElementById("plan");
  if (!planEl) throw new Error("Missing #plan element");
  planEl.textContent = plan === "pro" ? "Pro" : "Free";
  const apiKeyEl = document.getElementById("api-key");
  if (!apiKeyEl) throw new Error("Missing #api-key element");
  apiKeyEl.textContent = apiKey
    ? `${apiKey.slice(0, 8)}••••••••`
    : "Not set";

  // Hide manual key input if already has a key
  const manualSection = document.getElementById("manual-key-section");
  if (!manualSection) throw new Error("Missing #manual-key-section element");
  manualSection.style.display = apiKey ? "none" : "block";

  // Manage/Upgrade button — text changes based on plan
  const manageBtn = document.getElementById("manage-sub");
  if (!manageBtn) throw new Error("Missing #manage-sub element");
  if (!apiKey) {
    manageBtn.style.display = "none";
  } else {
    manageBtn.style.display = "inline-block";
    manageBtn.textContent = plan === "pro" ? "Manage Subscription" : "Upgrade to Pro";
  }
};

// Save manually entered API key — validate first, then save
document.getElementById("save-key")?.addEventListener("click", async () => {
  const input = document.getElementById("manual-key-input") as HTMLInputElement;
  const statusEl = document.getElementById("save-status");
  if (!statusEl) throw new Error("Missing #save-status element");
  const key = input.value.trim();
  if (!key) return;

  statusEl.textContent = "Validating key...";
  statusEl.style.color = "var(--accent)";

  // Validate the key WITHOUT storing it first — only store on confirmed success
  try {
    const res = await fetch(`${API_BASE}/usage`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json = await res.json() as { data?: { plan: string; email: string } };

    if (json.data?.email) {
      // Key is valid — NOW store it
      await storage.set("apiKey", key);
      await storage.set("userPlan", json.data.plan);
      await storage.set("userEmail", json.data.email);
      statusEl.textContent = "Saved!";
      statusEl.style.color = "var(--accent)";
      input.value = "";
    } else {
      // Invalid key — never stored
      statusEl.textContent = "Invalid API key. Check and try again.";
      statusEl.style.color = "var(--error, #f44747)";
    }
  } catch {
    // Network error — never stored
    statusEl.textContent = "Could not validate key. Check your connection.";
    statusEl.style.color = "var(--error, #f44747)";
  }

  setTimeout(() => {
    statusEl.textContent = "";
  }, 4000);
  loadProfile();
});

document.getElementById("copy-key")?.addEventListener("click", async () => {
  const apiKey = await storage.get("apiKey");
  if (apiKey) {
    const btn = document.getElementById("copy-key");
    if (btn) copyToClipboard(btn, () => apiKey, "Copy Key");
  }
});

document.getElementById("manage-sub")?.addEventListener("click", async () => {
  const plan = await storage.get("userPlan");
  const { api, SITE_URL } = await import("../shared/api");

  if (plan === "pro") {
    const res = await api.portal();
    if ("data" in res) {
      chrome.tabs.create({ url: res.data.url });
    }
  } else {
    chrome.tabs.create({ url: `${SITE_URL}/#pricing` });
  }
});

document.getElementById("logout")?.addEventListener("click", async () => {
  await storage.clear();
  const { AUTH_URL } = await import("../shared/api");
  chrome.tabs.create({ url: `${AUTH_URL}?logout=true` });
  loadProfile();
});

document.getElementById("delete-account")?.addEventListener("click", async () => {
  const confirmed = await showConfirmModal({
    title: "Delete Account",
    message: "This will permanently delete your account, cancel your subscription, and erase all decode history. This cannot be undone.",
    confirmText: "Delete My Account",
    confirmDanger: true,
  });
  if (!confirmed) return;

  const { api, AUTH_URL } = await import("../shared/api");
  const result = await api.deleteAccount();

  if ("error" in result) {
    // Show error — don't clear storage on failure
    await showConfirmModal({
      title: "Deletion Failed",
      message: "Could not delete your account. Please try again or contact support.",
      confirmText: "OK",
    });
    return;
  }

  await storage.clear();
  chrome.tabs.create({ url: `${AUTH_URL}?logout=true` });
  loadProfile();
});

// React to auth/plan changes from other tabs
chrome.storage.local.onChanged.addListener(() => {
  loadProfile();
});

loadProfile();
