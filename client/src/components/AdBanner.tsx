import { useEffect, useState } from "react";
import { api, type Ad } from "../api";

const CONTACT = "mailto:contato@galacticwar.com.br?subject=Patroc%C3%ADnio%20Galactic%20Wars";

// Banner de anunciantes. variant "stack" (landing, vertical) ou "strip" (faixa no jogo).
// Sem anúncios ativos: na landing mostra o convite "seu anúncio aqui"; no jogo some.
export function AdBanner({ variant = "strip", label = true }: { variant?: "stack" | "strip"; label?: boolean }) {
  const [ads, setAds] = useState<Ad[]>([]);
  useEffect(() => { api.ads().then((d) => setAds(d.ads)).catch(() => {}); }, []);

  if (ads.length === 0) {
    if (variant !== "stack") return null;
    return (
      <div className="landing-sponsors">
        <div className="sponsor-label">Patrocínio</div>
        <a className="sponsor-slot" href={CONTACT}>📣 Seu anúncio aqui — fale com a gente: contato@galacticwar.com.br</a>
      </div>
    );
  }

  const open = (ad: Ad) => { api.adClick(ad.id); window.open(ad.linkUrl, "_blank", "noopener,noreferrer"); };

  return (
    <div className={`ads ads-${variant}`}>
      {label && <div className="sponsor-label">Patrocínio</div>}
      <div className="ads-row">
        {ads.map((ad) => (
          <button key={ad.id} type="button" className="ad-card" title={ad.title} onClick={() => open(ad)}>
            <img src={ad.imageUrl} alt={ad.title} loading="lazy" />
            {ad.caption && <span className="ad-cap">{ad.caption}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
