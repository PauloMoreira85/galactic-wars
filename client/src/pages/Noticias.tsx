import { useEffect, useState } from "react";
import { api, REFRESH_MS } from "../api";

export function Noticias() {
  const [news, setNews] = useState<{ tick: number; message: string }[]>([]);
  async function load() { try { setNews((await api.news()).news); } catch {} }
  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, []);

  return (
    <div className="panel">
      <h2>Notícias</h2>
      {news.length === 0 ? (
        <div className="roid-count">Nenhuma notícia ainda.</div>
      ) : (
        <table>
          <thead><tr><th>Tick</th><th>Evento</th></tr></thead>
          <tbody>
            {news.map((n, i) => (
              <tr key={i}><td className="rank-num">#{n.tick}</td><td>{n.message}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
