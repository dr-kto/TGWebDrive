import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./config.js";
import { uid } from "./util.js";

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "tgdrive.sqlite"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  phone TEXT,
  user_id TEXT,
  username TEXT,
  api_id INTEGER NOT NULL,
  api_hash TEXT NOT NULL,
  session TEXT NOT NULL,
  is_premium INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  peer_json TEXT NOT NULL,
  kind TEXT NOT NULL,          -- 'saved' | 'channel'
  created_at INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  peer_json TEXT NOT NULL,
  msg_id INTEGER,
  multipart_id TEXT,
  name TEXT,
  mime TEXT,
  size INTEGER,
  password_hash TEXT,
  expires_at INTEGER,
  downloads INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'file',
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  current_account_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS multipart_files (
  id TEXT PRIMARY KEY,                 -- logical file id, prefixed 'mp_'
  account_id TEXT NOT NULL,
  peer_json TEXT NOT NULL,             -- folder peer this file lives in
  name TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL,               -- total reassembled size
  parts_json TEXT NOT NULL,            -- JSON [{ msgId, size }, ...] in order
  created_at INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_multipart_peer ON multipart_files(account_id, peer_json);
`);

function checkpoint() {
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {}
}

function namedStmt(sql, keys, { flush = false } = {}) {
  const s = db.prepare(sql);
  const bind = (obj = {}) => keys.map((k) => (obj[k] === undefined ? null : obj[k]));
  return {
    run: (obj) => {
      const r = s.run(...bind(obj));
      if (flush) checkpoint();
      return r;
    },
    get: (obj) => s.get(...bind(obj)),
    all: (obj) => s.all(...bind(obj)),
  };
}

function flushStmt(sql) {
  const s = db.prepare(sql);
  return {
    run: (...args) => {
      const r = s.run(...args);
      checkpoint();
      return r;
    },
    get: (...args) => s.get(...args),
    all: (...args) => s.all(...args),
  };
}

export function metaGet(k, dflt = null) {
  const row = db.prepare("SELECT v FROM meta WHERE k = ?").get(k);
  return row ? row.v : dflt;
}

export function metaSet(k, v) {
  db.prepare("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k, String(v));
}

export const stmt = {
  addAccount: namedStmt(
    `INSERT INTO accounts (id,label,phone,user_id,username,api_id,api_hash,session,is_premium,created_at,last_used_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ["id", "label", "phone", "user_id", "username", "api_id", "api_hash", "session", "is_premium", "created_at", "last_used_at"],
    { flush: true }
  ),
  listAccounts: db.prepare(`SELECT * FROM accounts ORDER BY last_used_at DESC`),
  getAccount: db.prepare(`SELECT * FROM accounts WHERE id = ?`),
  touchAccount: db.prepare(`UPDATE accounts SET last_used_at = ? WHERE id = ?`),
  updateAccount: namedStmt(
    `UPDATE accounts SET session=?, is_premium=?, label=?, user_id=?, username=? WHERE id=?`,
    ["session", "is_premium", "label", "user_id", "username", "id"],
    { flush: true }
  ),
  deleteAccount: flushStmt(`DELETE FROM accounts WHERE id = ?`),

  addFolder: namedStmt(
    `INSERT INTO folders (id,account_id,parent_id,title,peer_json,kind,created_at) VALUES (?,?,?,?,?,?,?)`,
    ["id", "account_id", "parent_id", "title", "peer_json", "kind", "created_at"],
    { flush: true }
  ),
  foldersFor: db.prepare(`SELECT * FROM folders WHERE account_id = ? ORDER BY kind DESC, title COLLATE NOCASE`),
  getFolder: db.prepare(`SELECT * FROM folders WHERE id = ? AND account_id = ?`),
  deleteFolder: flushStmt(`DELETE FROM folders WHERE id = ? AND account_id = ?`),

  addShare: namedStmt(
    `INSERT INTO shares (id,account_id,peer_json,msg_id,multipart_id,name,mime,size,password_hash,expires_at,created_at,kind)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ["id", "account_id", "peer_json", "msg_id", "multipart_id", "name", "mime", "size", "password_hash", "expires_at", "created_at", "kind"]
  ),
  getShare: db.prepare(`SELECT * FROM shares WHERE id = ?`),
  getShareByFile: db.prepare(`SELECT * FROM shares WHERE account_id = ? AND peer_json = ? AND msg_id = ? ORDER BY created_at DESC LIMIT 1`),
  deleteSharesByFile: db.prepare(`DELETE FROM shares WHERE account_id = ? AND peer_json = ? AND msg_id = ?`),
  deleteFolderShares: db.prepare(`DELETE FROM shares WHERE account_id = ? AND peer_json = ? AND kind = 'folder'`),
  getFolderShare: db.prepare(`SELECT * FROM shares WHERE account_id = ? AND peer_json = ? AND kind = 'folder' LIMIT 1`),
  incShareDownload: db.prepare(`UPDATE shares SET downloads = downloads + 1 WHERE id = ?`),
  listShares: db.prepare(`SELECT * FROM shares ORDER BY created_at DESC`),
  deleteShare: db.prepare(`DELETE FROM shares WHERE id = ?`),

  addApiKey: namedStmt(
    `INSERT INTO api_keys (id,token_hash,label,account_id,created_at) VALUES (?,?,?,?,?)`,
    ["id", "token_hash", "label", "account_id", "created_at"]
  ),
  listApiKeys: db.prepare(`SELECT id, label, account_id, created_at FROM api_keys ORDER BY created_at DESC`),
  findApiKeyByHash: db.prepare(`SELECT id, account_id FROM api_keys WHERE token_hash = ?`),
  deleteApiKey: db.prepare(`DELETE FROM api_keys WHERE id = ?`),

  addUser: namedStmt(
    `INSERT INTO users (id,username,password_hash,role,created_at) VALUES (?,?,?,?,?)`,
    ["id", "username", "password_hash", "role", "created_at"],
    { flush: true }
  ),
  getUserByUsername: db.prepare(`SELECT * FROM users WHERE username = ?`),
  getUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  listUsers: db.prepare(`SELECT id, username, role, created_at FROM users ORDER BY created_at`),
  updateUser: namedStmt(`UPDATE users SET password_hash = ?, role = ? WHERE id = ?`, ["password_hash", "role", "id"], { flush: true }),
  deleteUser: flushStmt(`DELETE FROM users WHERE id = ?`),
  countUsers: db.prepare(`SELECT COUNT(*) AS c FROM users`),

  addMultipart: namedStmt(
    `INSERT INTO multipart_files (id,account_id,peer_json,name,mime,size,parts_json,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    ["id", "account_id", "peer_json", "name", "mime", "size", "parts_json", "created_at"]
  ),
  getMultipart: db.prepare(`SELECT * FROM multipart_files WHERE id = ?`),
  listMultipart: db.prepare(`SELECT * FROM multipart_files WHERE account_id = ? AND peer_json = ? ORDER BY created_at DESC`),
  renameMultipart: namedStmt(`UPDATE multipart_files SET name = ? WHERE id = ?`, ["name", "id"]),
  updateMultipartParts: namedStmt(`UPDATE multipart_files SET parts_json = ? WHERE id = ?`, ["parts_json", "id"]),
  deleteMultipart: db.prepare(`DELETE FROM multipart_files WHERE id = ?`),
  getShareByMultipart: db.prepare(`SELECT * FROM shares WHERE account_id = ? AND peer_json = ? AND multipart_id = ? ORDER BY created_at DESC LIMIT 1`),
  deleteSharesByMultipart: db.prepare(`DELETE FROM shares WHERE multipart_id = ?`),

  addSession: namedStmt(
    `INSERT INTO sessions (sid,user_id,username,role,current_account_id,created_at,expires_at)
     VALUES (?,?,?,?,?,?,?)`,
    ["sid", "user_id", "username", "role", "current_account_id", "created_at", "expires_at"]
  ),
  getSession: db.prepare(`SELECT * FROM sessions WHERE sid = ?`),
  updateSessionRow: namedStmt(`UPDATE sessions SET current_account_id = ? WHERE sid = ?`, ["current_account_id", "sid"]),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE sid = ?`),
  deleteExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expires_at < ?`),
  deleteSessionsByUser: db.prepare(`DELETE FROM sessions WHERE user_id = ?`),
};

// Migration: seed an admin user from the legacy single admin password (if present),
// so existing installs keep working after the upgrade to multi-user.
(() => {
  if (stmt.countUsers.get().c === 0) {
    const legacy = metaGet("admin_password");
    if (legacy) {
      stmt.addUser.run({ id: uid(), username: "admin", password_hash: legacy, role: "admin", created_at: Date.now() });
    }
  }
})();

export default db;
