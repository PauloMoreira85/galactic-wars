// Cliente HTTP fininho para a API do jogo.

const TOKEN_KEY = "gw_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
  return data as T;
}

export type Resource = "metalium" | "carbonum" | "plutonium";

// Modos do jogo (instâncias separadas). Detecta o RUR pelo subdomínio.
export const MAIN_URL = "https://galacticwar.com.br";
export const RUR_URL = "https://rur.galacticwar.com.br";
// Link de convite do Discord da comunidade. Deixe "" pra esconder os botões.
// Quando criar o servidor, cole aqui o link (ex.: "https://discord.gg/abc123").
export const DISCORD_URL = "";
export const IS_RUR = typeof window !== "undefined" && window.location.hostname.startsWith("rur.");
// Intervalo de auto-refresh das telas. No RUR o tick é de 5s, então precisa ser
// quase em tempo real; no jogo principal (tick 60s) 10s basta.
export const REFRESH_MS = IS_RUR ? 1500 : 10000;

export interface RaceInfo {
  key: string;
  name: string;
  tagline: string;
  lore: string;
  img?: string;
  strengths?: string[];
  weaknesses?: string[];
  charImg?: string;
  ships?: { name: string; classe: string; roider: boolean }[];
}

// Nave real da tabela oficial.
export interface UnitItem {
  name: string;
  img: string;           // /art/ships/<slug>.png
  classe: string;        // Ca/Co/Fr/De/Cr/Na/Ro
  classeLabel: string;   // Caça/Corveta/...
  tipo: string;          // Normal/PEM/Invisivel/Assimiladora/Inseto/Roider
  roider: boolean;
  alvos: string[];       // classes que ela acerta
  stats: { ini: number; agi: number; varm: number; qarm: number; pfog: number; fusel: number; rp: number; tec: number; comb: number };
  travelTec: number; // TEC efetivo dentro da galáxia (com propulsão)
  cost: Record<Resource, number>;
  ticks: number;
  count: number;        // quantas estão na BASE (usado pela Frotas pra transferir)
  total: number;        // total que você tem: base + todas as frotas
  unlocked: boolean;
  captured?: boolean; // nave de outra raça (assimilada) — só pra carregar em frota
}

export interface QueueItem {
  id: string;
  kind: "ship" | "tech";
  techKind: "research" | "building" | null;
  shipClass: string | null;
  key: string | null;
  label: string;
  quantity: number;
  ticksRemaining: number;
}

export type TechCategory = "mineracao" | "tec" | "espionagem" | "sabotagem" | "naves";

export interface TechItem {
  key: string;
  name: string;
  category: TechCategory;
  kind: "research" | "building";
  desc: string;
  level: number;
  max: number;
  maxed: boolean;
  cost: Record<Resource, number> | null;
  ticks: number | null;
  reqsMet: boolean;
  requires: { name: string; level: number }[];
  affordable: boolean;
  canStart: boolean;
}

export interface HallChampion {
  position: number; commander: string; planet: string; coords: string;
  race: string | null; roids: number; score: number;
}
export interface HallRound { round: number; endedAt: string; top: HallChampion[] }

export interface PlanetView {
  commander: string;
  commanderAvatar: string | null;
  commanderTitle: string;
  race: RaceInfo & {
    traits: Record<string, unknown>;
  };
  planet: {
    id: string;
    name: string;
    coords: string;
    resources: Record<Resource, number>;
    roids: Record<Resource, number> & { total: number };
    productionPerTick: Record<Resource, number>;
    nextRoidCost: Record<Resource, number>; // custo (em METALIUM) do próximo roid de cada recurso
    miningBonus: Record<Resource, number>;  // bônus FLAT de produção das minas
    travelReduction: number;                // ticks reduzidos no tempo de viagem
    score: number;
    rank: number;
    cargo: string | null;
    fleetSlots: number;
    fleetsActive: number;
    nextFleetSlotCost: Record<Resource, number> | null;
    autoExiles: number;
    morale: number;
    moralePct: number;
    protection: { active: boolean; ticksLeft: number };
  };
  agents: {
    counts: Record<string, number>;
    protection: { ce: number; needed: number; shielded: boolean; roids: number; roidsPerCE: number };
  };
  mustChooseRace: boolean;
  onlineCount: number;
  newsUnread: number;
  admin: boolean;
  galaxyFund: { metalium: number; carbonum: number; plutonium: number; taxRate: number; marketFee: number; marketLocked: boolean; iAmCG?: boolean; iAmME?: boolean; iAmMG?: boolean; iAmMD?: boolean };
  tech: TechItem[];
  effects: { espionage: number };
  units: UnitItem[];
  queue: QueueItem[];
  game: {
    tickNumber: number;
    lastTickAt: string | null;
    tickIntervalSeconds: number;
    roundTicks: number;
    roundEnded: boolean;
    roundStartAt: string | null;
    nextRoundStartAt: string | null;
  };
}

