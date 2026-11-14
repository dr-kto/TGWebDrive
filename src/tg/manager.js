import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { stmt } from "../db.js";
import { uid } from "../util.js";
import QRCode from "qrcode";

const OPTS = { connectionRetries: 5, useWSS: true, retryDelay: 1000, autoReconnect: true };

// accountId -> { client, lastUsed }
const clients = new Map();
// tempToken -> { client, apiId, apiHash, phone, phoneCodeHash, createdAt }
const logins = new Map();

function buildSession(sessionStr, apiId, apiHash) {
  return new TelegramClient(new StringSession(sessionStr || ""), apiId, apiHash, OPTS);
}

async function connect(c) {
  if (!c.connected) await c.connect();
  return c;
}

export async function getConnectedClient(accountId) {
  let entry = clients.get(accountId);
  if (entry) {
    entry.lastUsed = Date.now();
    try {
      if (!entry.client.connected) await entry.client.connect();
      return entry.client;
    } catch {
      clients.delete(accountId);
    }
  }
  const acc = stmt.getAccount.get(accountId);
  if (!acc) throw new HttpError(404, "Account not found");
  const client = buildSession(acc.session, acc.api_id, acc.api_hash);
  await connect(client);
  let ok = false;
  try {
    ok = await client.isUserAuthorized();
  } catch {
    ok = false;
  }
  if (!ok) throw new HttpError(401, "Telegram session expired — please log in again");
  entry = { client, lastUsed: Date.now() };
  clients.set(accountId, entry);
  stmt.touchAccount.run(Date.now(), accountId);
  return client;
}

export function dropClient(accountId) {
  const entry = clients.get(accountId);
  if (entry) {
    try {
      entry.client.disconnect();
    } catch {}
    clients.delete(accountId);
  }
}

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function saveOrUpdateAccount(client, apiId, apiHash, fallbackPhone = "") {
  return (async () => {
    const me = await client.getMe();
    const sessionStr = client.session.save();
    const now = Date.now();
    const label = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.username || me.phone || fallbackPhone || "Account";
    const userId = String(me.id);
    const phone = me.phone || fallbackPhone || "";
    const username = me.username || null;
    const isPremium = me.premium ? 1 : 0;

    const existing = stmt.listAccounts.all().find((a) => a.user_id === userId);
    if (existing) {
      dropClient(existing.id);
      stmt.updateAccount.run({
        id: existing.id,
        session: sessionStr,
        is_premium: isPremium,
        label,
        user_id: userId,
        username,
      });
      stmt.touchAccount.run(now, existing.id);
      clients.set(existing.id, { client, lastUsed: now });
      return {
        id: existing.id,
        me: { name: label, username, phone, premium: !!me.premium },
      };
    }

    const id = uid();
    stmt.addAccount.run({
      id,
      label,
      phone,
      user_id: userId,
      username,
      api_id: apiId,
      api_hash: apiHash,
      session: sessionStr,
      is_premium: isPremium,
      created_at: now,
      last_used_at: now,
    });
    clients.set(id, { client, lastUsed: now });
    return {
      id,
      me: { name: label, username, phone, premium: !!me.premium },
    };
  })();
}

/* ---------------- Phone Login flow ---------------- */

export async function beginLogin(apiId, apiHash, phone) {
  apiId = Number(apiId);
  const client = buildSession("", apiId, apiHash);
  await connect(client);
  let sent;
  try {
    sent = await client.sendCode({ apiId, apiHash }, phone);
  } catch (e) {
    await safeDisconnect(client);
    throw mapTgError(e);
  }
  const tempToken = uid() + uid();
  logins.set(tempToken, {
    client,
    apiId,
    apiHash,
    phone,
    phoneCodeHash: sent.phoneCodeHash,
    isCodeViaApp: sent.isCodeViaApp,
    createdAt: Date.now(),
  });
  return { tempToken, isCodeViaApp: !!sent.isCodeViaApp };
}

/* ---------------- QR Login flow ---------------- */

const qrLogins = new Map();

