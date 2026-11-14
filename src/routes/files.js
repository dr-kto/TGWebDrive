import { Router } from "express";
import { ZipArchive } from "archiver";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mime from "mime-types";
import { stmt } from "../db.js";
import { config } from "../config.js";
import { requireAppAuth, requireAccount } from "../middleware.js";
import { getConnectedClient, HttpError } from "../tg/manager.js";
import {
  buildPeer,
  listMessages,
  getOne,
  serializeMessage,
  serializeMultipart,
  parseParts,
  isMultipartId,
  uploadFile,
  sendTextMessage,
  renameFile,
  deleteFiles,
  streamToResponse,
  streamMultipart,
  streamThumb,
} from "../tg/operations.js";
import { publish, subscribe, finish, fail } from "../jobs.js";
import { uid, safeFilename } from "../util.js";
import { generateThumb, IMAGE_RE } from "../thumb.js";

export const files = Router();

function sliceToFile(src, start, size, dst) {
  return new Promise((resolve, reject) => {
    const r = fs.createReadStream(src, { start, end: start + size - 1 });
    const w = fs.createWriteStream(dst);
    let done = false;
    const finishOnce = (err) => {
      if (done) return;
      done = true;
      err ? reject(err) : resolve();
    };
    r.on("error", finishOnce);
    w.on("error", finishOnce);
    w.on("finish", () => finishOnce());
    r.pipe(w);
  });
}

function loadOwnedMultipart(req) {
  const mp = stmt.getMultipart.get(req.params.id);
  if (!mp || mp.account_id !== req.accountId) throw new HttpError(404, "File not found");
  return mp;
}

function mergeMultipartIntoList(items, accountId, peerJson, folderId, folderTitle, { includeVirtual = true, search = "" } = {}) {
  const mps = stmt.listMultipart.all(accountId, peerJson);
  if (!mps.length) return items;
  const partIds = new Set();
  for (const mp of mps) for (const p of parseParts(mp)) partIds.add(Number(p.msgId));
  let out = partIds.size ? items.filter((it) => !partIds.has(Number(it.id))) : items;
  if (includeVirtual) {
    const q = (search || "").toLowerCase();
    for (const mp of mps) {
      if (q && !(mp.name || "").toLowerCase().includes(q)) continue;
      out.push({ ...serializeMultipart(mp), folderId, folderTitle });
    }
    out.sort((a, b) => (Number(b.date) || 0) - (Number(a.date) || 0));
  }
  return out;
}

async function loadFolder(req, { allowAll = false } = {}) {
  const folderId = req.query.folder || req.headers["x-folder"];
  if (!folderId) throw new HttpError(400, "Missing folder");
  if (folderId === "all") {
    if (!allowAll) throw new HttpError(400, "Specify a folder for this operation");
    const allFolders = stmt.foldersFor.all(req.accountId);
    return { row: { id: "all", title: "All Files" }, peer: null, allFolders };
  }
  const row = stmt.getFolder.get(folderId, req.accountId);
  if (!row) throw new HttpError(404, "Folder not found");
  return { row, peer: buildPeer(row), allFolders: null };
}

