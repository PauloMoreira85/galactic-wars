import { useMemo, useState } from "react";

type Galaxy = {
  setor: number;
  paralelo: number;
  coord: string;
  name: string | null;
  planets: number;
  hasAlly: boolean;
  isMine: boolean;
  distanceTicks: number;
};

type UniverseData = {
  setores: number;
  paralelos: number;
  galaxies: Galaxy[];
};

type Filter = "all" | "planets" | "ally";

/**
 * Mapa estelar imersivo do universo. Cada galáxia é um "sol" num campo
 * setor×paralelo, sobre um fundo de nebulosa. Rotas alcançáveis (+2t, mesmo
 * setor OU paralelo) ligam-se à sua galáxia. Hover mostra detalhes; clicar abre.
 * mode "full" = universo inteiro; "vizinhanca" = só a cruz do jogador.
 */
export function UniverseMap({
  data,
  mySetor,
  mySystem,
  mode,
  onOpen,
}: {
  data: UniverseData;
  mySetor: number;
  mySystem: number;
  mode: "full" | "vizinhanca";
  onOpen: (setor: number, paralelo: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [hover, setHover] = useState<Galaxy | null>(null);

  const inScope = (g: Galaxy) =>
    mode === "full" || g.setor === mySetor || g.paralelo === mySystem;

  const gals = data.galaxies.filter(inScope);
  const setores = mode === "full"
    ? Array.from({ length: data.setores }, (_, i) => i + 1)
    : Array.from(new Set(gals.map((g) => g.setor))).sort((a, b) => a - b);
  const paralelos = mode === "full"
    ? Array.from({ length: data.paralelos }, (_, i) => i + 1)
    : Array.from(new Set(gals.map((g) => g.paralelo))).sort((a, b) => a - b);

  const W = 760;
  const padL = 44, padT = 48, padR = 28, padB = 28;
  const rowH = mode === "vizinhanca" ? 96 : Math.max(60, Math.min(96, 560 / setores.length));
  const H = padT + padB + setores.length * rowH;
  const gridW = W - padL - padR;
  const colW = gridW / paralelos.length;

  const cx = (p: number) => padL + (paralelos.indexOf(p) + 0.5) * colW;
  const cy = (s: number) => padT + (setores.indexOf(s) + 0.5) * rowH;

  // estrelinhas de fundo (determinísticas p/ não piscar a cada render)
  const stars = useMemo(() => {
    const out: { x: number; y: number; r: number; o: number }[] = [];
    let seed = 1337;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 90; i++) out.push({ x: rnd() * W, y: rnd() * H, r: rnd() * 1.2 + 0.2, o: rnd() * 0.5 + 0.15 });
    return out;
  }, [W, H]);

  const me = gals.find((g) => g.isMine);
  const visible = (g: Galaxy) =>
    filter === "all" ? true : filter === "planets" ? (g.planets > 0 || g.isMine) : (g.hasAlly || g.isMine);

  // cor por status
  const statusColor = (g: Galaxy) =>
    g.isMine ? "#5cc8ff" : g.hasAlly ? "#38d6a0" : g.planets > 0 ? "#dce9fb" : "#46597a";

  return (
    <div className="umap">
      <div className="umap-filters">
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>Tudo</button>
        <button className={filter === "planets" ? "on" : ""} onClick={() => setFilter("planets")}>Com planetas</button>
        <button className={filter === "ally" ? "on" : ""} onClick={() => setFilter("ally")}>Aliados</button>
        <span className="umap-legend">
          <i className="dot me" /> você
          <i className="dot ally" /> aliado
          <i className="dot pop" /> povoada
          <i className="dot empty" /> vazia
        </span>
      </div>

      <div className="umap-stage">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="universe-map">
          <defs>
            <radialGradient id="um-star" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <filter id="um-blur" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          {/* estrelas de fundo */}
          {stars.map((s, i) => <circle key={`st${i}`} cx={s.x} cy={s.y} r={s.r} fill="#cfe0ff" opacity={s.o} />)}

          {/* rotas da minha galáxia p/ destinos alcançáveis (+2t) */}
          {me && gals.filter((g) => !g.isMine && g.distanceTicks <= 2 && visible(g)).map((g) => (
            <line key={`r${g.coord}`} x1={cx(me.paralelo)} y1={cy(me.setor)} x2={cx(g.paralelo)} y2={cy(g.setor)}
              className="um-route" />
          ))}

          {/* cabeçalhos dos eixos */}
          {paralelos.map((p) => (
            <text key={`hp${p}`} x={cx(p)} y={28} className={`um-head ${p === mySystem ? "axis" : ""}`}>P{p}</text>
          ))}
          {setores.map((s) => (
            <text key={`hs${s}`} x={20} y={cy(s) + 4} className={`um-head ${s === mySetor ? "axis" : ""}`}>S{s}</text>
          ))}

          {/* nós das galáxias */}
          {gals.map((g) => {
            if (!visible(g)) return null;
            const x = cx(g.paralelo);
            const y = cy(g.setor);
            const col = statusColor(g);
            const pop = g.planets > 0 || g.isMine;
            const r = g.isMine ? 9 : pop ? 5 + Math.min(g.planets, 6) * 0.9 : 2.6;
            const glowR = r + (g.isMine ? 16 : pop ? 10 : 4);
            const dim = !pop && !g.isMine ? 0.5 : 1;
            return (
              <g key={g.coord} style={{ cursor: "pointer" }} opacity={dim}
                 onClick={() => onOpen(g.setor, g.paralelo)}
                 onMouseEnter={() => setHover(g)} onMouseLeave={() => setHover((h) => (h === g ? null : h))}>
                {/* halo */}
                {(pop || g.isMine) && <circle cx={x} cy={y} r={glowR} fill={col} opacity={0.16} filter="url(#um-blur)" />}
                {/* núcleo brilhante */}
                <circle cx={x} cy={y} r={r + 3} fill="url(#um-star)" opacity={pop || g.isMine ? 0.8 : 0.3} />
                <circle cx={x} cy={y} r={r} fill={col} stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} />
                {/* anel pulsante na minha galáxia */}
                {g.isMine && <circle cx={x} cy={y} r={r + 6} fill="none" stroke="#5cc8ff" strokeWidth={1.5} className="um-pulse" />}
                {/* rótulo discreto só p/ povoadas/nomeadas no modo vizinhança, ou no hover */}
                {(mode === "vizinhanca" && pop) && (
                  <text x={x} y={y + glowR + 12} className="um-name">{g.isMine ? "você" : (g.name || g.coord)}</text>
                )}
              </g>
            );
          })}
        </svg>

        {/* tooltip */}
        {hover && (
          <div className="umap-tip">
            <div className="umap-tip-t">{hover.isMine ? "⭐ Sua galáxia" : (hover.name || "Galáxia")} <span>{hover.coord}</span></div>
            <div className="umap-tip-r">
              {hover.planets > 0 ? `${hover.planets} planeta(s)` : "sem planetas"}
              {hover.hasAlly && " · 🤝 aliado"}
              {!hover.isMine && ` · ${hover.distanceTicks === 0 ? "mesma galáxia" : `${hover.distanceTicks} tick(s) de viagem`}`}
            </div>
            <div className="umap-tip-go">clique para abrir →</div>
          </div>
        )}
      </div>
    </div>
  );
}
