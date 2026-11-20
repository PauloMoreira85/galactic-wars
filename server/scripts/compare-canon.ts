// Compara a tabela de naves ATUAL do jogo (unitTable.ts) com a CANÔNICA de outro
// round (docs/tabela_naves_canon_av.csv). Aponta divergências de stats.
// npx tsx server/scripts/compare-canon.ts
import { readFileSync } from "node:fs";
import { UNIT_TABLE } from "../src/game/unitTable.js";

const csv = readFileSync(new URL("../../docs/tabela_naves_canon_av.csv", import.meta.url), "utf8");
const lines = csv.trim().split(/\r?\n/).slice(1);

// decodifica entidades html (&eacute; etc) e tira pontos de milhar
const dec = (s: string) => s
  .replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó")
  .replace(/&uacute;/g, "ú").replace(/&aacute;/g, "á").replace(/&Iacute;/g, "Í")
  .replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Aacute;/g, "Á")
  .replace(/&ccedil;/g, "ç").replace(/&atilde;/g, "ã").trim();
const num = (s: string) => Number(dec(s).replace(/\./g, "")) || 0;

type Canon = { nome: string; ini: number; agi: number; varm: number; qarm: number; pfog: number; fusel: number; m: number; c: number };
const canon: Canon[] = lines.map((l) => {
  const p = l.split(",");
  // Nome,Classe,A1,A2,A3,Ini,Agi,Var,Qarm,Pfog,Fusel,RP,M,C,P,...
  return { nome: dec(p[0]), ini: num(p[5]), agi: num(p[6]), varm: num(p[7]), qarm: num(p[8]), pfog: num(p[9]), fusel: num(p[10]), m: num(p[12]), c: num(p[13]) };
});
const byName = new Map(canon.map((c) => [c.nome, c]));

const FIELDS: (keyof Canon)[] = ["ini", "agi", "varm", "qarm", "pfog", "fusel", "m", "c"];
let diffs = 0;
console.log("Divergências JOGO (atual) vs CANON (outro round):\n");
for (const u of UNIT_TABLE) {
  const c = byName.get(u.nome);
  if (!c) { console.log(`  ${u.nome} — não existe no canon`); continue; }
  const changes: string[] = [];
  for (const f of FIELDS) {
    const atual = (u as any)[f] as number;
    const canonVal = c[f] as number;
    if (atual !== canonVal) changes.push(`${f}: jogo ${atual} ↔ canon ${canonVal}`);
  }
  if (changes.length) { diffs++; console.log(`  ${u.nome.padEnd(13)} (${u.race}) — ${changes.join(" · ")}`); }
}
console.log(`\n${diffs} nave(s) divergem do canon.`);
