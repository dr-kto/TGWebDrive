import { Api, utils } from "telegram";
import bigInt from "big-integer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fmtBytes, classify, extOf } from "../util.js";
import { HttpError } from "./manager.js";
import { generateThumb, thumbCachePath } from "../thumb.js";

/* ---------- peers ---------- */

export function buildPeer(folder) {
  const p = typeof folder.peer_json === "string" ? JSON.parse(folder.peer_json) : folder.peer_json;
  if (!p) throw new HttpError(400, "Bad folder");
  if (p.kind === "self") return new Api.InputPeerSelf();
  if (p.kind === "channel") {
    return new Api.InputPeerChannel({
      channelId: BigInt(p.channelId),
      accessHash: BigInt(p.accessHash),
    });
  }
  if (p.kind === "chat") {
    return new Api.InputPeerChat({ chatId: BigInt(p.chatId || p.channelId) });
  }
  if (p.kind === "user") {
    return new Api.InputPeerUser({ userId: BigInt(p.userId), accessHash: BigInt(p.accessHash) });
  }
  throw new HttpError(400, "Unsupported folder type");
}

export const SAVED_PEER = { kind: "self" };

/* ---------- multipart helpers ---------- */

export function isMultipartId(id) {
  return typeof id === "string" && id.startsWith("mp_");
}

export function serializeMultipart(mp) {
  let parts = [];
  try {
    parts = JSON.parse(mp.parts_json) || [];
  } catch {}
  const mime = mp.mime || "application/octet-stream";
  return {
    id: mp.id,
    multipart: true,
    partsCount: parts.length,
    date: Math.floor(Number(mp.created_at) / 1000),
    caption: "",
    name: mp.name,
    mime,
    ext: extOf(mp.name),
    size: Number(mp.size),
    sizeText: fmtBytes(Number(mp.size)),
    kind: classify(mime, mp.name),
    isPhoto: false,
    hasThumb: false,
    width: null,
    height: null,
    duration: null,
  };
}

export function parseParts(mp) {
  try {
    return JSON.parse(mp.parts_json) || [];
  } catch {
    return [];
  }
}

/* ---------- message serialization ---------- */

