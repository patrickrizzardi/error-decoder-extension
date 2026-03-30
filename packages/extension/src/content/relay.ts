// Lightweight error relay — runs at document_start in ISOLATED world
// Catches CustomEvents from main world capture script immediately
// No DOM manipulation, no imports — just relay errors to background

document.addEventListener("errordecoder-error", ((event: CustomEvent) => {
  chrome.runtime.sendMessage({
    type: "CAPTURED_ERROR",
    text: event.detail.text,
    level: event.detail.level,
    timestamp: Date.now(),
    url: window.location.href,
    domain: window.location.hostname,
  }).catch(() => {});
}) as EventListener);
