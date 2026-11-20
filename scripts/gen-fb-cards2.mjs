// Gera os PNGs dos cards de mecânica/comparativo/CTA pro Facebook.
// Pré-requisito: dev server em http://localhost:5173
// Uso: node scripts/gen-fb-cards2.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", "docs", "fb-posts");
mkdirSync(OUT, { recursive: true });

const URL = process.env.URL || "http://localhost:5173/art/fb-cards2.html";
const CARDS = ["abertura", "roids", "combate", "intel", "alianca", "comparativo", "cta"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1120 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
await page.waitForTimeout(700);

for (const c of CARDS) {
  const el = await page.$(`#card-${c}`);
  if (!el) { console.log(`! card ${c} não encontrado`); continue; }
  const file = join(OUT, `post-${c}.png`);
  await el.screenshot({ path: file });
  console.log(`✓ ${file}`);
}

await browser.close();
console.log(`\nPronto — PNGs em ${OUT}`);
