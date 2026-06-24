// ===== TABELA DE UNIDADES OFICIAL do Galactic Wars =====
// Fonte: snapshot archive.org (testes.galacticwars.com.br/toolkit/tabela_unidades.php, 2007).
// Dado CANÔNICO — substitui o modelo simplificado de 6 classes genéricas.
//
// Legenda das colunas:
//  classe: Ca=Caça Co=Corveta Fr=Fragata De=Destroyer Cr=Cruzador Na=Nave-mãe Ro=Roider
//  alvos (A1/A2/A3): classes que a nave consegue atingir (— = nenhuma)
//  ini  = Iniciativa (MENOR atira primeiro)
//  agi  = Agilidade (maior = mais difícil de ser atingida)
//  varm = Velocidade das Armas (maior = acerta mais fácil)
//  qarm = Quantidade de Armas (tiros por tick)
//  pfog = Poder de Fogo (dano por tiro). PEM (Daharan) tem pfog 0: paralisa em vez de destruir.
//  fusel= Fuselagem (quanto de dano aguenta por tick = "HP")
//  rp   = Resistência ao PEM (probabilidade de um tiro PEM falhar, %)
//  m/c/p= custo metalium/carbonum/plutonium
//  ticks= tempo de construção
//  comb = Combustível por viagem
//  tec  = Tempo Estimado de Chegada (viagem dentro da galáxia)
//  tipo = Normal | PEM | Invisivel | Assimiladora | Inseto | Roider

export type ClasseCode = "Ca" | "Co" | "Fr" | "De" | "Cr" | "Na" | "Ro";
export type RaceTable = "Humana" | "Daharan" | "Rakshasa" | "c-Mech" | "Insecta";
export type UnitTipo = "Normal" | "PEM" | "Invisivel" | "Assimiladora" | "Inseto" | "Roider";

export interface UnitRow {
  nome: string;
  race: RaceTable;
  classe: ClasseCode;
  alvos: ClasseCode[];
  ini: number; agi: number; varm: number; qarm: number; pfog: number; fusel: number; rp: number;
  m: number; c: number; p: number; ticks: number; comb: number; tec: number;
  tipo: UnitTipo;
  roider: boolean;
}

// Helper conciso: [nome, classe, [alvos], ini, agi, varm, qarm, pfog, fusel, rp, m, c, p, ticks, comb, tec, tipo]
type Raw = [string, ClasseCode, ClasseCode[], number, number, number, number, number, number, number, number, number, number, number, number, number, UnitTipo];
function rows(race: RaceTable, data: Raw[]): UnitRow[] {
  return data.map((d) => ({
    nome: d[0], race, classe: d[1], alvos: d[2],
    ini: d[3], agi: d[4], varm: d[5], qarm: d[6], pfog: d[7], fusel: d[8], rp: d[9],
    m: d[10], c: d[11], p: d[12], ticks: d[13], comb: d[14], tec: d[15],
    tipo: d[16], roider: d[16] === "Roider",
  }));
}

