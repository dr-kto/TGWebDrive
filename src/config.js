import "dotenv/config";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(ROOT, "data");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const UPLOAD_TMP = path.join(DATA_DIR, "uploads");

for (const d of [DATA_DIR, UPLOAD_TMP]) fs.mkdirSync(d, { recursive: true });

// Auto-generate and persist SECRET in .env on first run so sessions stay valid across restarts.
function readOrCreateSecret() {
  if (process.env.SECRET && process.env.SECRET.length >= 32) return process.env.SECRET;
  const envFile = path.join(ROOT, ".env");
  if (fs.existsSync(envFile)) {
    const raw = fs.readFileSync(envFile, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^SECRET=(.+)$/);
      if (m && m[1].trim().length >= 32) return m[1].trim();
    }
    const gen = randomBytes(32).toString("hex");
    const updated = /^SECRET=.*$/m.test(raw)
      ? raw.replace(/^SECRET=.*$/m, `SECRET=${gen}`)
      : `${raw.replace(/\s*$/, "")}\nSECRET=${gen}\n`;
    try {
      fs.writeFileSync(envFile, updated, { mode: 0o600 });
    } catch {}
    return gen;
  }
  const gen = randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(envFile, `SECRET=${gen}\n`, { mode: 0o600 });
  } catch {}
  return gen;
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  host: process.env.HOST || "127.0.0.1",
  secret: readOrCreateSecret(),
  publicUrl: (process.env.PUBLIC_URL || "https://drive.dotplushq.online").replace(/\/$/, ""),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 2 * 1024 * 1024 * 1024,
  // Telegram caps a single non-premium upload at ~2 GiB. Anything larger is
  // transparently split into <=2 GiB parts on disk and reassembled on download.
  splitPartBytes: Number(process.env.SPLIT_PART_BYTES) || Math.floor(1.9 * 1024 * 1024 * 1024),
  apiPresets: (process.env.API_PRESETS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [id, hash] = s.split(":");
      return { id: id.trim(), hash: hash.trim() };
    }),
  isProd: process.env.NODE_ENV === "production",
};