export async function beginQrLogin(apiId, apiHash) {
  apiId = Number(apiId);
  const client = buildSession("", apiId, apiHash);
  await connect(client);
  const tempToken = uid() + uid();

  let tokenData;
  try {
    tokenData = await client.invoke(
      new Api.auth.ExportLoginToken({ apiId, apiHash, exceptIds: [] })
    );
  } catch (e) {
    await safeDisconnect(client);
    throw mapTgError(e);
  }

  if (tokenData.className === "auth.LoginTokenSuccess") {
    const acct = await saveOrUpdateAccount(client, apiId, apiHash);
    return { tempToken, done: true, accountId: acct.id };
  }

  const qrDataUrl = await _tokenToQr(tokenData.token);
  const entry = {
    client,
    apiId,
    apiHash,
    createdAt: Date.now(),
    done: false,
    accountId: null,
    error: null,
    needs2FA: false,
    qrDataUrl,
    me: null,
    expiresAt: tokenData.expires * 1000,
  };
  qrLogins.set(tempToken, entry);
  _pollQr(tempToken, entry);
  return { tempToken, qrDataUrl, expiresIn: tokenData.expires - Math.floor(Date.now() / 1000) };
}

async function _tokenToQr(tok) {
  const b64 = Buffer.from(tok).toString("base64url");
  return QRCode.toDataURL(`tg://login?token=${b64}`, {
    width: 280,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}

async function _pollQr(tempToken, entry) {
  const { client, apiId, apiHash } = entry;
  for (let i = 0; i < 90; i++) {
    if (!qrLogins.has(tempToken)) return;
    await new Promise((r) => setTimeout(r, 1500));
    if (!qrLogins.has(tempToken)) return;
    try {
      const r = await client.invoke(
        new Api.auth.ExportLoginToken({ apiId, apiHash, exceptIds: [] })
      );
      if (r.className === "auth.LoginTokenSuccess") {
        const acct = await saveOrUpdateAccount(client, apiId, apiHash);
        entry.accountId = acct.id;
        entry.me = acct.me;
        entry.done = true;
        return;
      }
      if (r.className === "auth.LoginTokenMigrateTo") {
        await client._switchDC(r.dcId);
        try {
          await client.invoke(new Api.auth.ImportLoginToken({ token: r.token }));
        } catch (e2) {
          if (e2.errorMessage === "SESSION_PASSWORD_NEEDED") {
            entry.needs2FA = true;
            return;
          }
          throw e2;
        }
        const acct = await saveOrUpdateAccount(client, apiId, apiHash);
        entry.accountId = acct.id;
        entry.me = acct.me;
        entry.done = true;
        return;
      }
      if (r.token) {
        entry.qrDataUrl = await _tokenToQr(r.token);
        entry.expiresAt = r.expires * 1000;
      }
    } catch (e) {
      if (e.errorMessage === "SESSION_PASSWORD_NEEDED") {
        entry.needs2FA = true;
        return;
      }
    }
  }
  if (qrLogins.has(tempToken) && !entry.done) {
    entry.error = "QR login timed out";
    entry.done = true;
  }
}

export function checkQrLogin(tempToken) {
  const e = qrLogins.get(tempToken);
  if (!e) throw new HttpError(400, "QR session expired");
  if (e.error) {
    qrLogins.delete(tempToken);
    throw new HttpError(400, e.error);
  }
  if (e.needs2FA) return { done: false, needs2FA: true };
  if (e.done && e.accountId) {
    const r = { done: true, accountId: e.accountId, me: e.me };
    qrLogins.delete(tempToken);
    return r;
  }
  return { done: false, qrDataUrl: e.qrDataUrl };
}

export async function submitQr2FA(tempToken, password) {
  const e = qrLogins.get(tempToken);
  if (!e) throw new HttpError(400, "QR session expired");
  if (!e.needs2FA) throw new HttpError(400, "2FA not required");
  try {
    await do2FA(e.client, password);
    const acct = await saveOrUpdateAccount(e.client, e.apiId, e.apiHash);
    const r = { done: true, accountId: acct.id, me: acct.me };
    qrLogins.delete(tempToken);
    return r;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw mapTgError(err);
  }
}

export function cancelQrLogin(tempToken) {
  const e = qrLogins.get(tempToken);
  if (e) {
    safeDisconnect(e.client);
    qrLogins.delete(tempToken);
  }
}

export async function resendCode(tempToken) {
  const L = logins.get(tempToken);
  if (!L) throw new HttpError(400, "Login session expired");
  try {
    const r = await L.client.sendCode({ apiId: L.apiId, apiHash: L.apiHash }, L.phone);
    L.phoneCodeHash = r.phoneCodeHash;
    L.isCodeViaApp = r.isCodeViaApp;
    return { isCodeViaApp: !!r.isCodeViaApp };
  } catch (e) {
    throw mapTgError(e);
  }
}

export async function finishLogin(tempToken, code, password) {
  const L = logins.get(tempToken);
  if (!L) throw new HttpError(400, "Login session expired. Start again.");
  const { client, apiId, apiHash, phone, phoneCodeHash } = L;
  try {
    try {
      await client.invoke(
        new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: String(code) })
      );
    } catch (e) {
      if (e.errorMessage !== "SESSION_PASSWORD_NEEDED") throw e;
      if (!password) {
        const err = new HttpError(449, "Two-factor authentication required");
        err.code = "2FA_NEEDED";
        throw err;
      }
      await do2FA(client, password);
    }

    const acct = await saveOrUpdateAccount(client, apiId, apiHash, phone);
    logins.delete(tempToken);
    return acct;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw mapTgError(e);
  }
}

