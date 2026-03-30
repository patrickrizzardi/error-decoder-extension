// Content script — runs on every page (ISOLATED world)
// Error relay handled by relay.ts (document_start)
// This script: panel UI, inspector, tech detection, source map resolution

import { showPanel, hidePanel, isPanelVisible } from "./panel";
import { startInspecting, stopInspecting } from "./inspector";
import { detectTechStack } from "./tech-detect";
import { resolveStackTrace } from "./sourcemap";

// Run tech detection after page loads, store for sidebar
const runTechDetection = () => {
  // Wait a bit for the main world script to populate globals
  setTimeout(() => {
    const tech = detectTechStack();
    chrome.runtime.sendMessage({
      type: "TECH_DETECTED",
      tech,
    }).catch(() => {});
  }, 1500);
};

if (document.readyState === "complete") {
  runTechDetection();
} else {
  window.addEventListener("load", runTechDetection);
}

// Listen for messages from background worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTEXT") {
    const tech = detectTechStack();
    sendResponse({
      url: window.location.href,
      domain: window.location.hostname,
      tech,
      isDev:
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.port !== "",
    });
  }
  if (message.type === "SHOW_PANEL") { showPanel(); sendResponse({ shown: true }); }
  if (message.type === "HIDE_PANEL") { hidePanel(); sendResponse({ hidden: true }); }
  if (message.type === "TOGGLE_PANEL") {
    if (isPanelVisible()) hidePanel(); else showPanel();
    sendResponse({ visible: isPanelVisible() });
  }
  if (message.type === "START_INSPECT") { startInspecting(); sendResponse({ started: true }); }
  if (message.type === "STOP_INSPECT") { stopInspecting(); sendResponse({ stopped: true }); }

  // Resolve source maps for a stack trace
  if (message.type === "RESOLVE_SOURCEMAP") {
    resolveStackTrace(message.errorText).then((resolved) => {
      sendResponse({ resolved });
    }).catch(() => {
      sendResponse({ resolved: message.errorText }); // Return original on failure
    });
    return true; // Keep channel open for async response
  }

  return true;
});
