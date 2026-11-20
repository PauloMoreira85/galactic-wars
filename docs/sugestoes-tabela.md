# 🔧 Sugestões de melhoria da tabela de unidades

Baseado na auditoria (`server/scripts/table-audit.ts`) + nos testes de combate
(`balance-test.ts`). Iniciativa confirmada: **MENOR = atira primeiro** (combat.ts:158).

---

## ✅ O que está bem

- **Cobertura de alvos completa**: toda raça consegue acertar todas as 6 classes.
- **Daharan atira primeiro de verdade**: ini média 6 (as outras 43–59). É a raça
  mais rápida — o PEM dela paralisa antes de qualquer um reagir. Design correto.
- **Insecta = barata e numerosa**: domina eficiência de dano E resistência por
  recurso (Vespa, Abelha, Cupim, Escorpião no topo). Coerente com a identidade.

---

## 🔴 1. Poucas naves acertam NAVE-MÃE (raiz do problema do Zeus)

Quem mira a classe "Na" (nave-mãe), por raça:

| Raça | Naves que acertam nave-mãe |
|---|---|
| Humana | Vulcano, **Zeus** |
| Daharan | **só Néftis** |
| Rakshasa | Fenrir, Tyr |
| c-Mech | Fea, Danu |
| Insecta | Abelha, Cupim |

A nave-mãe é a unidade mais cara e decisiva, mas **só 9 naves no jogo inteiro a
acertam**. Isso faz o duelo de capitais depender de 1-2 naves específicas — e
quando uma raça tem a melhor delas (Zeus), ela domina.

**Sugestão:** dar a cada raça **pelo menos 2 naves sólidas** que mirem nave-mãe,
e equilibrar a nave-mãe humana (abaixo).

---

## 🔴 2. Zeus (nave-mãe Humana) forte demais

Stats: Ini 85, fusel **450** (o maior do jogo), pfog 40, mira Na+Cr. Custo 70000M.
Nos testes, destrói qualquer nave-mãe inimiga sem perder nada (só o Cupim a vence).

**Sugestão (escolher):**
- fusel 450 → **~360** (ainda a mais resistente, mas não imbatível), ou
- pfog 40 → **~30**, ou
- garantir resposta das outras nave-mãe (ponto 1).

---

## 🟡 3. Tanatos (Humana) — destroyer caro e fraco

É a nave **menos eficiente em dano** do jogo (efic 3.0): custa 12000 e bate só
36/tick. Para um Destroyer anti-caça/corveta, rende pouco pelo preço.

**Sugestão:** subir pfog (ex 67 → ~90) OU baixar o custo. Dá mais razão pra usá-la.

---

## 🟡 4. Insecta pode estar eficiente DEMAIS por recurso

Lidera dano/custo (Cupim 14.1, Escorpião 13, Vespa 11.3) **e** resistência/custo
(Abelha, Gafanhoto, Cupim no topo). "Barata e numerosa" é a identidade, mas estar
no topo das DUAS métricas pode torná-la a melhor escolha pura por recurso.

**Sugestão:** vigiar em jogo real. Se a Insecta dominar o ranking, subir levemente
o custo das naves-chave (Vespa/Escorpião) ou baixar o fusel das baratas.

---

## 🟢 5. Rakshasa frágil — OK (é design)

As 3 naves menos resistentes do jogo são Rakshasa (Thor, Njord, Heimdall). Mas é
coerente: invisíveis e rápidas, pagam com casco fino. Não mexer.

---

## Resumo de prioridade

1. **Equilibrar o Zeus** (ponto 2) — único desequilíbrio forte e isolado.
2. **Mais naves anti-nave-mãe por raça** (ponto 1) — melhora o fim de jogo.
3. Buff no **Tanatos** (ponto 3) — pequeno, melhora variedade.
4. Vigiar **Insecta** (ponto 4) — só observar por ora.
