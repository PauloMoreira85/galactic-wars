import * as webpushNs from "web-push";
import { prisma } from "../db.js";

// web-push é CommonJS: em ESM o default pode vir sob .default ou no próprio ns.
const webpush: typeof import("web-push") = (webpushNs as any).default ?? webpushNs;

// ===== Web Push (notificações com o app fechado) =====
// Chaves VAPID: a PÚBLICA é exposta ao cliente (/api/push/key); a PRIVADA vem do
// .env (VAPID_PRIVATE). Sem as duas, o push fica DESLIGADO (não quebra o jogo).
const VAPID_PUBLIC = process.env.VAPID_PUBLIC ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:contato@galacticwar.com.br";

export const PUSH_ENABLED = !!(VAPID_PUBLIC && VAPID_PRIVATE);
if (PUSH_ENABLED) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export function pushPublicKey(): string {
  return VAPID_PUBLIC;
}

// Salva (ou atualiza) a inscrição de um dispositivo do usuário.
export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Inscrição inválida");
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}

export async function removeSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

// Push do CHAT DO UNIVERSO: avisa só quem TEM inscrição de push E optou por receber
// (tag chatuniverso é opt-in). Itera os inscritos (conjunto pequeno), menos o autor.
export async function pushChatUniverso(exceptUserId: string, author: string, body: string) {
  if (!PUSH_ENABLED) return;
  const subs = await prisma.pushSubscription.findMany({ select: { userId: true }, distinct: ["userId"] });
  for (const s of subs) {
    if (s.userId === exceptUserId) continue;
    pushToUser(s.userId, { title: "🌌 Chat do Universo", body: `${author}: ${body.slice(0, 120)}`, tag: "chatuniverso", url: "/" }).catch(() => {});
  }
}

// Envia uma notificação push a TODOS os dispositivos de um usuário.
// Remove inscrições mortas (410/404) automaticamente. Nunca lança (best-effort).
export async function pushToUser(userId: string, payload: { title: string; body: string; tag?: string; url?: string }) {
  if (!PUSH_ENABLED) return;
  // Respeita as preferências do jogador (notifOff = tags desligadas).
  // Regra geral: vazio/null = recebe tudo. EXCEÇÃO: "chatuniverso" é opt-in (barulhento)
  // — só envia se o jogador tem prefs salvas e NÃO desligou esse tipo.
  if (payload.tag) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { notifOff: true } });
    let off: string[] = [];
    try { off = u?.notifOff ? JSON.parse(u.notifOff) : []; } catch { off = []; }
    if (off.includes(payload.tag)) return;
    if (payload.tag === "chatuniverso" && u?.notifOff == null) return; // opt-in: sem prefs = não recebe
  }
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return;
  const data = JSON.stringify({
    title: payload.title, body: payload.body,
    tag: payload.tag ?? "gw", url: payload.url ?? "/",
  });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data);
    } catch (e: any) {
      const code = e?.statusCode;
      if (code === 410 || code === 404) await removeSubscription(s.endpoint); // dispositivo removeu o app
    }
  }));
}
