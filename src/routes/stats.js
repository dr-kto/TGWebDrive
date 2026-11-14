import { Router } from "express";
import { stmt } from "../db.js";
import { requireAppAuth, requireAccount } from "../middleware.js";
import { getConnectedClient } from "../tg/manager.js";
import { buildPeer, listMessages } from "../tg/operations.js";
import { fmtBytes } from "../util.js";

export const stats = Router();

stats.get("/stats", requireAppAuth, requireAccount, async (req, res, next) => {
  try {
    const folderIds = [];
    const q = req.query.folder;
    if (q && q !== "all") folderIds.push(q);
    else folderIds.push(...stmt.foldersFor.all(req.accountId).map((f) => f.id));

    let count = 0;
    let totalBytes = 0;
    const byKind = {};
    const folders = [];
    const client = await getConnectedClient(req.accountId);

    for (const fid of folderIds.slice(0, 12)) {
      const row = stmt.getFolder.get(fid, req.accountId);
      if (!row) continue;
      const peer = buildPeer(row);
      const r = await listMessages(client, peer, { limit: 100 });
      let fCount = 0;
      let fBytes = 0;
      for (const s of r.items) {
        fCount++;
        fBytes += s.size || 0;
        count++;
        totalBytes += s.size || 0;
        byKind[s.kind] = (byKind[s.kind] || 0) + 1;
      }
      folders.push({ id: fid, title: row.title, count: fCount, bytes: fBytes, bytesText: fmtBytes(fBytes), more: !!r.nextOffset });
    }

    res.json({
      approximate: folders.some((f) => f.more),
      count,
      totalBytes,
      totalText: fmtBytes(totalBytes),
      byKind,
      folders,
    });
  } catch (e) {
    next(e);
  }
});