export const UNIT_TABLE: UnitRow[] = [
  ...rows("Humana", [
    ["Artemis", "Ca", ["Co", "Ca"], 15, 35, 35, 3, 2, 6, 45, 1300, 0, 0, 4, 10, 2, "Normal"],
    ["Perseu", "Co", ["Fr"], 37, 25, 32, 6, 3, 15, 55, 2400, 250, 0, 8, 20, 3, "Normal"],
    ["Ares", "Co", ["De", "Cr"], 41, 25, 18, 5, 5, 16, 60, 2100, 750, 0, 8, 25, 3, "Normal"],
    ["Deméter", "Fr", ["Co"], 53, 28, 40, 5, 5, 45, 65, 3200, 2500, 0, 12, 65, 4, "Normal"],
    ["Vulcano", "Fr", ["Cr", "Na"], 57, 22, 23, 4, 7, 45, 70, 4000, 1500, 0, 12, 80, 4, "Normal"],
    ["Hera", "Fr", ["Ro"], 99, 25, 1, 1, 1, 50, 55, 3200, 1700, 0, 12, 95, 4, "Roider"],
    ["Tanatos", "De", ["Ca", "Co"], 29, 23, 48, 12, 3, 67, 70, 4000, 8000, 0, 16, 135, 4, "Normal"],
    ["Netuno", "De", ["Ro"], 99, 17, 1, 2, 1, 55, 75, 10000, 2000, 0, 16, 175, 4, "Roider"],
    ["Hermes", "Cr", ["De", "Fr"], 75, 13, 22, 10, 17, 180, 70, 15000, 10000, 0, 20, 225, 5, "Normal"],
    ["Apolo", "Cr", ["Co"], 73, 10, 30, 21, 10, 200, 75, 22000, 8000, 0, 20, 350, 5, "Normal"],
    ["Hercules", "Na", ["Fr"], 83, 12, 15, 20, 27, 380, 90, 30000, 24000, 0, 24, 400, 5, "Normal"],
    ["Zeus", "Na", ["Na", "Cr"], 85, 5, 10, 20, 40, 450, 95, 70000, 16000, 0, 24, 700, 5, "Normal"],
  ]),
  ...rows("Daharan", [
    ["Osíris", "Ca", ["Co"], 2, 35, 0, 1, 0, 6, 40, 0, 1000, 0, 4, 10, 2, "PEM"],
    ["Isis", "Ca", ["Ca"], 1, 35, 0, 2, 0, 6, 45, 1000, 250, 0, 4, 10, 2, "PEM"],
    ["Hórus", "Co", ["Fr"], 4, 22, 0, 2, 0, 20, 50, 1750, 1500, 0, 8, 20, 3, "PEM"],
    ["Geb", "Co", ["De", "Cr"], 3, 22, 0, 1, 0, 20, 60, 1900, 1400, 0, 8, 40, 3, "PEM"],
    ["Seth", "Fr", ["Ro"], 99, 25, 1, 1, 1, 25, 65, 2350, 2000, 0, 12, 25, 4, "Roider"],
    ["Bastet", "Fr", ["Ca", "Co"], 5, 22, 0, 7, 0, 40, 70, 3750, 3250, 0, 12, 85, 4, "PEM"],
    ["Nut", "De", ["Fr"], 7, 20, 0, 6, 0, 55, 70, 7000, 4000, 0, 16, 160, 4, "PEM"],
    ["Sekmet", "Cr", ["Cr", "De"], 8, 14, 0, 8, 0, 185, 70, 16000, 12000, 0, 20, 320, 5, "PEM"],
    ["Anúbis", "Cr", ["Co", "Ca"], 6, 10, 0, 25, 0, 190, 75, 20000, 7000, 0, 20, 340, 5, "PEM"],
    ["Thoth", "Cr", ["Ro"], 99, 10, 1, 3, 1, 125, 80, 18000, 12500, 0, 20, 400, 5, "Roider"],
    ["Néftis", "Na", ["Na", "Cr"], 9, 5, 0, 20, 0, 300, 95, 45000, 35000, 0, 24, 700, 5, "PEM"],
    ["Amon-Rá", "Na", ["Co", "Ca"], 10, 5, 0, 95, 0, 350, 95, 50000, 36000, 0, 24, 750, 5, "PEM"],
  ]),
  ...rows("Rakshasa", [
    ["Thor", "Ca", ["Ca", "Co"], 13, 40, 45, 3, 2, 3, 30, 1200, 0, 0, 4, 10, 2, "Invisivel"],
    ["Njord", "Ca", ["Fr"], 17, 35, 30, 3, 5, 3, 25, 1200, 500, 0, 4, 10, 2, "Invisivel"],
    ["Heimdall", "Ca", ["De"], 19, 30, 30, 3, 5, 3, 30, 750, 1050, 0, 4, 10, 2, "Invisivel"],
    ["Attila", "Co", ["Co", "Ca"], 31, 28, 35, 5, 4, 12, 50, 1500, 1200, 0, 8, 20, 3, "Invisivel"],
    ["Hela", "Co", ["Ro"], 99, 32, 1, 1, 1, 9, 45, 1100, 1400, 0, 8, 25, 3, "Roider"],
    ["Fenrir", "Co", ["Cr", "Na"], 39, 32, 24, 5, 8, 10, 50, 2100, 1000, 0, 8, 35, 3, "Invisivel"],
    ["Loki", "Fr", ["De"], 49, 30, 32, 7, 7, 30, 70, 4500, 3000, 0, 12, 65, 4, "Invisivel"],
    ["Freya", "Fr", ["Cr"], 55, 25, 20, 9, 6, 35, 60, 4250, 3250, 0, 12, 75, 4, "Invisivel"],
    ["Vidar", "De", ["Ro"], 99, 20, 1, 2, 1, 50, 70, 10000, 2000, 0, 16, 175, 4, "Roider"],
    ["Baldur", "De", ["De", "Fr"], 63, 20, 35, 6, 9, 75, 65, 5000, 7000, 0, 16, 165, 4, "Invisivel"],
    ["Tyr", "Cr", ["Na", "Cr"], 69, 18, 25, 13, 25, 140, 70, 19000, 12500, 0, 20, 360, 5, "Invisivel"],
    ["Odin", "Na", ["Co", "Fr"], 79, 7, 36, 120, 4, 325, 90, 45000, 35000, 0, 24, 750, 5, "Invisivel"],
  ]),
  ...rows("c-Mech", [
    ["Caillech", "Ca", ["Ca"], 25, 25, 35, 3, 2, 7, 25, 800, 500, 0, 4, 10, 2, "Assimiladora"],
    ["Cerridwen", "Ca", ["Fr", "Co"], 27, 30, 30, 3, 5, 5, 25, 500, 800, 0, 4, 10, 2, "Assimiladora"],
    ["Gwynn", "Co", ["Co"], 43, 20, 30, 5, 6, 25, 60, 1750, 2500, 0, 8, 75, 3, "Assimiladora"],
    ["Badb", "Co", ["De", "Fr"], 45, 20, 22, 6, 6, 25, 65, 2500, 1750, 0, 8, 66, 3, "Assimiladora"],
    ["Smertrios", "Fr", ["Ro"], 99, 20, 1, 1, 1, 30, 65, 1800, 1800, 0, 12, 125, 4, "Roider"],
    ["Lugh", "Fr", ["Ca", "Co"], 59, 25, 30, 5, 5, 35, 55, 2750, 1750, 0, 12, 40, 4, "Assimiladora"],
    ["Morrigan", "Fr", ["Fr"], 61, 20, 34, 9, 6, 45, 65, 4000, 4000, 0, 12, 95, 4, "Assimiladora"],
    ["Fea", "De", ["Cr", "Na"], 67, 20, 17, 7, 18, 80, 75, 10000, 6000, 0, 16, 140, 4, "Assimiladora"],
    ["Macha", "De", ["De"], 65, 15, 23, 13, 8, 80, 65, 8500, 9500, 0, 16, 195, 4, "Assimiladora"],
    ["Scathach", "Cr", ["Cr"], 77, 10, 23, 7, 34, 165, 70, 11000, 13000, 0, 20, 420, 5, "Assimiladora"],
    ["Danu", "Na", ["Na", "Cr"], 89, 6, 10, 10, 35, 325, 90, 28500, 25500, 0, 24, 700, 5, "Assimiladora"],
    ["Cernunnos", "Na", ["Fr", "De"], 87, 5, 40, 45, 7, 355, 90, 35000, 32000, 0, 24, 800, 5, "Assimiladora"],
  ]),
  ...rows("Insecta", [
    ["Formiga", "Ca", ["Ca", "Co"], 11, 25, 32, 2, 1, 1, 5, 250, 250, 0, 4, 6, 2, "Inseto"],
    ["Abelha", "Ca", ["Cr", "Na"], 23, 30, 20, 1, 6, 5, 10, 200, 360, 0, 4, 15, 2, "Inseto"],
    ["Vespa", "Ca", ["De"], 21, 38, 28, 3, 3, 1, 15, 400, 400, 0, 4, 6, 2, "Inseto"],
    ["Mosca", "Co", ["Fr"], 35, 20, 35, 4, 5, 16, 35, 1000, 1500, 0, 8, 25, 3, "Inseto"],
    ["Besouro", "Co", ["Ro"], 99, 25, 1, 1, 1, 11, 45, 1000, 1250, 0, 8, 35, 3, "Roider"],
    ["Mosquito", "Co", ["Co", "Ca"], 33, 25, 35, 7, 3, 11, 40, 1250, 1000, 0, 8, 45, 3, "Inseto"],
    ["Aranha", "Fr", ["De", "Fr"], 51, 25, 30, 12, 4, 35, 65, 2000, 4000, 0, 12, 100, 4, "Inseto"],
    ["Louva-a-Deus", "Cr", ["Ro"], 99, 13, 1, 3, 1, 125, 70, 16000, 11500, 0, 20, 400, 5, "Roider"],
    ["Escorpião", "Cr", ["De"], 71, 13, 15, 15, 20, 160, 75, 10000, 13000, 0, 20, 350, 5, "Inseto"],
    ["Cupim", "Na", ["Na", "Cr"], 81, 26, 20, 15, 30, 250, 85, 12000, 20000, 0, 24, 750, 5, "Inseto"],
    ["Gafanhoto", "Na", ["Ca", "Co"], 47, 20, 35, 40, 5, 280, 90, 15000, 20000, 0, 24, 650, 5, "Inseto"],
    ["Rainha", "Na", [], 91, 7, 0, 0, 0, 300, 90, 20000, 35000, 0, 24, 1000, 5, "Inseto"],
  ]),
];

export const RACE_TABLE_KEYS: RaceTable[] = ["Humana", "Daharan", "Rakshasa", "c-Mech", "Insecta"];
export function unitsByRace(race: RaceTable) {
  return UNIT_TABLE.filter((u) => u.race === race);
}
