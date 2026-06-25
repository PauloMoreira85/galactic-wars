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
  mineracao: "Mineração", tec: "TEC — Propulsão", espionagem: "Inteligência", sabotagem: "Sabotagem", naves: "Naves",
};
const CAT_ORDER = ["mineracao", "tec", "espionagem", "sabotagem", "naves"];

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
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [alerts, setAlerts] = useState({ underAttack: false, incomingDefense: false, galaxyUnderAttack: false });
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
  const cost = planet.nextRoidCost;
  const canAfford =
    planet.resources.metalium >= cost.metalium &&
    planet.resources.carbonum >= cost.carbonum &&
    planet.resources.plutonium >= cost.plutonium;

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
                const progress = kind === "research" ? "Pesquisando…" : "Construindo…";
                return (
                  <button disabled={!t.canStart || shipBusy !== null || inQueue} onClick={() => doUpgrade(t.key)}>
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
                  className={`menu-link ${section === it.key ? "active" : ""} ${it.soon ? "soon" : ""}`}
                  disabled={it.soon}
                  title={it.soon ? "Em breve" : ""}
                  onClick={() => go(it)}
                >
                  {it.label}
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
            <span className="sh-planet-icon">🪐</span>
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
            <button key={key} className={`action-tab ${section === key ? "active" : ""}`} onClick={() => setSection(key)}>
              {label}
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
                  <li>Na <b>Galáxia</b>, envie a frota: mesma galáxia = só transporte (defesa); outras = atacar.</li>
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
          <div className="panel">
            <h2>Asteroides (roids) — {planet.roids.total} no total</h2>
            <div className="cost">
              Custo do próximo roid:{" "}
              <span>{fmt(cost.metalium)} metalium</span>
              {cost.carbonum > 0 && <> · <span>{fmt(cost.carbonum)} carbonum</span></>}
              {cost.plutonium > 0 && <> · <span>{fmt(cost.plutonium)} plutônio</span></>}
            </div>
            {RES_META.map(({ key, label }) => (
              <div className="roid-row" key={key}>
                <div className="roid-label">
                  <span className={`dot ${key}`} />
                  <div>
                    <div>{label}</div>
                    <div className="roid-count">{planet.roids[key]} roids extraindo</div>
                  </div>
                </div>
                <button disabled={!canAfford || busy !== null} onClick={() => build(key)}>
                  {busy === key ? "..." : `⛏️ minerar ${label}`}
                </button>
              </div>
            ))}
            {!canAfford && <div className="error" style={{ marginTop: 12 }}>Recursos insuficientes para o próximo roid.</div>}
            {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          </div>
        )}

        {(section === "pesquisa" || section === "construcao") && view.queue.length > 0 && (
          <div className="panel">
            <h2>Fila</h2>
            {view.queue.map((q) => (
              <div className="roid-row" key={q.id}>
                <div>{q.kind === "tech" ? "🔬 " : "🛠️ "}{q.label}</div>
                <div className="roid-count">{q.ticksRemaining} tick(s)</div>
              </div>
            ))}
          </div>
        )}

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
              Produção atual dos roids: <span>{view.planet.prodMul}%</span> · velocidade de frota:{" "}
              <span>{view.planet.travelMul}%</span> do tempo base.
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
                              type="number" min={1} value={qty[u.name] ?? 1}
                              onChange={(e) => setQty({ ...qty, [u.name]: Number(e.target.value) })}
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

            {view.queue.length > 0 && (
              <div className="panel">
                <h2>Fila de produção</h2>
                {view.queue.map((q) => (
                  <div className="roid-row" key={q.id}>
                    <div>{q.kind === "tech" ? "🔬 " : "🛠️ "}{q.label}</div>
                    <div className="roid-count">{q.ticksRemaining} tick(s) restante(s)</div>
                  </div>
                ))}
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