/* --------- list --------- */
files.get("/files", requireAppAuth, requireAccount, async (req, res, next) => {
  try {
    const { row, peer, allFolders } = await loadFolder(req, { allowAll: true });
    const client = await getConnectedClient(req.accountId);
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const offsetId = Number(req.query.offsetId) || 0;
    const search = req.query.search || undefined;

    if (allFolders) {
      if (offsetId) return res.json({ items: [], nextOffset: null, count: 0 });
      const seenPeers = new Set();
      const targetFolders = [];
      for (const f of allFolders) {
        if (seenPeers.has(f.peer_json)) continue;
        seenPeers.add(f.peer_json);
        targetFolders.push(f);
      }
      const perFolder = Math.max(20, Math.ceil(limit / Math.max(1, targetFolders.length)) + 15);
      const aggregated = [];
      const results = await Promise.allSettled(
        targetFolders.slice(0, 15).map(async (f) => {
          const r = await listMessages(client, buildPeer(f), { limit: perFolder, search });
          let tagged = r.items.map((it) => ({ ...it, folderId: f.id, folderTitle: f.title }));
          tagged = mergeMultipartIntoList(tagged, req.accountId, f.peer_json, f.id, f.title, {
            includeVirtual: true,
            search,
          });
          return tagged;
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && Array.isArray(r.value)) aggregated.push(...r.value);
      }
      aggregated.sort((a, b) => (Number(b.date) || 0) - (Number(a.date) || 0));
      const sliced = aggregated.slice(0, limit);
      return res.json({ items: sliced, nextOffset: null, count: sliced.length });
    }

    const r = await listMessages(client, peer, { limit, offsetId, search });
    r.items = r.items.map((it) => ({ ...it, folderId: row.id, folderTitle: row.title }));
    r.items = mergeMultipartIntoList(r.items, req.accountId, row.peer_json, row.id, row.title, {
      includeVirtual: !offsetId,
      search,
    });
    r.count = r.items.length;
    res.json(r);
  } catch (e) {
    next(e);
  }
});

/* --------- upload progress (SSE) --------- */
files.get("/files/upload/progress", requireAppAuth, (req, res) => {
  const job = String(req.query.job || "");
  if (!job) return res.status(400).end();
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(":ok\n\n");
  const send = (d) => res.write(`data: ${JSON.stringify(d)}\n\n`);
  const unsubscribe = subscribe(job, send);
  const keep = setInterval(() => {
    try {
      res.write(":ping\n\n");
    } catch {}
  }, 20000);
  req.on("close", () => {
    clearInterval(keep);
    unsubscribe();
  });
});

/* --------- create note / link (real Telegram message) --------- */
files.post("/files/item", requireAppAuth, requireAccount, async (req, res, next) => {
  try {
    const requested = req.body?.folder || req.query.folder;
    const all = stmt.foldersFor.all(req.accountId);
    const row = (requested && requested !== "all" ? stmt.getFolder.get(requested, req.accountId) : null) || all[0];
    if (!row) return res.status(404).json({ error: "Folder not found" });

    const client = await getConnectedClient(req.accountId);
    const peer = buildPeer(row);
    const kind = req.body?.kind === "link" ? "link" : "note";
    const title = String(req.body?.title || "").trim();
    const text = String(req.body?.text || req.body?.noteContent || req.body?.caption || "").trim();
    const url = String(req.body?.url || "").trim();

    let messageBody = "";
    if (kind === "link") {
      if (!url) return res.status(400).json({ error: "URL is required" });
      messageBody = [title, text, url].filter(Boolean).join("\n");
    } else {
      if (!text && !title) return res.status(400).json({ error: "Note content or title is required" });
      messageBody = title && text && !text.startsWith(title) ? `${title}\n${text}` : text || title;
    }

    const sent = await sendTextMessage(client, peer, messageBody);
    const fresh = sent?.id ? await getOne(client, peer, sent.id).catch(() => sent) : sent;
    const serialized = serializeMessage(fresh);
    res.status(201).json({
      ok: true,
      file: serialized ? { ...serialized, folderId: row.id, folderTitle: row.title } : null,
    });
  } catch (e) {
    next(e);
  }
});

/* --------- upload (real Telegram file, auto-splits > splitPartBytes) --------- */
files.post("/files/upload", requireAppAuth, requireAccount, async (req, res, next) => {
  const job = String(req.headers["x-job"] || "");
  let tmp = "";
  let upDir = "";
  try {
    const requested = req.query.folder || req.headers["x-folder"];
    const all = stmt.foldersFor.all(req.accountId);
    const row = (requested && requested !== "all" ? stmt.getFolder.get(requested, req.accountId) : null) || all[0];
    if (!row) throw new HttpError(404, "Folder not found");
    const peer = buildPeer(row);

    const client = await getConnectedClient(req.accountId);
    const fileName = safeFilename(decodeURIComponent(req.headers["x-filename"] || "file"));
    const size = Number(req.headers["x-filesize"] || 0);
    const caption = req.headers["x-caption"] ? decodeURIComponent(req.headers["x-caption"]) : "";
    const forceDocument = req.headers["x-force-document"] !== "0";

    upDir = fs.mkdtempSync(path.join(os.tmpdir(), "tgd-up-"));
    tmp = path.join(upDir, fileName);
    const out = fs.createWriteStream(tmp);
    let received = 0;
    await new Promise((resolve, reject) => {
      const onData = (c) => {
        received += c.length;
        if (job && size) publish(job, { phase: "receiving", received, size, ratio: received / size });
      };
      req.on("data", onData);
      req.pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);
      req.on("error", reject);
      req.on("aborted", () => reject(new Error("Client aborted upload")));
    });

    if (job) publish(job, { phase: "sending", uploaded: 0, total: size, ratio: 0 });
    let thumbPath;
    if (IMAGE_RE.test(fileName)) {
      try {
        thumbPath = path.join(upDir, "_thumb.jpg");
        await generateThumb(tmp, thumbPath);
      } catch {
        thumbPath = undefined;
      }
    }

    if (size > config.splitPartBytes) {
      const detectedMime = mime.lookup(fileName) || "application/octet-stream";
      const mpId = "mp_" + uid();
      stmt.addMultipart.run({
        id: mpId,
        account_id: req.accountId,
        peer_json: row.peer_json,
        name: fileName,
        mime: detectedMime,
        size,
        parts_json: "[]",
        created_at: Date.now(),
      });
      const parts = [];
      let offset = 0;
      let partIndex = 0;
      let uploadedSoFar = 0;
      try {
        while (offset < size) {
          const thisSize = Math.min(config.splitPartBytes, size - offset);
          const partName = `${fileName}.part${partIndex}`.replace(/[\\/]/g, "_");
          const partPath = path.join(upDir, partName);
          await sliceToFile(tmp, offset, thisSize, partPath);
          const sent = await uploadFile(client, peer, {
            filePath: partPath,
            fileName: partName,
            fileSize: thisSize,
            caption: partIndex === 0 ? caption : "",
            forceDocument: true,
            onProgress: (uploaded) => {
              if (!job) return;
              const overall = uploadedSoFar + Number(uploaded);
              publish(job, {
                phase: "sending",
                uploaded: String(overall),
                total: String(size),
                ratio: size ? overall / size : 0,
                multipart: true,
                part: partIndex + 1,
              });
            },
          });
          fs.unlink(partPath, () => {});
          const msgId = Number(sent && sent.id);
          if (!msgId || Number.isNaN(msgId)) throw new Error("Telegram returned no id for part " + (partIndex + 1));
          parts.push({ msgId, size: thisSize });
          stmt.updateMultipartParts.run({ id: mpId, parts_json: JSON.stringify(parts) });
          uploadedSoFar += thisSize;
          offset += thisSize;
          partIndex++;
        }
      } catch (splitErr) {
        const sentIds = parts.map((p) => p.msgId).filter(Boolean);
        if (sentIds.length) {
          try { await deleteFiles(client, peer, sentIds); } catch {}
        }
        stmt.deleteMultipart.run(mpId);
        stmt.deleteSharesByMultipart.run(mpId);
        throw splitErr;
      }
      fs.rm(upDir, { recursive: true, force: true }, () => {});
      const file = { ...serializeMultipart(stmt.getMultipart.get(mpId)), folderId: row.id, folderTitle: row.title };
      if (job) finish(job, { id: file?.id, name: file?.name });
      return res.json({ ok: true, file });
    }

    const sent = await uploadFile(client, peer, {
      filePath: tmp,
      fileName,
      fileSize: size || undefined,
      caption,
      forceDocument,
      thumb: thumbPath,
      onProgress: (uploaded, total) => {
        if (!job) return;
        publish(job, {
          phase: "sending",
          uploaded: String(uploaded),
          total: String(total),
          ratio: total ? Number(uploaded) / Number(total) : 0,
        });
      },
    });
    fs.rm(upDir, { recursive: true, force: true }, () => {});
    const serialized = serializeMessage(sent);
    const file = serialized ? { ...serialized, folderId: row.id, folderTitle: row.title } : null;
    if (job) finish(job, { id: file?.id, name: file?.name });
    res.json({ ok: true, file });
  } catch (e) {
    if (upDir) fs.rm(upDir, { recursive: true, force: true }, () => {});
    const aborted = e?.message === "Client aborted upload" || e?.code === "ERR_ABORTED";
    if (job) fail(job, aborted ? new Error("Cancelled") : e);
    if (aborted) return res.status(499).end();
    next(e);
  }
});

