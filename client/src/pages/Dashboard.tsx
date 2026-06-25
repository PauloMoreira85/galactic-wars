import { useEffect, useState } from "react";
import { api, clearToken, type PlanetView, type Resource, type TechItem } from "../api";
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

const RES_META: { key: Resource; label: string }[] = [
  { key: "metalium", label: "Metalium" },
  { key: "carbonum", label: "Carbonum" },
  { key: "plutonium", label: "Plutônio" },
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

type Section = "planeta" | "galaxia" | "frotas" | "trafego" | "pesquisa" | "construcao" | "naves" | "recursos" | "combates" | "votacao" | "noticias" | "aliancas" | "associados" | "preferencias" | "forum" | "forumgalaxia" | "chat" | "mensagens" | "sabotagem" | "intel";

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
    { key: "pesquisa", label: "Pesquisa" },
    { key: "construcao", label: "Construção" },
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
    { key: "equipe", label: "Equipe Galactic Wars", soon: true },
  ],
];

const TITLES: Record<Section, string> = {
  planeta: "Página Principal",
  galaxia: "Galáxia",
  frotas: "Frotas",
  trafego: "Tráfego",
  pesquisa: "Pesquisa",
  naves: "Naves",
  construcao: "Construção",
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
  const [showIntro, setShowIntro] = useState(() => localStorage.getItem("gw_intro_hidden") !== "1");
  const [mktFrom, setMktFrom] = useState<Resource>("metalium");
  const [mktTo, setMktTo] = useState<Resource>("carbonum");
  const [mktAmt, setMktAmt] = useState(0);
  const [mktErr, setMktErr] = useState("");
  const [mktBusy, setMktBusy] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [alerts, setAlerts] = useState({ underAttack: false, incomingDefense: false, galaxyUnderAttack: false });
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const countdown = useCountdown(view);

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
      try {
        const t = await api.traffic();
        setAlerts({
          underAttack: t.fleets.some((f) => f.toMe && f.mission === "attack"),
          incomingDefense: t.fleets.some((f) => f.toMe && f.mission === "transport"),
          galaxyUnderAttack: t.incomingAttacks > 0,
        });
      } catch {}
      try { setUnreadMsgs((await api.pmUnread()).unread); } catch {}
    } catch (e: any) {
      if (String(e.message).includes("autenticado") || String(e.message).includes("Token")) {
        onLogout();
      }
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, []);

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

  async function doTrade() {
    setMktErr("");
    if (mktFrom === mktTo) { setMktErr("Escolha recursos diferentes."); return; }
    if (mktAmt <= 0) { setMktErr("Informe uma quantidade."); return; }
    setMktBusy(true);
    try {
      setView(await api.marketTrade(mktFrom, mktTo, mktAmt));
      setMktAmt(0);
    } catch (e: any) { setMktErr(e.message ?? "Falha na troca"); }
    finally { setMktBusy(false); }
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
  }

  if (!view) return <div className="app">Carregando o universo...</div>;

  const { planet, game } = view;
  // Cada roid custa SÓ o próprio recurso (e sobe +250 por roid daquele recurso).
  const roidCost = (r: Resource) => planet.nextRoidCost[r];
  const canAffordRoid = (r: Resource) => planet.resources[r] >= roidCost(r);

  // Renderiza os itens de tech (Pesquisa ou Construção) agrupados por categoria.
  function renderTech(kind: "research" | "building", verb: string) {
    const items = view!.tech.filter((t) => t.kind === kind);
    const cats = CAT_ORDER.filter((c) => items.some((t) => t.category === c));
    return cats.map((cat) => (
      <div className="panel" key={cat}>
        <h2>{CAT_LABELS[cat]}</h2>
        {items.filter((t) => t.category === cat).map((t: TechItem) => (
          <div className="roid-row" key={t.key}>
            <div className="roid-label">
              <div>
                <div>
                  <b>{t.name}</b>{" "}
                  {t.max > 1 && <span className="roid-count">nível {t.level}/{t.max}</span>}
                  {t.max === 1 && t.level >= 1 && <span style={{ color: "var(--carbonum)" }}>✓ feito</span>}
                </div>
                <div className="roid-count">{t.desc}</div>
                {!t.reqsMet && t.requires.length > 0 && (
                  <div className="roid-count" style={{ color: "var(--danger)" }}>
                    🔒 requer: {t.requires.map((r) => r.name).join(", ")}
                  </div>
                )}
                {t.reqsMet && !t.maxed && !t.affordable && (
                  <div className="roid-count" style={{ color: "#e6a23c" }}>⚠️ liberado — faltam recursos</div>
                )}
                {t.cost && (
                  <div className="roid-count">
                    {fmt(t.cost.metalium)}M · {fmt(t.cost.carbonum)}C · {fmt(t.cost.plutonium)}P · {t.ticks} ticks
                  </div>
                )}
              </div>
            </div>
            <div>
              {t.maxed ? (
                <span className="roid-count">máx</span>
              ) : (() => {
                const inQueue = view!.queue.some((q) => q.kind === "tech" && q.key === t.key);
                const kindPending = view!.queue.some((q) => q.techKind === kind); // 1 por vez (pesquisa/construção)
                const progress = kind === "research" ? "Pesquisando…" : "Construindo…";
                return (
                  <button disabled={!t.canStart || shipBusy !== null || inQueue || kindPending}
                    title={kindPending && !inQueue ? `Já há ${kind === "research" ? "uma pesquisa" : "uma construção"} em andamento — cancele na fila pra trocar` : undefined}
                    onClick={() => doUpgrade(t.key)}>
                    {shipBusy === t.key ? "..." : inQueue ? progress : verb}
                  </button>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    ));
  }

  return (
    <div className="layout">
      {/* ===== Barra lateral ===== */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/art/logo/brasao.jpg" alt="Galactic Wars" className="sidebar-logo" />
        </div>

        <nav className="menu">
          {MENU.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="menu-sep" />}
              {group.map((it) => (
                <button
                  key={it.key}
                  className={`menu-link ${section === it.key ? "active" : ""} ${it.soon ? "soon" : ""} ${it.key === "mensagens" && unreadMsgs > 0 ? "alert-msg" : ""}`}
                  disabled={it.soon}
                  title={it.soon ? "Em breve" : ""}
                  onClick={() => go(it)}
                >
                  {it.label}{it.key === "mensagens" && unreadMsgs > 0 ? ` ✉️ (${unreadMsgs})` : ""}
                </button>
              ))}
            </div>
          ))}
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
            🏆 <b>Round encerrado!</b>{ranking[0] && <> Campeão: <b>{ranking[0].username}</b> — {ranking[0].planet} ({ranking[0].coords})</>}. As ações estão congeladas; aguarde o próximo round.
          </div>
        )}

        {/* Cabeçalho de status no topo, como no print da época */}
        <div className="status-header">
          <div className="sh-commander">
            {view.commanderAvatar
              ? <img className="sh-avatar" src={view.commanderAvatar} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }} />
              : <span className="sh-planet-icon">🪐</span>}
            <div>
              <div className="sh-name">{view.commanderTitle}</div>
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
            <div className="sh-cell"><span>Online</span><b>{view.onlineCount}</b></div>
            <div className="sh-cell"><span>Moral</span><b>—</b></div>
          </div>
        </div>

        {/* Ações rápidas (como os botões do topo do print) */}
        <div className="action-tabs">
          {([
            ["mensagens", "✉️ Mensagem"],
            ["forumgalaxia", "💬 Fórum"],
            ["noticias", "📰 Notícias"],
          ] as [Section, string][]).map(([key, label]) => (
            <button key={key} className={`action-tab ${section === key ? "active" : ""} ${key === "mensagens" && unreadMsgs > 0 ? "alert-msg" : ""}`} onClick={() => setSection(key)}>
              {label}{key === "mensagens" && unreadMsgs > 0 ? ` (${unreadMsgs})` : ""}
            </button>
          ))}
          {/* Radar: acende quando ALGUÉM da sua galáxia está sob ataque */}
          <span
            className={`radar ${alerts.galaxyUnderAttack ? "radar-on" : ""}`}
            title={alerts.galaxyUnderAttack ? "Alerta: planeta(s) da galáxia sob ataque!" : "Radar da galáxia: tudo calmo"}
            onClick={() => setSection("trafego")}
          />
          {/* Defesa (verde se reforço chegando) e Ataque (vermelho se sob ataque) */}
          <button
            className={`action-tab ${section === "trafego" ? "active" : ""} ${alerts.incomingDefense ? "alert-def" : ""}`}
            onClick={() => setSection("trafego")}
          >
            🛡️ Defesa
          </button>
          <button
            className={`action-tab ${alerts.underAttack ? "alert-atk" : ""}`}
            onClick={() => setSection("trafego")}
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
                  <li><b>Inicie a mineração de roids</b> na Página Principal (botão "⛏️ minerar …") — você paga pra começar a minerar. Mais roids = mais recursos por tick.</li>
                  <li><b>Pesquise</b> (🔬) pra desbloquear construções; depois <b>construa</b> (🛠️).</li>
                  <li>Em <b>Naves, Inteligência e Sabotagem</b> a cadeia é: pesquisa → fábrica → libera a próxima.</li>
                  <li>Construa naves nas fábricas (<b>Naves</b>) e monte uma frota em <b>Frotas</b>.</li>
                  <li>Na <b>Galáxia</b>, envie a frota: mesma galáxia = só <b>defender</b> (aliados); outras = <b>atacar</b>.</li>
                  <li>Você tem <b>proteção de novato por 72 ticks</b> — ninguém te ataca. Cresça à vontade.</li>
                </ol>
                <div className="roid-count">💡 A raça dos inimigos é segredo — descubra espionando (Inteligência). Tudo detalhado na <b>Árvore Tecnológica</b> (Ferramentas).</div>
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
              <h2>Ranking — top comandantes</h2>
              <table>
                <thead>
                  <tr><th className="rank-num">#</th><th>Comandante</th><th>Planeta</th><th>Coord.</th><th>Roids</th></tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={i}>
                      <td className="rank-num">{i + 1}</td>
                      <td>{r.username}</td>
                      <td>{r.planet}</td>
                      <td>{r.coords}</td>
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
              Inicie a mineração de um roid pagando <b>só o recurso dele</b>. O custo sobe +250 a cada roid daquele recurso. Cada roid produz <b>{fmt(450)}</b>/tick. Teto: <b>{fmt(30000000)}</b> por recurso (o que passar é perdido).
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
                  <div className="roid-count">custo: {fmt(roidCost(key))} {label}</div>
                  <button disabled={!canAffordRoid(key) || busy !== null} onClick={() => build(key)}>
                    {busy === key ? "..." : `⛏️ minerar ${label}`}
                  </button>
                </div>
              </div>
            ))}
            {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          </div>

          <div className="panel">
            <h2>🕳️ Mercado Negro</h2>
            <div className="cost" style={{ marginBottom: 10 }}>
              Troque um recurso por outro. Taxa de <b>20%</b> — você recebe 80% do valor trocado.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={mktFrom}
                onChange={(e) => { const v = e.target.value as Resource; setMktFrom(v); if (mktTo === v) setMktTo(RES_META.find((r) => r.key !== v)!.key); }}
                style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}
              >
                {RES_META.map((r) => <option key={r.key} value={r.key}>{r.label} (tem {fmt(planet.resources[r.key])})</option>)}
              </select>
              <span>→</span>
              <select
                value={mktTo}
                onChange={(e) => setMktTo(e.target.value as Resource)}
                style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}
              >
                {RES_META.filter((r) => r.key !== mktFrom).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              <input
                type="number" min={1} value={mktAmt || ""} placeholder="quantidade"
                onChange={(e) => setMktAmt(Math.max(0, Math.floor(Number(e.target.value))))}
                style={{ width: 140, margin: 0, padding: "6px 10px" }}
              />
              <button disabled={mktBusy || mktAmt <= 0 || mktFrom === mktTo} onClick={doTrade}>{mktBusy ? "..." : "trocar"}</button>
            </div>
            <div className="roid-count" style={{ marginTop: 8 }}>
              Você recebe: <b style={{ color: "var(--text)" }}>{fmt(Math.floor(mktAmt * (1 - 0.20)))}</b> de {RES_META.find((r) => r.key === mktTo)?.label}
            </div>
            {mktErr && <div className="error" style={{ marginTop: 10 }}>{mktErr}</div>}
          </div>
          </>
        )}

        {(section === "pesquisa" || section === "construcao") && (() => {
          const wantKind = section === "pesquisa" ? "research" : "building";
          const fila = view.queue.filter((q) => q.techKind === wantKind);
          if (fila.length === 0) return null;
          return (
          <div className="panel">
            <h2>Fila</h2>
            {fila.map((q) => { const t = queueTag(q); return (
              <div className="roid-row" key={q.id}>
                <div>{t.icon} <span className="roid-count" style={{ color: t.color }}>{t.tag}:</span> {q.label}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="roid-count">{q.ticksRemaining} tick(s)</span>
                  <button onClick={() => doCancel(q.id)} title="Cancelar — reembolso proporcional ao tempo que falta" style={{ padding: "2px 8px", fontSize: 11 }}>cancelar</button>
                </div>
              </div>
            ); })}
          </div>
          );
        })()}

        {section === "pesquisa" && (
          <>
            <div className="cost" style={{ marginBottom: 12 }}>
              Pesquise para desbloquear construções e novas classes de nave.
            </div>
            {renderTech("research", "Pesquisar")}
            {error && <div className="error">{error}</div>}
          </>
        )}

        {section === "construcao" && (
          <>
            <div className="cost" style={{ marginBottom: 12 }}>
              Bônus de mineração: <span>+{fmt(view.planet.miningBonus.metalium)} M</span> · <span>+{fmt(view.planet.miningBonus.carbonum)} C</span> · <span>+{fmt(view.planet.miningBonus.plutonium)} P</span> por tick · viagem: <span>−{view.planet.travelReduction} tick(s)</span>.
            </div>
            {renderTech("building", "Construir")}
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
                    <th>Nave</th><th>Classe</th><th>Alvos</th><th>⚔️ Tiros</th><th>🛡️ Fusel</th><th>Ini</th><th>Custo (M/C/P)</th><th>Frota</th><th>Construir</th>
                  </tr>
                </thead>
                <tbody>
                  {view.units.map((u) => (
                    <tr key={u.name} style={{ opacity: u.unlocked ? 1 : 0.4 }}>
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
                      <td>{fmt(u.count)}</td>
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

        {section === "galaxia" && <Galaxy view={view} onChanged={refresh} />}

        {section === "frotas" && <Frotas view={view} onChanged={refresh} />}

        {section === "trafego" && <Trafego />}

        {section === "combates" && <Combats />}

        {section === "votacao" && <Governo />}

        {section === "noticias" && <Noticias />}

        {section === "aliancas" && <Aliancas />}

        {section === "associados" && <Associados onChanged={refresh} />}
        {section === "preferencias" && <Preferencias view={view} onChanged={refresh} />}

        {section === "forum" && <Forum />}

        {section === "forumgalaxia" && <Forum board={{ key: `gal-${planet.coords.split(":")[0]}`, name: `Fórum da Galáxia ${planet.coords.split(":")[0]}` }} />}

        {section === "chat" && <Chat />}

        {section === "mensagens" && <Mensagens />}

        {section === "sabotagem" && <Sabotagem />}

        {section === "intel" && <Inteligencia />}
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
  );
}
