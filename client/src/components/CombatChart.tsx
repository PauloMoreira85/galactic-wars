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
const ICON: Record<string, string> = { destroy: "💥", pem: "⚡", assim: "🛸" };

function fmt(n: number) { return n.toLocaleString("pt-BR"); }

/**
 * Gráfico de troca de tiros, redesenhado pra ficar legível (pedido do Endless):
 * — cada nave vira um "card" com o nome e quantas agiram;
 * — um conector sai do atirador até o alvo, com um selo no meio dizendo o efeito
 *   (ícone + nº + ação: destruídas / paralisadas / assimiladas);
 * — grossura do conector = quantas naves foram abatidas.
 * Lê do mesmo `log` do relatório.
 */
export function CombatChart({ log }: { log: LogEntry[] }) {
  if (!log || log.length === 0) return null;

  // Naves de cada lado (ordem estável de aparição) + quantas agiram (pra mostrar no card).
  const atkShips: string[] = [];
  const defShips: string[] = [];
  const countOf = new Map<string, number>(); // "side|ship" -> nº de naves que agiram
  for (const e of log) {
    const arr = e.side === "a" ? atkShips : defShips;
    if (!arr.includes(e.ship)) arr.push(e.ship);
    const other = e.side === "a" ? defShips : atkShips;
    if (!other.includes(e.target)) other.push(e.target);
    const k = `${e.side}|${e.ship}`;
    countOf.set(k, Math.max(countOf.get(k) ?? 0, e.count));
  }

  // Soma por (atirador, alvo, ação) pra ter 1 conector por par (não 1 por linha do log).
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

  // Vários efeitos no MESMO alvo (ex.: Mosquito leva PEM + assimilação) empilhariam
  // os selos no mesmo ponto. Agrupa por (lado-do-alvo, alvo) e dá a cada selo um
  // índice pra espalhar na vertical. Também alterna o ponto do caminho (t) pra separar
  // horizontalmente conectores que caem na mesma faixa.
  const tgtGroups = new Map<string, number>();
  const sealIndex: number[] = [];
  const sealCount: number[] = [];
  shots.forEach((s, i) => {
    const k = `${s.side}|${s.target}`; // alvo está no lado OPOSTO, mas a chave é estável
    const idx = tgtGroups.get(k) ?? 0;
    sealIndex[i] = idx;
    tgtGroups.set(k, idx + 1);
  });
  shots.forEach((s, i) => { sealCount[i] = tgtGroups.get(`${s.side}|${s.target}`) ?? 1; });

  // Geometria: dois blocos (atacante à esquerda, defensor à direita), cards empilhados.
  const W = 700;
  const rowH = 54;
  const cardW = 130, cardH = 34;
  const rows = Math.max(atkShips.length, defShips.length);
  const H = Math.max(170, rows * rowH + 64);
  const top = 50;
  const colAx = 20;           // x esquerdo do card atacante
  const colDx = W - 20 - cardW; // x esquerdo do card defensor
  const outX = colAx + cardW;  // saída (borda direita do card atacante)
  const inX = colDx;           // entrada (borda esquerda do card defensor)

  const yOf = (ships: string[], ship: string) => top + ships.indexOf(ship) * rowH + cardH / 2;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block", margin: "0 auto" }}>
        {/* títulos */}
        <text x={colAx + cardW / 2} y={26} fill="var(--danger)" fontSize="15" fontWeight="700" textAnchor="middle">⚔️ Atacante</text>
        <text x={colDx + cardW / 2} y={26} fill="var(--carbonum)" fontSize="15" fontWeight="700" textAnchor="middle">🛡️ Defensor</text>

        {/* conectores atirador -> alvo (atrás dos cards) */}
        {shots.map((s, i) => {
          const fromShips = s.side === "a" ? atkShips : defShips;
          const toShips = s.side === "a" ? defShips : atkShips;
          const fromRight = s.side === "a"; // atacante atira da esquerda pra direita
          const x1 = fromRight ? outX : colDx;
          const x2 = fromRight ? inX : outX;
          const y1 = yOf(fromShips, s.ship);
          const y2 = yOf(toShips, s.target);
          const w = 2 + (s.amount / maxAmt) * 8;
          const midX = (x1 + x2) / 2;
          const col = COLORS[s.action];
          return (
            <g key={i}>
              <path d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                stroke={col} strokeWidth={w} strokeOpacity={0.5} fill="none" />
              {/* seta no alvo */}
              <circle cx={x2} cy={y2} r={4} fill={col} />
              {/* selo do efeito posicionado PERTO DO ALVO (≈72% do caminho), na altura
                  do alvo — evita o empilhamento de todos os selos no centro. */}
              {(() => {
                const cnt = sealCount[i] || 1;
                const idx = sealIndex[i] || 0;
                // Espaça horizontalmente (t) quando há vários efeitos no mesmo alvo,
                // e dá um empurrãozinho vertical pra não colar um selo no outro.
                const t = cnt > 1 ? 0.62 + idx * (0.22 / Math.max(1, cnt - 1)) : 0.72;
                const bx = (1 - t) ** 3 * x1 + 3 * (1 - t) ** 2 * t * midX + 3 * (1 - t) * t ** 2 * midX + t ** 3 * x2;
                const by = (1 - t) ** 3 * y1 + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3 * y2;
                const vy = cnt > 1 ? (idx - (cnt - 1) / 2) * 15 : 0;
                return (
                  <g transform={`translate(${bx}, ${by + vy})`}>
                    <rect x={-38} y={-11} width={76} height={22} rx={11} fill="var(--panel, #0d1424)" stroke={col} strokeOpacity={0.95} />
                    <text x={0} y={4} fill={col} fontSize="11.5" fontWeight="700" textAnchor="middle">
                      {ICON[s.action]} {fmt(s.amount)}
                    </text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* cards de naves — atacante */}
        {atkShips.map((ship) => {
          const y = yOf(atkShips, ship);
          const n = countOf.get(`a|${ship}`);
          return (
            <g key={"a" + ship}>
              <rect x={colAx} y={y - cardH / 2} width={cardW} height={cardH} rx={7} fill="rgba(255,106,78,0.16)" stroke="var(--danger)" strokeOpacity={0.6} />
              <text x={colAx + cardW / 2} y={y - 1} fill="#ffd9cf" fontSize="12.5" fontWeight="700" textAnchor="middle">{ship}</text>
              {n != null && <text x={colAx + cardW / 2} y={y + 11} fill="#ffd9cf" fontSize="10" opacity={0.75} textAnchor="middle">{fmt(n)} agiram</text>}
            </g>
          );
        })}
        {/* cards de naves — defensor */}
        {defShips.map((ship) => {
          const y = yOf(defShips, ship);
          const n = countOf.get(`d|${ship}`);
          return (
            <g key={"d" + ship}>
              <rect x={colDx} y={y - cardH / 2} width={cardW} height={cardH} rx={7} fill="rgba(37,211,255,0.14)" stroke="var(--carbonum)" strokeOpacity={0.6} />
              <text x={colDx + cardW / 2} y={y - 1} fill="#cfefff" fontSize="12.5" fontWeight="700" textAnchor="middle">{ship}</text>
              {n != null && <text x={colDx + cardW / 2} y={y + 11} fill="#cfefff" fontSize="10" opacity={0.75} textAnchor="middle">{fmt(n)} agiram</text>}
            </g>
          );
        })}
      </svg>

      {/* legenda */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginTop: 8 }}>
        {usedActions.map((a) => (
          <span key={a} className="roid-count" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: COLORS[a] }}>{ICON[a]}</span>
            <span style={{ width: 16, height: 3, borderRadius: 2, background: COLORS[a], display: "inline-block" }} />
            {LABEL[a]}
          </span>
        ))}
        <span className="roid-count" style={{ fontSize: 12, opacity: 0.7 }}>linha mais grossa = mais naves abatidas</span>
      </div>
    </div>
  );
}
