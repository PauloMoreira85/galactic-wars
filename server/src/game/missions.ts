import { prisma } from "../db.js";
import { addNews } from "./news.js";
import { parseUnits, totalUnits } from "./unitmap.js";

// ===== Missões de novato =====
// Ensinam o jogo e dão um empurrão nos primeiros ticks (onde só dá pra pesquisar/
// construir/minerar). Recompensa AUTOMÁTICA ao cumprir. A condição recebe um
// "contexto" já carregado (pra não fazer N queries por missão).

export interface MissionCtx {
  tech: Record<string, number>;
  agents: Record<string, number>;
  baseUnits: Record<string, number>;
  fleetUnits: Record<string, number>; // naves em frotas
  roidsTotal: number;
  fleetSlots: number;
  hasAlliance: boolean;
  sentPM: boolean;
  voted: boolean;
  hadCombat: boolean;    // já participou de combate (atacou ou defendeu)
  sentFleet: boolean;    // já enviou alguma frota
  newsOpened: boolean;   // já abriu as notícias
}

export interface MissionDef {
  key: string;
  title: string;
  desc: string;                 // o que fazer (ensina)
  reward: { m?: number; c?: number; p?: number; roidM?: number; roidC?: number; roidP?: number };
  done: (c: MissionCtx) => boolean;
}

const totalUnitsOf = (c: MissionCtx) => totalUnits(c.baseUnits) + totalUnits(c.fleetUnits);

