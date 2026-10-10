// Builds the public site into deploy/dist from landing-structure.html and the files it references.
//   node build.mjs                    one build (CI uses this; set SITE_URL for canonical/OG tags)
//   node build.mjs --watch --serve    rebuild on change and serve on http://localhost:8080
import { cp, mkdir, readFile, rm, stat, watch, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEPLOY = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.dirname(DEPLOY);
const OUT = path.join(DEPLOY, "dist");
const PAGE = "landing-structure.html";
const ALWAYS = ["assets/vendor", "assets/favicon.svg", "assets/og-image.jpg"];
const EXTERNAL = /^(?:[a-z]+:|\/\/|#|\/)/i;

async function build() {
  const siteUrl = (
    process.env.SITE_URL ||
    (process.env.VERCEL_ENV === "production" ? "https://www.felixlabs.net" : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  ).replace(/\/+$/, "");
  let html = await readFile(path.join(SRC, PAGE), "utf8");
  html = siteUrl ? html.replaceAll("{{SITE_URL}}", siteUrl) : html.split("\n").filter((line) => !line.includes("{{SITE_URL}}")).join("\n");

  const refs = new Set(ALWAYS);
  for (const m of html.matchAll(/\s(?:src|href|poster|data-lottie)="([^"]+)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+)/g)) refs.add(m[1]);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const missing = [];
  for (const ref of refs) {
    if (EXTERNAL.test(ref)) continue;
    const rel = decodeURIComponent(ref.split(/[?#]/)[0]);
    const from = path.join(SRC, rel);
    try {
      await stat(from);
      await cp(from, path.join(OUT, rel), { recursive: true });
    } catch {
      missing.push(rel);
    }
  }
  if (missing.length) throw new Error(`Missing files referenced by ${PAGE}:\n  ${missing.join("\n  ")}`);

  await writeFile(path.join(OUT, "index.html"), html);
  await writeFile(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ""}`);
  if (siteUrl) {
    await writeFile(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}/</loc></url></urlset>\n`);
  }
  console.log(`Built ${refs.size} references into ${path.relative(process.cwd(), OUT) || OUT}${siteUrl ? ` for ${siteUrl}` : ""}`);
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml",
};

function serve(port) {
  createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/consult" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      console.log("[dev] consultation request, not emailed:", body);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end('{"ok":true}');
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(OUT, rel);
    if (!file.startsWith(OUT)) return res.writeHead(403).end();
    try {
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404).end("Not found");
    }
  }).listen(port, () => console.log(`Serving ${OUT} on http://localhost:${port}`));
}

const args = process.argv.slice(2);
const watching = args.includes("--watch");
try {
  await build();
} catch (err) {
  console.error(err.message);
  if (!watching) process.exit(1);
}
if (args.includes("--serve")) serve(Number(process.env.PORT || 8080));
if (watching) {
  let timer;
  for await (const event of watch(SRC, { recursive: true })) {
    if (!event.filename || event.filename.startsWith("deploy")) continue;
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((err) => console.error(err.message)), 150);
  }
}