function docName(doc) {
  for (const a of doc?.attributes || []) {
    if (a instanceof Api.DocumentAttributeFilename) return a.fileName;
  }
  const ext = utils.getExtension(doc) || extOf("");
  return "file" + (ext ? "." + ext : "");
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function serializeMessage(msg) {
  if (!msg || msg.className === "MessageService") return null;

  // WebPage link preview message
  if (msg.media instanceof Api.MessageMediaWebPage && msg.media.webpage instanceof Api.WebPage) {
    const wp = msg.media.webpage;
    const urlMatch = (msg.message || "").match(/https?:\/\/\S+/i);
    const url = wp.url || wp.displayUrl || (urlMatch ? urlMatch[0] : "");
    if (!url) return null;
    const domain = domainOf(url);
    const hasPhoto = !!(wp.photo && !(wp.photo instanceof Api.PhotoEmpty));
    const title = wp.title || wp.siteName || domain || url;
    const size = Buffer.byteLength(url + (msg.message || ""), "utf8");
    return {
      id: Number(msg.id),
      date: Number(msg.date),
      caption: msg.message || "",
      name: title,
      mime: "text/uri-list",
      ext: "url",
      size,
      sizeText: fmtBytes(size),
      kind: "link",
      isPhoto: false,
      hasThumb: hasPhoto,
      width: null,
      height: null,
      duration: null,
      url,
      domain,
      hasPreview: !!(wp.title || wp.description || hasPhoto),
      previewDescription: wp.description || (msg.message && msg.message.trim() !== url ? msg.message : ""),
    };
  }

  // Plain text / link message without attachment
  if (!msg.media || msg.media instanceof Api.MessageMediaEmpty || msg.media instanceof Api.MessageMediaWebPage) {
    const raw = typeof msg.message === "string" ? msg.message.trim() : "";
    if (!raw) return null;
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1] || "";
    const isPureUrl = /^https?:\/\/\S+$/i.test(raw);
    const isTaggedLink = lines.length <= 3 && /^https?:\/\/\S+$/i.test(lastLine);

    if (isPureUrl || isTaggedLink) {
      const url = isPureUrl ? raw : lastLine;
      const domain = domainOf(url);
      const name = isPureUrl ? url : lines[0] !== url ? lines[0] : domain || url;
      const desc = lines.length === 3 ? lines[1] : "";
      const size = Buffer.byteLength(raw, "utf8");
      return {
        id: Number(msg.id),
        date: Number(msg.date),
        caption: raw,
        name,
        mime: "text/uri-list",
        ext: "url",
        size,
        sizeText: fmtBytes(size),
        kind: "link",
        isPhoto: false,
        hasThumb: false,
        width: null,
        height: null,
        duration: null,
        url,
        domain,
        hasPreview: false,
        previewDescription: desc,
      };
    }

    const firstLine = (lines[0] || "Note").slice(0, 64);
    const size = Buffer.byteLength(raw, "utf8");
    return {
      id: Number(msg.id),
      date: Number(msg.date),
      caption: "",
      name: firstLine,
      mime: "text/plain",
      ext: "note",
      size,
      sizeText: fmtBytes(size),
      kind: "note",
      isPhoto: false,
      hasThumb: false,
      width: null,
      height: null,
      duration: null,
      noteContent: raw,
    };
  }

  let name = null,
    mime = null,
    size = null,
    isPhoto = false,
    hasThumb = false,
    width = null,
    height = null,
    duration = null,
    artist = null;

  if (msg.media instanceof Api.MessageMediaPhoto && msg.media.photo && !(msg.media.photo instanceof Api.PhotoEmpty)) {
    isPhoto = true;
    mime = "image/jpeg";
    name = `photo_${msg.id}.jpg`;
    hasThumb = true;
    let best = 0;
    let dim = null;
    for (const s of msg.media.photo.sizes || []) {
      const t = s instanceof Api.PhotoSizeProgressive ? Math.max(...(s.sizes || [])) : s.size || 0;
      if (t > best) {
        best = Number(t);
        if (s.w && s.h) dim = { w: s.w, h: s.h };
      }
      if ((s instanceof Api.PhotoStrippedSize || s instanceof Api.PhotoCachedSize) && !hasThumb) hasThumb = true;
    }
    size = best || null;
    if (dim) {
      width = dim.w;
      height = dim.h;
    }
  } else if (msg.media instanceof Api.MessageMediaDocument && msg.media.document && !(msg.media.document instanceof Api.DocumentEmpty)) {
    const doc = msg.media.document;
    mime = doc.mimeType || "application/octet-stream";
    size = Number(doc.size);
    name = docName(doc);
    for (const a of doc.attributes || []) {
      if (a instanceof Api.DocumentAttributeImageSize) {
        width = a.w;
        height = a.h;
      }
      if (a instanceof Api.DocumentAttributeVideo) {
        width = a.w ?? width;
        height = a.h ?? height;
        duration = a.duration ?? duration;
        if (!hasThumb && (a.thumb || a.flags?.thumb)) hasThumb = true;
      }
      if (a instanceof Api.DocumentAttributeAudio) {
        duration = a.duration ?? duration;
        if (a.performer) artist = a.performer;
        if (a.title && /^file(\.|$)/i.test(name)) {
          const ext = extOf(name) || "mp3";
          name = `${a.title}.${ext}`;
        }
      }
      if (a instanceof Api.DocumentAttributeAnimated) hasThumb = hasThumb || !!doc.thumbs?.length;
    }
    hasThumb = hasThumb || !!(doc.thumbs && doc.thumbs.length);
  } else {
    return null;
  }

  return {
    id: Number(msg.id),
    date: Number(msg.date),
    caption: msg.message || "",
    name,
    mime: mime || "application/octet-stream",
    ext: extOf(name),
    size,
    sizeText: fmtBytes(size),
    kind: classify(mime, name),
    isPhoto,
    hasThumb,
    width,
    height,
    duration,
    ...(artist ? { artist } : {}),
  };
}

/* ---------- listing ---------- */

export async function listMessages(client, peer, { limit = 50, offsetId = 0, search } = {}) {
  const offId = Number(offsetId) || 0;
  const params = {
    limit,
    offsetId: offId,
  };
  if (search) params.search = search;
  const messages = await client.getMessages(peer, params);
  const items = [];
  let minId = null;
  for (const m of messages) {
    const mid = Number(m.id);
    if (minId === null || mid < minId) minId = mid;
    const s = serializeMessage(m);
    if (s) items.push(s);
  }
  const nextOffset = minId !== null && minId !== offId && messages.length >= limit ? minId : null;
  return { items, nextOffset, count: items.length };
}