async function do2FA(client, password) {
  const srp = await client.invoke(new Api.account.GetPassword());
  const computed = await computeCheck(srp, password);
  await client.invoke(new Api.auth.CheckPassword({ password: computed }));
}

async function computeCheck(srp, password) {
  const mod = await import("telegram/Password.js");
  const fn = mod.computeCheck || mod.default?.computeCheck;
  if (!fn) throw new Error("computeCheck unavailable in this telegram build");
  return fn(srp, password);
}

export function cancelLogin(tempToken) {
  const L = logins.get(tempToken);
  if (L) {
    safeDisconnect(L.client);
    logins.delete(tempToken);
  }
}

async function safeDisconnect(c) {
  try {
    await c.disconnect();
  } catch {}
}

function mapTgError(e) {
  const msg = e.errorMessage || e.message || "Telegram error";
  let status = 400;
  if (/FLOOD_WAIT_(\d+)/.test(msg)) {
    const s = Number(RegExp.$1);
    return new HttpError(429, `Telegram asks to wait ${s}s before retrying`);
  }
  if (msg.includes("PHONE_NUMBER_INVALID")) return new HttpError(400, "Phone number is invalid");
  if (msg.includes("API_ID_INVALID") || msg.includes("API_ID_PUBLISHED_FLOOD"))
    return new HttpError(400, "API ID / API hash are invalid");
  if (msg.includes("PHONE_CODE_INVALID")) return new HttpError(400, "Wrong login code");
  if (msg.includes("PHONE_CODE_EXPIRED")) return new HttpError(400, "Login code expired. Request a new one.");
  if (msg.includes("PASSWORD_HASH_INVALID")) return new HttpError(400, "Wrong 2FA password");
  if (msg.includes("SESSION_REVOKED") || msg.includes("AUTH_KEY_UNREGISTERED"))
    return new HttpError(401, "Session revoked. Please log in again.");
  return new HttpError(status, msg);
}

// housekeeping: expire stale logins every 10 min
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, L] of logins) {
    if (L.createdAt < cutoff) {
      safeDisconnect(L.client);
      logins.delete(k);
    }
  }
  for (const [k, L] of qrLogins) {
    if (L.createdAt < cutoff) {
      safeDisconnect(L.client);
      qrLogins.delete(k);
    }
  }
}, 10 * 60 * 1000).unref();
