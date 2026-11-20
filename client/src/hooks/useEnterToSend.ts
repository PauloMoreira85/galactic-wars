import { useState } from "react";

// Preferência "Enviar com Enter" (ligado/desligado), compartilhada entre Chat e
// Mensagens e lembrada no navegador. Desligado = Enter quebra linha, só o botão envia.
const KEY = "gw_enter_to_send";

function read(): boolean {
  try { const v = localStorage.getItem(KEY); return v == null ? true : v === "1"; }
  catch { return true; } // default: ligado
}

export function useEnterToSend(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState<boolean>(read);
  function set(v: boolean) {
    setOn(v);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignora (modo privado) */ }
  }
  return [on, set];
}
