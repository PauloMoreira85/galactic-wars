// Gera os PNGs 1080x1080 dos cards de raça pro Facebook.
// Pré-requisito: dev server rodando (npm run dev -w client) em http://localhost:5173
// Uso: node scripts/gen-fb-cards.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", "docs", "fb-posts");
mkdirSync(OUT, { recursive: true });

const URL = process.env.URL || "http://localhost:5173/art/fb-cards.html";
const CARDS = ["humanos", "daharan", "rakshasa", "mech", "insecta"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1120 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle" });
// Garante que as fontes do Google carregaram.
await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
await page.waitForTimeout(600);

for (const c of CARDS) {
  const el = await page.$(`#card-${c}`);
  if (!el) { console.log(`! card ${c} não encontrado`); continue; }
  const file = join(OUT, `raca-${c}.png`);
  await el.screenshot({ path: file });
  console.log(`✓ ${file}`);
}

await browser.close();
console.log(`\nPronto — PNGs em ${OUT}`);
