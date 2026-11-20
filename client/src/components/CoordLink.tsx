import { createContext, useContext, Fragment, type ReactNode } from "react";

// Contexto global de navegação por coordenada. A Dashboard fornece a função que
// abre a aba Galáxia já na galáxia daquela coordenada. Qualquer página usa
// <CoordLink c="4:2:1" /> sem precisar receber props manualmente.
export const CoordNavContext = createContext<((coords: string) => void) | null>(null);

// Coordenada clicável. Se há navegação disponível, vira link (abre a galáxia);
// senão, só texto. `label` opcional troca o texto exibido (default = a própria coord).
export function CoordLink({ c, label }: { c: string; label?: string }) {
  const nav = useContext(CoordNavContext);
  // Só as 2 primeiras partes (setor:paralelo) importam pra navegar; o slot é o planeta.
  const valid = /^\d+:\d+(:\d+)?$/.test(c);
  if (!nav || !valid) return <span className="roid-count">{label ?? c}</span>;
  return (
    <button className="coord-link" title={`Ver a galáxia ${c}`} onClick={() => nav(c)}>
      {label ?? c}
    </button>
  );
}

// Varre um texto livre e troca toda coordenada "g:s:slot" por um <CoordLink>
// clicável, mantendo o resto do texto. Usado em notícias, chat, mensagens, etc.
// Exige o slot (3 partes) pra não confundir com placar/relógio tipo "12:30".
const COORD_RE = /\b(\d{1,3}:\d{1,3}:\d{1,3})\b/g;
export function linkifyCoords(text: string): ReactNode {
  if (!text) return text;
  const out: ReactNode[] = [];
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  COORD_RE.lastIndex = 0;
  while ((m = COORD_RE.exec(text)) !== null) {
    if (m.index > last) out.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    out.push(<CoordLink key={i++} c={m[1]} />);
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return out;
}
