import { createServer } from "node:http";
import nodemailer from "nodemailer";

const env = process.env;
const PORT = Number(env.PORT || 3000);
const DRY_RUN = env.MAIL_DRY_RUN === "1";
const MAIL_TO = env.MAIL_TO;
const MAIL_FROM = env.MAIL_FROM || env.SMTP_USER;

const required = DRY_RUN ? ["MAIL_TO"] : ["MAIL_TO", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
const missing = required.filter((key) => !env[key]);
if (missing.length) {
  console.error(`Missing settings in .env: ${missing.join(", ")}`);
  process.exit(1);
}

const port = Number(env.SMTP_PORT || 587);
const transport = DRY_RUN
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });

if (!DRY_RUN) {
  transport.verify().then(
    () => console.log(`SMTP login to ${env.SMTP_HOST} works`),
    (err) => console.error(`SMTP check failed, requests will not be delivered: ${err.message}`),
  );
}

// Per-visitor limit; Caddy sets X-Forwarded-For to the real client address.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(ip);
}, WINDOW_MS).unref();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const line = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

function reply(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  if (req.url === "/api/health") return reply(res, 200, { ok: true });
  if (req.url !== "/api/consult" || req.method !== "POST") return reply(res, 404, { error: "not_found" });

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16000) return reply(res, 413, { error: "too_large" });
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return reply(res, 400, { error: "bad_json" });
  }

  // Bots fill the hidden "website" field; answer as if it worked and drop it.
  if (data.website) return reply(res, 200, { ok: true });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  if (rateLimited(ip)) return reply(res, 429, { error: "rate_limited" });

  const name = line(data.name, 200);
  const email = line(data.email, 200);
  const phone = line(data.phone, 50);
  const lang = line(data.lang, 10);
  const message = typeof data.message === "string" ? data.message.trim().slice(0, 2000) : "";
  if (!name || !EMAIL.test(email)) return reply(res, 422, { error: "invalid" });

  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || "-"}`,
    `Language: ${lang || "-"}`,
    `Form: ${data.source === "consult-dialog-form" ? "pop-up" : "page section"}`,
    "",
    message || "(no message)",
  ].join("\n");

  try {
    await transport.sendMail({ from: MAIL_FROM, to: MAIL_TO, replyTo: { name, address: email }, subject: `Consultation request: ${name}`, text });
    if (DRY_RUN) console.log(`[dry run] would email ${MAIL_TO}:\n${text}`);
    reply(res, 200, { ok: true });
  } catch (err) {
    console.error(`Sending failed: ${err.message}`);
    reply(res, 502, { error: "send_failed" });
  }
}).listen(PORT, () => console.log(`Mailer listening on ${PORT}${DRY_RUN ? " (dry run, nothing is sent)" : ""}`));
