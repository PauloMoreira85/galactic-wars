// Glossário central dos jargões do jogo. Usado pelo <Termo> pra mostrar um
// tooltip explicativo pro novato em qualquer tela.
export const GLOSSARIO: Record<string, string> = {
  AE: "Agente de Espionagem — força ofensiva dos seus agentes (P/M/T/D) numa missão. Compete contra o CE do alvo.",
  CE: "Contra-Espionagem — agentes de defesa. Barram espiões e sabotadores inimigos. Quanto mais CE acima do AE do atacante, menor a chance dele passar.",
  AC: "Agente de Contra-Espionagem — o mesmo que CE (defesa contra espiões/sabotadores).",
  AM: "Ataque (Militar) — na calculadora, o lado atacante. Você pode importar a frota de uma espionagem.",
  AD: "Defesa — na calculadora, o lado defensor. Pode importar a frota espionada do alvo.",
  TEC: "Tempo de viagem da frota em ticks. Cai com a pesquisa de Deslocamento (naves mais rápidas chegam antes).",
  PEM: "Pulso Eletromagnético — paralisa naves inimigas por um tick (elas sobrevivem, mas não atiram).",
  CMA: "Capacidade Máxima de Assimilação — quanto de naves inimigas suas assimiladoras conseguem converter.",
  roid: "Asteroide — cada roid produz 1 recurso por tick. É sua renda passiva; roiders roubam os roids do alvo.",
  roids: "Asteroides — cada um produz 1 recurso por tick. Roiders roubam os roids do alvo no ataque.",
  CG: "Comandante da Galáxia — líder eleito da galáxia; gerencia o fundo de recursos e a defesa.",
  roider: "Nave que, em vez de atirar, rouba roids do alvo. Cada uma rouba Qarm roids por tick de ataque.",
};

// Mostra um termo com tooltip. Se não houver texto pra ele, só renderiza o termo.
export function Termo({ k, children }: { k: string; children?: React.ReactNode }) {
  const desc = GLOSSARIO[k];
  if (!desc) return <>{children ?? k}</>;
  return (
    <abbr title={desc} style={{ textDecoration: "underline dotted", textUnderlineOffset: 2, cursor: "help" }}>
      {children ?? k}
    </abbr>
  );
}
