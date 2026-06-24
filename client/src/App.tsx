import { useState } from "react";
import { getToken } from "./api";
import { Auth } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { ForumPage } from "./pages/ForumPage";
import { usePath, navigate } from "./router";

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const path = usePath();

  if (!authed) return <Auth onAuthed={() => setAuthed(true)} />;
  if (path === "/forum") return <ForumPage onClose={() => navigate("/")} />;
  return <Dashboard onLogout={() => setAuthed(false)} />;
}
