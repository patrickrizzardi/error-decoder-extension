/**
 * Extension build script using Bun's bundler
 * Outputs to dist/ — load this folder as an unpacked extension in Chrome
 *
 * Run: bun run packages/extension/build.ts
 */

import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ROOT = import.meta.dir;
const DIST = resolve(ROOT, "dist");

// Clean dist
if (existsSync(DIST)) {
  const { rmSync } = await import("fs");
  rmSync(DIST, { recursive: true });
}
mkdirSync(DIST, { recursive: true });

// Bundle TypeScript entry points
const entrypoints = [
  { entry: "src/background/index.ts", outfile: "background.js" },
  { entry: "src/capture/main-world.ts", outfile: "capture.js" },
  { entry: "src/content/relay.ts", outfile: "relay.js" },
  { entry: "src/content/index.ts", outfile: "content.js" },
  { entry: "src/sidepanel/index.ts", outfile: "sidepanel/index.js" },
  { entry: "src/options/index.ts", outfile: "options/index.js" },
  { entry: "src/devtools/devtools.ts", outfile: "devtools/devtools.js" },
  { entry: "src/devtools/panel.ts", outfile: "devtools/panel.js" },
];

const results = await Promise.all(
  entrypoints.map(({ entry, outfile }) =>
    Bun.build({
      entrypoints: [resolve(ROOT, entry)],
      outdir: DIST,
      naming: outfile,
      target: "browser",
      format: "iife",
      minify: false,
      sourcemap: "external",
      define: {
        "process.env.NODE_ENV": '"production"',
        __API_BASE__: JSON.stringify(
          process.env.API_BASE ?? "http://localhost:4001/api"
        ),
        __AUTH_URL__: JSON.stringify(
          process.env.AUTH_URL ?? "http://localhost:4000/auth"
        ),
      },
    })
  )
);

for (const [i, result] of results.entries()) {
  if (!result.success) {
    console.error(`Failed to build ${entrypoints[i].entry}:`);
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
}

console.log("✓ Bundled TypeScript entry points");

// Copy and fix manifest — update paths to built files
const manifest = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf-8"));
manifest.background.service_worker = "background.js";
manifest.content_scripts[0].js = ["capture.js"];  // MAIN world — overrides console/fetch
manifest.content_scripts[1].js = ["relay.js"];    // ISOLATED world — relays CustomEvents at document_start
manifest.content_scripts[2].js = ["content.js"];  // ISOLATED world — panel, inspector at document_idle
manifest.side_panel.default_path = "sidepanel/index.html";
delete manifest.action.default_popup; // No popup — icon click toggles sidebar
manifest.options_page = "options/index.html";
manifest.devtools_page = "devtools/devtools.html";
writeFileSync(resolve(DIST, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("✓ Manifest copied and paths updated");

// Copy HTML files — fix script references
const htmlFiles = [
  { src: "src/sidepanel/index.html", dest: "sidepanel/index.html" },
  { src: "src/options/index.html", dest: "options/index.html" },
  { src: "src/devtools/devtools.html", dest: "devtools/devtools.html" },
  { src: "src/devtools/panel.html", dest: "devtools/panel.html" },
];

for (const { src, dest } of htmlFiles) {
  const destPath = resolve(DIST, dest);
  mkdirSync(resolve(destPath, ".."), { recursive: true });

  let html = readFileSync(resolve(ROOT, src), "utf-8");
  // Fix script tags: .ts → .js, remove type="module"
  html = html.replace(/src="index\.ts"/g, 'src="index.js"');
  html = html.replace(/ type="module"/g, "");
  writeFileSync(destPath, html);
}
console.log("✓ HTML files copied");

// Copy CSS files
const cssFiles = [
  { src: "src/sidepanel/styles.css", dest: "sidepanel/styles.css" },
];

for (const { src, dest } of cssFiles) {
  copyFileSync(resolve(ROOT, src), resolve(DIST, dest));
}
console.log("✓ CSS files copied");

// Copy icons
const iconsDir = resolve(DIST, "icons");
mkdirSync(iconsDir, { recursive: true });
for (const icon of ["icon-16.png", "icon-48.png", "icon-128.png"]) {
  const srcPath = resolve(ROOT, "public/icons", icon);
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, resolve(iconsDir, icon));
  }
}
console.log("✓ Icons copied");

console.log("\n✅ Extension built to packages/extension/dist/");
console.log("   Load as unpacked extension in chrome://extensions/");