export interface GovMember { id: string; name: string; commander: string; coords: string; votes: number;
  donation?: { recv: number; cap: number; canReceive: number; resetIn: number } }
export interface GovView {
  galaxy: number;
  galaxyCoord?: string;
  galaxyName: string | null; flag: string | null;
  cg: string | null; cgId: string | null;
  me: string | null; meId: string | null;
  mg: string | null; mgId: string | null;
  md: string | null; mdId: string | null;
  taxRate: number;
  marketFee: number;
  marketLocked: boolean;
  fund: Record<Resource, number>;
  treaties: { other: number; otherCoord?: string; status: string; proposedByMe: boolean }[];
  iAmCG: boolean; iAmME: boolean; iAmMG: boolean; iAmMD: boolean;
  myVote: string | null;
  members: GovMember[];
  donations?: { from: string; to: string; metalium: number; carbonum: number; plutonium: number; tick: number }[];
}

export interface AllianceMemberView { planetId: string; role: string; name: string; commander: string; coords: string }
export interface AllianceView {
  inAlliance: boolean;
  myRequests?: { allianceId: string; name: string; tag: string }[]; // pedidos pendentes DELE (sem aliança)
  id?: string; name?: string; tag?: string; maxMembers?: number;
  myRole?: string; canInvite?: boolean; isLeader?: boolean; canManage?: boolean;
  orders?: string | null; ordersBy?: string | null; ordersAt?: string | null;
  members?: AllianceMemberView[];
  pending?: { planetId: string; name: string; commander: string }[]; // pedidos recebidos (TL/HC veem)
}
export interface AttackBoardView {
  locked: boolean;
  canManage: boolean;
  myPlanetId: string;
  targets: {
    id: string; coord: string; targetName: string | null; note: string | null; createdBy: string;
    intelHash: string | null;
    ownerPlanetId: string | null; shared: boolean; iAmOwner: boolean; mineClaimed: boolean;
    claimers: { planetId: string; name: string; coords: string; isOwner: boolean }[];
  }[];
}
export interface AllianceIntelItem {
  id: string; spyHash: string; targetCoords: string; targetName: string; agent: string; sharedBy: string; tick: number; at: string;
}
export const ROLE_LABEL: Record<string, string> = {
  lider: "TL (Tag Leader)", alto_comando: "Alto Comando", dc: "DC (Defense Commander)", ac: "AC (Attack Commander)", scanner: "Scanner", porta_voz: "Porta-Voz", recruta: "Recruta",
};
export const ALLIANCE_ROLES = ["lider", "alto_comando", "dc", "ac", "scanner", "porta_voz", "recruta"];

