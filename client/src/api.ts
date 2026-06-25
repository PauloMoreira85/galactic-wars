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
  count: number;
  unlocked: boolean;
}

export interface QueueItem {
  id: string;
  kind: "ship" | "tech";
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

export interface PlanetView {
  commander: string;
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
    nextRoidCost: Record<Resource, number>;
    prodMul: number;
    travelMul: number;
    score: number;
    rank: number;
    cargo: string | null;
    fleetSlots: number;
    fleetsActive: number;
    nextFleetSlotCost: Record<Resource, number> | null;
    autoExiles: number;
  };
  onlineCount: number;
  tech: TechItem[];
  effects: { prodMul: number; travelMul: number; espionage: number };
  units: UnitItem[];
  queue: QueueItem[];
  game: {
    tickNumber: number;
    lastTickAt: string | null;
    tickIntervalSeconds: number;
    roundTicks: number;
    roundEnded: boolean;
  };
}

export interface GovMember { id: string; name: string; commander: string; coords: string; votes: number }
export interface GovView {
  galaxy: number;
  galaxyName: string | null; flag: string | null;
  cg: string | null; cgId: string | null;
  me: string | null; meId: string | null;
  mg: string | null; mgId: string | null;
  md: string | null; mdId: string | null;
  taxRate: number;
  fund: Record<Resource, number>;
  treaties: { other: number; status: string; proposedByMe: boolean }[];
  iAmCG: boolean; iAmME: boolean; iAmMG: boolean; iAmMD: boolean;
  myVote: string | null;
  members: GovMember[];
}

export interface AllianceMemberView { planetId: string; role: string; name: string; commander: string; coords: string }
export interface AllianceView {
  inAlliance: boolean;
  invites?: { allianceId: string; name: string; tag: string }[];
  id?: string; name?: string; tag?: string;
  myRole?: string; canInvite?: boolean; isLeader?: boolean;
  members?: AllianceMemberView[];
  pending?: { planetId: string; name: string; commander: string }[];
}
export const ROLE_LABEL: Record<string, string> = {
  lider: "Líder", alto_comando: "Alto Comando", dc: "DC", scanner: "Scanner", porta_voz: "Porta-Voz", recruta: "Recruta",
};
export const ALLIANCE_ROLES = ["lider", "alto_comando", "dc", "scanner", "porta_voz", "recruta"];

