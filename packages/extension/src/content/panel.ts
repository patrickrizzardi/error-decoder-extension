// Injected panel — sidebar that pushes page content over

let panelFrame: HTMLIFrameElement | null = null;
let panelVisible = false;

const PANEL_WIDTH = 400;

export const showPanel = () => {
  if (!panelFrame) {
    createPanel();
  }

  panelFrame!.style.transform = "translateX(0)";
  panelVisible = true;

  // Push the entire page over — use html element for most reliable push
  const html = document.documentElement;
  html.style.transition = "margin-right 0.2s ease, width 0.2s ease";
  html.style.marginRight = `${PANEL_WIDTH}px`;
  html.style.overflow = "auto";
};

export const hidePanel = () => {
  if (!panelFrame) return;

  panelFrame.style.transform = `translateX(${PANEL_WIDTH}px)`;
  panelVisible = false;

  const html = document.documentElement;
  html.style.marginRight = "0";
};

export const togglePanel = () => {
  if (panelVisible) hidePanel(); else showPanel();
};

export const isPanelVisible = () => panelVisible;

const createPanel = () => {
  panelFrame = document.createElement("iframe");
  panelFrame.id = "errordecoder-panel";
  panelFrame.src = chrome.runtime.getURL("sidepanel/index.html");

  Object.assign(panelFrame.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: `${PANEL_WIDTH}px`,
    height: "100vh",
    border: "none",
    borderLeft: "1px solid #3e3e3e",
    zIndex: "2147483647",
    transform: `translateX(${PANEL_WIDTH}px)`,
    transition: "transform 0.2s ease",
    boxShadow: "-2px 0 12px rgba(0, 0, 0, 0.3)",
    backgroundColor: "#1e1e1e",
  });

  document.body.appendChild(panelFrame);

  window.addEventListener("message", (event) => {
    if (event.data?.type === "ERRORDECODER_CLOSE") {
      hidePanel();
    }
  });
};
