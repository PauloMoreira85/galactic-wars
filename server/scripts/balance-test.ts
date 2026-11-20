// Teste de balanceamento entre as raças usando o MOTOR REAL de combate do jogo.
// Monta frotas de CUSTO equivalente e cruza todas as raças (atacante x defensor),
// em 3 cenários, e aponta discrepâncias grandes.
// Rodar:  npx tsx server/scripts/balance-test.ts
import { simulateCombat } from "../src/game/combat.js";
import { UNIT_TABLE, RACE_TABLE_KEYS, type RaceTable } from "../src/game/unitTable.js";

type UnitMap = Record<string, number>;
const costOf = (name: string) => { const u = UNIT_TABLE.find((x) => x.nome === name)!; return u.m + u.c; };
const unitsOf = (race: RaceTable) => UNIT_TABLE.filter((u) => u.race === race);
const combatUnits = (race: RaceTable) => unitsOf(race).filter((u) => !u.roider); // naves de guerra (tira roider econômico)

const BUDGET = 20_000_000; // orçamento de M+C por frota

// Monta uma frota gastando ~BUDGET numa escolha de naves (lista de nomes), dividido igual.
function buildFleet(names: string[], budget = BUDGET): UnitMap {
  const f: UnitMap = {};
  const per = budget / names.length;
  for (const n of names) { const qty = Math.floor(per / costOf(n)); if (qty > 0) f[n] = qty; }
  return f;
}

// Score de valor (M+C) de uma frota — pra comparar "quanto sobrou vivo".
function value(f: UnitMap): number {
  let v = 0; for (const n of Object.keys(f)) v += (f[n] || 0) * costOf(n); return v;
}
const totalShips = (f: UnitMap) => Object.values(f).reduce((a, b) => a + b, 0);

// Cenários de frota por raça:
// A) só a nave-mãe (classe "Na") mais cara da raça
// B) frota "balanceada": 1 nave de cada classe de combate
// C) só caças (classe "Ca")
function fleetA(race: RaceTable): UnitMap { // nave-mãe
  const nas = combatUnits(race).filter((u) => u.classe === "Na").sort((a, b) => (b.m + b.c) - (a.m + a.c));
  return nas.length ? buildFleet([nas[0].nome]) : {};
}
function fleetB(race: RaceTable): UnitMap { // frota de guerra realista: TODAS as naves de combate, orçamento dividido
  return buildFleet(combatUnits(race).map((u) => u.nome));
}
function fleetC(race: RaceTable): UnitMap { // caças
  const cas = combatUnits(race).filter((u) => u.classe === "Ca");
  return cas.length ? buildFleet(cas.map((u) => u.nome)) : {};
}

const SCEN: Record<string, (r: RaceTable) => UnitMap> = { A_navemae: fleetA, B_balanceada: fleetB, C_cacas: fleetC };
const RACES = RACE_TABLE_KEYS;

type Outcome = { atk: RaceTable; def: RaceTable; winner: string; atkLeftPct: number; defLeftPct: number };

function run(scen: (r: RaceTable) => UnitMap): Outcome[] {
  const out: Outcome[] = [];
  for (const atk of RACES) for (const def of RACES) {
    if (atk === def) continue;
    const A = scen(atk), D = scen(def);
    if (totalShips(A) === 0 || totalShips(D) === 0) continue;
    const vA0 = value(A), vD0 = value(D);
    const res = simulateCombat({ ...A }, { ...D }, 3);
    const atkLeft = value(res.finalAttacker) / vA0 * 100;
    const defLeft = value(res.finalDefender) / vD0 * 100;
    out.push({ atk, def, winner: res.winner, atkLeftPct: Math.round(atkLeft), defLeftPct: Math.round(defLeft) });
  }
  return out;
}

// ===== Execução + relatório =====
console.log(`Orçamento por frota: ${(BUDGET/1e6).toFixed(0)}M (M+C), combate de 3 ticks.\n`);

const winCount: Record<string, { w: number; l: number; draw: number; dominance: number }> = {};
for (const r of RACES) winCount[r] = { w: 0, l: 0, draw: 0, dominance: 0 };

for (const [name, fn] of Object.entries(SCEN)) {
  console.log(`\n===== CENÁRIO ${name} =====`);
  const rows = run(fn);
  for (const o of rows) {
    const flag =
      o.winner === "atacante" && o.atkLeftPct >= 70 ? "  ⚠️ DOMÍNIO do atacante" :
      o.winner === "defesa" && o.defLeftPct >= 70 ? "  ⚠️ DOMÍNIO do defensor" : "";
    console.log(`  ${o.atk.padEnd(9)} atk x ${o.def.padEnd(9)} def → ${o.winner.padEnd(16)} (atk ${o.atkLeftPct}% · def ${o.defLeftPct}% vivos)${flag}`);
    // Placar agregado (ponto de vista do atacante do par)
    if (o.winner === "atacante") { winCount[o.atk].w++; winCount[o.def].l++; if (o.atkLeftPct >= 70) winCount[o.atk].dominance++; }
    else if (o.winner === "defesa") { winCount[o.def].w++; winCount[o.atk].l++; if (o.defLeftPct >= 70) winCount[o.def].dominance++; }
    else { winCount[o.atk].draw++; winCount[o.def].draw++; }
  }
}

console.log(`\n\n===== PLACAR AGREGADO (todos os cenários) =====`);
const sorted = [...RACES].sort((a, b) => winCount[b].w - winCount[a].w);
for (const r of sorted) {
  const s = winCount[r];
  console.log(`  ${r.padEnd(10)} → ${s.w}V / ${s.l}D / ${s.draw}E  · domínios: ${s.dominance}`);
}
console.log(`\n(⚠️ DOMÍNIO = venceu sobrando ≥70% da frota — desequilíbrio forte naquele confronto)`);
