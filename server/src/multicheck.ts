import { prisma } from "./db.js";

// Detector AVANÇADO de multi-conta: cruza vários sinais (não só IP) e dá um
// "score de suspeita" por par de contas. Uso (no container):
//   node server/dist/multicheck.js
//
// Sinais (quanto mais batem, mais suspeito):
//   • mesmo IP                  (forte)
//   • mesmo WhatsApp            (muito forte)
//   • mesma chave PIX           (muito forte)
//   • contas criadas no mesmo minuto (médio)
//   • galáxias iguais/vizinhas  (fraco — só reforça)
// Pares legítimos liberados (AllowedPair) são marcados como [LIBERADO].

type U = { id: string; username: string; whatsapp: string | null; pixKey: string | null; createdAt: Date; galaxy: number | null; system: number | null };

function norm(s: string | null): string | null {
  if (!s) return null;
  const d = s.replace(/\D/g, ""); // só dígitos (whatsapp/pix numérico)
  return d.length >= 6 ? d.slice(-11) : (s.trim().toLowerCase() || null);
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, whatsapp: true, pixKey: true, createdAt: true,
      planet: { select: { galaxy: true, system: true } } },
  });
  const list: U[] = users.map((u) => ({
    id: u.id, username: u.username, whatsapp: u.whatsapp, pixKey: u.pixKey,
    createdAt: u.createdAt, galaxy: u.planet?.galaxy ?? null, system: u.planet?.system ?? null,
  }));

  // IPs por conta.
  const ips = await prisma.accountIp.findMany({ select: { userId: true, ip: true } });
  const ipByUser = new Map<string, Set<string>>();
  for (const r of ips) { if (!ipByUser.has(r.userId)) ipByUser.set(r.userId, new Set()); ipByUser.get(r.userId)!.add(r.ip); }

  const allowed = await prisma.allowedPair.findMany();
  const isAllowed = (a: string, b: string) => {
    const [x, y] = a < b ? [a, b] : [b, a];
    return allowed.some((p) => p.aId === x && p.bId === y);
  };

  type Hit = { a: string; b: string; score: number; reasons: string[]; allowed: boolean };
  const hits: Hit[] = [];

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j];
      const reasons: string[] = [];
      let score = 0;

      // IP em comum
      const ipA = ipByUser.get(A.id), ipB = ipByUser.get(B.id);
      const sharedIp = ipA && ipB ? [...ipA].filter((x) => ipB.has(x)) : [];
      if (sharedIp.length) { score += 3; reasons.push(`mesmo IP (${sharedIp[0]})`); }

      // WhatsApp
      const wA = norm(A.whatsapp), wB = norm(B.whatsapp);
      if (wA && wB && wA === wB) { score += 5; reasons.push(`mesmo WhatsApp (${wA})`); }

      // PIX
      const pA = norm(A.pixKey), pB = norm(B.pixKey);
      if (pA && pB && pA === pB) { score += 5; reasons.push(`mesma chave PIX`); }

      // Criadas no mesmo minuto
      if (Math.abs(A.createdAt.getTime() - B.createdAt.getTime()) < 60_000) {
        score += 2; reasons.push("criadas quase no mesmo minuto");
      }

      // Galáxias iguais (reforço)
      if (A.galaxy != null && A.galaxy === B.galaxy && A.system === B.system) {
        score += 1; reasons.push("na mesma galáxia");
      }

      if (score >= 3) hits.push({ a: A.username, b: B.username, score, reasons, allowed: isAllowed(A.id, B.id) });
    }
  }

  hits.sort((x, y) => y.score - x.score);
  console.log(`\n=== DETECTOR DE MULTI-CONTA — ${list.length} contas, ${hits.length} par(es) suspeito(s) ===\n`);
  if (hits.length === 0) { console.log("✅ Nenhum par suspeito."); }
  for (const h of hits) {
    const tag = h.allowed ? " [LIBERADO]" : "";
    const nivel = h.score >= 5 ? "🔴 ALTA" : h.score >= 4 ? "🟠 MÉDIA" : "🟡 BAIXA";
    console.log(`${nivel} (${h.score})${tag}  ${h.a}  ⇄  ${h.b}`);
    console.log(`         ${h.reasons.join(" · ")}\n`);
  }
  console.log("Obs: pares legítimos (irmãos/mesma casa) podem ser liberados com:");
  console.log("  node server/dist/multiaccount.js allow <conta1> <conta2>");
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
