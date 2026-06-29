import { useEffect, useState } from "react";
import { api, type AdminAd, type AdInput } from "../api";

const MAX_IMG = 200_000; // ~200KB (igual ao servidor)

const PLACEMENT_LABELS: Record<string, string> = {
  landing: "Landing (tela de login)",
  cadastro: "Cadastro (criar conta)",
  game: "Dentro do jogo",
  round: "Tela de round (escolha de raça)",
  todas: "Em todos os lugares",
};

const EMPTY: AdInput = { title: "", imageUrl: "", linkUrl: "", caption: "", placement: "game", active: true, sortOrder: 0 };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function Admin() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [ads, setAds] = useState<AdminAd[]>([]);
  const [form, setForm] = useState<AdInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setAds((await api.adminAds()).ads); } catch (e: any) { setErr(e.message ?? "Falha"); }
  }
  useEffect(() => {
    api.me().then((v) => {
      setAllowed(v.admin);
      if (v.admin) load();
    }).catch(() => setAllowed(false));
  }, []);

  function reset() { setForm(EMPTY); setEditingId(null); setErr(""); }
  function edit(ad: AdminAd) {
    setEditingId(ad.id);
    setForm({ title: ad.title, imageUrl: ad.imageUrl, linkUrl: ad.linkUrl, caption: ad.caption ?? "", placement: ad.placement, active: ad.active, sortOrder: ad.sortOrder });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = await fileToDataUrl(f);
    if (url.length > MAX_IMG) { setErr(`Imagem grande demais (~${Math.round(url.length / 1024)}KB). Máx ~${MAX_IMG / 1024}KB — comprima/reduza.`); return; }
    setErr("");
    setForm((s) => ({ ...s, imageUrl: url }));
  }

  async function save() {
    setErr(""); setBusy(true);
    try {
      if (!form.title.trim() || !form.imageUrl || !form.linkUrl.trim()) throw new Error("Preencha título, imagem e link.");
      if (editingId) await api.adminAdUpdate(editingId, form);
      else await api.adminAdCreate(form);
      reset(); await load();
    } catch (e: any) { setErr(e.message ?? "Falha ao salvar"); }
    finally { setBusy(false); }
  }

  async function toggle(ad: AdminAd) { await api.adminAdUpdate(ad.id, { active: !ad.active }).catch(() => {}); load(); }
  async function remove(ad: AdminAd) {
    if (!confirm(`Remover o anúncio "${ad.title}"?`)) return;
    await api.adminAdDelete(ad.id).catch(() => {}); load();
  }

  if (allowed === null) return <div className="app" style={{ padding: 24 }}><div className="roid-count">Carregando…</div></div>;
  if (!allowed) return (
    <div className="app" style={{ padding: 24 }}>
      <div className="panel"><h2>Acesso restrito</h2><div className="cost">Esta área é só para administradores. (Configure <code>ADMIN_USERS</code> no servidor com o seu nome de líder.)</div></div>
    </div>
  );

  return (
    <div className="app" style={{ display: "block", padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>🛠️ Admin — Anunciantes</h1>
        <a className="link" href="/">← voltar ao jogo</a>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>{editingId ? "Editar anúncio" : "Novo anúncio"}</h2>
        <label className="sub">Título (nome do anunciante)</label>
        <input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} placeholder="Ex.: Pizzaria do Zé" />

        <label className="sub">Banner (imagem)</label>
        <input type="file" accept="image/*" onChange={pickFile} />
        <div className="roid-count">Ou cole uma URL de imagem:</div>
        <input value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl} onChange={(e) => setForm((s) => ({ ...s, imageUrl: e.target.value }))} placeholder="https://…/banner.png" />
        {form.imageUrl && (
          <div style={{ margin: "8px 0" }}>
            <img src={form.imageUrl} alt="prévia" style={{ maxWidth: "100%", maxHeight: 120, borderRadius: 8, border: "1px solid var(--border)" }} />
          </div>
        )}

        <label className="sub">Link (ao clicar)</label>
        <input value={form.linkUrl} onChange={(e) => setForm((s) => ({ ...s, linkUrl: e.target.value }))} placeholder="https://…" />

        <label className="sub">Legenda (opcional)</label>
        <input value={form.caption ?? ""} onChange={(e) => setForm((s) => ({ ...s, caption: e.target.value }))} placeholder="Texto curto sob o banner" />

        <label className="sub">Onde aparece</label>
        <select value={form.placement ?? "game"} onChange={(e) => setForm((s) => ({ ...s, placement: e.target.value as any }))}
          style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px", width: "100%" }}>
          {Object.entries(PLACEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "8px 0", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))} style={{ width: "auto" }} /> Ativo
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            Ordem <input type="number" value={form.sortOrder ?? 0} onChange={(e) => setForm((s) => ({ ...s, sortOrder: Number(e.target.value) }))} style={{ width: 70, margin: 0 }} />
          </label>
        </div>

        {err && <div className="error">{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button disabled={busy} onClick={save}>{busy ? "..." : editingId ? "Salvar alterações" : "Criar anúncio"}</button>
          {editingId && <button className="link" onClick={reset}>cancelar edição</button>}
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Anúncios ({ads.length})</h2>
        {ads.length === 0 ? <div className="roid-count">Nenhum anúncio ainda.</div> : (
          <table>
            <thead><tr><th>Banner</th><th>Título</th><th>Local</th><th>Ordem</th><th>Cliques</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {ads.map((ad) => (
                <tr key={ad.id} style={{ opacity: ad.active ? 1 : 0.5 }}>
                  <td><img src={ad.imageUrl} alt={ad.title} style={{ height: 36, borderRadius: 4 }} /></td>
                  <td><b>{ad.title}</b><div className="roid-count">{ad.linkUrl}</div></td>
                  <td className="roid-count">{PLACEMENT_LABELS[ad.placement] ?? ad.placement}</td>
                  <td>{ad.sortOrder}</td>
                  <td>{ad.clicks}</td>
                  <td><button className="link" onClick={() => toggle(ad)}>{ad.active ? "🟢 ativo" : "⚫ inativo"}</button></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => edit(ad)}>editar</button>{" "}
                    <button className="link" style={{ color: "var(--danger)" }} onClick={() => remove(ad)}>remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
