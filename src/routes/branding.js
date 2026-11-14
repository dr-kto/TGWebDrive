import { Router, raw } from "express";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config.js";
import { metaGet, metaSet } from "../db.js";
import { requireAppAuth, requireAdmin } from "../middleware.js";

export const branding = Router();

const KEY = "branding";
const LOGO_FILE = path.join(DATA_DIR, "branding-logo");
const LOGO_MIME_KEY = "branding_logo_mime";

const DEFAULTS = {
  name: "Telegram Disk",
  accent: "#2E7CF6",
  tagline: "Secure file sharing",
  copyright: "",
  viewMode: "masonry",
  preferences: {
    chunkSize: "2mb",
    wifiAutoDownload: true,
    hdThumbnails: true,
  },
};

const ALLOWED_LOGO = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);
const MAX_LOGO = 2 * 1024 * 1024;

function readBranding() {
  let parsed = {};
  try {
    parsed = JSON.parse(metaGet(KEY, "{}") || "{}");
  } catch {
    parsed = {};
  }
  return {
    ...DEFAULTS,
    ...parsed,
    preferences: { ...DEFAULTS.preferences, ...(parsed.preferences || {}) },
  };
}

function logoVersion() {
  try {
    return String(fs.statSync(LOGO_FILE).mtimeMs || Date.now());
  } catch {
    return "";
  }
}

function publicBranding() {
  const b = readBranding();
  const hasLogo = fs.existsSync(LOGO_FILE);
  return {
    name: b.name,
    accent: b.accent,
    tagline: b.tagline,
    copyright: b.copyright,
    viewMode: b.viewMode,
    preferences: b.preferences,
    logo: hasLogo ? `/api/branding/logo?v=${logoVersion()}` : "",
  };
}

branding.get("/branding", (req, res) => {
  res.json(publicBranding());
});

branding.get("/branding/logo", (req, res) => {
  if (!fs.existsSync(LOGO_FILE)) return res.status(404).end();
  const mime = metaGet(LOGO_MIME_KEY, "image/png");
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "public, max-age=300");
  fs.createReadStream(LOGO_FILE).pipe(res);
});

function normalizeHex(v) {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(String(v || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h.toLowerCase();
}

function clean(s, max) {
  return String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
}

branding.put("/branding", requireAppAuth, (req, res) => {
  const current = readBranding();
  const body = req.body || {};
  const isAdmin = req.user?.role === "admin";
  const next = {
    name: isAdmin && body.name !== undefined ? clean(body.name, 40) || DEFAULTS.name : current.name,
    accent: isAdmin && body.accent !== undefined ? normalizeHex(body.accent) || DEFAULTS.accent : current.accent,
    tagline: isAdmin && body.tagline !== undefined ? clean(body.tagline, 80) : current.tagline,
    copyright: isAdmin && body.copyright !== undefined ? clean(body.copyright, 80) : current.copyright,
    viewMode: body.viewMode === "list" ? "list" : body.viewMode === "masonry" ? "masonry" : current.viewMode,
    preferences: body.preferences ? { ...current.preferences, ...body.preferences } : current.preferences,
  };
  metaSet(KEY, JSON.stringify(next));
  res.json({ ok: true, branding: publicBranding() });
});

branding.post("/branding/logo", requireAppAuth, requireAdmin, raw({ type: "image/*", limit: "2mb" }), (req, res, next) => {
  const mime = (req.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_LOGO.has(mime)) return res.status(400).json({ error: "Logo must be a PNG, JPEG, WebP, GIF, SVG or ICO image" });
  const buf = req.body;
  if (!Buffer.isBuffer(buf)) return res.status(400).json({ error: "Missing image data" });
  if (buf.length > MAX_LOGO) return res.status(413).json({ error: "Logo too large (max 2 MB)" });
  try {
    fs.writeFileSync(LOGO_FILE, buf);
    metaSet(LOGO_MIME_KEY, mime);
    res.json({ ok: true, logo: `/api/branding/logo?v=${logoVersion()}` });
  } catch (e) {
    next(e);
  }
});

branding.delete("/branding/logo", requireAppAuth, requireAdmin, (req, res) => {
  try { fs.unlinkSync(LOGO_FILE); } catch {}
  res.json({ ok: true });
});
