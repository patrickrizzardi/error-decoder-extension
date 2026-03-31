// Simple dev server for landing page
// In production this is just static files on Vercel

// Env vars to inject into auth page (replaces %%PLACEHOLDER%% tokens)
const envReplacements: Record<string, string> = {
  "%%SUPABASE_URL%%": process.env.SUPABASE_URL ?? "",
  "%%SUPABASE_PUBLISHABLE_KEY%%": process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  "%%API_BASE%%": process.env.API_URL ?? "http://localhost:4001",
  "%%EXTENSION_ID%%": process.env.EXTENSION_ID ?? "",
};

const injectEnv = (html: string): string => {
  let result = html;
  for (const [token, value] of Object.entries(envReplacements)) {
    result = result.replaceAll(token, value);
  }
  return result;
};

const contentTypes: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = Bun.serve({
  port: 4000,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname === "/" ? "/index.html" : url.pathname;

    // Add .html extension for clean URLs (/auth → /auth.html)
    const filePath = `./packages/web/src${path}`;
    let file = Bun.file(filePath);

    if (!(await file.exists())) {
      file = Bun.file(`${filePath}.html`);
      if (!(await file.exists())) {
        file = Bun.file("./packages/web/src/index.html");
      }
    }

    const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")) : ".html";
    const contentType = contentTypes[ext] ?? "text/plain";

    // Inject env vars into HTML files
    if (contentType === "text/html") {
      const html = await file.text();
      return new Response(injectEnv(html), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  },
});

console.log(`Landing page dev server on port ${server.port}`);
