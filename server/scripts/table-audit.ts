// Auditoria da tabela de unidades: procura distorções estruturais.
// npx tsx server/scripts/table-audit.ts
import { UNIT_TABLE, RACE_TABLE_KEYS, type RaceTable } from "../src/game/unitTable.js";

const CLASSES = ["Ca", "Co", "Fr", "De", "Cr", "Na"] as const;
const cost = (u: any) => u.m + u.c;

// 1) Cobertura de alvos: quais CLASSES cada raça consegue acertar?
console.log("=== 1) COBERTURA DE ALVOS POR RAÇA (classes que ela acerta) ===");
for (const r of RACE_TABLE_KEYS) {
  const us = UNIT_TABLE.filter((u) => u.race === r && !u.roider);
  const hit = new Set<string>();
  for (const u of us) for (const a of u.alvos) hit.add(a);
  const missing = CLASSES.filter((c) => !hit.has(c));
  console.log(`  ${r.padEnd(9)} acerta: [${[...hit].join(",")}]${missing.length ? `   ⚠️ NÃO acerta: ${missing.join(",")}` : "  ✅ completa"}`);
}

// 2) Quem acerta nave-mãe (Na)? classe mais cara e decisiva.
console.log("\n=== 2) QUEM ACERTA NAVE-MÃE (Na) ===");
for (const r of RACE_TABLE_KEYS) {
  const hitNa = UNIT_TABLE.filter((u) => u.race === r && u.alvos.includes("Na")).map((u) => u.nome);
  console.log(`  ${r.padEnd(9)} ${hitNa.length ? hitNa.join(", ") : "⚠️ NINGUÉM acerta nave-mãe!"}`);
}

// 3) Eficiência de dano por recurso: pfog*qarm por 1000 de custo (naves normais).
console.log("\n=== 3) EFICIÊNCIA DE DANO (pfog×qarm por 1000 de custo) — top e bottom ===");
const eff = UNIT_TABLE.filter((u) => !u.roider && u.pfog > 0).map((u) => ({
  nome: u.nome, race: u.race, classe: u.classe, tipo: u.tipo,
  dano: u.pfog * u.qarm, custo: cost(u), e: +( (u.pfog * u.qarm) / (cost(u) / 1000) ).toFixed(1),
})).sort((a, b) => b.e - a.e);
console.log("  MAIS eficientes:");
for (const x of eff.slice(0, 6)) console.log(`    ${x.nome.padEnd(12)} ${x.race.padEnd(9)} ${x.classe} — dano ${x.dano}/tick · custo ${x.custo} · efic ${x.e}`);
console.log("  MENOS eficientes:");
for (const x of eff.slice(-6)) console.log(`    ${x.nome.padEnd(12)} ${x.race.padEnd(9)} ${x.classe} — dano ${x.dano}/tick · custo ${x.custo} · efic ${x.e}`);

// 4) Resistência por recurso: fusel por 1000 de custo.
console.log("\n=== 4) RESISTÊNCIA (fusel por 1000 de custo) — top e bottom ===");
const res = UNIT_TABLE.filter((u) => !u.roider).map((u) => ({
  nome: u.nome, race: u.race, classe: u.classe, fusel: u.fusel, custo: cost(u), e: +(u.fusel / (cost(u) / 1000)).toFixed(1),
})).sort((a, b) => b.e - a.e);
console.log("  MAIS tanque:");
for (const x of res.slice(0, 6)) console.log(`    ${x.nome.padEnd(12)} ${x.race.padEnd(9)} ${x.classe} — fusel ${x.fusel} · custo ${x.custo} · efic ${x.e}`);
console.log("  MENOS tanque:");
for (const x of res.slice(-6)) console.log(`    ${x.nome.padEnd(12)} ${x.race.padEnd(9)} ${x.classe} — fusel ${x.fusel} · custo ${x.custo} · efic ${x.e}`);

// 5) Iniciativa: MENOR = atira primeiro (confirmado no motor, combat.ts:158).
console.log("\n=== 5) INICIATIVA — média por raça (MENOR = atira ANTES) ===");
const inis = RACE_TABLE_KEYS.map((r) => {
  const us = UNIT_TABLE.filter((u) => u.race === r && !u.roider);
  return { r, avg: us.reduce((a, u) => a + u.ini, 0) / us.length };
}).sort((a, b) => a.avg - b.avg);
for (const x of inis) console.log(`  ${x.r.padEnd(9)} ini média ${x.avg.toFixed(0)}${x.avg < 15 ? "  ⚡ atira primeiro" : ""}`);

// 6) Naves "nicho morto": acertam uma classe que quase ninguém usa, ou são dominadas.
console.log("\n=== 6) ALVOS RAROS: classes pouco miradas (podem deixar naves inúteis) ===");
const targetCount: Record<string, number> = {};
for (const u of UNIT_TABLE) if (!u.roider) for (const a of u.alvos) targetCount[a] = (targetCount[a] || 0) + 1;
for (const c of CLASSES) console.log(`  classe ${c}: mirada por ${targetCount[c] || 0} naves${(targetCount[c] || 0) <= 3 ? "  ⚠️ pouco mirada" : ""}`);
