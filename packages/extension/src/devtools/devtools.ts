// DevTools entry — creates the ErrorDecoder panel tab inside Chrome DevTools

chrome.devtools.panels.create(
  "ErrorDecoder",
  "icons/icon-16.png",
  "devtools/panel.html"
);
