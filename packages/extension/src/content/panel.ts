// Injected panel — sidebar that pushes page content over, resizable via drag handle

let panelFrame: HTMLIFrameElement | null = null;
let dragHandle: HTMLDivElement | null = null;
let panelVisible = false;
let panelWidth = 400;

// Load saved width
const STORAGE_KEY = "errordecoder-panel-width";
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  // Min/max panel width in pixels
  if (saved) panelWidth = Math.max(280, Math.min(800, parseInt(saved, 10)));
} catch {}

export const showPanel = () => {
  if (!panelFrame) {
    createPanel();
  }

  panelFrame!.style.transform = "translateX(0)";
  panelFrame!.style.width = `${panelWidth}px`;
  dragHandle!.style.right = `${panelWidth - 6}px`;
  dragHandle!.style.opacity = "1";
  panelVisible = true;

  const html = document.documentElement;
  html.style.transition = "margin-right 0.2s ease";
  html.style.marginRight = `${panelWidth}px`;
  html.style.overflow = "auto";
};

export const hidePanel = () => {
  if (!panelFrame) return;

  panelFrame.style.transform = `translateX(${panelWidth}px)`;
  panelVisible = false;

  if (dragHandle) dragHandle.style.opacity = "0";

  const html = document.documentElement;
  html.style.marginRight = "0";
};

export const isPanelVisible = () => panelVisible;

const resizePanel = (newWidth: number) => {
  panelWidth = Math.max(280, Math.min(800, newWidth));

  if (panelFrame) {
    panelFrame.style.width = `${panelWidth}px`;
  }
  if (dragHandle) {
    dragHandle.style.right = `${panelWidth - 6}px`;
  }

  document.documentElement.style.marginRight = `${panelWidth}px`;

  // Save preference
  try { localStorage.setItem(STORAGE_KEY, String(panelWidth)); } catch {}
};

const createPanel = () => {
  // Create the iframe
  panelFrame = document.createElement("iframe");
  panelFrame.id = "errordecoder-panel";
  panelFrame.src = chrome.runtime.getURL("sidepanel/index.html");
  panelFrame.setAttribute("allow", "clipboard-write");

  Object.assign(panelFrame.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: `${panelWidth}px`,
    height: "100vh",
    border: "none",
    borderLeft: "1px solid #3e3e3e",
    // Max 32-bit signed int — ensures panel is above all page content
    zIndex: "2147483647",
    transform: `translateX(${panelWidth}px)`,
    transition: "transform 0.2s ease",
    boxShadow: "-2px 0 12px rgba(0, 0, 0, 0.3)",
    backgroundColor: "#1e1e1e",
  });

  document.body.appendChild(panelFrame);

  // Create drag handle on the left edge of the panel
  dragHandle = document.createElement("div");
  dragHandle.id = "errordecoder-drag";
  Object.assign(dragHandle.style, {
    position: "fixed",
    top: "0",
    right: `${panelWidth - 6}px`,
    width: "12px",
    height: "100vh",
    cursor: "col-resize",
    zIndex: "2147483647",
    opacity: "0",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  // Grip pill — same width as visual indicator, no background on parent
  const grip = document.createElement("div");
  Object.assign(grip.style, {
    width: "4px",
    height: "48px",
    borderRadius: "2px",
    background: "rgba(180, 180, 180, 0.8)",
    transition: "background 0.15s, height 0.15s, width 0.15s",
  });
  dragHandle.appendChild(grip);

  dragHandle.addEventListener("mouseenter", () => {
    grip.style.background = "rgba(86, 156, 214, 0.9)";
    grip.style.height = "64px";
    grip.style.width = "5px";
  });
  dragHandle.addEventListener("mouseleave", () => {
    if (!isDragging) {
      grip.style.background = "rgba(180, 180, 180, 0.8)";
      grip.style.height = "48px";
      grip.style.width = "4px";
    }
  });

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  dragHandle.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = panelWidth;

    // Disable transitions during drag for smooth resizing
    if (panelFrame) panelFrame.style.transition = "none";
    document.documentElement.style.transition = "none";

    // Prevent iframe from eating mouse events
    if (panelFrame) panelFrame.style.pointerEvents = "none";

    grip.style.background = "rgba(86, 156, 214, 0.9)";
    grip.style.height = "64px";

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const delta = startX - e.clientX;
    resizePanel(startWidth + delta);
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;

    if (panelFrame) {
      panelFrame.style.transition = "transform 0.2s ease";
      panelFrame.style.pointerEvents = "auto";
    }
    document.documentElement.style.transition = "margin-right 0.2s ease";

    grip.style.background = "rgba(180, 180, 180, 0.8)";
    grip.style.height = "48px";
    grip.style.width = "4px";
  });

  document.body.appendChild(dragHandle);

  // Listen for close message from the iframe
  window.addEventListener("message", (event) => {
    if (event.data?.type === "ERRORDECODER_CLOSE") {
      hidePanel();
    }
  });
};
