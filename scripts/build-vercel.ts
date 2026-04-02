/**
 * Vercel deployment build script
 *
 * 1. Bundles the Hono API into a single serverless function (api/index.js)
 * 2. Copies web files to public/ with env vars injected into HTML
 *
 * Run: bun run scripts/build-vercel.ts
 */
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmSync,
  existsSync,
} from "fs";
import { join, extname } from "path";

const ROOT = process.cwd();

// --- 1. Bundle API ---

console.log("Bundling API for Vercel...");

const apiOutDir = join(ROOT, "api");
if (existsSync(apiOutDir)) {
  rmSync(apiOutDir, { recursive: true });
}
mkdirSync(apiOutDir, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(ROOT, "vercel-entry.ts")],
  outdir: apiOutDir,
  target: "node",
  format: "esm",
  minify: true,
  naming: "index.mjs",
  // Bundle everything — no external deps needed at runtime
  external: [],
});

if (!result.success) {
  console.error("API bundle failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("  ✓ API bundled → api/index.mjs");

// --- 2. Build web (static files with env injection) ---

console.log("Building web files...");

const envReplacements: Record<string, string> = {
  "%%SUPABASE_URL%%": process.env.SUPABASE_URL ?? "",
  "%%SUPABASE_PUBLISHABLE_KEY%%": process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  "%%API_BASE%%": process.env.APP_URL ?? "",
  "%%EXTENSION_ID%%": process.env.EXTENSION_ID ?? "",
};

const webSrc = join(ROOT, "packages/web/src");
const publicDir = join(ROOT, "public");

if (existsSync(publicDir)) {
  rmSync(publicDir, { recursive: true });
}

const skipFiles = new Set(["server.ts"]);

const copyDir = (src: string, dest: string) => {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src);

  for (const entry of entries) {
    if (skipFiles.has(entry)) continue;

    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (extname(entry) === ".html") {
      // Inject env vars into HTML
      let html = readFileSync(srcPath, "utf-8");
      for (const [token, value] of Object.entries(envReplacements)) {
        html = html.replaceAll(token, value);
      }
      writeFileSync(destPath, html);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
};

copyDir(webSrc, publicDir);
console.log("  ✓ Web files → public/");

// --- Done ---
console.log("\n✅ Vercel build complete");
console.log("   api/index.mjs  — serverless function");
console.log("   public/        — static files");
