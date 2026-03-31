// Tech stack detection — identifies frameworks, libraries, and 3rd party scripts
// Runs in ISOLATED world — checks DOM markers, script URLs, meta tags
// Globals detected by main world capture script via DOM attribute

export type DetectedTech = {
  name: string;
  category: "framework" | "ui" | "build" | "state" | "runtime" | "analytics" | "payment" | "monitoring" | "chat" | "auth" | "cms" | "hosting" | "database" | "other";
  version?: string;
  color: string;
};

let cachedTech: DetectedTech[] | null = null;

// Clear stale cache on SPA navigation (content script persists across route changes)
window.addEventListener("popstate", () => { cachedTech = null; });
window.addEventListener("hashchange", () => { cachedTech = null; });

export const detectTechStack = (): DetectedTech[] => {
  if (cachedTech) return cachedTech;

  const detected: DetectedTech[] = [];
  const add = (tech: DetectedTech) => {
    if (!detected.some((t) => t.name === tech.name)) detected.push(tech);
  };

  const globals = getPageGlobals();
  const scriptUrls = getScriptUrls();
  const linkUrls = getLinkUrls();
  const allSrc = scriptUrls + " " + linkUrls;

  // ============================================
  // FRONTEND FRAMEWORKS
  // ============================================

  if (globals.react || document.querySelector("[data-reactroot]") || document.querySelector("[data-react-helmet]")) {
    add({ name: "React", category: "framework", version: globals.reactVersion as string || undefined, color: "#61dafb" });
  }

  if (globals.nextjs || document.querySelector("#__next")) {
    add({ name: "Next.js", category: "framework", color: "#000000" });
  }

  if (globals.vue || document.querySelector("[data-v-]") || document.querySelector("[data-vue-app]")) {
    add({ name: "Vue", category: "framework", color: "#42b883" });
  }

  if (globals.nuxt || document.querySelector("#__nuxt")) {
    add({ name: "Nuxt", category: "framework", color: "#00dc82" });
  }

  const ngVer = document.querySelector("[ng-version]")?.getAttribute("ng-version");
  if (globals.angular || ngVer) {
    add({ name: "Angular", category: "framework", version: ngVer || undefined, color: "#dd0031" });
  }

  if (globals.svelte || document.querySelector("[class*='svelte-']")) {
    add({ name: "Svelte", category: "framework", color: "#ff3e00" });
  }

  if (document.querySelector("[data-astro-cid]") || document.querySelector("astro-island")) {
    add({ name: "Astro", category: "framework", color: "#ff5d01" });
  }

  if (globals.remix) add({ name: "Remix", category: "framework", color: "#000000" });

  if (globals.solid) add({ name: "SolidJS", category: "framework", color: "#2c4f7c" });

  if (document.querySelector("[data-qwik]") || globals.qwik) {
    add({ name: "Qwik", category: "framework", color: "#18b6f6" });
  }

  if (globals.ember || document.querySelector("[id^='ember']")) {
    add({ name: "Ember", category: "framework", color: "#e04e39" });
  }

  if (globals.preact) add({ name: "Preact", category: "framework", color: "#673ab8" });

  if (document.querySelector("[x-data]") || document.querySelector("[x-bind]")) {
    add({ name: "Alpine.js", category: "framework", color: "#77c1d2" });
  }

  if (document.querySelector("[hx-get]") || document.querySelector("[hx-post]") || document.querySelector("[data-hx-get]")) {
    add({ name: "HTMX", category: "framework", color: "#3366cc" });
  }

  if (globals.lit || document.querySelector("[lit-element]")) {
    add({ name: "Lit", category: "framework", color: "#324fff" });
  }

  // ============================================
  // BACKEND / CMS (detectable from frontend clues)
  // ============================================

  if (document.querySelector('meta[name="csrf-token"]') && document.querySelector('meta[name="csrf-param"]')) {
    add({ name: "Ruby on Rails", category: "framework", color: "#cc0000" });
  }

  if (document.querySelector('meta[name="csrf-token"][content]') && allSrc.includes("laravel") ||
      document.querySelector('input[name="_token"]') && document.cookie.includes("laravel_session")) {
    add({ name: "Laravel", category: "framework", color: "#ff2d20" });
  }

  if (document.querySelector('input[name="csrfmiddlewaretoken"]') || allSrc.includes("django")) {
    add({ name: "Django", category: "framework", color: "#092e20" });
  }

  if (document.querySelector('meta[name="generator"][content*="WordPress"]') ||
      allSrc.includes("wp-content") || allSrc.includes("wp-includes")) {
    add({ name: "WordPress", category: "cms", color: "#21759b" });
  }

  if (document.querySelector('meta[name="generator"][content*="Drupal"]') || allSrc.includes("drupal")) {
    add({ name: "Drupal", category: "cms", color: "#0678be" });
  }

  if (allSrc.includes("cdn.shopify.com") || document.querySelector('meta[name="shopify"]')) {
    add({ name: "Shopify", category: "cms", color: "#96bf48" });
  }

  if (allSrc.includes("squarespace.com")) {
    add({ name: "Squarespace", category: "cms", color: "#000000" });
  }

  if (allSrc.includes("wix.com") || document.querySelector("[data-mesh-id]")) {
    add({ name: "Wix", category: "cms", color: "#0c6efc" });
  }

  if (document.querySelector("#phpmyadmin") || document.title.includes("phpMyAdmin")) {
    add({ name: "phpMyAdmin", category: "database", color: "#f89d13" });
  }

  if (document.title.includes("pgAdmin") || document.querySelector("[data-pgadmin]")) {
    add({ name: "pgAdmin", category: "database", color: "#336791" });
  }

  if (document.title.includes("Adminer") || document.querySelector("#content.adminer")) {
    add({ name: "Adminer", category: "database", color: "#34567c" });
  }

  // ============================================
  // UI LIBRARIES
  // ============================================

  // Tailwind — check for utility class patterns
  const hasTailwind = document.querySelector("[class*='flex ']") &&
    document.querySelector("[class*='bg-']") &&
    (document.querySelector("[class*='px-']") || document.querySelector("[class*='py-']"));
  if (hasTailwind) add({ name: "Tailwind", category: "ui", color: "#06b6d4" });

  if (document.querySelector(".container.bootstrap") || document.querySelector("[class*='btn-primary']") &&
      document.querySelector("[class*='col-']")) {
    add({ name: "Bootstrap", category: "ui", color: "#7952b3" });
  }

  if (document.querySelector("[class*='MuiButton']") || document.querySelector("[class*='MuiTypography']")) {
    add({ name: "Material UI", category: "ui", color: "#007fff" });
  }

  if (document.querySelector("[class*='chakra-']")) {
    add({ name: "Chakra UI", category: "ui", color: "#319795" });
  }

  if (document.querySelector("[class*='ant-']")) {
    add({ name: "Ant Design", category: "ui", color: "#1890ff" });
  }

  if (document.querySelector("[class*='bulma']") || allSrc.includes("bulma")) {
    add({ name: "Bulma", category: "ui", color: "#00d1b2" });
  }

  if (document.querySelector("[data-radix-collection-item]") || document.querySelector("[data-radix-popper-content-wrapper]")) {
    add({ name: "Radix UI", category: "ui", color: "#111111" });
  }

  if (allSrc.includes("foundation.min") || document.querySelector(".foundation-mq")) {
    add({ name: "Foundation", category: "ui", color: "#1779ba" });
  }

  // ============================================
  // BUILD TOOLS
  // ============================================

  if (globals.vite || document.querySelector('script[type="module"][src*="/@vite"]') || allSrc.includes("/@vite/")) {
    add({ name: "Vite", category: "build", color: "#646cff" });
  }

  if (globals.webpack) add({ name: "Webpack", category: "build", color: "#8dd6f9" });
  if (globals.turbopack) add({ name: "Turbopack", category: "build", color: "#f38020" });

  if (allSrc.includes("parcel")) add({ name: "Parcel", category: "build", color: "#e6a317" });

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  if (globals.redux) add({ name: "Redux", category: "state", color: "#764abc" });
  if (globals.zustand) add({ name: "Zustand", category: "state", color: "#443e38" });
  if (globals.mobx) add({ name: "MobX", category: "state", color: "#ff9955" });

  // Pinia/Vuex (Vue state)
  if (globals.pinia) add({ name: "Pinia", category: "state", color: "#ffd859" });

  // ============================================
  // RUNTIME LIBRARIES
  // ============================================

  if (globals.jquery) {
    add({ name: "jQuery", category: "runtime", version: globals.jqueryVersion as string || undefined, color: "#0769ad" });
  }

  if (globals.lodash) add({ name: "Lodash", category: "runtime", version: globals.lodash as string || undefined, color: "#3492ff" });
  if (globals.axios) add({ name: "Axios", category: "runtime", color: "#5a29e4" });

  if (allSrc.includes("socket.io")) add({ name: "Socket.IO", category: "runtime", color: "#010101" });
  if (allSrc.includes("apollo") || globals.apollo) add({ name: "Apollo GraphQL", category: "runtime", color: "#311c87" });
  if (allSrc.includes("three.js") || allSrc.includes("three.min")) add({ name: "Three.js", category: "runtime", color: "#000000" });
  if (allSrc.includes("d3.min") || allSrc.includes("d3.v")) add({ name: "D3.js", category: "runtime", color: "#f9a03c" });
  if (allSrc.includes("chart.js") || globals.chart) add({ name: "Chart.js", category: "runtime", color: "#ff6384" });
  if (allSrc.includes("moment.min") || allSrc.includes("moment.js")) add({ name: "Moment.js", category: "runtime", color: "#4a4a55" });
  if (allSrc.includes("gsap") || globals.gsap) add({ name: "GSAP", category: "runtime", color: "#88ce02" });
  if (allSrc.includes("anime.min")) add({ name: "Anime.js", category: "runtime", color: "#f74f82" });

  // TypeScript (source map references)
  if (document.querySelector('script[src*=".tsx"]') || document.querySelector('script[src*=".ts"]')) {
    add({ name: "TypeScript", category: "runtime", color: "#3178c6" });
  }

  // ============================================
  // ANALYTICS
  // ============================================

  if (allSrc.includes("google-analytics") || allSrc.includes("gtag") || allSrc.includes("googletagmanager")) {
    add({ name: "Google Analytics", category: "analytics", color: "#e37400" });
  }

  if (allSrc.includes("mixpanel")) add({ name: "Mixpanel", category: "analytics", color: "#7856ff" });

  if (allSrc.includes("facebook.net") || allSrc.includes("fbevents")) {
    add({ name: "Facebook Pixel", category: "analytics", color: "#1877f2" });
  }

  if (allSrc.includes("hotjar")) add({ name: "Hotjar", category: "analytics", color: "#fd3a5c" });
  if (allSrc.includes("clarity.ms")) add({ name: "Clarity", category: "analytics", color: "#0078d4" });
  if (allSrc.includes("hs-analytics") || allSrc.includes("hsforms") || allSrc.includes("hubspot")) {
    add({ name: "HubSpot", category: "analytics", color: "#ff7a59" });
  }
  if (allSrc.includes("segment.com") || allSrc.includes("segment.io")) add({ name: "Segment", category: "analytics", color: "#52bd94" });
  if (allSrc.includes("amplitude")) add({ name: "Amplitude", category: "analytics", color: "#1c1c63" });
  if (allSrc.includes("posthog")) add({ name: "PostHog", category: "analytics", color: "#f9bd2b" });
  if (allSrc.includes("plausible")) add({ name: "Plausible", category: "analytics", color: "#5850ec" });
  if (allSrc.includes("heap-")) add({ name: "Heap", category: "analytics", color: "#ff5733" });
  if (allSrc.includes("linkedin.com/insight") || allSrc.includes("snap.licdn")) {
    add({ name: "LinkedIn Insight", category: "analytics", color: "#0a66c2" });
  }
  if (allSrc.includes("tiktok.com/i18n") || allSrc.includes("analytics.tiktok")) {
    add({ name: "TikTok Pixel", category: "analytics", color: "#000000" });
  }
  if (allSrc.includes("twitter.com/oct") || allSrc.includes("static.ads-twitter")) {
    add({ name: "Twitter Pixel", category: "analytics", color: "#1da1f2" });
  }
  if (allSrc.includes("pinterest.com/ct") || allSrc.includes("pintrk")) {
    add({ name: "Pinterest Tag", category: "analytics", color: "#e60023" });
  }

  // ============================================
  // PAYMENTS
  // ============================================

  if (allSrc.includes("stripe.com") || allSrc.includes("js.stripe.com")) {
    add({ name: "Stripe", category: "payment", color: "#635bff" });
  }
  if (allSrc.includes("paypal.com") || allSrc.includes("paypalobjects")) {
    add({ name: "PayPal", category: "payment", color: "#003087" });
  }
  if (allSrc.includes("square.com") || allSrc.includes("squareup.com")) {
    add({ name: "Square", category: "payment", color: "#006aff" });
  }
  if (allSrc.includes("braintree") || allSrc.includes("braintreegateway")) {
    add({ name: "Braintree", category: "payment", color: "#000000" });
  }
  if (allSrc.includes("wingspan.app") || allSrc.includes("wingspan.com")) {
    add({ name: "Wingspan", category: "payment", color: "#1a56db" });
  }
  if (allSrc.includes("adyen.com") || allSrc.includes("adyencheckout")) {
    add({ name: "Adyen", category: "payment", color: "#0abf53" });
  }
  if (allSrc.includes("venmo") || allSrc.includes("venmo.com")) {
    add({ name: "Venmo", category: "payment", color: "#3d95ce" });
  }
  if (allSrc.includes("cash.app") || allSrc.includes("cashapp")) {
    add({ name: "Cash App", category: "payment", color: "#00d632" });
  }
  if (allSrc.includes("coinbase.com") || allSrc.includes("coinbase-commerce")) {
    add({ name: "Coinbase", category: "payment", color: "#0052ff" });
  }
  if (allSrc.includes("commerce.coinbase")) {
    add({ name: "Coinbase Commerce", category: "payment", color: "#0052ff" });
  }
  if (allSrc.includes("metamask") || globals.ethereum) {
    add({ name: "MetaMask/Web3", category: "payment", color: "#f6851b" });
  }
  if (allSrc.includes("solana") || globals.solana) {
    add({ name: "Solana", category: "payment", color: "#9945ff" });
  }
  if (allSrc.includes("ethers.js") || allSrc.includes("ethers.min")) {
    add({ name: "Ethers.js", category: "payment", color: "#2535a0" });
  }
  if (allSrc.includes("web3.min") || allSrc.includes("web3.js") || globals.web3) {
    add({ name: "Web3.js", category: "payment", color: "#f16822" });
  }
  if (allSrc.includes("wagmi") || allSrc.includes("rainbowkit")) {
    add({ name: "RainbowKit", category: "payment", color: "#7b3fe4" });
  }
  if (allSrc.includes("plaid.com") || allSrc.includes("plaid-link")) {
    add({ name: "Plaid", category: "payment", color: "#111111" });
  }

  // ============================================
  // MONITORING / ERROR TRACKING
  // ============================================

  if (globals.sentry || allSrc.includes("sentry")) add({ name: "Sentry", category: "monitoring", color: "#362d59" });
  if (allSrc.includes("datadog")) add({ name: "Datadog", category: "monitoring", color: "#632ca6" });
  if (allSrc.includes("newrelic") || allSrc.includes("nr-data")) add({ name: "New Relic", category: "monitoring", color: "#008c99" });
  if (allSrc.includes("logrocket")) add({ name: "LogRocket", category: "monitoring", color: "#764abc" });
  if (allSrc.includes("fullstory")) add({ name: "FullStory", category: "monitoring", color: "#448aff" });
  if (allSrc.includes("bugsnag")) add({ name: "Bugsnag", category: "monitoring", color: "#4949e4" });
  if (allSrc.includes("rollbar")) add({ name: "Rollbar", category: "monitoring", color: "#1c1c1c" });

  // ============================================
  // CHAT / SUPPORT
  // ============================================

  if (allSrc.includes("intercom")) add({ name: "Intercom", category: "chat", color: "#1f8ded" });
  if (allSrc.includes("zendesk")) add({ name: "Zendesk", category: "chat", color: "#03363d" });
  if (allSrc.includes("drift.com") || document.querySelector("#drift-widget")) {
    add({ name: "Drift", category: "chat", color: "#0176ff" });
  }
  if (allSrc.includes("crisp.chat")) add({ name: "Crisp", category: "chat", color: "#1972f5" });
  if (allSrc.includes("livechatinc") || allSrc.includes("livechat")) {
    add({ name: "LiveChat", category: "chat", color: "#ff5100" });
  }
  if (allSrc.includes("tawk.to")) add({ name: "Tawk.to", category: "chat", color: "#1dbe72" });
  if (allSrc.includes("freshdesk") || allSrc.includes("freshchat")) {
    add({ name: "Freshdesk", category: "chat", color: "#25c16f" });
  }

  // ============================================
  // AUTH
  // ============================================

  if (allSrc.includes("auth0.com")) add({ name: "Auth0", category: "auth", color: "#eb5424" });
  if (allSrc.includes("clerk.com") || allSrc.includes("clerk.dev")) add({ name: "Clerk", category: "auth", color: "#6c47ff" });
  if (allSrc.includes("supabase")) add({ name: "Supabase", category: "auth", color: "#3ecf8e" });

  // ============================================
  // HOSTING / INFRA
  // ============================================

  if (allSrc.includes("vercel") || document.querySelector('meta[name="next-head-count"]')) {
    add({ name: "Vercel", category: "hosting", color: "#000000" });
  }
  if (allSrc.includes("netlify") || document.querySelector('meta[name="generator"][content*="Netlify"]')) {
    add({ name: "Netlify", category: "hosting", color: "#00c7b7" });
  }
  if (allSrc.includes("cloudflare") || document.querySelector('script[src*="cloudflare"]')) {
    add({ name: "Cloudflare", category: "hosting", color: "#f38020" });
  }
  if (allSrc.includes("firebase") || globals.firebase) {
    add({ name: "Firebase", category: "hosting", color: "#ffca28" });
  }
  if (allSrc.includes("recaptcha") || allSrc.includes("grecaptcha")) {
    add({ name: "reCAPTCHA", category: "auth", color: "#4285f4" });
  }
  if (allSrc.includes("hcaptcha")) add({ name: "hCaptcha", category: "auth", color: "#0074bf" });
  if (allSrc.includes("turnstile") || allSrc.includes("challenges.cloudflare")) {
    add({ name: "Turnstile", category: "auth", color: "#f38020" });
  }

  cachedTech = detected;
  return detected;
};

// ============================================
// Helpers
// ============================================

const getPageGlobals = (): Record<string, string | boolean> => {
  try {
    const raw = document.documentElement.getAttribute("data-errordecoder-globals");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const getScriptUrls = (): string => {
  return Array.from(document.querySelectorAll("script[src]"))
    .map((s) => s.getAttribute("src") || "")
    .join(" ");
};

const getLinkUrls = (): string => {
  return Array.from(document.querySelectorAll("link[href]"))
    .map((l) => l.getAttribute("href") || "")
    .join(" ");
};
