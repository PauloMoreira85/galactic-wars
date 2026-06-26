import { useState } from "react";
import { getToken, clearToken } from "./api";
import { Auth } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { Ferramentas } from "./pages/Ferramentas";
import { ResetPassword } from "./pages/ResetPassword";

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  // Redefinição de senha (link do e-mail) — funciona logado ou não.
  if (window.location.pathname.replace(/\/+$/, "") === "/reset") return <ResetPassword />;
  if (!authed) return <Auth onAuthed={() => setAuthed(true)} />;
  // Ferramentas abre numa aba separada (URL /ferramentas) — dá pra consultar
  // espionagens enquanto mexe nas frotas/naves na aba principal.
  if (window.location.pathname.replace(/\/+$/, "") === "/ferramentas") {
    return <Ferramentas onClose={() => { window.location.href = "/"; }} />;
  }
  return <Dashboard onLogout={() => { clearToken(); setAuthed(false); }} />;
}
