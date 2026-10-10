const nodemailer = require("nodemailer");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

function line(value, max) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function transport() {
  const env = process.env;
  if (env.MAIL_DRY_RUN === "1") return nodemailer.createTransport({ jsonTransport: true });
  const port = Number(env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method" });
    return;
  }

  const env = process.env;
  const required = env.MAIL_DRY_RUN === "1" ? ["MAIL_TO"] : ["MAIL_TO", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    console.error(`Missing env: ${missing.join(", ")}`);
    res.status(500).json({ error: "not_configured" });
    return;
  }

  const data = req.body && typeof req.body === "object" ? req.body : {};
  if (data.website) {
    res.status(200).json({ ok: true });
    return;
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  if (rateLimited(ip)) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const name = line(data.name, 200);
  const email = line(data.email, 200);
  const phone = line(data.phone, 50);
  const lang = line(data.lang, 10);
  const message = typeof data.message === "string" ? data.message.trim().slice(0, 2000) : "";
  if (!name || !EMAIL.test(email)) {
    res.status(422).json({ error: "invalid" });
    return;
  }

  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || "-"}`,
    `Language: ${lang || "-"}`,
    `Form: ${data.source === "consult-dialog-form" ? "pop-up" : "page section"}`,
    "",
    message || "(no message)"
  ].join("\n");

  try {
    await transport().sendMail({
      from: env.MAIL_FROM || env.SMTP_USER,
      to: env.MAIL_TO,
      replyTo: { name, address: email },
      subject: `Consultation request: ${name}`,
      text
    });
    if (env.MAIL_DRY_RUN === "1") console.log(`[dry run] would email ${env.MAIL_TO}:\n${text}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`Sending failed: ${err.message}`);
    res.status(502).json({ error: "send_failed" });
  }
};
