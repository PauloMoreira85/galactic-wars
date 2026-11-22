import { useState } from "react";

// Raças que já têm trailer em /art/videos/raca-<key>.mp4.
// (c-Mech usa a chave interna 'mech' → arquivo raca-mech.mp4)
const RACES_WITH_TRAILER = new Set(["humanos", "daharan", "rakshasa", "mech", "insecta"]);

/**
 * Botão "▶ Trailer" que abre o vídeo de apresentação da raça num modal (com som).
 * Só renderiza se a raça tiver trailer. Reutilizável na landing e na escolha de raça.
 */
export function TrailerButton({ raceKey, label = "▶ Trailer" }: { raceKey: string; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!RACES_WITH_TRAILER.has(raceKey)) return null;
  const src = `/art/videos/raca-${raceKey}.mp4`;

  return (
    <>
      <button
        type="button"
        className="trailer-btn"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        {label}
      </button>
      {open && (
        <div className="trailer-modal" onClick={() => setOpen(false)}>
          <div className="trailer-modal-inner" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="trailer-close" onClick={() => setOpen(false)} aria-label="Fechar">✕</button>
            <video src={src} autoPlay controls playsInline style={{ width: "100%", borderRadius: 10, display: "block" }} />
          </div>
        </div>
      )}
    </>
  );
}

export { RACES_WITH_TRAILER };