/* --------- zip download (must be before /files/:id) --------- */
files.get("/files/zip", requireAppAuth, requireAccount, async (req, res, next) => {
  try {
    const { row, peer } = await loadFolder(req);
    const client = await getConnectedClient(req.accountId);
    const ids = req.query.ids ? String(req.query.ids).split(",").map((x) => x.trim()).filter(Boolean) : null;
    let items = [];
    if (ids && ids.length) {
      for (const id of ids) {
        try {
          const msg = await getOne(client, peer, id);
          const s = serializeMessage(msg);
          if (s) items.push(s);
        } catch {}
      }
    } else {
      const r = await listMessages(client, peer, { limit: 200 });
      items = r.items;
    }
    const zipName = safeFilename((row.title || "folder") + ".zip");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);
    res.setHeader("Cache-Control", "no-store");
    const archive = new ZipArchive({ zlib: { level: 5 } });
    archive.on("error", (e) => {
      if (!res.headersSent) next(e);
      else res.end();
    });
    archive.pipe(res);
    const used = new Set();
    for (const f of items) {
      try {
        const msg = await getOne(client, peer, f.id);
        let buf = null;
        if (f.kind === "note" || f.kind === "link") {
          const txt = msg.message || f.noteContent || f.url || "";
          if (txt) buf = Buffer.from(txt, "utf8");
        } else {
          buf = await client.downloadMedia(msg);
        }
        if (!Buffer.isBuffer(buf) || !buf.length) continue;
        let name = safeFilename(f.name || `file_${f.id}`);
        if (used.has(name)) name = `${Date.now()}-${name}`;
        used.add(name);
        archive.append(buf, { name, date: new Date((f.date || 0) * 1000) });
      } catch {}
    }
    await archive.finalize();
  } catch (e) {
    if (!res.headersSent) next(e);
  }
});