export const api = {
  races: () => request<{ races: RaceInfo[] }>("/auth/races"),

  register: (body: {
    email: string;
    username: string;
    password: string;
    planetName?: string;
    preposition?: string;
    race: string;
  }) => request<{ token: string; username: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  }),

  login: (body: { login: string; password: string }) =>
    request<{ token: string; username: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: () => request<PlanetView>("/game/me"),

  buildRoid: (resource: Resource) =>
    request<PlanetView>("/game/roids/build", {
      method: "POST",
      body: JSON.stringify({ resource }),
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
  spyLookup: (hash: string) =>
    request<{ hash: string; targetName: string; targetCoords: string; agent: string; tick: number; intel: any }>(`/game/spy/lookup/${encodeURIComponent(hash)}`),

  sabotage: () => request<{ all: { key: string; name: string; building: string; desc: string }[]; available: string[] }>("/game/sabotage"),
  sabotageRun: (galaxy: number, system: number, slot: number, key: string) =>
    request<{ success?: boolean; message?: string }>("/game/sabotage", { method: "POST", body: JSON.stringify({ galaxy, system, slot, key }) }),

  govName: (name: string) =>
    request<GovView>("/game/galaxy/name", { method: "POST", body: JSON.stringify({ name }) }),

  govFlag: (image: string) =>
    request<GovView>("/game/galaxy/flag", { method: "POST", body: JSON.stringify({ image }) }),

  news: () => request<{ news: { tick: number; message: string }[] }>("/game/news"),

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

  chat: (room: string) => request<{ label: string; messages: { id: string; author: string; body: string; at: string }[] }>(`/game/chat/${room}`),
  chatSend: (room: string, body: string) => request<{ label: string; messages: { id: string; author: string; body: string; at: string }[] }>(`/game/chat/${room}`, { method: "POST", body: JSON.stringify({ body }) }),

  alliance: () => request<AllianceView>("/game/alliance"),
  allianceCreate: (name: string, tag: string) =>
    request<AllianceView>("/game/alliance/create", { method: "POST", body: JSON.stringify({ name, tag }) }),
  allianceInvite: (username: string) =>
    request<AllianceView>("/game/alliance/invite", { method: "POST", body: JSON.stringify({ username }) }),
  allianceAccept: (allianceId: string) =>
    request<AllianceView>("/game/alliance/accept", { method: "POST", body: JSON.stringify({ allianceId }) }),
  allianceLeave: () => request<AllianceView>("/game/alliance/leave", { method: "POST" }),
  allianceKick: (planetId: string) =>
    request<AllianceView>("/game/alliance/kick", { method: "POST", body: JSON.stringify({ planetId }) }),
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
  renameFleet: (id: string, name: string) =>
    request<{ ok: true }>(`/game/fleets/${id}/rename`, { method: "POST", body: JSON.stringify({ name }) }),
  dispatchFleet: (id: string, body: { galaxy: number; system: number; slot: number; mission: "attack" | "transport"; ticks?: number }) =>
    request<{ ok: true }>(`/game/fleets/${id}/dispatch`, { method: "POST", body: JSON.stringify(body) }),

  recallFleet: (id: string) =>
    request<{ ok: true }>(`/game/fleets/${id}/recall`, { method: "POST" }),

  autoExile: () =>
    request<PlanetView>("/game/auto-exile", { method: "POST" }),
  changePassword: (current: string, next: string) =>
    request<{ ok: true }>("/game/change-password", { method: "POST", body: JSON.stringify({ current, next }) }),
  marketTrade: (from: Resource, to: Resource, amount: number) =>
    request<PlanetView>("/game/market/trade", { method: "POST", body: JSON.stringify({ from, to, amount }) }),

  traffic: () =>
    request<{
      galaxy: number;
      incomingAttacks: number;
      incomingToMe: number;
      fleets: {
        origin: string; owner: string; target: string; targetName: string | null;
        mission: string; status: string; ships: number; ticks: number; toMe: boolean;
      }[];
    }>("/game/traffic"),

  combats: () =>
    request<{
      combats: {
        id: string;
        tick: number;
        role: "attacker" | "defender";
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
        attackerRace: string;
        defenderRace: string;
        ticks: number;
        captured: Record<Resource, number>;
        attacker: { name: string; before: number; lost: number; pem: number; survivors: number }[];
        defender: { name: string; before: number; lost: number; pem: number; survivors: number }[];
        log?: { side: "a" | "d"; ini: number; ship: string; count: number; target: string; shots: number; action: "pem" | "destroy" | "assim"; amount: number; chance: number }[];
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
  govDonate: (toPlanetId: string, metalium: number, carbonum: number, plutonium: number) =>
    request<GovView>("/game/galaxy/donate", { method: "POST", body: JSON.stringify({ toPlanetId, metalium, carbonum, plutonium }) }),
  mgFleets: () =>
    request<{ fleets: { owner: string; mission: string; status: string; target: string }[] }>("/game/galaxy/mg-fleets"),

  ranking: () =>
    request<{
      ranking: { username: string; planet: string; coords: string; roids: number }[];
    }>("/game/ranking"),

  toolUnits: () =>
    request<{ units: {
      name: string; race: string; classe: string; roider: boolean; tipo: string; img: string; alvos: string[];
      ini: number; agi: number; varm: number; qarm: number; pfog: number; fusel: number; rp: number;
      m: number; c: number; p: number; ticks: number; comb: number; tec: number;
    }[] }>("/game/tools/units"),
  galaxyRanking: () =>
    request<{ ranking: { galaxy: number; name: string | null; score: number; planets: number; morale: number | null }[] }>("/game/tools/galaxy-ranking"),
  toolTechtree: () =>
    request<{ techs: { key: string; name: string; category: string; kind: string; desc: string; max: number; requires: { name: string; level: number }[] }[] }>("/game/tools/techtree"),
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

  privateView: () =>
    request<PrivateView>("/game/private"),
  privateCreate: (name: string) =>
    request<PrivateView>("/game/private/create", { method: "POST", body: JSON.stringify({ name }) }),
  privateInvite: (username: string) =>
    request<PrivateView>("/game/private/invite", { method: "POST", body: JSON.stringify({ username }) }),
  privateJoin: (galaxy: number) =>
    request<PrivateView>("/game/private/join", { method: "POST", body: JSON.stringify({ galaxy }) }),
};

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
}
