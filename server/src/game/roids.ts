import { prisma, TX_OPTS, withWrite } from "../db.js";
import { ResourceKey, nextRoidCost } from "./constants.js";

export function totalRoids(p: {
  roidMetalium: number;
  roidCarbonum: number;
  roidPlutonium: number;
}) {
  return p.roidMetalium + p.roidCarbonum + p.roidPlutonium;
}

const ROID_FIELD: Record<ResourceKey, "roidMetalium" | "roidCarbonum" | "roidPlutonium"> = {
  metalium: "roidMetalium",
  carbonum: "roidCarbonum",
  plutonium: "roidPlutonium",
};

// Produz `count` roids focados em `resource`, pagando o custo ESCALONADO (cada roid
// fica mais caro). Inicia quantos der com o recurso disponível, até `count`. Lança
// Error só se não der pra iniciar NENHUM. Retorna o planeta atualizado.
export async function buildRoid(planetId: string, resource: ResourceKey, count = 1) {
  const want = Math.max(1, Math.min(1000, Math.floor(count))); // teto de segurança
  return withWrite(() => prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId } });
    if (!planet) throw new Error("Planeta nao encontrado");

    const field = ROID_FIELD[resource];
    let have = { metalium: planet.metalium, carbonum: planet.carbonum, plutonium: planet.plutonium };
    let roidsNow = planet[field];
    let built = 0;
    let spent = { metalium: 0, carbonum: 0, plutonium: 0 };
    // Soma o custo progressivo de cada roid até acabar o recurso ou atingir `want`.
    for (let i = 0; i < want; i++) {
      const cost = nextRoidCost(resource, roidsNow);
      if (have.metalium < cost.metalium || have.carbonum < cost.carbonum || have.plutonium < cost.plutonium) break;
      have.metalium -= cost.metalium; have.carbonum -= cost.carbonum; have.plutonium -= cost.plutonium;
      spent.metalium += cost.metalium; spent.carbonum += cost.carbonum; spent.plutonium += cost.plutonium;
      roidsNow++; built++;
    }
    if (built === 0) throw new Error("Recursos insuficientes para iniciar a mineração do roid");

    return tx.planet.update({
      where: { id: planetId },
      data: {
        metalium: { decrement: spent.metalium },
        carbonum: { decrement: spent.carbonum },
        plutonium: { decrement: spent.plutonium },
        [field]: { increment: built },
        morale: { increment: built }, // +1 moral por roid iniciado
      },
    });
  }, TX_OPTS));
}
