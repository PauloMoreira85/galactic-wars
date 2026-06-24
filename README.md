# 🪐 Galactic Wars

Recriação de um jogo de estratégia espacial **tick-based multiplayer** de navegador
(linhagem Planetarion / OGame), centrado em **asteroides ("roids")**.

## Conceito

O universo avança em **ticks** (por padrão 1 por hora). A cada tick os roids produzem
recursos, construções/pesquisas avançam, frotas se movem e batalhas resolvem.

### Recursos
- **Metalium** — cascos e estruturas
- **Carbonum** — combustível e blindagem
- **Plutonium** — pesquisa e armas avançadas

### Roids (asteroides) — o coração do jogo
- Cada roid é focado em **1 recurso** e o produz a cada tick.
- **Produzir** roid: custo que **escala** com o total de roids que você tem.
- **Roubar** roid: vencendo uma batalha você leva uma **% dos roids do alvo**,
  respeitando a distribuição dele por recurso.

### Frota (progressão por pesquisa + construção)
Caça → Corveta → Fragata → Destroyer → Cruzador → Nave-mãe.

### Raças (escolhidas no registro, permanentes)
| Raça | Identidade | Efeito mecânico |
|------|-----------|-----------------|
| **Humanos** | Naves resistentes | +30% de casco/resistência |
| **Daharan** | Pacíficos, PEM | Tiros *paralisam* (não destroem) + atiram primeiro |
| **Rakshasa** | Furtivos | Invisíveis no radar; só frotas que roubam roids aparecem |
| **Mech** | Auto-replicantes | Chance de clonar nave ao acertar; constroem naves de todas as raças |
| **Insecta** | Enxame | Naves frágeis (-40% casco) mas baratas (-50% custo); vencem no número |

Os efeitos de combate (PEM, furtividade, clonagem) entram nas Fases 3–5; a escolha já é
armazenada e os modificadores ficam em [server/src/game/races.ts](server/src/game/races.ts).

## Stack
- **server/** — Node.js + TypeScript + Express + Prisma (SQLite no dev, PostgreSQL na prod)
- **client/** — React + Vite + TypeScript
- Motor de tick agendado dentro do servidor.

## Como rodar (dev)

```bash
npm install
npm run db:setup        # gera o banco SQLite + dados iniciais
npm run dev             # sobe server (3001) + client (5173)
```

Abra http://localhost:5173

## Status (roadmap)
- [x] **Fase 1** — Fundação: contas, login, 1 planeta por jogador
- [x] **Fase 2** — Economia: roids (custo escalável), 3 recursos, motor de tick
- [x] **Raças** — 5 raças jogáveis com traits (escolha no registro)
- [x] **Fase 3** — Frota + **Pesquisa & Construção**: sistema de tecnologias/construções por níveis em 4 categorias — **Mineração** (+5%/nível na produção dos roids), **TEC/Propulsão** (−4%/nível no tempo de viagem), **Inteligência/Espionagem** (espionar planetas), **Naves** (ciclo: pesquisa a classe → constrói a fábrica → produz; a fábrica libera a próxima classe). `shipCostModifier` da raça aplicado.
- [x] **Fase 4** — Mapa da galáxia, envio de frotas (viagem em ticks), tela "Tráfego atual", retorno automático
- [x] **Fase 5** — Combate **ao vivo** (engajamento de 3 ticks, **sem vencedor** — as duas frotas perdem naves e a atacante volta com o que sobrou). **Recuo a qualquer momento.** Captura de roids **por tick (máx 5%, diminuindo se o ataque >> defesa)**, carregada de volta. Relatório (Início/Perdidas/PEM/Sobrev.). Traits ativos (PEM Daharan = paralisa + atira 1º, clone Mech, surpresa Rakshasa). Regra: só ataca outra galáxia; jogadores espalhados por 9 galáxias.
- [ ] **Fase 6** — Alianças (cruzam galáxias, entre jogadores; cargos: Líder/Alto comando/DC/Scanner/Porta Voz/Recrutas) & ranking
- [ ] **Fase 7** — Sistemas dos prints: Moral, Pontuação, Inteligência/Agentes, Sabotagem, modo férias
- [ ] **Fase 8** — Polimento visual e balanceamento

### Naves (6 classes universais, nomes temáticos por raça)
Caça · Corveta · Fragata · Destroyer · Cruzador · Nave-mãe. Catálogo e stats em
[server/src/game/ships.ts](server/src/game/ships.ts).
- **Humanos** — deuses gregos/romanos (Hermes, Apolo, Ares, Tânatos, Vulcano, Hades)
- **Rakshasa** — deuses nórdicos (Loki, Heimdall, Njord, Frigg, Thor, Odin)
- **Daharan** — deuses egípcios (Bastet, Tóth, Hórus, Set, Anúbis, Rá)
- **Insecta** — insetos (Formiga, Vespa, Gafanhoto, Louva-Deus, Escorpião, Rainha)
- **Mech** — linha mecânica própria; clona naves inimigas em combate (Fase 5)
