import { useState } from "react";
import { getToken } from "./api";
import { Auth } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  if (!authed) return <Auth onAuthed={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => setAuthed(false)} />;
}
