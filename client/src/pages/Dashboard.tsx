import { useEffect, useState } from "react";
import { api, clearToken, IS_RUR, MAIN_URL, RUR_URL, REFRESH_MS, type PlanetView, type Resource, type TechItem } from "../api";
import { CoordNavContext, CoordLink } from "../components/CoordLink";
import { Galaxy } from "./Galaxy";
import { Trafego } from "./Trafego";
import { Frotas } from "./Frotas";
import { Combats } from "./Combats";
import { Governo } from "./Governo";
import { Noticias } from "./Noticias";
import { Aliancas } from "./Aliancas";
import { Associados } from "./Associados";
import { Forum } from "./Forum";
import { Chat } from "./Chat";
import { Mensagens } from "./Mensagens";
import { Sabotagem } from "./Sabotagem";
import { Inteligencia } from "./Inteligencia";
import { Preferencias } from "./Preferencias";
import { RaceChoiceScreen } from "../components/RaceChoiceScreen";
import { AdBanner } from "../components/AdBanner";

const RES_META: { key: Resource; label: string }[] = [
  { key: "metalium", label: "Metalium" },
  { key: "carbonum", label: "Carbonum" },
  { key: "plutonium", label: "Plutonium" },
];

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

// Imagem de arte com fallback: tenta .png, depois .jpg/.jpeg/.webp; se nenhuma
// existir mostra um placeholder. (Recomendado PNG transparente; JPG tem fundo.)
// Se passar onZoom, clicar amplia a imagem no lightbox.
function ArtImg({ src, alt, className, placeholder, onZoom }: { src: string; alt: string; className?: string; placeholder: string; onZoom?: (src: string, alt: string) => void }) {
  const base = src.replace(/\.png$/i, "");
  const exts = [".png", ".jpg", ".jpeg", ".webp"];
  const [i, setI] = useState(0);
  if (i >= exts.length) return <span className={`art-missing ${className ?? ""}`} title="sem arte ainda">{placeholder}</span>;
  const cur = base + exts[i];
  return (
    <img
      src={cur} alt={alt} className={`${className ?? ""} ${onZoom ? "zoomable" : ""}`} loading="lazy"
      title={onZoom ? "Clique para ampliar" : undefined}
      onError={() => setI(i + 1)}
      onClick={onZoom ? () => onZoom(cur, alt) : undefined}
    />
  );
}

const CAT_LABELS: Record<string, string> = {
  mineracao: "Mineração", tec: "Deslocamento", espionagem: "Inteligência", sabotagem: "Sabotagem", naves: "Naves",
};
const CAT_ORDER = ["mineracao", "tec", "espionagem", "sabotagem", "naves"];

// Ícone + rótulo do item na fila: distingue Pesquisa / Construção / Nave.
function queueTag(q: { kind: string; techKind: string | null }) {
  if (q.kind === "ship") return { icon: "🚀", tag: "Nave", color: "var(--accent)" };
  if (q.techKind === "research") return { icon: "🔬", tag: "Pesquisa", color: "#37e07a" };
  return { icon: "🛠️", tag: "Construção", color: "var(--carbonum)" };
}

