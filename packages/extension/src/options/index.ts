// Options page — account settings

import { storage } from "../shared/storage";

const loadProfile = async () => {
  const email = await storage.get("userEmail");
  const plan = await storage.get("userPlan");
  const apiKey = await storage.get("apiKey");

  document.getElementById("email")!.textContent = email ?? "Not signed in";
  document.getElementById("plan")!.textContent = plan === "pro" ? "Pro" : "Free";
  document.getElementById("api-key")!.textContent = apiKey
    ? `${apiKey.slice(0, 8)}••••••••`
    : "Not set";
};

document.getElementById("copy-key")?.addEventListener("click", async () => {
  const apiKey = await storage.get("apiKey");
  if (apiKey) {
    await navigator.clipboard.writeText(apiKey);
    const btn = document.getElementById("copy-key")!;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = "Copy Key"; }, 2000);
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
