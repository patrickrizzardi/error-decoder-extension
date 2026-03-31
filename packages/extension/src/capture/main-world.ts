// This runs in the PAGE'S main world (not extension isolated world)
// Declared in manifest with "world": "MAIN"
// Chrome injects this directly — bypasses CSP

// Data flow: intercept console/fetch/XHR → emit CustomEvent → relay.ts picks it up

if (!(window as any).__errorDecoderActive) {
  (window as any).__errorDecoderActive = true;

  const emit = (level: string, text: string) => {
    document.dispatchEvent(
      new CustomEvent("errordecoder-error", { detail: { level, text } })
    );
  };

  // Console errors
  const origError = console.error;
  console.error = function (...args: any[]) {
    const text = args
      .map((a: any) =>
        typeof a === "string"
          ? a
          : a instanceof Error
            ? a.message + (a.stack ? "\n" + a.stack : "")
            : JSON.stringify(a)
      )
      .join(" ");
    emit("error", text);
    origError.apply(console, args);
  };

  // Console warnings
  const origWarn = console.warn;
  console.warn = function (...args: any[]) {
    const text = args
      .map((a: any) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    emit("warning", text);
    origWarn.apply(console, args);
  };

  // Unhandled errors
  window.addEventListener("error", (e) => {
    emit("error", e.message + (e.filename ? " at " + e.filename + ":" + e.lineno : ""));
  });

  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    emit(
      "error",
      "Unhandled Promise Rejection: " +
        (reason instanceof Error
          ? reason.message + "\n" + reason.stack
          : reason || "unknown")
    );
  });

  // Failed fetch requests
  const origFetch = window.fetch;
  window.fetch = function (...args: any[]) {
    let url = args[0];
    if (typeof url === "object" && url.url) url = url.url;
    const urlStr = typeof url === "string" ? url : "unknown URL";

    return origFetch
      .apply(window, args as any)
      .then((response: Response) => {
        if (!response.ok) {
          emit("error", `Network Error: ${response.status} ${response.statusText} — ${urlStr}`);
        }
        return response;
      })
      .catch((err: Error) => {
        emit("error", `Network Error: ${err.message || "fetch failed"} — ${urlStr}`);
        throw err;
      });
  };

  // Failed XMLHttpRequests
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string) {
    (this as any).__edUrl = url;
    (this as any).__edMethod = method;
    return origOpen.apply(this, arguments as any);
  };

  XMLHttpRequest.prototype.send = function () {
    const xhr = this;
    xhr.addEventListener("loadend", () => {
      if (xhr.status >= 400 || xhr.status === 0) {
        const text =
          xhr.status === 0
            ? `Network Error: Request failed — ${(xhr as any).__edMethod} ${(xhr as any).__edUrl}`
            : `Network Error: ${xhr.status} ${xhr.statusText} — ${(xhr as any).__edMethod} ${(xhr as any).__edUrl}`;
        emit("error", text);
      }
    });
    return origSend.apply(this, arguments as any);
  };

  // ============================================
  // Tech stack detection — expose globals to isolated world via DOM
  // ============================================

  const detectGlobals = () => {
    const globals: Record<string, string | boolean> = {};

    // Frameworks
    if ((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) globals.react = true;
    if ((window as any).React?.version) globals.reactVersion = (window as any).React.version;
    if ((window as any).__NEXT_DATA__) globals.nextjs = true;
    if ((window as any).__VUE__) globals.vue = true;
    if ((window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__) globals.vue = true;
    if ((window as any).__NUXT__) globals.nuxt = true;
    if ((window as any).__SVELTE_HMR) globals.svelte = true;
    if ((window as any).__remixContext) globals.remix = true;
    if ((window as any).ng) globals.angular = true;

    // Build tools
    if ((window as any).__vite_plugin_react_preamble_installed__) globals.vite = true;
    if ((window as any).webpackJsonp || (window as any).__webpack_modules__) globals.webpack = true;
    if ((window as any).__turbopack_require__) globals.turbopack = true;

    // State
    if ((window as any).__REDUX_DEVTOOLS_EXTENSION__) globals.redux = true;

    // Libraries
    if ((window as any).jQuery || (window as any).$?.fn?.jquery) {
      globals.jquery = true;
      globals.jqueryVersion = (window as any).jQuery?.fn?.jquery || "";
    }
    if ((window as any)._?.VERSION) globals.lodash = (window as any)._.VERSION;
    if ((window as any).axios) globals.axios = true;

    // More frameworks
    if ((window as any)._$HY) globals.solid = true; // SolidJS
    if ((window as any).Ember) globals.ember = true;
    if ((window as any).__PREACT_DEVTOOLS__) globals.preact = true;
    if ((window as any).qwikCity || (window as any).__qwik__) globals.qwik = true;
    if ((window as any).__litDevMode) globals.lit = true;

    // State management
    if ((window as any).__ZUSTAND_DEVTOOLS__) globals.zustand = true;
    if ((window as any).__mobxGlobals) globals.mobx = true;
    if ((window as any).__pinia) globals.pinia = true;

    // More libraries
    if ((window as any).Apollo || (window as any).__APOLLO_CLIENT__) globals.apollo = true;
    if ((window as any).gsap || (window as any).TweenMax) globals.gsap = true;
    if ((window as any).Chart) globals.chart = true;

    // Firebase
    if ((window as any).firebase || (window as any).__FIREBASE_DEFAULTS__) globals.firebase = true;

    // Web3 / Crypto
    if ((window as any).ethereum) globals.ethereum = true;
    if ((window as any).solana) globals.solana = true;
    if ((window as any).web3) globals.web3 = true;

    // Monitoring
    if ((window as any).Sentry) globals.sentry = true;

    // Expose to isolated world via DOM attribute
    document.documentElement.setAttribute(
      "data-errordecoder-globals",
      JSON.stringify(globals)
    );
  };

  // Run after a short delay to let page scripts initialize
  setTimeout(detectGlobals, 1000);
  // Also run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", detectGlobals);
  } else {
    detectGlobals();
  }
}
