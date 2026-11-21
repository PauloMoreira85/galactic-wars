type LogEntry = {
  side: "a" | "d";
  ini: number;
  ship: string;
  count: number;
  target: string;
  shots: number;
  action: "pem" | "destroy" | "assim";
  amount: number;
  chance: number;
  assimCost?: number;
};

const COLORS: Record<string, string> = {
  destroy: "var(--danger)",
  pem: "var(--plutonium)",
  assim: "var(--accent)",
};
const LABEL: Record<string, string> = {
  destroy: "destruídas",
  pem: "paralisadas (PEM)",
  assim: "assimiladas",
};

/**
 * Gráfico de troca de tiros: para cada lado, as naves ativas viram barras.
 * As linhas cruzam do atirador até o alvo; a cor diz o efeito e a grossura/
 * número dizem quantas naves foram abatidas. Lê do mesmo `log` do relatório.
 */
export function CombatChart({ log }: { log: LogEntry[] }) {
  if (!log || log.length === 0) return null;

  // Naves de cada lado (ordem estável de aparição).
  const atkShips: string[] = [];
  const defShips: string[] = [];
  for (const e of log) {
    const arr = e.side === "a" ? atkShips : defShips;
    if (!arr.includes(e.ship)) arr.push(e.ship);
    // o alvo também é uma nave do lado oposto
    const other = e.side === "a" ? defShips : atkShips;
    if (!other.includes(e.target)) other.push(e.target);
  }

  const W = 680;
  const rowH = 46;
  const rows = Math.max(atkShips.length, defShips.length);
  const H = Math.max(200, rows * rowH + 70);
  const colA = 150; // x da coluna atacante
  const colD = W - 150; // x da coluna defensor
  const top = 56;

  const yOf = (ships: string[], ship: string) =>
    top + ships.indexOf(ship) * rowH + rowH / 2;

  // soma por (atirador, alvo, ação) pra não poluir com uma linha por log
  type Shot = { side: "a" | "d"; ship: string; target: string; action: string; amount: number };
  const map = new Map<string, Shot>();
  for (const e of log) {
    if (e.amount <= 0) continue;
    const k = `${e.side}|${e.ship}|${e.target}|${e.action}`;
    const cur = map.get(k);
    if (cur) cur.amount += e.amount;
    else map.set(k, { side: e.side, ship: e.ship, target: e.target, action: e.action, amount: e.amount });
  }
  const shots = Array.from(map.values());
  const maxAmt = Math.max(1, ...shots.map((s) => s.amount));

  const usedActions = Array.from(new Set(shots.map((s) => s.action)));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block", margin: "0 auto" }}>
        {/* títulos das colunas */}
        <text x={colA} y={28} fill="var(--danger)" fontSize="15" fontWeight="700" textAnchor="middle">⚔️ Atacante</text>
        <text x={colD} y={28} fill="var(--carbonum)" fontSize="15" fontWeight="700" textAnchor="middle">🛡️ Defensor</text>

        {/* linhas de disparo */}
        {shots.map((s, i) => {
          const fromShips = s.side === "a" ? atkShips : defShips;
          const toShips = s.side === "a" ? defShips : atkShips;
          const fromX = s.side === "a" ? colA + 56 : colD - 56;
          const toX = s.side === "a" ? colD - 56 : colA + 56;
          const y1 = yOf(fromShips, s.ship);
          const y2 = yOf(toShips, s.target);
          const w = 1.5 + (s.amount / maxAmt) * 7;
          const midX = (fromX + toX) / 2;
          return (
            <g key={i}>
              <path
                d={`M ${fromX} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${toX} ${y2}`}
                stroke={COLORS[s.action]}
                strokeWidth={w}
                strokeOpacity={0.55}
                fill="none"
              />
              <circle cx={toX} cy={y2} r={4} fill={COLORS[s.action]} />
              <text x={midX} y={(y1 + y2) / 2 - 4} fill={COLORS[s.action]} fontSize="12" fontWeight="700" textAnchor="middle">
                −{s.amount.toLocaleString("pt-BR")}
              </text>
            </g>
          );
        })}

        {/* barras de naves — atacante */}
        {atkShips.map((ship) => {
          const y = yOf(atkShips, ship);
          return (
            <g key={"a" + ship}>
              <rect x={colA - 56} y={y - 13} width={112} height={26} rx={6} fill="rgba(255,106,78,0.14)" stroke="var(--danger)" strokeOpacity={0.5} />
              <text x={colA} y={y + 4} fill="#ffd9cf" fontSize="12" fontWeight="600" textAnchor="middle">{ship}</text>
            </g>
          );
        })}
        {/* barras de naves — defensor */}
        {defShips.map((ship) => {
          const y = yOf(defShips, ship);
          return (
            <g key={"d" + ship}>
              <rect x={colD - 56} y={y - 13} width={112} height={26} rx={6} fill="rgba(37,211,255,0.12)" stroke="var(--carbonum)" strokeOpacity={0.5} />
              <text x={colD} y={y + 4} fill="#cfefff" fontSize="12" fontWeight="600" textAnchor="middle">{ship}</text>
            </g>
          );
        })}
      </svg>

      {/* legenda */}
      <div style={{ display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap", marginTop: 6 }}>
        {usedActions.map((a) => (
          <span key={a} className="roid-count" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 16, height: 3, borderRadius: 2, background: COLORS[a], display: "inline-block" }} />
            {LABEL[a]}
          </span>
        ))}
        <span className="roid-count" style={{ fontSize: 12, opacity: 0.7 }}>linha mais grossa = mais naves abatidas</span>
      </div>
    </div>
  );
}
