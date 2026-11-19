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
  spied: boolean;        // já espionou alguém (gerou relatório)
  sabotaged: boolean;    // já lançou uma sabotagem
  toolsUsed: boolean;    // já abriu as Ferramentas/Calculadora
  galaxyViewed: boolean; // já abriu a tela da Galáxia
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
  { key: "m_fundicao", title: "Fundação de Metalium", desc: "📍 Abra o menu ☰ (3 tracinhos, topo-esquerda) → Tecnologia. Na trilha 'Mineração', clique em 'Fundição de Metalium' e construa. É a base da sua economia — tudo começa por aqui.", reward: { m: 10000 }, done: (c) => (c.tech.centroMineracao ?? 0) >= 1 },
  { key: "m_roids5", title: "Minere 5 asteroides", desc: "📍 Menu ☰ → Recursos. Clique em 'Minerar asteroide' até chegar a 11 roids no total (você começa com 6). Cada roid rende recursos todo tick — é sua renda passiva.", reward: { roidM: 2 }, done: (c) => c.roidsTotal >= 11 },
  { key: "m_carbonum_pesq", title: "Pesquise Carbonum", desc: "📍 Menu ☰ → Tecnologia → trilha 'Mineração'. Pesquise 'Desenvolvimento de Carbonum' pra destravar o 2º recurso do jogo.", reward: { c: 10000 }, done: (c) => (c.tech.extracaoCristal ?? 0) >= 1 },
  { key: "m_carbonum_build", title: "Extração de Carbonum", desc: "📍 Tecnologia → 'Mineração'. Depois de pesquisar, construa a 'Extração de Carbonum'. A partir daí você produz Carbonum por tick (olhe o contador no topo da tela).", reward: { roidC: 1 }, done: (c) => (c.tech.minaCristal ?? 0) >= 1 },
  { key: "m_plutonium", title: "Produza Plutônium", desc: "📍 Tecnologia → 'Mineração'. Avance até o 'Reator de geração rápida' pra produzir Plutônium — é o combustível que as frotas gastam pra viajar.", reward: { p: 10000 }, done: (c) => (c.tech.labEonio ?? 0) >= 1 },
  { key: "m_roids15", title: "15 asteroides", desc: "📍 Menu ☰ → Recursos. Continue minerando até 15 roids no total. Quanto mais roids, mais recursos por tick e mais naves você constrói depois.", reward: { roidM: 1, roidC: 1, roidP: 1 }, done: (c) => c.roidsTotal >= 15 },
  { key: "m_mina_profunda", title: "Mineração avançada", desc: "📍 Tecnologia → 'Mineração'. Pesquise 'Ruptura nuclear de baixo custo' — libera as minas profundas (+25.000/tick cada). É o salto de economia do meio de jogo.", reward: { m: 15000, c: 15000 }, done: (c) => (c.tech.recursosProfundidade ?? 0) >= 1 },
  { key: "m_calc", title: "Use a Calculadora", desc: "📍 Menu ☰ → Ferramentas → Calculadora. Simule quanto rende construir naves/roids ou quanto custa uma pesquisa antes de gastar. Planejar economiza recursos.", reward: { m: 8000, c: 8000 }, done: (c) => c.toolsUsed },

  // ---- Naves e frotas ----
  { key: "m_fabrica", title: "Indústrias de Naves", desc: "📍 Tecnologia → trilha 'Naves'. Construa as 'Indústrias de Naves' — sem ela você não fabrica nenhuma nave.", reward: { m: 15000, c: 15000 }, done: (c) => (c.tech.fundicaoCacas ?? 0) >= 1 },
  { key: "m_nave1", title: "Sua 1ª nave", desc: "📍 Menu ☰ → Naves. Clique no Caça (a nave mais barata), escolha a quantidade e construa. Cada raça tem naves próprias com funções diferentes.", reward: { m: 10000, c: 10000 }, done: (c) => totalUnitsOf(c) >= 1 },
  { key: "m_frota", title: "Crie uma frota", desc: "📍 Menu ☰ → Frotas → 'Criar frota'. Depois use as setas « » pra transferir naves do hangar (base) pra frota. Só com naves numa frota você consegue enviá-las pra fora.", reward: { p: 15000 }, done: (c) => c.fleetSlots >= 1 },
  { key: "m_desloc", title: "Pesquise Deslocamento", desc: "📍 Tecnologia → trilha 'Deslocamento'. Pesquise 'Propulsores de alta velocidade' — cada nível reduz o tempo (TEC) que as frotas levam pra chegar ao alvo.", reward: { m: 15000 }, done: (c) => (c.tech.mecanicaQuantica ?? 0) >= 1 },
  { key: "m_galaxia", title: "Explore a Galáxia", desc: "📍 Menu ☰ → Galáxia. Veja os planetas vizinhos, suas coordenadas (setor:paralelo:slot) e quem é aliado ou inimigo. Clique numa coordenada em qualquer lugar do jogo pra abrir o planeta.", reward: { m: 8000, c: 8000 }, done: (c) => c.galaxyViewed },
  { key: "m_envio", title: "Mova uma frota", desc: "📍 Menu ☰ → Frotas. Escolha a frota, digite a coordenada de destino e envie (defesa de aliado ou ataque). Acompanhe o tráfego na própria aba Frotas.", reward: { m: 15000, c: 15000 }, done: (c) => c.sentFleet },
  { key: "m_combate", title: "Primeiro combate", desc: "📍 Envie uma frota de ataque a um inimigo, ou defenda um aliado atacado. O relatório aparece em Menu ☰ → Combates — lá você vê os tiros e as perdas de cada lado.", reward: { m: 20000, c: 20000, roidM: 1, roidC: 1 }, done: (c) => c.hadCombat },

  // ---- Inteligência e sabotagem ----
  { key: "m_intel", title: "Central de Inteligência", desc: "📍 Tecnologia → trilha 'Inteligência'. Construa a 'Central de Inteligência' — destrava treinar agentes pra espionar, sabotar e se defender.", reward: { p: 10000 }, done: (c) => (c.tech.centralInteligencia ?? 0) >= 1 },
  { key: "m_agente", title: "Treine um agente", desc: "📍 Menu ☰ → Inteligência. Treine seu primeiro agente. Agentes são a sua espionagem e sabotagem — e também sua defesa contra espiões inimigos.", reward: { p: 15000 }, done: (c) => Object.values(c.agents).reduce((a, b) => a + (b || 0), 0) >= 1 },
  { key: "m_ce", title: "Contra-Espionagem", desc: "📍 Menu ☰ → Inteligência. Treine agentes de Contra-Espionagem (CE) — eles barram os espiões e sabotadores que o inimigo mandar contra você.", reward: { p: 15000 }, done: (c) => (c.agents.CE ?? 0) >= 1 },
  { key: "m_espionar", title: "Espione um inimigo", desc: "📍 Menu ☰ → Inteligência → 'Espionar'. Digite a coordenada do alvo pra ver roids, naves e tecnologia dele. O relatório fica salvo em Ferramentas → Espionagens. Saber o que o outro tem é meio caminho pra vencer.", reward: { m: 12000, p: 12000 }, done: (c) => c.spied },
  { key: "m_sabotar", title: "Faça uma sabotagem", desc: "📍 Menu ☰ → Inteligência → 'Sabotar'. Escolha o alvo e o que atacar (recursos, naves em construção, etc.). A sabotagem leva alguns ticks pra fazer efeito. É guerra sem enviar frota.", reward: { m: 15000, p: 15000 }, done: (c) => c.sabotaged },

  // ---- Comunidade e política ----
  { key: "m_msg", title: "Mande uma mensagem", desc: "📍 Menu ☰ → Mensagens → 'Nova conversa'. Digite a coordenada de outro comandante e escreva (estilo chat, Enter envia). Diplomacia vence tanto quanto frota.", reward: { m: 8000, c: 8000 }, done: (c) => c.sentPM },
  { key: "m_news", title: "Leia as Notícias", desc: "📍 Menu ☰ → Notícias. É o painel onde chegam os avisos do seu planeta: ataque chegando, defesa, espionagem sofrida, pesquisa concluída. Olhe sempre.", reward: { m: 5000, c: 5000 }, done: (c) => c.newsOpened },
  { key: "m_voto", title: "Vote na galáxia", desc: "📍 Menu ☰ → Governo. Vote para Comandante da Galáxia — ele gerencia o fundo de recursos e organiza a defesa dos aliados. Sua galáxia é seu time.", reward: { m: 10000, c: 10000 }, done: (c) => c.voted },
  { key: "m_alianca", title: "Entre numa aliança", desc: "📍 Menu ☰ → Alianças. Crie uma ou entre numa existente. Alianças cruzam galáxias — é a estrutura política grande do jogo. Juntos vocês dominam o universo.", reward: { m: 20000, c: 20000, p: 20000 }, done: (c) => c.hasAlliance },
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

  const [alliance, pm, vote, combat, spied, sabotaged, tick] = await Promise.all([
    prisma.allianceMember.findUnique({ where: { planetId } }).then((x) => !!x),
    prisma.privateMessage.count({ where: { fromUserId: planet.userId } }).then((n) => n > 0),
    prisma.galaxyVote.count({ where: { voterPlanetId: planetId } }).then((n) => n > 0),
    prisma.battleReport.count({ where: { OR: [{ attackerPlanetId: planetId }, { defenderPlanetId: planetId }] } }).then((n) => n > 0),
    prisma.spyReport.count({ where: { spyPlanetId: planetId } }).then((n) => n > 0),
    Promise.all([
      prisma.sabotageCooldown.count({ where: { planetId } }),
      prisma.sabotageOrder.count({ where: { saboteurPlanetId: planetId } }),
    ]).then(([a, b]) => a + b > 0),
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
    spied, sabotaged,
    toolsUsed: planet.toolsSeenAt != null,
    galaxyViewed: planet.galaxySeenAt != null,
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
