# ⚖️ Teste de Balanceamento das Raças — distorções encontradas

Testes feitos com o **motor real** de combate (`simulateCombat`), frotas de custo
equivalente (20M em M+C), cruzando todas as raças. Script: `server/scripts/balance-test.ts`.
Rodar: `npx tsx server/scripts/balance-test.ts`.

---

## 🔴 Distorção 1 — Zeus (nave-mãe Humana) é quase imbatível

Em combate de nave-mãe contra nave-mãe, o **Zeus destrói 100 de qualquer
nave-mãe inimiga SEM PERDER UMA ÚNICA NAVE**:

| Zeus x | Resultado |
|---|---|
| Hercules (Humana) | Zeus 100 vivos · inimigo **0** |
| Amon-Rá (Daharan) | Zeus 100 · inimigo **0** |
| Odin (Rakshasa)   | Zeus 100 · inimigo **0** |
| Danu (c-Mech)     | Zeus 91 · inimigo **0** |
| Cupim (Insecta)   | **Zeus 0** · Cupim 76 (único que vence) |

**Causa:** Zeus tem Ini 85 (atira cedo), mira `Na,Cr` (acerta nave-mãe), fusel 450
(resistência altíssima) e pfog 40 (dano alto). As naves-mãe das outras raças ou
**não miram "Na"** (não revidam no Zeus) ou são frágeis demais. Só o Cupim (Insecta)
o supera, por mirar "Na,Cr" com volume.

**Efeito no jogo:** quem joga de Humano com nave-mãe tem vantagem desproporcional.
No placar agregado: **Humana 10V / 0D**, todas as outras 0 vitórias.

**Sugestões de correção (uma ou combinação):**
- Reduzir o fusel do Zeus (450 → ~350) ou o pfog (40 → ~30).
- Garantir que as naves-mãe das outras raças mirem "Na" (hoje Hercules mira só "Fr",
  Amon-Rá só "Co/Ca", Odin só "Co/Fr" — nenhuma acerta nave-mãe).
- Subir o custo do Zeus (hoje 70000M+16000C).

---

## 🔴 Distorção 2 — Daharan não consegue matar (empate eterno)

O ataque Daharan **só paralisa (PEM), nunca destrói**. Contra uma frota resistente,
ele **não causa nenhuma baixa real** — nem em 10 ticks:

```
Daharan atk x Humana (10 ticks): indefinido
  Humana: Tanatos 500, Hermes 200, Apolo 150, Zeus 50  ← NENHUMA baixa
```

**Causa:** TODAS as naves de combate Daharan são tipo "PEM" (paralisam). Naves
paralisadas sobrevivem e voltam. Se o Daharan não tem nenhuma nave que destrói,
o combate dele vira empate perpétuo — ele trava o inimigo mas não resolve.

**Efeito no jogo:** Daharan é um "muro" impenetrável na defesa (quase não perde
nada), mas **inútil no ataque** (não conquista nada). No agregado quase todos os
confrontos Daharan terminam 100%/100% ou ~95%/100%.

**Sugestões:**
- Dar ao Daharan **pelo menos uma nave que destrói** (não-PEM), pra ter poder ofensivo.
- Ou: naves paralisadas por X ticks seguidos passam a ser destruídas / sofrem dano.
- Ou: reduzir a duração/eficácia do PEM pra a frota inimiga revidar e o combate andar.

---

## 🟡 Distorção 3 — c-Mech frágil em frota pequena

Em frotas pequenas/médias o c-Mech atacando apanha muito (sobra 2–14% em vários
confrontos). Em frota grande melhora (chega a assimilar e CRESCER: 1540 naves vs
Insecta). A fragilidade é real mas menos crítica que as duas acima, e em parte é
o preço de design da assimilação.

**Sugestão (leve):** revisar o fusel das naves c-Mech menores (Caillech/Cerridwen),
ou o custo da assimilação, pra o c-Mech atacante não derreter em escala pequena.

---

## Observação metodológica

Muitos confrontos dão "indefinido / 100% x 100%" porque o combate é **pedra-papel-
tesoura por classe** (cada nave só acerta certas classes). Isso é intencional. O que
NÃO é saudável: frotas realistas inteiras que não se tocam, e os dois casos vermelhos
acima (Zeus imbatível, Daharan que não mata). Esses dois desequilibram de verdade.
