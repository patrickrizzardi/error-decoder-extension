// Element inspector — hover to highlight, click to select, capture element info

let inspecting = false;
let overlay: HTMLDivElement | null = null;
let hoveredElement: HTMLElement | null = null;

const OVERLAY_COLOR = "rgba(86, 156, 214, 0.2)";
const OVERLAY_BORDER = "rgba(86, 156, 214, 0.8)";

export const startInspecting = () => {
  if (inspecting) return;
  inspecting = true;

  // Create highlight overlay
  overlay = document.createElement("div");
  overlay.id = "errordecoder-inspector-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483646",
    background: OVERLAY_COLOR,
    border: `2px solid ${OVERLAY_BORDER}`,
    borderRadius: "2px",
    transition: "all 0.1s ease",
    display: "none",
  });
  document.body.appendChild(overlay);

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);

  // Change cursor
  document.body.style.cursor = "crosshair";
};

export const stopInspecting = () => {
  if (!inspecting) return;
  inspecting = false;

  overlay?.remove();
  overlay = null;
  hoveredElement = null;

  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeyDown, true);

  document.body.style.cursor = "";
};

const onMouseMove = (e: MouseEvent) => {
  const target = e.target as HTMLElement;

  // Skip our own UI elements
  if (target.closest("#errordecoder-panel") || target.id === "errordecoder-inspector-overlay") return;

  hoveredElement = target;

  if (overlay) {
    const rect = target.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: "block",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }
};

const onClick = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();

  if (!hoveredElement) return;

  const info = getElementInfo(hoveredElement);
  stopInspecting();

  // Send element info to sidebar
  chrome.runtime.sendMessage({
    type: "ELEMENT_SELECTED",
    element: info,
  }).catch(() => {});
};

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    stopInspecting();
    chrome.runtime.sendMessage({ type: "INSPECT_CANCELLED" }).catch(() => {});
  }
};

const getElementInfo = (el: HTMLElement) => {
  const computed = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  // Get meaningful selector
  let selector = el.tagName.toLowerCase();
  if (el.id) selector += `#${el.id}`;
  if (el.className && typeof el.className === "string") {
    selector += "." + el.className.trim().split(/\s+/).slice(0, 3).join(".");
  }

  // Get relevant computed styles
  const styles: Record<string, string> = {};
  const relevantProps = [
    "display", "position", "width", "height", "margin", "padding",
    "color", "background-color", "font-size", "font-weight", "font-family",
    "border", "border-radius", "flex-direction", "justify-content",
    "align-items", "gap", "grid-template-columns", "overflow",
    "opacity", "z-index", "box-shadow", "text-align",
  ];

  for (const prop of relevantProps) {
    const val = computed.getPropertyValue(prop);
    if (val && val !== "none" && val !== "normal" && val !== "auto" && val !== "0px") {
      styles[prop] = val;
    }
  }

  // Find matching CSS rules and their source files
  const matchedRules = getMatchedCSSRules(el);

  return {
    tag: el.tagName.toLowerCase(),
    selector,
    id: el.id || undefined,
    classes: el.className && typeof el.className === "string" ? el.className.trim().split(/\s+/) : [],
    text: (el.textContent || "").trim().slice(0, 100),
    attributes: getRelevantAttributes(el),
    styles,
    cssRules: matchedRules,
    dimensions: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
    },
    outerHTML: el.outerHTML.slice(0, 500),
    parentTag: el.parentElement?.tagName.toLowerCase(),
    childCount: el.children.length,
  };
};

// Find CSS rules that apply to the element + which stylesheet they're from
const getMatchedCSSRules = (el: HTMLElement): Array<{ selector: string; file: string; properties: string }> => {
  const matched: Array<{ selector: string; file: string; properties: string }> = [];

  try {
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules || sheet.rules;
      } catch {
        continue; // Cross-origin stylesheet, can't read
      }

      const sheetFile = sheet.href
        ? sheet.href.split("/").pop()?.split("?")[0] || "inline"
        : "inline";

      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          try {
            if (el.matches(rule.selectorText)) {
              // Extract just the relevant properties (not all 100+)
              const props: string[] = [];
              for (let i = 0; i < rule.style.length && i < 20; i++) {
                const prop = rule.style[i];
                props.push(`${prop}: ${rule.style.getPropertyValue(prop)}`);
              }

              matched.push({
                selector: rule.selectorText,
                file: sheetFile,
                properties: props.join("; "),
              });
            }
          } catch {
            // Invalid selector, skip
          }
        }
      }
    }
  } catch {
    // Stylesheet access failed
  }

  // Return most specific rules (last ones win in CSS), limited to 10
  return matched.slice(-10);
};

const getRelevantAttributes = (el: HTMLElement): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const skip = ["class", "id", "style"]; // Already captured

  for (const attr of el.attributes) {
    if (!skip.includes(attr.name)) {
      attrs[attr.name] = attr.value.slice(0, 100);
    }
  }

  return attrs;
};