/* --------- single + raw + download + thumb --------- */
files.get("/files/:id", requireAppAuth, requireAccount, async (req, res, next) => {
  try {
    if (isMultipartId(req.params.id)) {
      return res.json({ file: serializeMultipart(loadOwnedMultipart(req)) });
    }
    const { peer } = await loadFolder(req);
    const client = await getConnectedClient(req.accountId);
    const msg = await getOne(client, peer, req.params.id);
    res.json({ file: serializeMessage(msg) });
  } catch (e) {
    next(e);
  }
});

files.get("/files/:id/raw", requireAppAuth, requireAccount, async (req, res, next) => {
  try {
    if (isMultipartId(req.params.id)) {
      const mp = loadOwnedMultipart(req);
      const client = await getConnectedClient(req.accountId);
      const peer = buildPeer({ peer_json: mp.peer_json });
      return await streamMultipart(client, peer, parseParts(mp), Number(mp.size), req, res, {
        attachment: false,
        name: mp.name,
        mime: mp.mime,
      });
    }
    const { peer } = await loadFolder(req);
    const client = await getConnectedClient(req.accountId);
    const msg = await getOne(client, peer, req.params.id);
    await streamToResponse(client, msg, req, res, { attachment: false });
  } catch (e) {
    if (!res.headersSent) next(e);
  }
});

files.get("/files/:id/download", requireAppAuth, requireAccount, async (req, res, next) => {
  try {
    if (isMultipartId(req.params.id)) {
      const mp = loadOwnedMultipart(req);
      const client = await getConnectedClient(req.accountId);
      const peer = buildPeer({ peer_json: mp.peer_json });
      return await streamMultipart(client, peer, parseParts(mp), Number(mp.size), req, res, {
        attachment: true,
        name: mp.name,
        mime: mp.mime,
      });
    }
    const { peer } = await loadFolder(req);
    const client = await getConnectedClient(req.accountId);
    const msg = await getOne(client, peer, req.params.id);
    await streamToResponse(client, msg, req, res, { attachment: true });
  } catch (e) {
    if (!res.headersSent) next(e);
  }
});

files.get("/files/:id/thumb", requireAppAuth, requireAccount, async (req, res) => {
  try {
    if (isMultipartId(req.params.id)) return res.status(404).end();
    const { peer } = await loadFolder(req);
    const client = await getConnectedClient(req.accountId);
    const msg = await getOne(client, peer, req.params.id);
    await streamThumb(client, msg, res, `${req.accountId}-${req.query.folder}-${req.params.id}`);
  } catch {
    if (!res.headersSent) res.status(404).end();
  }
});

/* --------- rename (caption / note text) --------- */
files.patch("/files/:id", requireAppAuth, requireAccount, async (req, res, next) => {
  try {
    if (isMultipartId(req.params.id)) {
      const mp = loadOwnedMultipart(req);
      const name = String(req.body?.name ?? req.body?.caption ?? (mp.name || "")).trim();
      if (name) stmt.renameMultipart.run({ id: req.params.id, name: safeFilename(name) || mp.name });
      return res.json({ ok: true });
    }
    const { peer } = await loadFolder(req);
    const client = await getConnectedClient(req.accountId);
    const text = req.body?.noteContent !== undefined ? String(req.body.noteContent) : String(req.body?.caption ?? "");
    await renameFile(client, peer, req.params.id, text);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* --------- delete --------- */
files.delete("/files", requireAppAuth, requireAccount, async (req, res, next) => {
  try {
    const { peer } = await loadFolder(req);
    const client = await getConnectedClient(req.accountId);
    let ids = req.query.ids || req.body?.ids;
    if (typeof ids === "string") ids = ids.split(",").map((x) => x.trim());
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "ids required" });

    const mpIds = ids.filter((x) => isMultipartId(x));
    const msgIds = ids.filter((x) => !isMultipartId(x));
    let deleted = 0;

    if (msgIds.length) {
      await deleteFiles(client, peer, msgIds);
      deleted += msgIds.length;
    }

    for (const mpId of mpIds) {
      const mp = stmt.getMultipart.get(mpId);
      if (!mp || mp.account_id !== req.accountId) continue;
      const partIds = parseParts(mp).map((p) => p.msgId).filter(Boolean);
      if (partIds.length) {
        try {
          await deleteFiles(client, peer, partIds);
        } catch {}
      }
      stmt.deleteMultipart.run(mpId);
      stmt.deleteSharesByMultipart.run(mpId);
      deleted++;
    }

    res.json({ ok: true, deleted });
  } catch (e) {
    next(e);
  }
});
