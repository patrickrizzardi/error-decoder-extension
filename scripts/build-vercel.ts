/**
 * Vercel deployment build script — uses Build Output API v3
 *
 * Outputs to .vercel/output/ with explicit function + static config.
 * No auto-detection — we tell Vercel exactly what to deploy.
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
const OUTPUT = join(ROOT, ".vercel/output");

// Clean previous output
if (existsSync(OUTPUT)) {
  rmSync(OUTPUT, { recursive: true });
}

// --- 1. Bundle API as a Vercel Function ---

console.log("Bundling API...");

const funcDir = join(OUTPUT, "functions/api.func");
mkdirSync(funcDir, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(ROOT, "vercel-entry.ts")],
  outdir: funcDir,
  target: "node",
  format: "esm",
  minify: true,
  naming: "index.js",
  external: [],
});

if (!result.success) {
  console.error("API bundle failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Function config — tells Vercel this is a Node.js function
writeFileSync(
  join(funcDir, ".vc-config.json"),
  JSON.stringify({
    runtime: "nodejs22.x",
    handler: "index.js",
    launcherType: "Nodejs",
    maxDuration: 30,
  })
);

// ESM support — Node.js needs this to treat .js as ESM
writeFileSync(
  join(funcDir, "package.json"),
  JSON.stringify({ type: "module" })
);

console.log("  ✓ API → .vercel/output/functions/api.func/");

// --- 2. Static files (web pages with env injection) ---

console.log("Building web...");

const envReplacements: Record<string, string> = {
  "%%SUPABASE_URL%%": process.env.SUPABASE_URL ?? "",
  "%%SUPABASE_PUBLISHABLE_KEY%%": process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  "%%API_BASE%%": process.env.APP_URL ?? "",
  "%%EXTENSION_ID%%": process.env.EXTENSION_ID ?? "",
};

const webSrc = join(ROOT, "packages/web/src");
const staticDir = join(OUTPUT, "static");
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

copyDir(webSrc, staticDir);
console.log("  ✓ Web → .vercel/output/static/");

// --- 3. Build Output API config ---

writeFileSync(
  join(OUTPUT, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "/api/(.*)",
          dest: "/api",
          headers: { "Cache-Control": "no-store" },
        },
        { handle: "filesystem" },
      ],
    },
    null,
    2
  )
);

console.log("  ✓ Config → .vercel/output/config.json");
console.log("\n✅ Build Output API ready");