export const MISSIONS: MissionDef[] = [
  // ---- Primeiros passos / economia ----
  { key: "m_fundicao", title: "Fundação de Metalium", desc: "Construa a Fundição de Metalium (aba Tecnologia). É a base da sua economia.", reward: { m: 10000 }, done: (c) => (c.tech.centroMineracao ?? 0) >= 1 },
  { key: "m_roids5", title: "Minere 5 asteroides", desc: "Inicie asteroides na aba Recursos até ter 11 no total (você começa com 6). Roids = recursos por tick.", reward: { roidM: 2 }, done: (c) => c.roidsTotal >= 11 },
  { key: "m_carbonum_pesq", title: "Pesquise Carbonum", desc: "Pesquise 'Desenvolvimento de Carbonum' (aba Tecnologia) pra liberar o 2º recurso.", reward: { c: 10000 }, done: (c) => (c.tech.extracaoCristal ?? 0) >= 1 },
  { key: "m_carbonum_build", title: "Extração de Carbonum", desc: "Construa a 'Extração de Carbonum' — agora você produz Carbonum por tick.", reward: { roidC: 1 }, done: (c) => (c.tech.minaCristal ?? 0) >= 1 },
  { key: "m_plutonium", title: "Produza Plutônium", desc: "Avance a trilha de Mineração até o 'Reator de geração rápida' pra produzir Plutônium (combustível das frotas).", reward: { p: 10000 }, done: (c) => (c.tech.labEonio ?? 0) >= 1 },
  { key: "m_roids15", title: "15 asteroides", desc: "Chegue a 15 asteroides no total. Mais roids = mais recursos e mais naves depois.", reward: { roidM: 1, roidC: 1, roidP: 1 }, done: (c) => c.roidsTotal >= 15 },
  { key: "m_mina_profunda", title: "Mineração avançada", desc: "Pesquise 'Ruptura nuclear de baixo custo' (Mineração) — abre as minas profundas (+25.000/tick).", reward: { m: 15000, c: 15000 }, done: (c) => (c.tech.recursosProfundidade ?? 0) >= 1 },

  // ---- Naves e frotas ----
  { key: "m_fabrica", title: "Indústrias de Naves", desc: "Construa as 'Indústrias de Naves' (trilha Naves) pra poder fabricar Caças.", reward: { m: 15000, c: 15000 }, done: (c) => (c.tech.fundicaoCacas ?? 0) >= 1 },
  { key: "m_nave1", title: "Sua 1ª nave", desc: "Construa sua primeira nave (aba Naves). Cada raça tem naves próprias.", reward: { m: 10000, c: 10000 }, done: (c) => totalUnitsOf(c) >= 1 },
  { key: "m_frota", title: "Crie uma frota", desc: "Crie uma frota (aba Frotas) e transfira naves pra ela — é assim que você envia naves pra atacar ou defender.", reward: { p: 15000 }, done: (c) => c.fleetSlots >= 1 },
  { key: "m_desloc", title: "Pesquise Deslocamento", desc: "Pesquise 'Propulsores de alta velocidade' (trilha Deslocamento) — naves mais rápidas chegam antes ao alvo.", reward: { m: 15000 }, done: (c) => (c.tech.mecanicaQuantica ?? 0) >= 1 },
  { key: "m_envio", title: "Mova uma frota", desc: "Envie uma frota pra algum destino (defesa de aliado ou ataque). Veja o tráfego na aba correspondente.", reward: { m: 15000, c: 15000 }, done: (c) => c.sentFleet },
  { key: "m_combate", title: "Primeiro combate", desc: "Participe de um combate — ataque um inimigo ou defenda um aliado. Veja o resultado em Combates.", reward: { m: 20000, c: 20000, roidM: 1, roidC: 1 }, done: (c) => c.hadCombat },

  // ---- Inteligência ----
  { key: "m_intel", title: "Central de Inteligência", desc: "Pesquise/construa a 'Central de Inteligência' pra começar a espionar e se defender de espiões.", reward: { p: 10000 }, done: (c) => (c.tech.centralInteligencia ?? 0) >= 1 },
  { key: "m_agente", title: "Treine um agente", desc: "Treine seu primeiro agente (aba Inteligência). Agentes espionam, sabotam e protegem você.", reward: { p: 15000 }, done: (c) => Object.values(c.agents).reduce((a, b) => a + (b || 0), 0) >= 1 },
  { key: "m_ce", title: "Contra-Espionagem", desc: "Treine agentes de Contra-Espionagem (CE) — eles bloqueiam espiões e sabotadores inimigos.", reward: { p: 15000 }, done: (c) => (c.agents.CE ?? 0) >= 1 },

  // ---- Comunidade e política ----
  { key: "m_msg", title: "Mande uma mensagem", desc: "Envie uma mensagem privada a outro comandante (aba Mensagem). Diplomacia vence guerras.", reward: { m: 8000, c: 8000 }, done: (c) => c.sentPM },
  { key: "m_news", title: "Leia as Notícias", desc: "Abra a aba Notícias — é onde chegam avisos de ataque, defesa e eventos do seu planeta.", reward: { m: 5000, c: 5000 }, done: (c) => c.newsOpened },
  { key: "m_voto", title: "Vote na galáxia", desc: "Vote para Comandante da Galáxia (aba Votação/Governo). A galáxia é seu time de aliados.", reward: { m: 10000, c: 10000 }, done: (c) => c.voted },
  { key: "m_alianca", title: "Entre numa aliança", desc: "Crie ou entre numa aliança (aba Alianças). Juntos vocês dominam o universo.", reward: { m: 20000, c: 20000, p: 20000 }, done: (c) => c.hasAlliance },
];

export const MISSION_BY_KEY: Record<string, MissionDef> = Object.fromEntries(MISSIONS.map((m) => [m.key, m]));

