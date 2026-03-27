// Simple dev server for landing page
// In production this is just static files on Vercel

const server = Bun.serve({
  port: 4000,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname === "/" ? "/index.html" : url.pathname;

    const file = Bun.file(`./packages/web/src${path}`);
    if (await file.exists()) {
      return new Response(file);
    }

    // Fallback to index.html for SPA-like routing
    return new Response(Bun.file("./packages/web/src/index.html"));
  },
});

console.log(`Landing page dev server on port ${server.port}`);