export async function getOne(client, peer, id) {
  const messages = await client.getMessages(peer, { ids: [Number(id)] });
  const msg = Array.isArray(messages) ? messages[0] : messages;
  if (!msg) throw new HttpError(404, "File not found");
  return msg;
}

/* ---------- upload & text ---------- */

export function uploadFile(client, peer, { filePath, fileName, fileSize, caption, forceDocument, onProgress, thumb }) {
  return client.sendFile(peer, {
    file: filePath,
    fileName,
    fileSize,
    caption: caption || "",
    forceDocument: !!forceDocument,
    supportsStreaming: true,
    thumb,
    progressCallback: onProgress,
  });
}

export function sendTextMessage(client, peer, message) {
  return client.sendMessage(peer, { message: String(message || "") });
}

/* ---------- rename (caption / note) / delete ---------- */

export function renameFile(client, peer, id, caption) {
  return client.editMessage(peer, { message: Number(id), text: caption || "" });
}

export async function deleteFiles(client, peer, ids) {
  const numIds = ids.map((x) => Number(x));
  try {
    await client.deleteMessages(peer, numIds, { revoke: true });
    return true;
  } catch (e) {
    if (peer instanceof Api.InputPeerChannel) {
      await client.invoke(
        new Api.channels.DeleteMessages({
          channel: new Api.InputChannel({ channelId: peer.channelId, accessHash: peer.accessHash }),
          id: numIds,
        })
      );
      return true;
    }
    throw e;
  }
}

/* ---------- download / stream ---------- */

