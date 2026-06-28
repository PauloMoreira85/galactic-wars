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

// Produz 1 roid focado em `resource`, pagando o custo escalonado.
// Lanca Error com mensagem amigavel se nao houver recursos.
export async function buildRoid(planetId: string, resource: ResourceKey) {
  return withWrite(() => prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId } });
    if (!planet) throw new Error("Planeta nao encontrado");

    const field = ROID_FIELD[resource];
    const cost = nextRoidCost(resource, planet[field]);
    if (
      planet.metalium < cost.metalium ||
      planet.carbonum < cost.carbonum ||
      planet.plutonium < cost.plutonium
    ) {
      throw new Error("Recursos insuficientes para iniciar a mineração do roid");
    }

    return tx.planet.update({
      where: { id: planetId },
      data: {
        metalium: { decrement: cost.metalium },
        carbonum: { decrement: cost.carbonum },
        plutonium: { decrement: cost.plutonium },
        [field]: { increment: 1 },
      },
    });
  }, TX_OPTS));
}
