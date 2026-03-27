// Content script — lightweight, runs on every page
// Detects page context and responds to background worker requests

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
  // Check for minified stack trace patterns
  const patterns = [
    /:1:\d+/, // single-line references like :1:4523
    /[a-f0-9]{8,}\.(js|css)/, // hash filenames like main.a3f8b2c.js
    /webpack:\/\//, // webpack internal refs
    /vite:\/\//, // vite internal refs
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

// Send page context to background when requested
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

  return true;
});
