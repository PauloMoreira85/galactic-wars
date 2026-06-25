import nodemailer from "nodemailer";

// SMTP vem do .env (preenchido depois de criar a caixa contato@). Se não estiver
// configurado, sendMail retorna false e o chamador loga o link (útil pra testar).
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.MAIL_FROM ?? user ?? "contato@galacticwar.com.br";

export const mailConfigured = !!(host && user && pass);

let transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  if (!mailConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user: user!, pass: pass! } });
  }
  return transporter;
}

// Envia um e-mail. true = enviado; false = SMTP não configurado ou erro.
export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({ from, to, subject, html });
    return true;
  } catch (e) {
    console.error("[email] falha ao enviar:", e);
    return false;
  }
}
