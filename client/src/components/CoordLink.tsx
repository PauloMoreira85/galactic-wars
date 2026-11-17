import { createContext, useContext } from "react";

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