// Monta o contexto do planeta e verifica/concede as missões recém-cumpridas.
// Retorna as keys concedidas AGORA (pra avisar). Idempotente (não paga 2x).
export async function checkMissions(planetId: string): Promise<string[]> {
  const planet = await prisma.planet.findUnique({ where: { id: planetId } });
  if (!planet) return [];
  let done: string[] = [];
  try { done = JSON.parse(planet.missionsDone || "[]"); } catch { done = []; }
  const doneSet = new Set(done);
  // Se já concluiu todas, nada a fazer.
  if (doneSet.size >= MISSIONS.length) return [];

  const tech = safeJson(planet.tech);
  const agents = safeJson(planet.agents);
  const baseUnits = parseUnits(planet.units);
  const fleets = await prisma.fleet.findMany({ where: { ownerPlanetId: planetId }, select: { units: true, status: true } });
  const fleetUnits: Record<string, number> = {};
  for (const f of fleets) { const u = parseUnits(f.units); for (const n of Object.keys(u)) fleetUnits[n] = (fleetUnits[n] || 0) + u[n]; }

  const [alliance, pm, vote, combat, tick] = await Promise.all([
    prisma.allianceMember.findUnique({ where: { planetId } }).then((x) => !!x),
    prisma.privateMessage.count({ where: { fromUserId: planet.userId } }).then((n) => n > 0),
    prisma.galaxyVote.count({ where: { voterPlanetId: planetId } }).then((n) => n > 0),
    prisma.battleReport.count({ where: { OR: [{ attackerPlanetId: planetId }, { defenderPlanetId: planetId }] } }).then((n) => n > 0),
    prisma.gameState.findUnique({ where: { id: 1 } }).then((s) => s?.tickNumber ?? 0),
  ]);
  // Enviou frota? (tem frota fora da base, ou já teve combate = com certeza enviou)
  const sentFleet = combat || fleets.some((f) => f.status !== "idle");

  const ctx: MissionCtx = {
    tech, agents, baseUnits, fleetUnits,
    roidsTotal: planet.roidMetalium + planet.roidCarbonum + planet.roidPlutonium,
    fleetSlots: planet.fleetSlots,
    hasAlliance: alliance, sentPM: pm, voted: vote, hadCombat: combat, sentFleet,
    newsOpened: planet.newsSeenAt != null,
  };

  const granted: string[] = [];
  let addM = 0, addC = 0, addP = 0, addRM = 0, addRC = 0, addRP = 0;
  for (const mission of MISSIONS) {
    if (doneSet.has(mission.key)) continue;
    if (!mission.done(ctx)) continue;
    const r = mission.reward;
    addM += r.m ?? 0; addC += r.c ?? 0; addP += r.p ?? 0;
    addRM += r.roidM ?? 0; addRC += r.roidC ?? 0; addRP += r.roidP ?? 0;
    doneSet.add(mission.key); granted.push(mission.key);
  }
  if (!granted.length) return [];

  await prisma.planet.update({
    where: { id: planetId },
    data: {
      missionsDone: JSON.stringify([...doneSet]),
      metalium: { increment: addM }, carbonum: { increment: addC }, plutonium: { increment: addP },
      roidMetalium: { increment: addRM }, roidCarbonum: { increment: addRC }, roidPlutonium: { increment: addRP },
    },
  });
  for (const key of granted) {
    const m = MISSION_BY_KEY[key];
    const parts: string[] = [];
    if (m.reward.m) parts.push(`${m.reward.m} M`);
    if (m.reward.c) parts.push(`${m.reward.c} C`);
    if (m.reward.p) parts.push(`${m.reward.p} P`);
    if (m.reward.roidM) parts.push(`${m.reward.roidM} roid M`);
    if (m.reward.roidC) parts.push(`${m.reward.roidC} roid C`);
    if (m.reward.roidP) parts.push(`${m.reward.roidP} roid P`);
    await addNews(planetId, tick, `🎖️ Missão cumprida: "${m.title}" — recompensa: ${parts.join(" · ")}`);
  }
  return granted;
}

// Lista as missões com status (feito/pendente) pro painel do cliente.
export async function missionsView(planetId: string) {
  const planet = await prisma.planet.findUnique({ where: { id: planetId }, select: { missionsDone: true } });
  let done: string[] = [];
  try { done = JSON.parse(planet?.missionsDone || "[]"); } catch { done = []; }
  const doneSet = new Set(done);
  return MISSIONS.map((m) => ({
    key: m.key, title: m.title, desc: m.desc, done: doneSet.has(m.key),
    reward: m.reward,
  }));
}

function safeJson(s: string): Record<string, number> {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}
