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

/**
 * Mapa estelar do universo. Cada galáxia é um nó num campo setor×paralelo.
 * mode "full" = universo inteiro; "vizinhanca" = só a cruz do jogador (mesmo
 * setor OU paralelo, as rotas +2t). Clicar num nó abre a galáxia.
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
  // Na vizinhança só mostramos a cruz do jogador; no full, tudo.
  const inScope = (g: Galaxy) =>
    mode === "full" || g.setor === mySetor || g.paralelo === mySystem;

  const gals = data.galaxies.filter(inScope);
  const setores = mode === "full"
    ? Array.from({ length: data.setores }, (_, i) => i + 1)
    : Array.from(new Set(gals.map((g) => g.setor))).sort((a, b) => a - b);
  const paralelos = mode === "full"
    ? Array.from({ length: data.paralelos }, (_, i) => i + 1)
    : Array.from(new Set(gals.map((g) => g.paralelo))).sort((a, b) => a - b);

  const W = 680;
  const padL = 54, padT = 46, padR = 30, padB = 34;
  const rowH = mode === "vizinhanca" ? 74 : Math.max(48, Math.min(72, 440 / setores.length));
  const H = padT + padB + setores.length * rowH;
  const gridW = W - padL - padR;
  const colW = gridW / paralelos.length;

  const cx = (p: number) => padL + (paralelos.indexOf(p) + 0.5) * colW;
  const cy = (s: number) => padT + (setores.indexOf(s) + 0.5) * rowH;

  const distColor = (d: number) => (d === 0 ? "#4ea8ff" : d === 2 ? "#8ad0a8" : "#7f93ad");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="universe-map">
      {/* faixas destacadas: seu setor e paralelo (rotas +2t) */}
      {setores.includes(mySetor) && (
        <rect x={padL} y={cy(mySetor) - rowH / 2 + 4} width={gridW} height={rowH - 8} rx={8} className="um-axis-band" />
      )}
      {paralelos.includes(mySystem) && (
        <rect x={cx(mySystem) - colW / 2 + 4} y={padT} width={colW - 8} height={H - padT - padB} rx={8} className="um-axis-band" />
      )}

      {/* cabeçalhos */}
      {paralelos.map((p) => (
        <text key={`hp${p}`} x={cx(p)} y={30} className={`um-head ${p === mySystem ? "axis" : ""}`}>P{p}</text>
      ))}
      {setores.map((s) => (
        <text key={`hs${s}`} x={26} y={cy(s) + 4} className={`um-head ${s === mySetor ? "axis" : ""}`}>S{s}</text>
      ))}

      {/* nós das galáxias */}
      {gals.map((g) => {
        const x = cx(g.setor && g.paralelo ? g.paralelo : 1);
        const y = cy(g.setor);
        const onAxis = g.setor === mySetor || g.paralelo === mySystem;
        let fill: string, r: number, glow: string;
        if (g.isMine) { fill = "#4ea8ff"; r = 10; glow = "#4ea8ff"; }
        else if (g.hasAlly) { fill = "#38d6a0"; r = 7 + Math.min(g.planets, 6) * 0.6; glow = "#38d6a0"; }
        else if (g.planets > 0) { fill = "#cfe3f5"; r = 5 + Math.min(g.planets, 6) * 0.7; glow = onAxis ? "#38d6a0" : "#5a7799"; }
        else { fill = "#3a4a63"; r = 3; glow = "transparent"; }
        const op = g.planets > 0 || g.isMine ? 1 : 0.5;
        const dc = distColor(g.distanceTicks);
        const label = g.isMine ? "você" : `${g.coord} · +${g.distanceTicks}t`;
        return (
          <g key={g.coord} style={{ cursor: "pointer" }} opacity={op} onClick={() => onOpen(g.setor, g.paralelo)}>
            {glow !== "transparent" && <circle cx={x} cy={y} r={r + 5} fill={glow} opacity={0.18} />}
            <circle cx={x} cy={y} r={r} fill={fill} stroke={onAxis && !g.isMine ? "rgba(56,214,160,0.5)" : "rgba(0,0,0,0.3)"} strokeWidth={1} />
            {g.isMine && <circle cx={x} cy={y} r={r + 4} fill="none" stroke="#4ea8ff" strokeWidth={1.5} />}
            {g.name ? (
              <>
                <text x={x} y={y + r + 13} className="um-name">{g.name}</text>
                <text x={x} y={y + r + 24} className="um-dist" fill={dc}>{label}</text>
              </>
            ) : (
              <text x={x} y={y + r + 13} className="um-dist" fill={dc}>{label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
