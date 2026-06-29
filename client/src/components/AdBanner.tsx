import { useEffect, useState } from "react";
import { api, type Ad, type AdPlacement } from "../api";

const CONTACT = "mailto:contato@galacticwar.com.br?subject=Patroc%C3%ADnio%20Galactic%20Wars";

// Banner de anunciantes. variant "stack" (landing, vertical) ou "strip" (faixa no jogo).
// placement filtra os anúncios pelo local. Sem anúncios: na landing mostra o
// convite "seu anúncio aqui"; nos demais lugares some.
export function AdBanner({ variant = "strip", label = true, placement }: { variant?: "stack" | "strip"; label?: boolean; placement?: AdPlacement }) {
  const [ads, setAds] = useState<Ad[]>([]);
  useEffect(() => { api.ads(placement).then((d) => setAds(d.ads)).catch(() => {}); }, [placement]);

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
