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
  // Ensure we have an actual Element (not a text node, comment, etc.)
  let target = e.target as Node;
  if (!(target instanceof HTMLElement)) target = target.parentElement as HTMLElement;
  if (!target || !(target instanceof HTMLElement)) return;

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

const onClick = async (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();

  // Walk up to the nearest HTMLElement
  let target: HTMLElement | null = hoveredElement;
  if (!target) {
    let node: Node | null = e.target as Node;
    while (node && !(node instanceof HTMLElement)) node = node.parentNode;
    target = node as HTMLElement | null;
  }
  if (!target || !(target instanceof HTMLElement)) return;

  stopInspecting();

  const info = getElementInfo(target);

  // Send element info immediately — don't block on source map resolution
  chrome.runtime.sendMessage({
    type: "ELEMENT_SELECTED",
    element: info,
  }).catch(() => {});

  // Then try to resolve CSS source maps in the background
  // If it works, send an updated element with original file names
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    const resolution = resolveCSSSourceMaps(info.cssRules);
    const resolvedRules = await Promise.race([resolution, timeout]);

    if (resolvedRules && resolvedRules !== info.cssRules) {
      chrome.runtime.sendMessage({
        type: "ELEMENT_SELECTED",
        element: { ...info, cssRules: resolvedRules },
      }).catch(() => {});
    }
  } catch {
    // Source map resolution failed — no problem, we already sent the basic info
  }
};

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    stopInspecting();
    chrome.runtime.sendMessage({ type: "INSPECT_CANCELLED" }).catch(() => {});
  }
};

const getElementInfo = (el: HTMLElement | Element) => {
  // Ensure it's an Element that getComputedStyle can handle
  if (!(el instanceof Element)) return { tag: "unknown", selector: "unknown", styles: {}, dimensions: { width: 0, height: 0, top: 0, left: 0 }, outerHTML: "", childCount: 0, cssRules: [] };

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

// ============================================
// CSS Source Map Resolution
// ============================================

// Cache for fetched CSS source maps
const cssMapCache = new Map<string, any>();

// For each matched CSS rule, try to find the original source file via source maps
const resolveCSSSourceMaps = async (
  rules: Array<{ selector: string; file: string; properties: string }>
): Promise<Array<{ selector: string; file: string; originalFile?: string; properties: string }>> => {
  // Collect unique stylesheet URLs that need resolving
  const sheetUrls = new Set<string>();
  for (const rule of rules) {
    if (rule.file !== "inline" && rule.file.match(/[a-f0-9]{5,}\.(css)/)) {
      // Looks like a bundled/hashed filename — try to resolve
      sheetUrls.add(rule.file);
    }
  }

  // Fetch source maps for bundled stylesheets
  const sourceFilesBySheet = new Map<string, string[]>();

  for (const sheetFile of sheetUrls) {
    try {
      const sources = await getCSSSourceFiles(sheetFile);
      if (sources.length > 0) {
        sourceFilesBySheet.set(sheetFile, sources);
      }
    } catch {
      // Can't resolve, skip
    }
  }

  // For each rule, try to find the original file by searching sourcesContent for the selector
  return rules.map((rule) => {
    if (rule.file === "inline" || !sourceFilesBySheet.has(rule.file)) {
      return rule;
    }

    const originalFile = findSelectorInSources(rule.selector, rule.file);
    return { ...rule, originalFile: originalFile || undefined };
  });
};

// Fetch and cache CSS source map, return list of original source files
const getCSSSourceFiles = async (cssFilename: string): Promise<string[]> => {
  if (cssMapCache.has(cssFilename)) {
    const cached = cssMapCache.get(cssFilename);
    return cached?.sources || [];
  }

  try {
    // Find the full URL for this CSS file
    let cssUrl = "";
    for (const sheet of document.styleSheets) {
      if (sheet.href?.includes(cssFilename)) {
        cssUrl = sheet.href;
        break;
      }
    }

    if (!cssUrl) {
      cssMapCache.set(cssFilename, null);
      return [];
    }

    // Fetch the CSS file to find sourceMappingURL
    const cssResponse = await fetch(cssUrl);
    if (!cssResponse.ok) { cssMapCache.set(cssFilename, null); return []; }

    const cssText = await cssResponse.text();
    const urlMatch = cssText.match(/\/\*[#@]\s*sourceMappingURL=(.+?)\s*\*\//);

    if (!urlMatch) { cssMapCache.set(cssFilename, null); return []; }

    let mapUrl = urlMatch[1];

    // Handle data URI
    if (mapUrl.startsWith("data:")) {
      const base64Match = mapUrl.match(/base64,(.+)/);
      if (base64Match) {
        const map = JSON.parse(atob(base64Match[1]));
        cssMapCache.set(cssFilename, map);
        return map.sources || [];
      }
      cssMapCache.set(cssFilename, null);
      return [];
    }

    // Resolve relative URL
    if (!mapUrl.startsWith("http")) {
      const base = cssUrl.substring(0, cssUrl.lastIndexOf("/") + 1);
      mapUrl = base + mapUrl;
    }

    const mapResponse = await fetch(mapUrl);
    if (!mapResponse.ok) { cssMapCache.set(cssFilename, null); return []; }

    const map = await mapResponse.json();
    cssMapCache.set(cssFilename, map);
    return map.sources || [];
  } catch {
    cssMapCache.set(cssFilename, null);
    return [];
  }
};

// Search source map's sourcesContent for a CSS selector to find which file it's in
const findSelectorInSources = (selector: string, cssFilename: string): string | null => {
  const map = cssMapCache.get(cssFilename);
  if (!map?.sourcesContent || !map?.sources) return null;

  // Clean up the selector for searching
  const searchTerm = selector.replace(/\\/g, "");

  for (let i = 0; i < map.sourcesContent.length; i++) {
    const content = map.sourcesContent[i];
    if (!content) continue;

    if (content.includes(searchTerm)) {
      // Found it — return a clean source filename
      const source = map.sources[i];
      // Clean up paths like "../../src/components/Dashboard.vue"
      return source.split("/").slice(-2).join("/");
    }
  }

  // If selector not found in content, return the most likely source file
  // (filter out node_modules, keep .vue/.tsx/.scss files)
  const appSources = (map.sources as string[])
    .filter((s: string) => !s.includes("node_modules") && (s.endsWith(".vue") || s.endsWith(".tsx") || s.endsWith(".jsx") || s.endsWith(".scss") || s.endsWith(".css")))
    .map((s: string) => s.split("/").slice(-2).join("/"));

  return appSources.length > 0 ? `One of: ${appSources.slice(0, 5).join(", ")}` : null;
};