export const api = {
  meta: () => request<{ tickIntervalSeconds: number; roundTicks: number; roundDurationMinutes: number; startTimes: string[]; dailySchedule?: boolean }>("/meta"),

  races: () => request<{ races: RaceInfo[] }>("/auth/races"),

  hall: () => request<{ rounds: HallRound[] }>("/auth/hall"),

  register: (body: {
    email: string;
    username: string;
    password: string;
    planetName?: string;
    preposition?: string;
    race: string;
    whatsapp?: string;
  }) => request<{ token: string; username: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  }),

  login: (body: { login: string; password: string }) =>
    request<{ token: string; username: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  forgotPassword: (login: string) =>
    request<{ ok: true }>("/auth/forgot", { method: "POST", body: JSON.stringify({ login }) }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>("/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) }),

  me: () => request<PlanetView>("/game/me"),

  buildRoid: (resource: Resource, count = 1) =>
    request<PlanetView>("/game/roids/build", {
      method: "POST",
      body: JSON.stringify({ resource, count }),
    }),

  upgrade: (key: string) =>
    request<PlanetView>("/game/upgrade", { method: "POST", body: JSON.stringify({ key }) }),

  buildUnit: (name: string, quantity: number) =>
    request<PlanetView>("/game/units/build", {
      method: "POST",
      body: JSON.stringify({ name, quantity }),
    }),

  galaxy: (galaxy: number, system: number) =>
    request<{
      galaxy: number;
      system: number;
      name: string | null;
      flag: string | null;
      score: number;
      rank: number | null;
      morale: number | null;
      agents: { P: boolean; M: boolean; T: boolean; D: boolean };
      slots: {
        slot: number;
        occupied: boolean;
        planetId?: string;
        name?: string;
        preposition?: string;
        commander?: string;
        skin?: string;
        race?: string | null;
        raceTag?: string | null;
        allianceTag?: string | null;
        roids?: number;
        score?: number;
        rank?: number;
        online?: boolean | null;
        idleMs?: number | null;
        protected?: boolean;
        role?: "cg" | "me" | "mg" | "md" | null;
      }[];
    }>(`/game/galaxy/${galaxy}/${system}`),

  travel: (galaxy: number, system: number, slot: number) =>
    request<{ penalty: number }>(`/game/travel/${galaxy}/${system}/${slot}`),

  spy: (galaxy: number, system: number, slot: number, agent: "P" | "M" | "T" | "D") =>
    request<{ intel?: any; failed?: boolean; error?: string; hash?: string }>("/game/spy", { method: "POST", body: JSON.stringify({ galaxy, system, slot, agent }) }),

  agents: () =>
    request<{
      race: string;
      catalog: { key: string; name: string; desc: string; level: number; offensive: boolean; cost: Record<Resource, number>; ticks: number; unlocked: boolean; count: number }[];
      protection: { ce: number; needed: number; shielded: boolean; roids: number; roidsPerCE: number };
      training: { id: string; key: string; quantity: number; ticksRemaining: number }[];
    }>("/game/agents"),
  buildAgent: (key: string, quantity: number) =>
    request<PlanetView>("/game/agents/build", { method: "POST", body: JSON.stringify({ key, quantity }) }),
  spyLookup: (hash: string) =>
    request<{ hash: string; targetName: string; targetCoords: string; agent: string; tick: number; intel: any }>(`/game/spy/lookup/${encodeURIComponent(hash)}`),

  sabotage: () => request<{
    all: { key: string; name: string; building: string; desc: string; ticks: number; plut: number }[];
    available: string[];
    pending: { id: string; key: string; name: string; coords: string; tec: number }[];
    history: { id: string; key: string; name: string; target: string; coords: string; success: boolean; detail: string; tick: number }[];
  }>("/game/sabotage"),
  sabotageRun: (galaxy: number, system: number, slot: number, key: string) =>
    request<{ success?: boolean; message?: string }>("/game/sabotage", { method: "POST", body: JSON.stringify({ galaxy, system, slot, key }) }),

  govName: (name: string) =>
    request<GovView>("/game/galaxy/name", { method: "POST", body: JSON.stringify({ name }) }),

  govFlag: (image: string) =>
    request<GovView>("/game/galaxy/flag", { method: "POST", body: JSON.stringify({ image }) }),

  news: () => request<{ news: { tick: number; message: string }[] }>("/game/news"),
  newsSeen: () => request<{ ok: boolean }>("/game/news/seen", { method: "POST" }).catch(() => {}),
  markSeen: (what: "tools" | "galaxy") => request<{ ok: boolean }>(`/game/seen/${what}`, { method: "POST" }).catch(() => {}),

  forum: () => request<{ forums: { key: string; cat: string; name: string; desc: string; topics: number; messages: number; last: { authorName: string; at: string } | null }[] }>("/game/forum"),
  forumTopics: (key: string) => request<{ topics: { id: string; title: string; author: string; createdAt: string; bumpedAt: string; replies: number }[] }>(`/game/forum/topics/${key}`),
  forumCreateTopic: (key: string, title: string, body: string) =>
    request<{ id: string }>(`/game/forum/topics/${key}`, { method: "POST", body: JSON.stringify({ title, body }) }),
  forumTopic: (id: string) => request<{ id: string; forum: string; title: string; posts: { author: string; body: string; at: string }[] }>(`/game/forum/topic/${id}`),
  forumReply: (id: string, body: string) =>
    request<{ ok: true }>(`/game/forum/topic/${id}/reply`, { method: "POST", body: JSON.stringify({ body }) }),

  pm: () => request<{
    unread: number;
    inbox: { id: string; from: string; subject: string; body: string; read: boolean; at: string }[];
    sent: { id: string; to: string; subject: string; body: string; anonymous: boolean; at: string }[];
  }>("/game/pm"),
  pmSend: (to: string, subject: string, body: string, anonymous: boolean) =>
    request<any>("/game/pm", { method: "POST", body: JSON.stringify({ to, subject, body, anonymous }) }),
  pmRead: (id: string) => request<{ ok: true }>(`/game/pm/${id}/read`, { method: "POST" }),
  pmUnread: () => request<{ unread: number }>("/game/pm/unread"),
  // Modo chat
  pmConversations: () => request<{ conversations: { otherId: string; name: string; coords: string | null; last: string; lastAt: string; unread: number; lastMine: boolean }[] }>("/game/pm/conversations"),
  pmConversation: (otherId: string) => request<{ messages: { id: string; mine: boolean; fromName: string; subject: string; body: string; at: string }[] }>(`/game/pm/conversation/${otherId}`),

  chat: (room: string) => request<{ label: string; messages: { id: string; author: string; body: string; at: string }[] }>(`/game/chat/${room}`),
  chatOlder: (room: string, beforeId: string) => request<{ label: string; messages: { id: string; author: string; body: string; at: string }[] }>(`/game/chat/${room}?before=${encodeURIComponent(beforeId)}`),
  chatSend: (room: string, body: string) => request<{ label: string; messages: { id: string; author: string; body: string; at: string }[] }>(`/game/chat/${room}`, { method: "POST", body: JSON.stringify({ body }) }),
  chatUnread: () => request<{ unread: number; byRoom: Record<string, number> }>("/game/chat/unread"),
  missions: () => request<{ missions: { key: string; title: string; desc: string; done: boolean; reward: { m?: number; c?: number; p?: number; roidM?: number; roidC?: number; roidP?: number } }[] }>("/game/missions"),
  pushKey: () => request<{ key: string; enabled: boolean }>("/game/push/key"),
  pushSubscribe: (subscription: any) => request<{ ok: boolean }>("/game/push/subscribe", { method: "POST", body: JSON.stringify({ subscription }) }),
  pushUnsubscribe: (endpoint: string) => request<{ ok: boolean }>("/game/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
  notifPrefs: () => request<{ on: Record<string, boolean> }>("/game/notif-prefs"),
  saveNotifPrefs: (on: Record<string, boolean>) => request<{ ok: boolean }>("/game/notif-prefs", { method: "POST", body: JSON.stringify({ on }) }),
  chatSeen: () => request<{ ok: boolean }>("/game/chat/seen", { method: "POST" }).catch(() => {}),

  alliance: () => request<AllianceView>("/game/alliance"),
  allianceFleets: () => request<{
    role: string;
    memberFleets: { owner: string; ownerCoords: string; name: string; mission: string; status: string; target: string; ships: number; ticksLeft: number }[];
    attacks: { attacker: string; attackerCoords: string; target: string; status: string; ticksLeft: number }[];
  }>("/game/alliance/fleets"),
  allianceCreate: (name: string, tag: string) =>
    request<AllianceView>("/game/alliance/create", { method: "POST", body: JSON.stringify({ name, tag }) }),
  allianceRename: (name: string) =>
    request<AllianceView>("/game/alliance/rename", { method: "POST", body: JSON.stringify({ name }) }),
  allianceRequest: (tag: string) =>
    request<AllianceView>("/game/alliance/request", { method: "POST", body: JSON.stringify({ tag }) }),
  allianceRequestCancel: () =>
    request<AllianceView>("/game/alliance/request/cancel", { method: "POST" }),
  allianceRequestAccept: (planetId: string) =>
    request<AllianceView>("/game/alliance/request/accept", { method: "POST", body: JSON.stringify({ planetId }) }),
  allianceRequestReject: (planetId: string) =>
    request<AllianceView>("/game/alliance/request/reject", { method: "POST", body: JSON.stringify({ planetId }) }),
  allianceLeave: () => request<AllianceView>("/game/alliance/leave", { method: "POST" }),
  allianceKick: (planetId: string) =>
    request<AllianceView>("/game/alliance/kick", { method: "POST", body: JSON.stringify({ planetId }) }),
  allianceOrders: (text: string) =>
    request<AllianceView>("/game/alliance/orders", { method: "POST", body: JSON.stringify({ text }) }),
  attackBoard: () => request<AttackBoardView>("/game/alliance/attack"),
  attackLock: (locked: boolean) => request<AttackBoardView>("/game/alliance/attack/lock", { method: "POST", body: JSON.stringify({ locked }) }),
  attackAdd: (coord: string, note: string) => request<AttackBoardView>("/game/alliance/attack/add", { method: "POST", body: JSON.stringify({ coord, note }) }),
  attackRemove: (targetId: string) => request<AttackBoardView>("/game/alliance/attack/remove", { method: "POST", body: JSON.stringify({ targetId }) }),
  attackClaim: (targetId: string) => request<AttackBoardView>("/game/alliance/attack/claim", { method: "POST", body: JSON.stringify({ targetId }) }),
  attackUnclaim: (targetId: string) => request<AttackBoardView>("/game/alliance/attack/unclaim", { method: "POST", body: JSON.stringify({ targetId }) }),
  attackShare: (targetId: string, shared: boolean) => request<AttackBoardView>("/game/alliance/attack/share", { method: "POST", body: JSON.stringify({ targetId, shared }) }),
  allianceIntel: () => request<{ intel: AllianceIntelItem[] }>("/game/alliance/intel"),
  allianceIntelShare: (hash: string) => request<{ intel: AllianceIntelItem[] }>("/game/alliance/intel/share", { method: "POST", body: JSON.stringify({ hash }) }),
  allianceIntelUnshare: (id: string) => request<{ intel: AllianceIntelItem[] }>("/game/alliance/intel/unshare", { method: "POST", body: JSON.stringify({ id }) }),
  allianceRole: (planetId: string, role: string) =>
    request<AllianceView>("/game/alliance/role", { method: "POST", body: JSON.stringify({ planetId, role }) }),

  fleets: () =>
    request<{
      fleets: {
        id: string;
        name: string;
        mission: string;
        status: "idle" | "outbound" | "engaged" | "returning";
        idle: boolean;
        origin: string;
        target: string;
        units: Record<string, number>;
        totalShips: number;
        ticksRemaining: number;
        captured: Record<Resource, number>;
        canRecall: boolean;
        travel: { galaxia: number; setor: number; universo: number; fuel: number };
      }[];
    }>("/game/fleets"),

  createFleet: () =>
    request<PlanetView>("/game/fleets/create", { method: "POST" }),
  loadFleet: (id: string, units: Record<string, number>) =>
    request<PlanetView>(`/game/fleets/${id}/load`, { method: "POST", body: JSON.stringify({ units }) }),
  // Transfere naves direto entre frotas (ou base <-> frota). from/to = id da frota ou "base".
  transferFleet: (from: string, to: string, units: Record<string, number>) =>
    request<PlanetView>("/game/fleets/transfer", { method: "POST", body: JSON.stringify({ from, to, units }) }),
  renameFleet: (id: string, name: string) =>
    request<{ ok: true }>(`/game/fleets/${id}/rename`, { method: "POST", body: JSON.stringify({ name }) }),
  dispatchFleet: (id: string, body: { galaxy: number; system: number; slot: number; mission: "attack" | "transport"; ticks?: number; fake?: boolean }) =>
    request<{ ok: true }>(`/game/fleets/${id}/dispatch`, { method: "POST", body: JSON.stringify(body) }),

  recallFleet: (id: string) =>
    request<{ ok: true }>(`/game/fleets/${id}/recall`, { method: "POST" }),

  autoExile: () =>
    request<PlanetView>("/game/auto-exile", { method: "POST" }),
  changePassword: (current: string, next: string) =>
    request<{ ok: true }>("/game/change-password", { method: "POST", body: JSON.stringify({ current, next }) }),
  account: () =>
    request<{ email: string; username: string; whatsapp: string | null; pixKey: string | null; avatar: string | null }>("/game/account"),
  updateProfile: (body: { whatsapp?: string; pixKey?: string; avatar?: string }) =>
    request<{ email: string; username: string; whatsapp: string | null; pixKey: string | null; avatar: string | null }>("/game/account/profile", { method: "POST", body: JSON.stringify(body) }),
  changeEmail: (password: string, email: string) =>
    request<{ ok: true; email: string }>("/game/account/email", { method: "POST", body: JSON.stringify({ password, email }) }),
  changeRace: (race: string) =>
    request<PlanetView>("/game/account/race", { method: "POST", body: JSON.stringify({ race }) }),
  cancelOrder: (id: string) =>
    request<PlanetView>(`/game/queue/${id}/cancel`, { method: "POST" }),
  marketTrade: (from: Resource, to: Resource, amount: number) =>
    request<PlanetView>("/game/market/trade", { method: "POST", body: JSON.stringify({ from, to, amount }) }),
  marketFundTrade: (from: Resource, to: Resource, amount: number) =>
    request<PlanetView>("/game/market/fund-trade", { method: "POST", body: JSON.stringify({ from, to, amount }) }),

  traffic: () =>
    request<{
      galaxy: number;
      incomingAttacks: number;
      incomingToMe: number;
      fleets: {
        origin: string; owner: string; fleetName: string; target: string; targetName: string | null;
        mission: string; status: string; ships: number; ticks: number; toMe: boolean; own: boolean;
      }[];
      movements: {
        planet: string; owner: string; coords: string;
        fleets: { name: string; mission: string; status: string; target: string; ships: number; ticks: number; captured: Record<Resource, number> }[];
      }[];
    }>("/game/traffic"),

  combats: () =>
    request<{
      combats: {
        id: string;
        tick: number;
        role: "attacker" | "defender" | "defense-sent" | "defense-received";
        opponent: string;
        opponentCoords: string;
        myLost: number;
        oppLost: number;
        captured: Record<Resource, number>;
      }[];
    }>("/game/combats"),

  combat: (id: string) =>
    request<{
      id: string;
      tick: number;
      attackerName: string;
      defenderName: string;
      attackerCoords: string;
      defenderCoords: string;
      iAmAttacker: boolean;
      detail: {
        defense?: boolean; // registro de defesa (frota guarneceu, sem combate)
        allyDefense?: boolean; // aliado que defendeu um planeta COM combate
        defendedName?: string; defendedCoords?: string; // planeta que o aliado defendeu
        attackerRace?: string;
        defenderRace?: string;
        ticks: number;
        captured?: Record<Resource, number>;
        raid?: { capacity: number; ratePct: number; targetRoids?: number; captured: number; rows: { name: string; active: number; cargo: number; capacity: number }[] };
        attacker: { name: string; before: number; lost: number; pem: number; assim: number; survivors: number }[];
        defender: { name: string; before: number; lost: number; pem: number; assim: number; survivors: number }[];
        attackers?: { name: string; coords?: string; ships: number }[];
        defenders?: { name: string; coords?: string; ships: number; you?: boolean }[];
        aUnused?: { name: string; count: number }[];
        dUnused?: { name: string; count: number }[];
        log?: { side: "a" | "d"; ini: number; ship: string; count: number; target: string; shots: number; action: "pem" | "destroy" | "assim"; amount: number; chance: number; assimCost?: number }[];
      };
    }>(`/game/combats/${id}`),

  gov: () => request<GovView>("/game/galaxy/gov"),
  govVote: (candidatePlanetId: string) =>
    request<GovView>("/game/galaxy/vote", { method: "POST", body: JSON.stringify({ candidatePlanetId }) }),
  govAppoint: (role: "me" | "mg" | "md", planetId: string) =>
    request<GovView>("/game/galaxy/appoint", { method: "POST", body: JSON.stringify({ role, planetId }) }),
  treatyAction: (action: "propose" | "accept" | "cancel", otherGalaxy: number) =>
    request<GovView>(`/game/galaxy/treaty/${action}`, { method: "POST", body: JSON.stringify({ otherGalaxy }) }),
  govTax: (rate: number) =>
    request<GovView>("/game/galaxy/tax", { method: "POST", body: JSON.stringify({ rate }) }),
  govMarketFee: (rate: number) =>
    request<GovView>("/game/galaxy/market-fee", { method: "POST", body: JSON.stringify({ rate }) }),
  govMarketLock: (locked: boolean) =>
    request<GovView>("/game/galaxy/market-lock", { method: "POST", body: JSON.stringify({ locked }) }),
  govDonate: (toPlanetId: string, metalium: number, carbonum: number, plutonium: number) =>
    request<GovView>("/game/galaxy/donate", { method: "POST", body: JSON.stringify({ toPlanetId, metalium, carbonum, plutonium }) }),
  govContribute: (metalium: number, carbonum: number, plutonium: number) =>
    request<GovView>("/game/galaxy/contribute", { method: "POST", body: JSON.stringify({ metalium, carbonum, plutonium }) }),
  mgFleets: () =>
    request<{ planets: MgPlanet[] }>("/game/galaxy/mg-fleets"),

  ranking: () =>
    request<{
      ranking: { username: string; planet: string; coords: string; roids: number; score: number; you?: boolean; inRange?: boolean; sameGalaxy?: boolean; ally?: boolean }[];
    }>("/game/ranking"),
  allianceRanking: () =>
    request<{ ranking: { id: string; name: string; tag: string; score: number; members: number; avg: number }[] }>("/game/ranking/alliances"),
  raceDistribution: () =>
    request<{ total: number; dist: { key: string; name: string; count: number; pct: number }[] }>("/game/ranking/races"),
  trafficAt: (galaxy: number, system: number) =>
    request<{ fleets: { origin: string; target: string; mission: string; status: string; ships: number; ticks: number; own: boolean }[] }>(`/game/traffic-at/${galaxy}/${system}`),
  universe: () =>
    request<{
      setores: number; paralelos: number; myCoord: string;
      galaxies: { setor: number; paralelo: number; coord: string; name: string | null; planets: number; hasAlly: boolean; isMine: boolean; distanceTicks: number }[];
    }>("/game/universe"),

  toolUnits: () =>
    request<{ units: {
      name: string; race: string; classe: string; roider: boolean; tipo: string; img: string; alvos: string[];
      ini: number; agi: number; varm: number; qarm: number; pfog: number; fusel: number; rp: number;
      m: number; c: number; p: number; ticks: number; comb: number; tec: number;
    }[] }>("/game/tools/units"),
  galaxyRanking: () =>
    request<{ ranking: { galaxy: number; coord: string; name: string | null; score: number; planets: number; morale: number | null }[] }>("/game/tools/galaxy-ranking"),
  toolTechtree: () =>
    request<{ techs: { key: string; name: string; category: string; kind: string; desc: string; max: number; cost: number; ticks: number; requires: { name: string; level: number }[] }[] }>("/game/tools/techtree"),
  combatSim: (attacker: Record<string, number>, defender: Record<string, number>, ticks = 3) =>
    request<{
      ticks: { tick: number; aBefore: number; dBefore: number; aAfter: number; dAfter: number; raidCapacity: number; ratePct: number;
        aScoreBefore: number; dScoreBefore: number; aScoreAfter: number; dScoreAfter: number;
        aScoreLost: number; dScoreLost: number; aPemShips: number; dPemShips: number;
        attacker: { name: string; before: number; lost: number; pem: number; assim: number; survivors: number }[];
        defender: { name: string; before: number; lost: number; pem: number; assim: number; survivors: number }[];
      }[];
      winner: "atacante" | "defesa" | "ambos_destruidos" | "indefinido";
      finalAttacker: Record<string, number>; finalDefender: Record<string, number>;
      aScoreStart: number; dScoreStart: number; aScoreEnd: number; dScoreEnd: number;
      aScoreLostTotal: number; dScoreLostTotal: number;
      aUnused: { name: string; count: number }[]; dUnused: { name: string; count: number }[];
      aUnusedTotal: number; dUnusedTotal: number;
    }>("/game/tools/combat-sim", { method: "POST", body: JSON.stringify({ attacker, defender, ticks }) }),
  roidcapCalc: (atkScore: number, defScore: number, roids?: number) =>
    request<{ ratePct: number; saque: number | null; roids: number | null }>("/game/tools/roidcap", { method: "POST", body: JSON.stringify({ atkScore, defScore, roids }) }),
  toolSabotages: () =>
    request<{ sabotages: { key: string; name: string; plut: number; ticks: number }[] }>("/game/tools/sabotage"),
  sabotageSim: (body: { key: string; attackerAE: number; targetRoids: number; targetRace: string; targetCE: number }) =>
    request<{ key: string; name: string; plut: number; ticks: number; success: number }>("/game/tools/sabotage-sim", { method: "POST", body: JSON.stringify(body) }),
  toolPlanets: () =>
    request<{ planets: { name: string; commander: string; coords: string; galaxy: number; roids: number; score: number; protected: boolean }[]; totalUsers: number }>("/game/tools/planets"),
  spyReports: () =>
    request<{ reports: { id: string; hash: string; targetName: string; targetCoords: string; agent: string; tick: number; intel: any }[] }>("/game/spy-reports"),

  associado: () =>
    request<AssociadoView>("/game/associado"),
  associadoJoin: () =>
    request<AssociadoView>("/game/associado/join", { method: "POST" }),
  associadoRename: (name: string) =>
    request<AssociadoView>("/game/associado/rename", { method: "POST", body: JSON.stringify({ name }) }),
  associadoSkin: (skin: string) =>
    request<AssociadoView>("/game/associado/skin", { method: "POST", body: JSON.stringify({ skin }) }),

  privateView: () =>
    request<PrivateView>("/game/private"),
  privateCreate: (name: string) =>
    request<PrivateView>("/game/private/create", { method: "POST", body: JSON.stringify({ name }) }),
  privateInvite: (username: string) =>
    request<PrivateView>("/game/private/invite", { method: "POST", body: JSON.stringify({ username }) }),
  privateJoin: (galaxy: number) =>
    request<PrivateView>("/game/private/join", { method: "POST", body: JSON.stringify({ galaxy }) }),
  privateDecline: (galaxy: number) =>
    request<PrivateView>("/game/private/decline", { method: "POST", body: JSON.stringify({ galaxy }) }),

  // ===== Anúncios =====
  ads: (placement?: AdPlacement) => request<{ ads: Ad[] }>(`/ads${placement ? `?placement=${placement}` : ""}`),
  adClick: (id: string) => request<{ ok: boolean }>(`/ads/${id}/click`, { method: "POST" }).catch(() => {}),
  // Admin
  adminAds: () => request<{ ads: AdminAd[] }>("/ads/admin/all"),
  adminAdCreate: (body: AdInput) => request<{ ad: AdminAd }>("/ads/admin", { method: "POST", body: JSON.stringify(body) }),
  adminAdUpdate: (id: string, body: Partial<AdInput>) => request<{ ad: AdminAd }>(`/ads/admin/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  adminAdDelete: (id: string) => request<{ ok: boolean }>(`/ads/admin/${id}`, { method: "DELETE" }),
};

export interface MgFleet { name: string; mission: string; status: string; target: string; units: Record<string, number>; total: number }
export interface MgPlanet { planet: string; commander: string; coords: string; base: Record<string, number>; baseTotal: number; fleets: MgFleet[] }

export type AdPlacement = "landing" | "cadastro" | "game" | "round" | "todas";
export interface Ad { id: string; title: string; imageUrl: string; linkUrl: string; caption: string | null }
export interface AdminAd extends Ad { placement: AdPlacement; active: boolean; sortOrder: number; clicks: number; createdAt: string }
export interface AdInput { title: string; imageUrl: string; linkUrl: string; caption?: string | null; placement?: AdPlacement; active?: boolean; sortOrder?: number }

export interface PrivateView {
  owned: { galaxy: number; name: string | null; members: { name: string; commander: string; coords: string }[] } | null;
  invites: { galaxy: number; name: string }[];
}

export interface AssociadoView {
  associado: boolean;
  username: string;
  nameChanges: number;
  nameChangesLeft: number;
  maxNameChanges: number;
  skins?: { key: string; name: string }[];
  skin?: string;
}
