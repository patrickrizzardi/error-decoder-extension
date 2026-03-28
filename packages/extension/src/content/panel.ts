// Injected panel — renders decode results as a sidebar overlay on the current page

let panelFrame: HTMLIFrameElement | null = null;
let panelVisible = false;

const PANEL_WIDTH = 400;

export const showPanel = () => {
  if (!panelFrame) {
    createPanel();
  }

  panelFrame!.style.transform = "translateX(0)";
  panelVisible = true;

  // Push page content over to make room
  document.body.style.transition = "margin-right 0.2s ease";
  document.body.style.marginRight = `${PANEL_WIDTH}px`;
};

export const hidePanel = () => {
  if (!panelFrame) return;

  panelFrame.style.transform = `translateX(${PANEL_WIDTH}px)`;
  panelVisible = false;

  document.body.style.marginRight = "0";
};

export const togglePanel = () => {
  if (panelVisible) {
    hidePanel();
  } else {
    showPanel();
  }
};

export const isPanelVisible = () => panelVisible;

const createPanel = () => {
  // Create iframe that loads our sidepanel HTML
  panelFrame = document.createElement("iframe");
  panelFrame.id = "errordecoder-panel";
  panelFrame.src = chrome.runtime.getURL("sidepanel/index.html");

  // Style as a fixed sidebar on the right
  Object.assign(panelFrame.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: `${PANEL_WIDTH}px`,
    height: "100vh",
    border: "none",
    borderLeft: "1px solid #3e3e3e",
    zIndex: "2147483647", // Max z-index — always on top
    transform: `translateX(${PANEL_WIDTH}px)`, // Start hidden off-screen
    transition: "transform 0.2s ease",
    boxShadow: "-2px 0 12px rgba(0, 0, 0, 0.3)",
    backgroundColor: "#1e1e1e",
  });

  document.body.appendChild(panelFrame);

  // Listen for close message from the iframe
  window.addEventListener("message", (event) => {
    if (event.data?.type === "ERRORDECODER_CLOSE") {
      hidePanel();
    }
  });
};