export async function streamToResponse(client, msg, req, res, { attachment = false, name, mime: forcedMime } = {}) {
  const meta = serializeMessage(msg) || {};

  // Plain text / note / link message fallback
  if (!msg?.media || msg.media instanceof Api.MessageMediaEmpty || (meta.kind === "note" || meta.kind === "link")) {
    if (meta.kind === "note" || meta.kind === "link" || typeof msg?.message === "string") {
      const text = msg?.message || meta.noteContent || meta.url || "";
      const fileName = (meta.name || name || "note") + (meta.kind === "note" && !/\.txt$/i.test(meta.name || "") ? ".txt" : "");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `${attachment ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      return res.send(Buffer.from(text, "utf8"));
    }
  }

  const contentType = forcedMime || meta.mime || "application/octet-stream";
  const fileName = meta.name || name || "file";
  const total = Number(meta.size) || 0;
  const rangeHeader = req?.headers?.range;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=3600");

  if (attachment || !total) {
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `${attachment ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    return streamFull(client, msg, req, res, total);
  }

  let start = 0;
  let end = total - 1;
  let ranged = false;
  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (m) {
      if (m[1]) start = parseInt(m[1], 10);
      else if (m[2]) start = Math.max(0, total - parseInt(m[2], 10));
      if (m[1] && m[2]) end = parseInt(m[2], 10);
      if (start > total - 1) start = total - 1;
      end = Math.min(end, total - 1);
      ranged = true;
    }
  }
  const length = end - start + 1;
  res.writeHead(ranged ? 206 : 200, {
    "Content-Type": contentType,
    "Content-Length": String(length),
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    ...(ranged ? { "Content-Range": `bytes ${start}-${end}/${total}` } : {}),
  });
  return streamRange(client, msg, req, res, start, length, total);
}

async function streamFull(client, msg, req, res, total) {
  if (total) res.setHeader("Content-Length", String(total));
  let aborted = false;
  const onAbort = () => (aborted = true);
  if (req) req.on("close", onAbort);
  const writer = {
    async write(chunk) {
      if (aborted || res.destroyed) throw new Error("aborted");
      if (!res.write(chunk)) await new Promise((r) => res.once("drain", r));
    },
    async close() {
      if (!res.destroyed && !res.writableEnded) res.end();
    },
  };
  try {
    await client.downloadMedia(msg, { outputFile: writer });
  } catch (e) {
    if (!res.headersSent) throw e;
    try { res.end(); } catch {}
  } finally {
    if (req) req.removeListener("close", onAbort);
  }
}

async function streamRange(client, msg, req, res, start, length, total) {
  let aborted = false;
  const onAbort = () => (aborted = true);
  if (req) req.on("close", onAbort);
  let sent = 0;
  try {
    for await (const chunk of client.iterDownload({
      file: msg.media,
      offset: bigInt(start),
      fileSize: bigInt(total),
      requestSize: 524288,
    })) {
      if (aborted || res.destroyed) break;
      let out = chunk;
      const remaining = length - sent;
      if (out.length > remaining) out = out.subarray(0, remaining);
      if (out.length) {
        if (!res.write(out)) await new Promise((r) => res.once("drain", r));
        sent += out.length;
      }
      if (sent >= length) break;
    }
  } catch (e) {
    if (!res.headersSent) throw e;
    try { res.end(); } catch {}
  } finally {
    if (req) req.removeListener("close", onAbort);
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}

export async function streamMultipart(client, peer, parts, total, req, res, { attachment = false, name, mime } = {}) {
  const contentType = mime || "application/octet-stream";
  const fileName = name || "file";

  const ids = parts.map((p) => Number(p.msgId)).filter((x) => !isNaN(x));
  let messages = [];
  if (ids.length) messages = await client.getMessages(peer, { ids });

  res.setHeader("Accept-Ranges", "none");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `${attachment ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  if (total) res.setHeader("Content-Length", String(total));
  res.writeHead(200);

  let aborted = false;
  const onAbort = () => (aborted = true);
  if (req) req.on("close", onAbort);

  try {
    for (let i = 0; i < messages.length; i++) {
      if (aborted || res.destroyed) break;
      const msg = Array.isArray(messages) ? messages[i] : messages;
      if (!msg) continue;
      const writer = {
        async write(chunk) {
          if (aborted || res.destroyed) throw new Error("aborted");
          if (!res.write(chunk)) await new Promise((r) => res.once("drain", r));
        },
        async close() {},
      };
      await client.downloadMedia(msg, { outputFile: writer });
    }
  } catch (e) {
    if (!res.headersSent) throw e;
    try { res.end(); } catch {}
  } finally {
    if (req) req.removeListener("close", onAbort);
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}

/* ---------- thumbnail ---------- */

export async function streamThumb(client, msg, res, cacheKey) {
  const target =
    msg?.media instanceof Api.MessageMediaWebPage && msg.media.webpage?.photo
      ? msg.media.webpage.photo
      : msg;

  const tmp = path.join(os.tmpdir(), `tgd-thumb-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  try {
    await client.downloadMedia(target, { outputFile: tmp, thumb: 0 });
    if (fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
      const data = fs.readFileSync(tmp);
      fs.unlink(tmp, () => {});
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=604800");
      return res.send(data);
    }
  } catch {}
  if (fs.existsSync(tmp)) fs.unlink(tmp, () => {});

  const meta = serializeMessage(msg);
  const isImg = meta && (meta.kind === "image" || (meta.mime && meta.mime.startsWith("image/")));
  if (isImg && cacheKey) {
    const cachePath = thumbCachePath(cacheKey);
    try {
      if (!fs.existsSync(cachePath)) {
        const buf = await client.downloadMedia(msg);
        if (!Buffer.isBuffer(buf) || !buf.length) throw new Error("no data");
        const thumb = await generateThumb(buf);
        fs.writeFileSync(cachePath, thumb);
      }
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=604800");
      return res.sendFile(cachePath);
    } catch {}
  }
  res.status(404).end();
}

/* ---------- folders / channels ---------- */

export async function createChannelFolder(client, title) {
  const res = await client.invoke(
    new Api.channels.CreateChannel({
      broadcast: true,
      title: title.slice(0, 255),
      about: "Telegram Disk folder",
    })
  );
  const chat = extractCreatedChat(res);
  if (!chat) throw new HttpError(500, "Could not create folder");
  return {
    title,
    peer_json: {
      kind: "channel",
      channelId: String(chat.id),
      accessHash: String(chat.accessHash),
    },
  };
}

function extractCreatedChat(updates) {
  const chats = updates?.chats || updates?.updates?.flatMap?.((u) => u?.chats || []) || [];
  for (const c of chats) {
    if (c instanceof Api.Channel) return c;
  }
  return chats[0] || null;
}

export async function listDialogs(client) {
  const res = await client.invoke(
    new Api.messages.GetDialogs({ offsetPeer: new Api.InputPeerEmpty(), limit: 100, hash: 0n })
  );
  const out = [];
  const chats = res.chats || [];
  for (const c of chats) {
    if (c instanceof Api.Channel) {
      out.push({
        id: String(c.id),
        accessHash: String(c.accessHash),
        title: c.title || "Channel",
        type: "channel",
        username: c.username || null,
      });
    } else if (c instanceof Api.Chat) {
      out.push({
        id: String(c.id),
        accessHash: "0",
        title: c.title || "Chat",
        type: "chat",
        username: null,
      });
    }
  }
  return out;
}
