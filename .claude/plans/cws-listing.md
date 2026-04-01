# Chrome Web Store Listing

## Short Description (130 chars)

AI debugging sidebar. Real-time error capture, network monitoring, element inspector, and AI-powered fixes — right on any webpage.

## Detailed Description

ErrorDecoder is an always-on debugging sidebar that lives right on the page — not buried in DevTools. It captures errors in real-time, explains what went wrong using AI, and shows you how to fix it with copy-pasteable code.

WHAT IT DOES

Monitors your page for console errors, warnings, unhandled exceptions, and promise rejections as they happen. Also watches network traffic for 4xx, 5xx, and CORS failures. Every error streams into the sidebar automatically — no copy-pasting from the console.

Click any error and AI decodes it: what happened, why, how to fix it, and a working code example tailored to your stack.

ELEMENT INSPECTOR

Click any element to see computed styles, CSS rules, and box model. Ask the AI questions about it — why is this overflowing, why is the z-index broken, how do I center this.

TECH STACK AWARE

Auto-detects 90+ technologies — React, Vue, Angular, Next.js, Svelte, Express, Django, Rails, Tailwind, and more. AI gives framework-specific fixes, not generic advice. A CORS error gets a different answer for Next.js than for Express.

SOURCE MAPS

Minified stack traces like bundle.min.js:1:28403 are mapped back to original source files when source maps are available.

AI POWERED BY CLAUDE (ANTHROPIC)

Free tier uses Claude Haiku. Pro adds Claude Sonnet for deeper analysis of complex errors. Every decode includes root cause analysis and code examples.

FREE
- 3 AI decodes per day
- Real-time error and network capture
- Element inspector and tech detection
- Source map resolution

PRO — $9/month or $79/year
- Unlimited decodes
- 20 Deep Analysis (Claude Sonnet) per month
- Searchable decode history
- Full page context and unlimited input

WORKS EVERYWHERE

localhost, production, Stack Overflow, GitHub, docs sites. Dark and light mode. Resizable sidebar. Chrome, Edge, Brave, Arc, Opera, Vivaldi.

PRIVACY

Only processes error text you choose to decode. Never accesses source code, browsing history, or page content beyond what you select.

## Category

Developer Tools

## Permission Justifications

| Permission | Justification |
|-----------|--------------|
| `contextMenus` | Adds "Decode this error" to the right-click menu so users can select error text on any page and send it to the sidebar for AI decoding. |
| `storage` | Stores the user's API key, email, plan status, and sidebar width preference locally in the extension. No data is sent externally from storage. |
| `sidePanel` | The core UI — ErrorDecoder's debugging dashboard is displayed as a Chrome side panel alongside the current page. |
| `activeTab` | Needed to inject the sidebar iframe and element inspector overlay into the current page when the user clicks the extension icon. |
| `webRequest` | Monitors network traffic for failed requests (4xx, 5xx, CORS errors, connection failures) to display in the error feed. Only reads request metadata (URL, status code) — never reads request/response bodies. |
| `host_permissions: <all_urls>` | ErrorDecoder works on any webpage — it needs to inject its sidebar, capture console errors, detect tech stack, and resolve source maps on any site the user visits. The extension only activates when the user clicks the icon. |
| Content scripts (`<all_urls>`) | Three content scripts: (1) MAIN world script intercepts console.error/warn for error capture, (2) relay script bridges MAIN world messages to the extension, (3) idle script injects the sidebar iframe and handles element inspection. All run on every page to provide always-on error monitoring. |
| `externally_connectable` | Allows the ErrorDecoder website (errordecoder.dev) to send authentication tokens to the extension after the user signs up or logs in. Limited to errordecoder.dev only. |
| `web_accessible_resources` | Makes the sidebar HTML/CSS/JS files accessible to the injected iframe on any page. Required for the sidebar to render inside the page. |
