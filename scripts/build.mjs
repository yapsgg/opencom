import { build } from "esbuild"

const widgetOnly = process.argv.includes("--widget-only")

// The widget ships as one self-contained IIFE so a single <script> tag is enough.
await build({
  entryPoints: ["src/widget/index.ts"],
  outfile: "dist/widget.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "safari15"],
  legalComments: "none",
})

if (!widgetOnly) {
  await build({
    entryPoints: ["src/server/index.ts"],
    outfile: "dist/server.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    packages: "external",
  })
}

console.log(widgetOnly ? "built dist/widget.js" : "built dist/widget.js and dist/server.js")