function useCountdown(view: PlanetView | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!view?.game.lastTickAt) return null;
  const last = new Date(view.game.lastTickAt).getTime();
  const next = last + view.game.tickIntervalSeconds * 1000;
  const remaining = Math.max(0, Math.floor((next - now) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function fmtDur(secs: number) {
  if (secs <= 0) return "0s";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

// Status do round no ciclo diário: começando, rodando (termina em…) ou
// encerrado (próximo round em…). Recalcula a cada segundo.
function useRoundStatus(view: PlanetView | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!view?.game.roundStartAt) return null;
  const start = new Date(view.game.roundStartAt).getTime();
  const end = start + view.game.roundTicks * view.game.tickIntervalSeconds * 1000;
  if (now < start) return { label: "Começa em", time: fmtDur(Math.floor((start - now) / 1000)) };
  if (now < end) return { label: "Termina em", time: fmtDur(Math.floor((end - now) / 1000)) };
  // Round encerrado: conta pro próximo início agendado (o servidor calcula —
  // respeita 1 ou vários rounds por dia).
  const next = view.game.nextRoundStartAt ? new Date(view.game.nextRoundStartAt).getTime() : start + 24 * 3600 * 1000;
  return { label: "Próximo round", time: fmtDur(Math.floor((next - now) / 1000)) };
}

type Section = "planeta" | "galaxia" | "frotas" | "trafego" | "tecnologia" | "naves" | "recursos" | "combates" | "votacao" | "noticias" | "aliancas" | "associados" | "preferencias" | "forum" | "forumgalaxia" | "chat" | "mensagens" | "sabotagem" | "intel";

interface MenuItem {
  key: string;
  label: string;
  soon?: boolean;
}
// Estrutura espelhada do menu original (versão "mais atual"): grupos separados
// por linhas, só texto. Itens ainda não implementados ficam marcados "soon".
const MENU: MenuItem[][] = [
  [
    { key: "planeta", label: "Página Principal" },
    { key: "galaxia", label: "Galáxia" },
    { key: "combates", label: "Combates" },
    { key: "trafego", label: "Tráfego" },
    { key: "frotas", label: "Frotas" },
  ],
  [
    { key: "tecnologia", label: "Tecnologia" },
  ],
  [
    { key: "intel", label: "Inteligência" },
    { key: "sabotagem", label: "Sabotagem" },
    { key: "naves", label: "Naves" },
  ],
  [
    { key: "forumgalaxia", label: "Fórum da Galáxia" },
    { key: "mensagens", label: "Mensagem Privada" },
    { key: "forum", label: "Fórum do Universo" },
    { key: "chat", label: "Chat do Universo" },
  ],
  [
    { key: "noticias", label: "Notícias" },
    { key: "anotacoes", label: "Anotações", soon: true },
    { key: "enquetes", label: "Enquetes", soon: true },
    { key: "amigos", label: "Lista de Amigos", soon: true },
    { key: "indique", label: "Indique a um amigo", soon: true },
  ],
  [
    { key: "recursos", label: "Recursos" },
    { key: "votacao", label: "Votação / Governo da Galáxia" },
  ],
  [
    { key: "aliancas", label: "Alianças" },
    { key: "associados", label: "Associados" },
    { key: "preferencias", label: "Preferências" },
  ],
  [
    { key: "ferramentas", label: "Ferramentas" },
    { key: "equipe", label: "Equipe Galactic War", soon: true },
  ],
];

const TITLES: Record<Section, string> = {
  planeta: "Página Principal",
  galaxia: "Galáxia",
  frotas: "Frotas",
  trafego: "Tráfego",
  tecnologia: "Tecnologia",
  naves: "Naves",
  recursos: "Recursos",
  combates: "Combates",
  votacao: "Votação / Governo",
  noticias: "Notícias",
  aliancas: "Alianças",
  associados: "Associados",
  preferencias: "Preferências",
  forum: "Fórum do Universo",
  forumgalaxia: "Fórum da Galáxia",
  chat: "Chat do Universo",
  mensagens: "Mensagem Privada",
  sabotagem: "Sabotagem",
  intel: "Inteligência",
};

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<PlanetView | null>(null);
  const [ranking, setRanking] = useState<Awaited<ReturnType<typeof api.ranking>>["ranking"]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Resource | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [shipBusy, setShipBusy] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("planeta");
  const [menuOpen, setMenuOpen] = useState(false); // menu retrátil no celular
  const [showIntro, setShowIntro] = useState(() => localStorage.getItem("gw_intro_hidden") !== "1");
  const [mktFrom, setMktFrom] = useState<Resource>("metalium");
  const [mktTo, setMktTo] = useState<Resource>("carbonum");
  const [mktAmt, setMktAmt] = useState(0);
  const [mktErr, setMktErr] = useState("");
  const [mktBusy, setMktBusy] = useState(false);
  // Troca com o fundo da galáxia (painel separado do Mercado Negro).
  const [fgFrom, setFgFrom] = useState<Resource>("metalium");
  const [fgTo, setFgTo] = useState<Resource>("carbonum");
  const [fgAmt, setFgAmt] = useState(0);
  const [fgErr, setFgErr] = useState("");
  const [fgBusy, setFgBusy] = useState(false);
  // Doação do ME direto da aba Recursos (destino por coordenada).
  const [meGov, setMeGov] = useState<Awaited<ReturnType<typeof api.gov>> | null>(null);
  const [donTo, setDonTo] = useState("");
  const [donAmt, setDonAmt] = useState({ metalium: 0, carbonum: 0, plutonium: 0 });
  const [donErr, setDonErr] = useState("");
  // Contribuir PRA o fundo (qualquer planeta).
  const [contrib, setContrib] = useState({ metalium: 0, carbonum: 0, plutonium: 0 });
  const [contribErr, setContribErr] = useState("");
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [alerts, setAlerts] = useState({ underAttack: false, incomingDefense: false, galaxyUnderAttack: false });
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [newsUnread, setNewsUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const countdown = useCountdown(view);
  const roundStatus = useRoundStatus(view);
  const [pmTo, setPmTo] = useState(""); // coordenada pré-preenchida ao mandar msg pela Galáxia
  const [galaxyGoto, setGalaxyGoto] = useState(""); // coord p/ abrir direto ao clicar no ranking

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  async function refresh() {
    try {
      const [v, r] = await Promise.all([api.me(), api.ranking()]);
      setView(v);
      setRanking(r.ranking);
      setNewsUnread(v.newsUnread ?? 0);
      try {
        const t = await api.traffic();
        setAlerts({
          underAttack: t.fleets.some((f) => f.toMe && !f.own && f.mission === "attack"),
          incomingDefense: t.fleets.some((f) => f.toMe && !f.own && f.mission === "transport"),
          galaxyUnderAttack: t.incomingAttacks > 0,
        });
      } catch {}
      try { setUnreadMsgs((await api.pmUnread()).unread); } catch {}
      try { setChatUnread((await api.chatUnread()).unread); } catch {}
    } catch (e: any) {
      // Token inválido/expirado OU conta apagada (ex: depois de um reset de round):
      // o token continua "válido" mas o /me responde "Planeta/Usuário não encontrado".
      // Em qualquer desses casos, desloga (limpa o token) em vez de travar no loading.
      const msg = String(e?.message ?? "");
      if (/autenticado|token|encontrad/i.test(msg)) {
        onLogout();
      }
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // Ao abrir as Notícias, marca como lidas e apaga o aviso amarelo.
  useEffect(() => {
    if (section === "noticias") { setNewsUnread(0); api.newsSeen(); }
    if (section === "chat") { setChatUnread(0); api.chatSeen?.(); }
    // ME abrindo Recursos: carrega o governo (pra listar os planetas destino da doação).
    if (section === "recursos" && view?.galaxyFund.iAmME) { api.gov().then(setMeGov).catch(() => {}); }
    // Ao SAIR da Galáxia, limpa a coord guardada (do link do ranking/tráfego) pra que
    // abrir a aba de novo pelo menu comece sempre na galáxia do próprio jogador.
    if (section !== "galaxia" && galaxyGoto) setGalaxyGoto("");
  }, [section]);

  async function build(resource: Resource) {
    setError("");
    setBusy(resource);
    try {
      setView(await api.buildRoid(resource));
    } catch (e: any) {
      setError(e.message ?? "Falha");
    } finally {
      setBusy(null);
    }
  }

  async function doTradeMN() {
    setMktErr("");
    if (mktFrom === mktTo) { setMktErr("Escolha recursos diferentes."); return; }
    if (mktAmt <= 0) { setMktErr("Informe uma quantidade."); return; }
    setMktBusy(true);
    try { setView(await api.marketTrade(mktFrom, mktTo, mktAmt)); setMktAmt(0); }
    catch (e: any) { setMktErr(e.message ?? "Falha na troca"); }
    finally { setMktBusy(false); }
  }

  async function doTradeFundo() {
    setFgErr("");
    if (fgFrom === fgTo) { setFgErr("Escolha recursos diferentes."); return; }
    if (fgAmt <= 0) { setFgErr("Informe uma quantidade."); return; }
    setFgBusy(true);
    try { setView(await api.marketFundTrade(fgFrom, fgTo, fgAmt)); setFgAmt(0); }
    catch (e: any) { setFgErr(e.message ?? "Falha na troca"); }
    finally { setFgBusy(false); }
  }

  async function doCancel(id: string) {
    setError("");
    try { setView(await api.cancelOrder(id)); } catch (e: any) { setError(e.message ?? "Falha ao cancelar"); }
  }

  async function doUpgrade(key: string) {
    setError("");
    setShipBusy(key);
    try {
      setView(await api.upgrade(key));
    } catch (e: any) {
      setError(e.message ?? "Falha");
    } finally {
      setShipBusy(null);
    }
  }

  async function doBuildUnit(name: string) {
    setError("");
    setShipBusy(name);
    try {
      setView(await api.buildUnit(name, Math.max(1, qty[name] || 1)));
      setQty((q) => ({ ...q, [name]: 0 })); // zera o campo após mandar produzir
    } catch (e: any) {
      setError(e.message ?? "Falha");
    } finally {
      setShipBusy(null);
    }
  }

  function go(it: MenuItem) {
    if (it.soon) return;
    if (it.key === "ferramentas") { window.open("/ferramentas", "_blank", "noopener"); return; }
    if (it.key === "forum") { window.open("https://forum.galacticwar.com.br", "_blank", "noopener"); return; }
    setSection(it.key as Section);
    setMenuOpen(false); // fecha o menu retrátil ao escolher uma seção (celular)
  }

  if (!view) return <div className="app">Carregando o universo...</div>;

  // Início de round: tela obrigatória de escolha de raça (bloqueia o jogo).
  if (view.mustChooseRace) return <RaceChoiceScreen view={view} onChosen={refresh} onLogout={onLogout} />;

  const { planet, game } = view;
  // Todo roid é pago em METALIUM (canon original). planet.nextRoidCost[r] = custo
  // em metalium do próximo roid de r (escala com os roids daquele recurso).
  const roidCost = (r: Resource) => planet.nextRoidCost[r];
  const canAffordRoid = (r: Resource) => planet.resources.metalium >= roidCost(r);

  // Árvore de Tecnologia: Pesquisa + Construção JUNTAS, na ordem do canon, por
  // categoria (mesmo esquema da referência). Construção só libera depois da sua
  // pesquisa (reqsMet) — exceto a 1ª construção das trilhas que começam construindo.
  function renderTechTree() {
    const cats = CAT_ORDER.filter((c) => view!.tech.some((t) => t.category === c));
    return cats.map((cat) => (
      <div className="panel" key={cat}>
        <h2>{CAT_LABELS[cat]}</h2>
        {view!.tech.filter((t) => t.category === cat).map((t: TechItem) => {
          const isR = t.kind === "research";
          const inQueue = view!.queue.some((q) => q.kind === "tech" && q.key === t.key);
          const kindPending = view!.queue.some((q) => q.techKind === t.kind); // 1 pesquisa + 1 construção por vez
          const verb = isR ? "Pesquisar" : "Construir";
          const progress = isR ? "Pesquisando…" : "Construindo…";
          const badge: React.CSSProperties = {
            fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            color: isR ? "#7aa2ff" : "#ffb24d", background: isR ? "#7aa2ff1a" : "#ffb24d1a",
            border: `1px solid ${isR ? "#7aa2ff55" : "#ffb24d55"}`, whiteSpace: "nowrap",
          };
          return (
            <div className="roid-row" key={t.key}
              style={inQueue ? { background: "rgba(255,150,40,0.14)", borderLeft: "3px solid #ff9628", borderRadius: 6 } : undefined}>
              <div className="roid-label">
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={badge}>{isR ? "🔬 Pesquisa" : "🛠️ Construção"}</span>
                    <b style={inQueue ? { color: "#ff9628" } : undefined}>{t.name}</b>
                    {inQueue && <span className="roid-count" style={{ color: "#ff9628", fontWeight: 700 }}>● em andamento</span>}
                    {t.max > 1 && <span className="roid-count">nível {t.level}/{t.max}</span>}
                    {t.max === 1 && t.level >= 1 && <span style={{ color: "var(--carbonum)" }}>✓ feito</span>}
                  </div>
                  <div className="roid-count">{t.desc}</div>
                  {!t.reqsMet && t.requires.length > 0 && (
                    <div className="roid-count" style={{ color: "var(--danger)" }}>🔒 requer: {t.requires.map((r) => r.name).join(", ")}</div>
                  )}
                  {t.reqsMet && !t.maxed && !t.affordable && (
                    <div className="roid-count" style={{ color: "#e6a23c" }}>⚠️ liberado — faltam recursos</div>
                  )}
                  {t.cost && (
                    <div className="roid-count">{fmt(t.cost.metalium)} M · {fmt(t.cost.carbonum)} C · {t.ticks} ticks</div>
                  )}
                </div>
              </div>
              <div>
                {t.maxed ? <span className="roid-count">máx</span> : (
                  <button disabled={!t.canStart || shipBusy !== null || inQueue || kindPending}
                    title={kindPending && !inQueue ? `Já há ${isR ? "uma pesquisa" : "uma construção"} em andamento — cancele na fila pra trocar` : undefined}
                    onClick={() => doUpgrade(t.key)}>
                    {shipBusy === t.key ? "..." : inQueue ? progress : verb}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    ));
  }

  return (
    <CoordNavContext.Provider value={(c) => { setGalaxyGoto(c + "#" + Date.now()); setSection("galaxia"); }}>
    <div className="layout">
      {/* ===== Barra mobile: só aparece no celular — logo + ☰ + seção atual ===== */}
      <div className="mobile-bar">
        <img src="/art/logo/brasao.jpg" alt="GW" className="mobile-bar-logo" onClick={() => { setSection("planeta"); setMenuOpen(false); }} />
        <span className="mobile-bar-title">{TITLES[section]}</span>
        <button className="mobile-bar-menu" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>
      {/* Fundo escuro ao abrir o menu no celular (toca fora pra fechar) */}
      {menuOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />}

      {/* ===== Barra lateral ===== */}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/art/logo/brasao.jpg" alt="Galactic War" className="sidebar-logo" />
        </div>

        <nav className="menu">
          {MENU.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="menu-sep" />}
              {group.map((it) => (
                <button
                  key={it.key}
                  className={`menu-link ${section === it.key ? "active" : ""} ${it.soon ? "soon" : ""} ${it.key === "mensagens" && unreadMsgs > 0 ? "alert-msg" : ""} ${it.key === "noticias" && newsUnread > 0 ? "alert-news" : ""} ${it.key === "chat" && chatUnread > 0 ? "alert-msg" : ""}`}
                  disabled={it.soon}
                  title={it.soon ? "Em breve" : ""}
                  onClick={() => go(it)}
                >
                  {it.label}{it.key === "mensagens" && unreadMsgs > 0 ? ` ✉️ (${unreadMsgs})` : ""}{it.key === "noticias" && newsUnread > 0 ? ` 🔔 (${newsUnread})` : ""}{it.key === "chat" && chatUnread > 0 ? ` 💬 (${chatUnread})` : ""}
                </button>
              ))}
            </div>
          ))}
          <div className="menu-sep" />
          <a className="menu-link" href={IS_RUR ? MAIN_URL : RUR_URL} target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--accent)", fontWeight: 700, lineHeight: 1.25 }}>
            {IS_RUR ? "🌍 Jogo principal ↗" : "⚡ Jogar o RUR ↗"}
            <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.75 }}>
              {IS_RUR ? "modo clássico · nova janela" : "round ultra-rápido · nova janela"}
            </div>
          </a>
          {view.admin && (
            <a className="menu-link" href="/admin" target="_blank" rel="noopener noreferrer" style={{ color: "#ffb020", fontWeight: 700 }}>
              🛠️ Admin (anúncios) ↗
            </a>
          )}
          <div className="menu-sep" />
          <button className="menu-link logout" onClick={() => { clearToken(); onLogout(); }}>
            Logout
          </button>
        </nav>
      </aside>

      {/* ===== Conteúdo ===== */}
      <main className="content">
        {game.roundEnded && (
          <div className="panel round-ended">
            🏆 <b>Round encerrado!</b>{ranking[0] && <> Campeão: <b>{ranking[0].username}</b> — {ranking[0].planet} (<CoordLink c={ranking[0].coords} />)</>}. As ações estão congeladas.{roundStatus ? <> Próximo round em <b>{roundStatus.time}</b>.</> : " Aguarde o próximo round."}
          </div>
        )}

        {/* Cabeçalho de status no topo, como no print da época */}
        <div className="status-header">
          <div className="sh-commander">
            {view.commanderAvatar
              ? <img className="sh-avatar" src={view.commanderAvatar} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }} />
              : <span className="sh-planet-icon">🪐</span>}
            <div>
              <div className="sh-name">
                {view.commanderTitle}
                {planet.protection?.active && (
                  <span className="prot-badge" title={`Proteção de novato — ninguém pode te atacar (faltam ${planet.protection.ticksLeft} ticks)`}>P</span>
                )}
              </div>
              <div className="sh-cargo">{planet.cargo ?? "Comandante"}</div>
            </div>
          </div>
          <div className="sh-grid">
            <div className="sh-cell"><span>Planeta</span><b>{planet.name}</b></div>
            <div className="sh-cell"><span>Coordenadas</span><b>{planet.coords}</b></div>
            <div className="sh-cell"><span>Raça</span><b>{view.race.name}</b></div>
            <div className="sh-cell"><span>Roids</span><b>{fmt(planet.roids.total)}</b></div>
            <div className="sh-cell"><span>Pontuação</span><b>{fmt(planet.score)}</b></div>
            <div className="sh-cell"><span>Ranking</span><b>#{planet.rank}</b></div>
            <div className="sh-cell"><span>Tick</span><b>#{game.tickNumber} / {game.roundTicks}{countdown ? ` · ${countdown}` : ""}</b></div>
            {roundStatus && <div className="sh-cell"><span>{roundStatus.label}</span><b>{roundStatus.time}</b></div>}
            <div className="sh-cell"><span>Online</span><b>{view.onlineCount}</b></div>
            <div className="sh-cell"><span>Moral</span><b style={{ color: planet.morale >= 100 ? "#37e07a" : planet.morale >= 70 ? "var(--text)" : "#ff6b6b" }}>{planet.morale} <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 12 }}>({planet.moralePct}%)</span></b></div>
          </div>
        </div>

        {/* Ações rápidas (como os botões do topo do print) */}
        <div className="action-tabs">
          {([
            ["mensagens", "✉️ Mensagem"],
            ["forumgalaxia", "💬 Fórum"],
            ["noticias", "📰 Notícias"],
          ] as [Section, string][]).map(([key, label]) => (
            <button key={key} className={`action-tab ${section === key ? "active" : ""} ${key === "mensagens" && unreadMsgs > 0 ? "alert-msg" : ""} ${key === "noticias" && newsUnread > 0 ? "alert-news" : ""}`} onClick={() => setSection(key)}>
              {label}{key === "mensagens" && unreadMsgs > 0 ? ` (${unreadMsgs})` : ""}{key === "noticias" && newsUnread > 0 ? ` 🔔 (${newsUnread})` : ""}
            </button>
          ))}
          {/* Radar: acende quando ALGUÉM da sua galáxia está sob ataque */}
          <span
            className={`radar ${alerts.galaxyUnderAttack ? "radar-on" : ""}`}
            title={alerts.galaxyUnderAttack ? "Alerta: planeta(s) da galáxia sob ataque!" : "Radar da galáxia: tudo calmo"}
            onClick={() => setSection("trafego")}
          />
          {/* Defesa (verde se reforço chegando) e Ataque (vermelho se sob ataque).
              blur() remove o realce de foco do botão após clicar. */}
          <button
            className={`action-tab ${alerts.incomingDefense ? "alert-def" : ""}`}
            onClick={(e) => { e.currentTarget.blur(); setSection("trafego"); }}
          >
            🛡️ Defesa
          </button>
          <button
            className={`action-tab ${alerts.underAttack ? "alert-atk" : ""}`}
            onClick={(e) => { e.currentTarget.blur(); setSection("trafego"); }}
          >
            ⚔️ Ataque
          </button>
        </div>

        {/* Barra de recursos sempre visível (como nos prints) */}
        <div className="resource-bar">
          {RES_META.map(({ key, label }) => (
            <div className="resbar-item" key={key}>
              <span className={`dot ${key}`} />
              <span className="resbar-label">{label}</span>
              <span className="resbar-value">{fmt(planet.resources[key])}</span>
              <span className="resbar-prod">+{fmt(planet.productionPerTick[key])}/t</span>
            </div>
          ))}
        </div>

        <h1 className="section-title">{TITLES[section]}</h1>

        {section === "planeta" && (
          <>
            {showIntro ? (
              <div className="panel intro-guide">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <h2 style={{ margin: 0 }}>🚀 Primeiros passos, Comandante</h2>
                  <button className="link" onClick={() => { localStorage.setItem("gw_intro_hidden", "1"); setShowIntro(false); }}>ocultar</button>
                </div>
                <ol className="intro-steps">
                  <li><b>Minere roids</b> em <b>Recursos</b> (botão "⛏️ minerar …") — você paga pra abrir cada roid. Mais roids = mais recursos por tick.</li>
                  <li><b>Pesquise</b> (🔬) pra desbloquear e depois <b>construa</b> (🛠️). Em <b>Naves, Inteligência e Sabotagem</b> a cadeia é: pesquisa → construção → libera a próxima.</li>
                  <li>Construa <b>naves</b> (em Naves) e monte uma <b>frota</b> em <b>Frotas</b>, com as coordenadas do alvo.</li>
                  <li>Você pode <b>atacar ou defender</b> de 1 a 3 ticks: na <b>sua galáxia</b> só dá pra <b>defender</b> (aliados); em <b>outras galáxias</b> dá pra <b>atacar e defender</b>. Seus <b>roiders</b> ativos roubam os roids do alvo.</li>
                  <li><b>Inteligência</b>: treine agentes <b>P/M/T/D</b> pra espionar (gasta 1 por missão) e agentes de <b>Contra-Espionagem (CE)</b> pra se proteger — você fica blindado quando <b>CE ≥ seus roids ÷ 2</b>.</li>
                  <li><b>Sabotagem</b> prejudica o alvo (atrasa produção, rouba recurso/tecnologia…) — também é barrada pelo CE de quem você ataca.</li>
                  <li>Você tem <b>proteção de novato por 72 ticks</b> — ninguém te ataca. Cresça à vontade.</li>
                </ol>
                <div className="roid-count">💡 A raça dos inimigos é segredo — descubra com um <b>Agente Padrão</b> (Inteligência). Tudo detalhado na <b>Árvore Tecnológica</b> (Ferramentas).</div>
              </div>
            ) : (
              <button className="link" style={{ marginBottom: 12 }} onClick={() => setShowIntro(true)}>❔ Como jogar</button>
            )}
            <div className="panel race-banner">
              {view.race.img && (
                <ArtImg src={view.race.img} alt={view.race.name} className="race-portrait" placeholder="🛸" onZoom={(s, a) => setZoom({ src: s, alt: a })} />
              )}
              <div>
                <h2 style={{ marginBottom: 4 }}>Raça: {view.race.name}</h2>
                <div className="sub" style={{ marginBottom: 8 }}>{view.race.tagline}</div>
                <div className="race-lore">{view.race.lore}</div>
              </div>
            </div>

            <div className="panel">
              <h2>Recursos</h2>
              <div className="grid3">
                {RES_META.map(({ key, label }) => (
                  <div className="res-card" key={key}>
                    <div className="name"><span className={`dot ${key}`} />{label}</div>
                    <div className="amount">{fmt(planet.resources[key])}</div>
                    <div className="prod">+{fmt(planet.productionPerTick[key])} / tick</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>Ranking — comandantes do universo ({ranking.length})</h2>
              <table>
                <thead>
                  <tr><th className="rank-num">#</th><th>Comandante</th><th>Planeta</th><th>Coord.</th><th>Pontuação</th><th>Roids</th></tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={i}>
                      <td className="rank-num">{i + 1}</td>
                      <td>{r.username}</td>
                      <td>{r.planet}</td>
                      <td>
                        <button className="coord-link" title={`Ver a galáxia ${r.coords}`}
                          onClick={() => { setGalaxyGoto(r.coords + "#" + Date.now()); setSection("galaxia"); }}>
                          {r.coords}
                        </button>
                      </td>
                      <td><b>{(r.score ?? 0).toLocaleString("pt-BR")}</b></td>
                      <td>{r.roids}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {section === "recursos" && (
          <>
          <div className="panel">
            <h2>Asteroides (roids) — {planet.roids.total} no total</h2>
            <div className="cost">
              Inicie a mineração de um roid (pago em <b>Metalium</b>). O custo sobe <b>+1.000</b> a cada roid daquele recurso. Cada roid produz <b>250</b>/tick. Teto: <b>{fmt(30000000)}</b> por recurso (o que passar é perdido).
            </div>
            {RES_META.map(({ key, label }) => (
              <div className="roid-row" key={key}>
                <div className="roid-label">
                  <span className={`dot ${key}`} />
                  <div>
                    <div>{label}</div>
                    <div className="roid-count">{planet.roids[key]} roids · +{fmt(planet.productionPerTick[key])}/tick</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="roid-count">custo: {fmt(roidCost(key))} Metalium</div>
                  <button disabled={!canAffordRoid(key) || busy !== null} onClick={() => build(key)}>
                    {busy === key ? "..." : `⛏️ minerar ${label}`}
                  </button>
                </div>
              </div>
            ))}
            {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          </div>

          <div className="panel">
            <h2>🏦 Fundo da Galáxia</h2>
            <div className="cost" style={{ marginBottom: 10 }}>
              O <b>imposto</b> da galáxia ({view.galaxyFund.taxRate}% da produção) e as trocas abastecem este fundo — o <b>Ministro da Economia</b> doa recursos aos planetas e define a taxa do mercado.
            </div>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <div><span className="dot metalium" /> Metalium: <b>{fmt(view.galaxyFund.metalium)}</b></div>
              <div><span className="dot carbonum" /> Carbonum: <b>{fmt(view.galaxyFund.carbonum)}</b></div>
              <div><span className="dot plutonium" /> Plutonium: <b>{fmt(view.galaxyFund.plutonium)}</b></div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0 10px" }} />
            <div className="cost" style={{ marginBottom: 8 }}>
              Trocar <b>com o fundo</b>: o que você dá entra no fundo, o que recebe sai dele. Taxa <b>{view.galaxyFund.marketFee}%</b> (do ME) fica de lucro pro fundo. {view.galaxyFund.marketLocked && <b style={{ color: "#ff6b6b" }}>🔒 trancado pelo ME</b>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={fgFrom} onChange={(e) => { const v = e.target.value as Resource; setFgFrom(v); if (fgTo === v) setFgTo(RES_META.find((r) => r.key !== v)!.key); }}
                style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
                {RES_META.map((r) => <option key={r.key} value={r.key}>{r.label} (tem {fmt(planet.resources[r.key])})</option>)}
              </select>
              <span>→</span>
              <select value={fgTo} onChange={(e) => setFgTo(e.target.value as Resource)}
                style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
                {RES_META.filter((r) => r.key !== fgFrom).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              <input type="number" min={1} value={fgAmt || ""} placeholder="quantidade"
                onChange={(e) => setFgAmt(Math.max(0, Math.floor(Number(e.target.value))))}
                style={{ width: 140, margin: 0, padding: "6px 10px" }} />
              <button disabled={fgBusy || fgAmt <= 0 || fgFrom === fgTo || view.galaxyFund.marketLocked} onClick={doTradeFundo}>{fgBusy ? "..." : view.galaxyFund.marketLocked ? "🔒 trancado" : "🏦 trocar"}</button>
            </div>
            <div className="roid-count" style={{ marginTop: 8 }}>
              Você recebe: <b style={{ color: "var(--text)" }}>{fmt(Math.floor(fgAmt * (1 - view.galaxyFund.marketFee / 100)))}</b> de {RES_META.find((r) => r.key === fgTo)?.label} · fundo tem <b>{fmt(view.galaxyFund[fgTo])}</b>
            </div>
            {fgErr && <div className="error" style={{ marginTop: 10 }}>{fgErr}</div>}

            {/* Doar PRA o fundo — qualquer planeta da galáxia pode contribuir. */}
            <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0 10px" }} />
            <div className="cost" style={{ marginBottom: 8 }}>
              🤝 <b>Doar recursos PRA o fundo</b> (o ME distribui depois aos planetas):
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <input type="number" min={0} placeholder="M" value={contrib.metalium || ""} onChange={(e) => setContrib({ ...contrib, metalium: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 100, margin: 0, padding: "6px 8px" }} />
              <input type="number" min={0} placeholder="C" value={contrib.carbonum || ""} onChange={(e) => setContrib({ ...contrib, carbonum: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 100, margin: 0, padding: "6px 8px" }} />
              <input type="number" min={0} placeholder="P" value={contrib.plutonium || ""} onChange={(e) => setContrib({ ...contrib, plutonium: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 100, margin: 0, padding: "6px 8px" }} />
              <button disabled={contrib.metalium + contrib.carbonum + contrib.plutonium <= 0} onClick={async () => {
                setContribErr("");
                try { await api.govContribute(contrib.metalium, contrib.carbonum, contrib.plutonium); setContrib({ metalium: 0, carbonum: 0, plutonium: 0 }); await refresh(); }
                catch (e: any) { setContribErr(e.message ?? "Falha ao doar ao fundo"); }
              }}>🤝 doar ao fundo</button>
            </div>
            {contribErr && <div className="error" style={{ marginTop: 10 }}>{contribErr}</div>}
          </div>

          {/* Doação do fundo — só o ME vê (atalho aqui na aba Recursos). */}
          {view.galaxyFund.iAmME && (
            <div className="panel">
              <h2>💰 Doar do fundo (Ministro da Economia)</h2>
              <div className="cost" style={{ marginBottom: 6 }}>
                Fundo disponível: <b>{fmt(view.galaxyFund.metalium)}</b> M · <b>{fmt(view.galaxyFund.carbonum)}</b> C · <b>{fmt(view.galaxyFund.plutonium)}</b> P
                <div style={{ marginTop: 2 }}>Limite por doação (50%): <b style={{ color: "#3aa0ff" }}>{fmt(Math.floor(view.galaxyFund.metalium * 0.5))}</b> M · <b style={{ color: "#3aa0ff" }}>{fmt(Math.floor(view.galaxyFund.carbonum * 0.5))}</b> C · <b style={{ color: "#3aa0ff" }}>{fmt(Math.floor(view.galaxyFund.plutonium * 0.5))}</b> P · 1 doação a cada 72 ticks por planeta</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <select value={donTo} onChange={(e) => setDonTo(e.target.value)}
                  style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
                  <option value="">planeta destino...</option>
                  {(meGov?.members ?? []).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.coords})</option>)}
                </select>
                <input type="number" min={0} placeholder="M" value={donAmt.metalium || ""} onChange={(e) => setDonAmt({ ...donAmt, metalium: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 90, margin: 0, padding: "6px 8px" }} />
                <input type="number" min={0} placeholder="C" value={donAmt.carbonum || ""} onChange={(e) => setDonAmt({ ...donAmt, carbonum: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 90, margin: 0, padding: "6px 8px" }} />
                <input type="number" min={0} placeholder="P" value={donAmt.plutonium || ""} onChange={(e) => setDonAmt({ ...donAmt, plutonium: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 90, margin: 0, padding: "6px 8px" }} />
                <button disabled={!donTo} onClick={async () => {
                  setDonErr("");
                  try { await api.govDonate(donTo, donAmt.metalium, donAmt.carbonum, donAmt.plutonium); setDonAmt({ metalium: 0, carbonum: 0, plutonium: 0 }); setMeGov(await api.gov()); refresh(); }
                  catch (e: any) { setDonErr(e.message ?? "Falha ao doar"); }
                }}>doar</button>
              </div>
              {donErr && <div className="error" style={{ marginTop: 10 }}>{donErr}</div>}
            </div>
          )}

          <div className="panel">
            <h2>🕳️ Mercado Negro</h2>
            <div className="cost" style={{ marginBottom: 10 }}>
              Troca com taxa <b>fixa de 25%</b>, <b>sempre disponível</b> (não passa pelo fundo — o recurso trocado é consumido).
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={mktFrom} onChange={(e) => { const v = e.target.value as Resource; setMktFrom(v); if (mktTo === v) setMktTo(RES_META.find((r) => r.key !== v)!.key); }}
                style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
                {RES_META.map((r) => <option key={r.key} value={r.key}>{r.label} (tem {fmt(planet.resources[r.key])})</option>)}
              </select>
              <span>→</span>
              <select value={mktTo} onChange={(e) => setMktTo(e.target.value as Resource)}
                style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
                {RES_META.filter((r) => r.key !== mktFrom).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              <input type="number" min={1} value={mktAmt || ""} placeholder="quantidade"
                onChange={(e) => setMktAmt(Math.max(0, Math.floor(Number(e.target.value))))}
                style={{ width: 140, margin: 0, padding: "6px 10px" }} />
              <button disabled={mktBusy || mktAmt <= 0 || mktFrom === mktTo} onClick={doTradeMN}>{mktBusy ? "..." : "🕳️ trocar"}</button>
            </div>
            <div className="roid-count" style={{ marginTop: 8 }}>
              Você recebe: <b style={{ color: "var(--text)" }}>{fmt(Math.floor(mktAmt * 0.75))}</b> de {RES_META.find((r) => r.key === mktTo)?.label}
            </div>
            {mktErr && <div className="error" style={{ marginTop: 10 }}>{mktErr}</div>}
          </div>
          </>
        )}

        {section === "tecnologia" && (
          <>
            {view.queue.some((q) => q.kind === "tech") && (
              <div className="panel">
                <h2>Fila</h2>
                {view.queue.filter((q) => q.kind === "tech").map((q) => { const t = queueTag(q); return (
                  <div className="roid-row" key={q.id}>
                    <div>{t.icon} <span className="roid-count" style={{ color: t.color }}>{t.tag}:</span> {q.label}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="roid-count">{q.ticksRemaining} tick(s)</span>
                      <button onClick={() => doCancel(q.id)} title="Cancelar — reembolso proporcional ao tempo que falta" style={{ padding: "2px 8px", fontSize: 11 }}>cancelar</button>
                    </div>
                  </div>
                ); })}
              </div>
            )}
            <div className="cost" style={{ marginBottom: 12 }}>
              Cada item libera o <b>próximo</b> (alternando 🔬 Pesquisa ↔ 🛠️ Construção). A 1ª de <b>Mineração</b> e <b>Naves</b> já vem livre (começam construindo); as outras começam pesquisando. Você não pula etapas.
              <br />Minas: <span>+{fmt(view.planet.miningBonus.metalium)} M</span> · <span>+{fmt(view.planet.miningBonus.carbonum)} C</span> · <span>+{fmt(view.planet.miningBonus.plutonium)} P</span> por tick · viagem: <span>−{view.planet.travelReduction} tick(s)</span>.
            </div>
            {renderTechTree()}
            {error && <div className="error">{error}</div>}
          </>
        )}

        {section === "naves" && (
          <>
            <div className="panel">
              <h2>Hangar — {view.race.name}</h2>
              <div className="cost">
                ⚔️ tiros = nº de armas × dano · 🛡️ Fusel = quanto aguenta · alvos = classes que ela acerta · roiders só roubam roids.
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Nave</th><th>Classe</th><th>Alvos</th><th>⚔️ Tiros</th><th>🛡️ Fusel</th><th>Ini</th><th>Custo (M/C/P)</th><th title="total que você tem: base + todas as frotas">Total</th><th>Construir</th>
                  </tr>
                </thead>
                <tbody>
                  {view.units.map((u) => (
                    <tr key={u.name} style={{ opacity: (u.unlocked || u.captured) ? 1 : 0.4 }}>
                      <td>
                        <div className="ship-cell">
                          <ArtImg src={u.img} alt={u.name} className="ship-thumb" placeholder="🚀" onZoom={(s, a) => setZoom({ src: s, alt: a })} />
                          <span><b>{u.name}</b>{u.roider && <span style={{ color: "var(--carbonum)" }}> ⛏️</span>}</span>
                        </div>
                      </td>
                      <td>{u.classeLabel}</td>
                      <td className="roid-count">{u.roider ? "rouba roids" : u.alvos.join(", ") || "—"}</td>
                      <td>{u.roider ? "—" : `${u.stats.qarm}×${u.stats.pfog}${u.tipo === "PEM" ? " PEM" : ""}`}</td>
                      <td>{u.stats.fusel}</td>
                      <td>{u.stats.ini}</td>
                      <td className="roid-count">{fmt(u.cost.metalium)}/{fmt(u.cost.carbonum)}/{fmt(u.cost.plutonium)}</td>
                      <td title={u.total !== u.count ? `${fmt(u.count)} na base · ${fmt(u.total - u.count)} em frotas` : "tudo na base"}>{fmt(u.total)}</td>
                      <td>
                        {u.unlocked ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <input
                              type="number" min={1} placeholder="1" value={qty[u.name] || ""}
                              onChange={(e) => setQty({ ...qty, [u.name]: e.target.value === "" ? 0 : Math.max(1, Math.floor(Number(e.target.value))) })}
                              style={{ width: 80, margin: 0, padding: "4px 6px" }}
                            />
                            <button disabled={shipBusy !== null} onClick={() => doBuildUnit(u.name)}>
                              {shipBusy === u.name ? "..." : "+"}
                            </button>
                          </div>
                        ) : u.captured ? (
                          <span className="roid-count" title="nave de outra raça, assimilada — não dá pra construir, mas pode carregar em frota">🛸 capturada</span>
                        ) : (
                          <span className="roid-count">🔒 requer fábrica da classe</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
            </div>

            {view.queue.some((q) => q.kind === "ship") && (
              <div className="panel">
                <h2>Fila de produção</h2>
                {view.queue.filter((q) => q.kind === "ship").map((q) => { const t = queueTag(q); return (
                  <div className="roid-row" key={q.id}>
                    <div>{t.icon} <span className="roid-count" style={{ color: t.color }}>{t.tag}:</span> {q.label}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="roid-count">{q.ticksRemaining} tick(s) restante(s)</span>
                      <button onClick={() => doCancel(q.id)} title="Cancelar — reembolso proporcional ao tempo que falta" style={{ padding: "2px 8px", fontSize: 11 }}>cancelar</button>
                    </div>
                  </div>
                ); })}
              </div>
            )}
          </>
        )}

        {section === "galaxia" && <Galaxy view={view} gotoCoords={galaxyGoto} onChanged={refresh} onMessage={(c) => { setPmTo(c); setSection("mensagens"); }} />}

        {section === "frotas" && <Frotas view={view} onChanged={refresh} />}

        {section === "trafego" && <Trafego onGoto={(c) => { setGalaxyGoto(c + "#" + Date.now()); setSection("galaxia"); }} />}

        {section === "combates" && <Combats />}

        {section === "votacao" && <Governo />}

        {section === "noticias" && <Noticias />}

        {section === "aliancas" && <Aliancas />}

        {section === "associados" && <Associados onChanged={refresh} />}
        {section === "preferencias" && <Preferencias view={view} onChanged={refresh} />}

        {section === "forum" && <Forum />}

        {section === "forumgalaxia" && <Forum board={{ key: `gal-${planet.coords.split(":")[0]}`, name: `Fórum da Galáxia ${planet.coords.split(":")[0]}` }} />}

        {section === "chat" && <Chat myName={view.commander} />}

        {section === "mensagens" && <Mensagens initialTo={pmTo} />}

        {section === "sabotagem" && <Sabotagem />}

        {section === "intel" && <Inteligencia />}

        <AdBanner variant="strip" placement="game" />
      </main>

      {/* Lightbox: clique na arte amplia; clique em qualquer lugar (ou Esc/X) fecha */}
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <button className="lightbox-close" onClick={() => setZoom(null)} aria-label="Fechar">✕</button>
          <img src={zoom.src} alt={zoom.alt} onClick={(e) => e.stopPropagation()} />
          <div className="lightbox-cap">{zoom.alt}</div>
        </div>
      )}
    </div>
    </CoordNavContext.Provider>
  );
}
