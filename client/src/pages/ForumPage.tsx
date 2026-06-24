import { Forum } from "./Forum";

// Página separada do Fórum do Universo (URL própria: /forum).
export function ForumPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="page-wrap">
      <header className="page-head">
        <button className="menu-link" style={{ width: "auto" }} onClick={onClose}>‹ Voltar ao jogo</button>
        <div className="page-title">FÓRUM DO UNIVERSO</div>
      </header>
      <main className="page-main">
        <Forum />
      </main>
    </div>
  );
}
