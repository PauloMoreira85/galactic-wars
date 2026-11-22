// Escolhe qual vídeo de combate exibir no relatório, a partir do resultado.
// Biblioteca em /art/videos/: win-<atacante>-vs-<defensor>.mp4,
// lose-<defensor>-by-<atacante>.mp4. Raças: humanos/daharan/rakshasa/c-mech/insecta.

// Normaliza o nome/raça que vem do servidor (ex: "c-Mech", "Humanos") para a
// key usada no nome do arquivo.
function raceKey(raw?: string): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("mech")) return "c-mech";
  if (s.includes("human")) return "humanos";
  if (s.includes("dahar")) return "daharan";
  if (s.includes("raksha")) return "rakshasa";
  if (s.includes("insect")) return "insecta";
  return null;
}

type Row = { lost: number; pem: number; assim: number };

/**
 * Decide o vídeo do combate do ponto de vista do jogador.
 * @param iAmAtk  se o jogador é o atacante
 * @param atkRace raça do atacante (string do servidor)
 * @param defRace raça do defensor
 * @param myLost  total de naves que EU perdi
 * @param oppLost total de naves que o inimigo perdeu
 * Retorna o caminho do vídeo ou null (sem vídeo disponível).
 */
export function pickCombatVideo(
  iAmAtk: boolean,
  atkRace?: string,
  defRace?: string,
  myLost = 0,
  oppLost = 0,
): string | null {
  const atk = raceKey(atkRace);
  const def = raceKey(defRace);
  if (!atk || !def) return null;

  // Venci se o inimigo perdeu mais naves que eu (empate técnico = não vitória clara).
  const iWon = oppLost > myLost;
  const myRace = iAmAtk ? atk : def;
  const oppRace = iAmAtk ? def : atk;

  // Por ora só temos os vídeos de VITÓRIA (win-*). Os de derrota (lose-*) virão
  // depois; enquanto não existem, só mostramos vídeo pra quem venceu.
  if (iWon) {
    // Eu venci: minha raça executando a ação contra a raça inimiga.
    return `/art/videos/win-${myRace}-vs-${oppRace}.mp4`;
  }
  return null;
}
