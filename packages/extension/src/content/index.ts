// Content script — runs on every page
// Handles: page context detection, text selection, injected result panel

import { showPanel, hidePanel, isPanelVisible } from "./panel";

const detectFramework = (): string | undefined => {
  if (document.querySelector("[data-reactroot]") || (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) return "react";
  if ((window as any).__VUE__) return "vue";
  if (document.querySelector("[ng-version]")) return "angular";
  if ((window as any).__NEXT_DATA__) return "nextjs";
  if ((window as any).__NUXT__) return "nuxt";
  if ((window as any).__SVELTE_HMR) return "svelte";
  return undefined;
};

const detectIsMinified = (text: string): boolean => {
  const patterns = [
    /:1:\d+/,
    /[a-f0-9]{8,}\.(js|css)/,
    /webpack:\/\//,
    /vite:\/\//,
  ];
  return patterns.some((p) => p.test(text));
};

const getPageContext = () => ({
  url: window.location.href,
  domain: window.location.hostname,
  framework: detectFramework(),
  isDev:
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.port !== "",
});

// Listen for messages from background worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTEXT") {
    sendResponse(getPageContext());
  }

  if (message.type === "GET_SELECTION") {
    const selection = window.getSelection()?.toString()?.trim() ?? "";
    sendResponse({
      text: selection,
      isMinified: detectIsMinified(selection),
      ...getPageContext(),
    });
  }

  if (message.type === "SHOW_PANEL") {
    showPanel();
    sendResponse({ shown: true });
  }

  if (message.type === "HIDE_PANEL") {
    hidePanel();
    sendResponse({ hidden: true });
  }

  if (message.type === "TOGGLE_PANEL") {
    if (isPanelVisible()) {
      hidePanel();
    } else {
      showPanel();
    }
    sendResponse({ visible: isPanelVisible() });
  }

  return true;
});
