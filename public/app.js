import { icon, FILE_ICONS, LUCIDE } from "./icons.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const apiPresets = window.__PRESETS__ || [];

/* ===================== Branding & Preferences ===================== */
let brand = {
  name: "Telegram Disk",
  accent: "#2e7cf6",
  logo: "",
  tagline: "Secure file sharing",
  copyright: "",
  viewMode: "masonry",
  preferences: { chunkSize: "2mb", wifiAutoDownload: true, hdThumbnails: true },
};

function hexShade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "#2e7cf6"));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  return "#" + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
}
function hexRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "#2e7cf6"));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function setFavicon(accent) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='15' fill='${accent}'/><g fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'><path d='M44 40H24a9 9 0 1 1 8.6-11.6h2.3a5.8 5.8 0 1 1 0 11.6Z'/></g></svg>`;
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = "data:image/svg+xml," + encodeURIComponent(svg);
}
function applyBranding() {
  const root = document.documentElement.style;
  root.setProperty("--accent", brand.accent || "#2e7cf6");
  root.setProperty("--accent-2", hexShade(brand.accent || "#2e7cf6", -0.15));
  root.setProperty("--accent-soft", hexRgba(brand.accent || "#2e7cf6", 0.14));
  root.setProperty("--accent-glow", hexRgba(brand.accent || "#2e7cf6", 0.34));
  if (brand.name) document.title = brand.name;
  const tm = document.querySelector('meta[name="theme-color"]');
  if (tm) tm.setAttribute("content", brand.accent || "#2e7cf6");
  setFavicon(brand.accent || "#2e7cf6");
  renderBrand();
}
async function loadBranding() {
  try {
    brand = { ...brand, ...(await api("/api/branding")) };
    if (!localStorage.getItem("tg.view") && brand.viewMode) {
      state.view = brand.viewMode === "list" ? "list" : "grid";
    }
  } catch {}
  applyBranding();
}
const brandMark = (size = 20) =>
  brand.logo
    ? `<img class="brand-logo-img" src="${esc(brand.logo)}" alt="" width="${size}" height="${size}" />`
    : icon("cloud", { size, cls: "brand-logo" });
const brandName = () => esc(brand.name || "Telegram Disk");
const brandFootCopyright = () => (brand.copyright ? brand.copyright : `© ${new Date().getFullYear()} ${brand.name || "Telegram Disk"}`);

const fileIcon = (kind, size = 32) => {
  const f = FILE_ICONS[kind] || FILE_ICONS.file;
  return `<span class="ft ${f.c}">${icon(f.i, { size })}</span>`;
};

function getSessionToken() {
  try {
    return sessionStorage.getItem("tg.sid") || localStorage.getItem("tg.sid") || "";
  } catch {
    return "";
  }
}
function setSessionToken(tok, remember = true) {
  try {
    sessionStorage.removeItem("tg.sid");
    localStorage.removeItem("tg.sid");
    if (tok) (remember ? localStorage : sessionStorage).setItem("tg.sid", tok);
  } catch {}
}
function authUrl(url) {
  const t = getSessionToken();
  if (!t || !url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  return url + (url.includes("?") ? "&" : "?") + "_st=" + encodeURIComponent(t);
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const sid = getSessionToken();
  if (sid && !headers["X-Session"]) headers["X-Session"] = sid;
  const res = await fetch(path, {
    credentials: "include",
    ...opts,
    headers,
  });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) {
    let msg = res.statusText || "Request failed";
    if (ct.includes("json")) {
      const j = await res.json().catch(() => ({}));
      if (res.status === 401 && j.needsLogin) setSessionToken("");
      const err = new Error(j.error || msg);
      err.status = res.status;
      err.data = j;
      throw err;
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (ct.includes("json")) return res.json();
  return res;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtSize(n) {
  if (n == null || isNaN(n)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? Math.round(n) : n.toFixed(1)) + " " + u[i];
}
function fmtDate(t) {
  if (!t) return "";
  return new Date(t * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function fmtDur(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}
function fullUrl(u) {
  if (!u) return "";
  return u.startsWith("/") ? `${location.origin}${u}` : u;
}
function extractYouTubeId(url) {
  if (!url) return null;
  const str = String(url).trim();
  const shortMatch = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (shortMatch) return shortMatch[1];
  const pathMatch = str.match(/youtube\.com\/(?:shorts|embed|v|live)\/([a-zA-Z0-9_-]{11})/i);
  if (pathMatch) return pathMatch[1];
  const queryMatch = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
  if (queryMatch) return queryMatch[1];
  const anyMatch = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i);
  return anyMatch ? anyMatch[1] : null;
}

/* ===================== Modals & Dialogs ===================== */
function modalOverlay(inner, { closeOnBg = true } = {}) {
  const bg = el(`<div class="modal-bg"></div>`);
  bg.appendChild(inner);
  document.body.appendChild(bg);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    bg.remove();
  };
  if (closeOnBg) bg.onclick = (e) => { if (e.target === bg) close(); };
  bg._close = close;
  bg._inner = inner;
  return bg;
}
function uiAlert(message, { title = "", okText = "OK", icon: ic } = {}) {
  return new Promise((resolve) => {
    const card = el(`<div class="modal card-modal gd-dialog">
      <div class="gd-dialog-body">${ic ? `<div class="gd-dlg-ic">${ic}</div>` : ""}${title ? `<div class="gd-dlg-title">${esc(title)}</div>` : ""}${message ? `<div class="gd-dlg-msg">${esc(message)}</div>` : ""}</div>
      <div class="gd-dialog-actions"><button class="primary" id="gdOk">${esc(okText)}</button></div>
    </div>`);
    const bg = modalOverlay(card);
    card.querySelector("#gdOk").onclick = () => { bg._close(); resolve(true); };
    document.addEventListener("keydown", function h(e) {
      if (e.key === "Escape" || e.key === "Enter") {
        bg._close();
        document.removeEventListener("keydown", h);
        resolve(true);
      }
    });
  });
}
function uiConfirm(message, { title = "Please confirm", okText = "Confirm", cancelText = "Cancel", danger = false, icon: ic } = {}) {
  return new Promise((resolve) => {
    const card = el(`<div class="modal card-modal gd-dialog">
      <div class="gd-dialog-body">${ic ? `<div class="gd-dlg-ic ${danger ? "err-ic" : ""}">${ic}</div>` : ""}<div class="gd-dlg-title">${esc(title)}</div>${message ? `<div class="gd-dlg-msg">${message}</div>` : ""}</div>
      <div class="gd-dialog-actions"><button class="btn-2 ghost" id="gdNo">${esc(cancelText)}</button><button class="${danger ? "btn-2 danger-solid" : "primary"}" id="gdYes">${esc(okText)}</button></div>
    </div>`);
    const bg = modalOverlay(card);
    let val = false;
    const done = () => { bg._close(); resolve(val); };
    card.querySelector("#gdNo").onclick = done;
    card.querySelector("#gdYes").onclick = () => { val = true; done(); };
    document.addEventListener("keydown", function h(e) {
      if (e.key === "Escape") { document.removeEventListener("keydown", h); done(); }
      if (e.key === "Enter") { val = true; document.removeEventListener("keydown", h); done(); }
    });
  });
}
function uiPrompt({ label = "", placeholder = "", value = "", title = "", okText = "OK", multiline = false, validate } = {}) {
  return new Promise((resolve) => {
    const field = multiline
      ? `<textarea id="pIn" rows="4" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input id="pIn" placeholder="${esc(placeholder)}" value="${esc(value)}" />`;
    const card = el(`<div class="modal card-modal gd-dialog">
      <div class="gd-dialog-body">${title ? `<div class="gd-dlg-title">${esc(title)}</div>` : ""}${label ? `<div class="gd-dlg-msg">${esc(label)}</div>` : ""}<div class="gd-dlg-field">${field}</div><div class="err" id="pErr"></div></div>
      <div class="gd-dialog-actions"><button class="btn-2 ghost" id="gdNo">Cancel</button><button class="primary" id="gdYes">${esc(okText)}</button></div>
    </div>`);
    const bg = modalOverlay(card);
    const input = card.querySelector("#pIn");
    const errEl = card.querySelector("#pErr");
    setTimeout(() => { input.focus(); input.select && input.select(); }, 30);
    const submit = () => {
      const v = input.value;
      if (validate) {
        const e = validate(v);
        if (e) return (errEl.textContent = e);
      }
      bg._close();
      resolve(v);
    };
    const cancel = () => { bg._close(); resolve(null); };
    card.querySelector("#gdYes").onclick = submit;
    card.querySelector("#gdNo").onclick = cancel;
    input.onkeydown = (e) => {
      if (e.key === "Enter" && !multiline) submit();
      if (e.key === "Escape") cancel();
    };
  });
}

let __menu = null;
function closeMenus() {
  if (__menu) {
    __menu.remove();
    __menu = null;
    document.removeEventListener("mousedown", onMenuAway, true);
  }
}
function onMenuAway(e) {
  if (__menu && !__menu.contains(e.target) && !e.target.closest(".gd-menu-anchor")) closeMenus();
}
function openMenu(anchor, items, { align = "left", header } = {}) {
  closeMenus();
  const m = el(`<div class="gd-menu"></div>`);
  if (header) m.appendChild(el(`<div class="gd-menu-head">${header}</div>`));
  items.forEach((it) => {
    if (it.divider) {
      m.appendChild(el(`<div class="gd-menu-div"></div>`));
      return;
    }
    const b = it.href
      ? el(`<a class="gd-menu-item${it.danger ? " danger" : ""}" href="${esc(it.href)}" target="_blank" rel="noopener">${it.icon ? `<span class="gd-menu-ic">${it.icon}</span>` : ""}<span>${esc(it.label)}</span></a>`)
      : el(`<button type="button" class="gd-menu-item${it.danger ? " danger" : ""}">${it.icon ? `<span class="gd-menu-ic">${it.icon}</span>` : ""}<span>${esc(it.label)}</span></button>`);
    b.onclick = () => {
      closeMenus();
      it.onClick && it.onClick();
    };
    if (it.disabled) b.disabled = true;
    m.appendChild(b);
  });
  m.style.visibility = "hidden";
  document.body.appendChild(m);
  __menu = m;
  anchor.classList.add("gd-menu-anchor");
  requestAnimationFrame(() => {
    const r = anchor.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    let left = align === "right" ? r.right - mr.width : r.left;
    let top = r.bottom + 6;
    if (left + mr.width > window.innerWidth - 8) left = window.innerWidth - mr.width - 8;
    if (left < 8) left = 8;
    if (top + mr.height > window.innerHeight - 8) top = Math.max(8, r.top - mr.height - 6);
    m.style.left = left + "px";
    m.style.top = top + "px";
    m.style.visibility = "visible";
  });
  setTimeout(() => document.addEventListener("mousedown", onMenuAway, true), 0);
  return m;
}

/* ===================== App State ===================== */
const state = {
  auth: null,
  user: null,
  accounts: [],
  currentAccountId: null,
  folders: [],
  currentFolder: "all",
  currentView: null,
  view: localStorage.getItem("tg.view") || "grid",
  files: [],
  allAccountFiles: [],
  selected: new Set(),
  search: "",
  offsetId: 0,
  loading: false,
  sidebarOpen: false,
  profileOpen: false,
  accountsExpanded: false,
  category: "all", // all | media | documents | links | notes
  subFilter: "all",
  sortBy: "date", // date | name | size
  sortDir: "desc", // desc | asc
  dateZoom: "all", // all | year | month | day
  mobileSortExpanded: false,
};

function theme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("tg.theme", t);
  theme.current = t;
}
theme.current = localStorage.getItem("tg.theme") || "light";
theme(theme.current);

/* ===================== Audio Manager ===================== */
const audioMgr = {
  id: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  el: null,
};

function stopAudio() {
  if (audioMgr.el) {
    try { audioMgr.el.pause(); } catch {}
    audioMgr.el.src = "";
    audioMgr.el = null;
  }
  const prevId = audioMgr.id;
  audioMgr.playing = false;
  if (prevId) updateAudioUI(prevId);
}

function updateAudioUI(id) {
  const isThis = String(audioMgr.id) === String(id);
  const playing = isThis && audioMgr.playing;
  const cur = isThis ? audioMgr.currentTime : 0;
  const rawDur = Number($(`[data-audio-dur="${id}"]`)?.dataset.audioDur || 0);
  const dur = isThis && audioMgr.duration ? audioMgr.duration : rawDur;

  $$(`[data-audio-play="${id}"]`).forEach((btn) => {
    btn.innerHTML = icon(playing ? "pause" : "play", { size: 13 });
  });
  $$(`[data-audio-range="${id}"]`).forEach((rng) => {
    rng.max = String(Math.max(1, Math.floor(dur || 1)));
    rng.value = String(Math.min(Math.floor(dur || 1), Math.floor(cur)));
  });
  $$(`[data-audio-time="${id}"]`).forEach((tm) => {
    tm.textContent = dur ? `${fmtDur(cur)} / ${fmtDur(dur)}` : fmtDur(cur);
  });
}

window.toggleAudioPlay = (id) => {
  const f = state.files.find((x) => String(x.id) === String(id)) || state.allAccountFiles.find((x) => String(x.id) === String(id));
  if (!f) return;

  if (String(audioMgr.id) === String(id) && audioMgr.el) {
    if (audioMgr.playing) {
      audioMgr.playing = false;
      audioMgr.el.pause();
    } else {
      audioMgr.playing = true;
      audioMgr.el.play().catch(() => {
        audioMgr.playing = false;
        updateAudioUI(id);
        toast("Cannot play audio inline — try downloading");
      });
    }
    updateAudioUI(id);
    return;
  }

  stopAudio();
  audioMgr.id = String(id);
  audioMgr.currentTime = 0;
  audioMgr.duration = f.duration || 0;
  audioMgr.playing = true;

  const folderParam = f.folderId || (state.currentFolder !== "all" ? state.currentFolder : state.folders[0]?.id || "saved");
  const a = new Audio(authUrl(`/api/files/${f.id}/raw?folder=${folderParam}`));
  audioMgr.el = a;

  a.addEventListener("loadedmetadata", () => {
    if (isFinite(a.duration) && a.duration > 0) {
      audioMgr.duration = a.duration;
      updateAudioUI(id);
    }
  });
  a.addEventListener("timeupdate", () => {
    if (String(audioMgr.id) === String(id)) {
      audioMgr.currentTime = a.currentTime;
      updateAudioUI(id);
    }
  });
  a.addEventListener("ended", () => {
    audioMgr.playing = false;
    audioMgr.currentTime = 0;
    updateAudioUI(id);
  });
  a.addEventListener("error", () => {
    if (String(audioMgr.id) === String(id)) {
      audioMgr.playing = false;
      updateAudioUI(id);
      toast("Audio stream failed — try downloading");
    }
  });

  a.play().catch(() => {
    if (String(audioMgr.id) === String(id)) {
      audioMgr.playing = false;
      updateAudioUI(id);
    }
  });
  updateAudioUI(id);
};

window.seekAudio = (id, val) => {
  const sec = Number(val) || 0;
  if (String(audioMgr.id) !== String(id)) {
    window.toggleAudioPlay(id);
  }
  audioMgr.currentTime = sec;
  if (audioMgr.el && isFinite(audioMgr.el.duration)) {
    audioMgr.el.currentTime = sec;
  }
  updateAudioUI(id);
};

/* ===================== Boot ===================== */
async function boot() {
  clearInterval(window.__qrPoll);
  await loadBranding();
  const path = location.pathname;
  const m = path.match(/^\/s\/([A-Za-z0-9]+)/);
  if (m) return renderPublicShare(m[1]);

  $("#app").innerHTML = `<div class="center-load"><div class="spinner"></div></div>`;
  try {
    state.auth = await api("/api/auth/state");
  } catch {
    return renderError("Cannot reach the server.");
  }
  if (state.auth.needsSetup) return renderSetup();
  if (!state.auth.loggedIn) return renderLogin();
  state.user = state.auth.user;
  state.accounts = state.auth.accounts;
  state.currentAccountId = state.auth.currentAccountId || state.accounts[0]?.id || null;
  if (state.currentAccountId && state.auth.currentAccountId == null) {
    await api("/api/accounts/switch/" + state.currentAccountId, { method: "POST" });
  }
  if (!state.accounts.length) {
    return state.user?.isAdmin ? renderConnect() : renderNoAccounts();
  }
  renderApp();
  await loadFolders();
}

function renderNoAccounts() {
  $("#app").innerHTML = authShell(
    "No drive connected",
    "An administrator needs to connect a Telegram account before you can browse files.",
    `<button class="primary block" onclick="logout()">${icon("logout", { size: 16 })} Log out</button>`
  );
}
function renderError(msg) {
  $("#app").innerHTML = `<div class="auth-wrap"><div class="auth-card"><div class="auth-head">${icon("alert", { size: 30, cls: "err-ic" })}<h1>Something went wrong</h1></div><p class="sub">${esc(msg)}</p><button class="primary" onclick="location.reload()">${icon("refresh", { size: 16 })} Retry</button></div></div>`;
}

/* ===================== Auth Screens ===================== */
function authShell(head, sub, bodyHtml) {
  return `<div class="auth-wrap"><div class="auth-card">
    <div class="auth-brand">${brandMark(28)}</div>
    <div class="auth-head"><h1>${head}</h1></div>
    <p class="sub">${sub}</p>
    ${bodyHtml}
  </div></div>`;
}
function renderSetup() {
  $("#app").innerHTML = authShell("Welcome", "Create the admin account to manage this drive.", `
  <form id="setupForm">
    <div class="field"><label>Admin username</label>
      <div class="input-wrap">${icon("user", { size: 16, cls: "lead" })}<input id="un" required autocomplete="username" autofocus placeholder="username" /></div></div>
    <div class="field"><label>Admin password</label>
      <div class="input-wrap">${icon("lock", { size: 16, cls: "lead" })}<input type="password" id="pw" required minlength="4" autocomplete="new-password" placeholder="Choose a password" /></div></div>
    <div class="field"><label>Confirm password</label>
      <div class="input-wrap">${icon("lock", { size: 16, cls: "lead" })}<input type="password" id="pw2" required minlength="4" placeholder="Repeat password" /></div></div>
    <div class="err" id="err"></div>
    <button class="primary block" type="submit">${icon("shield", { size: 16 })} Create &amp; continue</button>
    <p class="hint">This admin account gates access to the drive and can create other users.</p>
  </form>`);
  $("#setupForm").onsubmit = async (e) => {
    e.preventDefault();
    const p = $("#pw").value, p2 = $("#pw2").value;
    if (p !== p2) return ($("#err").textContent = "Passwords do not match");
    try {
      const r = await api("/api/auth/setup", { method: "POST", body: JSON.stringify({ username: $("#un").value.trim(), password: p }) });
      if (r?.sessionToken) setSessionToken(r.sessionToken, true);
      boot();
    } catch (err) {
      $("#err").textContent = err.message;
    }
  };
}
function renderLogin() {
  $("#app").innerHTML = authShell("Welcome back", "Sign in to your Telegram Disk.", `
  <form id="loginForm">
    <div class="field"><label>Username</label>
      <div class="input-wrap">${icon("user", { size: 16, cls: "lead" })}<input id="un" required autofocus autocomplete="username" placeholder="Username" /></div></div>
    <div class="field"><label>Password</label>
      <div class="input-wrap">${icon("lock", { size: 16, cls: "lead" })}<input type="password" id="pw" required autocomplete="current-password" placeholder="Your password" /></div></div>
    <label class="remember"><input type="checkbox" id="rmb" checked /><span>Remember me</span><small>Stay logged in for 90 days</small></label>
    <div class="err" id="err"></div>
    <button class="primary block" type="submit">${icon("logout", { size: 16, cls: "flip" })} Sign in</button>
  </form>`);
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const remember = $("#rmb").checked;
      const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: $("#un").value, password: $("#pw").value, remember }) });
      if (r?.sessionToken) setSessionToken(r.sessionToken, remember);
      boot();
    } catch (err) {
      $("#err").textContent = err.message;
    }
  };
}

/* ===================== Connect Telegram (QR + Phone) ===================== */
function renderConnect() {
  clearInterval(window.__qrPoll);
  const accs = state.accounts
    .map((a) => `<div class="account-pill">${a.premium ? icon("zap", { size: 14, cls: "gold" }) : ""}<b>${esc(a.label)}</b> <span class="muted">${esc(a.phone || a.username || "")}</span></div>`)
    .join("");
  const presetSel = (id) => (apiPresets.length ? `<select id="${id}" class="mb"><option value="">Enter my own…</option>${apiPresets.map((p, i) => `<option value="${i}">Preset ${i + 1}</option>`).join("")}</select>` : "");
  const apiRow = (idF, hashF) => `<div class="row">
    <div class="input-wrap">${icon("keyRound", { size: 16, cls: "lead" })}<input id="${idF}" placeholder="api_id" inputmode="numeric" required /></div>
    <div class="input-wrap">${icon("keyRound", { size: 16, cls: "lead" })}<input id="${hashF}" placeholder="api_hash" required /></div></div>`;
  $("#app").innerHTML = authShell("Connect Telegram", "Your Telegram account becomes the storage backend.", `
  ${accs ? `<div class="acc-list">${accs}</div>` : ""}
  <div class="tg-tabs">
    <button class="tg-tab active" data-tab="qr">${icon("qrCode", { size: 15 })} QR Code</button>
    <button class="tg-tab" data-tab="sms">${icon("phone", { size: 15 })} Phone</button>
  </div>
  <div id="tabQr"><form id="qrCredsForm">
    <div class="field"><label>API credentials</label>${presetSel("presetQr")}${apiRow("apiIdQr", "apiHashQr")}</div>
    <div class="err" id="errQr"></div>
    <button class="primary block" type="submit">${icon("qrCode", { size: 16 })} Show QR code</button>
  </form></div>
  <div id="tabSms" style="display:none"><form id="connForm">
    <div class="field"><label>API credentials</label>${presetSel("preset")}${apiRow("apiId", "apiHash")}</div>
    <div class="field"><label>Phone number</label>
      <div class="input-wrap">${icon("phone", { size: 16, cls: "lead" })}<input id="phone" placeholder="+1 555 000 0000" required /></div></div>
    <div class="err" id="err"></div>
    <button class="primary block" type="submit">${icon("send", { size: 16 })} Send login code</button>
  </form></div>
  ${state.auth?.accounts?.length ? `<button type="button" class="link-btn" onclick="boot()">${icon("chevronLeft", { size: 14 })} Back to Disk</button>` : ""}
  <p class="hint center">Get <b>api_id</b> / <b>api_hash</b> at <a href="https://my.telegram.org/apps" target="_blank" rel="noopener">my.telegram.org</a></p>`);

  $$(".tg-tab").forEach((btn) => {
    btn.onclick = () => {
      $$(".tg-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      $("#tabQr").style.display = btn.dataset.tab === "qr" ? "" : "none";
      $("#tabSms").style.display = btn.dataset.tab === "sms" ? "" : "none";
    };
  });
  const bp = (s, i, h) => {
    const elS = $(s);
    if (elS) elS.onchange = (e) => { const p = apiPresets[e.target.value]; $(i).value = p ? p.id : ""; $(h).value = p ? p.hash : ""; };
  };
  if (apiPresets.length) { bp("#preset", "#apiId", "#apiHash"); bp("#presetQr", "#apiIdQr", "#apiHashQr"); }

  $("#connForm").onsubmit = async (e) => {
    e.preventDefault();
    $("#err").textContent = "";
    const body = { apiId: $("#apiId").value.trim(), apiHash: $("#apiHash").value.trim(), phone: $("#phone").value.trim() };
    try {
      const r = await api("/api/auth/tg/request", { method: "POST", body: JSON.stringify(body) });
      renderCodeStep(body, r.tempToken, r.isCodeViaApp);
    } catch (err) { $("#err").textContent = err.message; }
  };
  $("#qrCredsForm").onsubmit = async (e) => {
    e.preventDefault();
    $("#errQr").textContent = "";
    const body = { apiId: $("#apiIdQr").value.trim(), apiHash: $("#apiHashQr").value.trim() };
    try {
      const r = await api("/api/auth/tg/qr/start", { method: "POST", body: JSON.stringify(body) });
      if (r.done) return finishConnect();
      renderQrStep(body, r.tempToken, r.qrDataUrl);
    } catch (err) { $("#errQr").textContent = err.message; }
  };
}
function renderQrStep(creds, tempToken, qrDataUrl) {
  $("#app").innerHTML = authShell("Scan QR Code", "Open Telegram → Settings → Devices → Link Desktop Device", `
  <div class="qr-container">
    <div class="qr-frame"><img id="qrImg" src="${qrDataUrl}" alt="QR" width="240" height="240" />
      <div class="qr-overlay" id="qrOverlay" style="display:none"><div class="spinner"></div><span>Confirming…</span></div></div>
    <div class="qr-steps">
      <div class="qr-step"><span class="qr-num">1</span> Open <b>Telegram</b> on your phone</div>
      <div class="qr-step"><span class="qr-num">2</span> Go to <b>Settings → Devices</b></div>
      <div class="qr-step"><span class="qr-num">3</span> Tap <b>Link Desktop Device</b></div>
    </div>
  </div>
  <div class="err" id="errQr"></div>
  <button type="button" class="link-btn" id="qrCancelBtn">${icon("chevronLeft", { size: 14 })} Back</button>`);
  $("#qrCancelBtn").onclick = async () => {
    clearInterval(window.__qrPoll);
    try { await api("/api/auth/tg/qr/cancel", { method: "POST", body: JSON.stringify({ tempToken }) }); } catch {}
    renderConnect();
  };
  window.__qrPoll = setInterval(async () => {
    if (!$("#qrImg")) { clearInterval(window.__qrPoll); return; }
    try {
      const r = await api("/api/auth/tg/qr/check", { method: "POST", body: JSON.stringify({ tempToken }) });
      if (r.qrDataUrl) { const img = $("#qrImg"); if (img && img.src !== r.qrDataUrl) img.src = r.qrDataUrl; }
      if (r.needs2FA) { clearInterval(window.__qrPoll); renderQr2FAStep(tempToken); return; }
      if (r.done) { clearInterval(window.__qrPoll); const ov = $("#qrOverlay"); if (ov) ov.style.display = "flex"; setTimeout(() => finishConnect(), 400); }
    } catch (err) { clearInterval(window.__qrPoll); if ($("#errQr")) $("#errQr").textContent = err.message; }
  }, 1500);
}
function renderQr2FAStep(tempToken) {
  $("#app").innerHTML = authShell("Two-factor password", "Your Telegram account has cloud 2FA enabled.", `
  <form id="qrPwForm"><div class="field"><label>Cloud password</label>
    <div class="input-wrap">${icon("lock", { size: 16, cls: "lead" })}<input type="password" id="qr2faPw" required autofocus placeholder="2FA password" /></div></div>
    <div class="err" id="errQr"></div>
    <button class="primary block" type="submit">${icon("check", { size: 16 })} Unlock</button></form>`);
  $("#qrPwForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/api/auth/tg/qr/password", { method: "POST", body: JSON.stringify({ tempToken, password: $("#qr2faPw").value }) });
      finishConnect();
    } catch (err) { $("#errQr").textContent = err.message; }
  };
}
function renderCodeStep(creds, tempToken, isCodeViaApp) {
  $("#app").innerHTML = authShell("Enter the code", `We sent a code${isCodeViaApp ? " in your Telegram app" : " via SMS"} to ${esc(creds.phone)}.`, `
  <form id="codeForm">
    <div class="field"><label>Login code</label>
      <div class="input-wrap">${icon("shield", { size: 16, cls: "lead" })}<input id="code" inputmode="numeric" required autofocus placeholder="12345" /></div></div>
    <div class="err" id="err"></div>
    <button class="primary block" type="submit">${icon("check", { size: 16 })} Sign in</button>
    <button type="button" class="link-btn" id="resendBtn">${icon("refresh", { size: 14 })} Resend code</button>
  </form>`);
  $("#resendBtn").onclick = async () => {
    try {
      await api("/api/auth/tg/resend", { method: "POST", body: JSON.stringify({ tempToken }) });
      toast("Code resent");
    } catch (err) { $("#err").textContent = err.message; }
  };
  $("#codeForm").onsubmit = async (e) => {
    e.preventDefault();
    $("#err").textContent = "";
    try {
      await api("/api/auth/tg/code", { method: "POST", body: JSON.stringify({ tempToken, code: $("#code").value.trim() }) });
      finishConnect();
    } catch (err) {
      if (err.status === 449 || err.data?.needPassword) return renderPasswordStep(creds, tempToken);
      $("#err").textContent = err.message;
    }
  };
}
function renderPasswordStep(creds, tempToken) {
  $("#app").innerHTML = authShell("Two-factor password", "Your Telegram account has cloud 2FA enabled.", `
  <form id="pwForm"><div class="field"><label>Cloud password</label>
    <div class="input-wrap">${icon("lock", { size: 16, cls: "lead" })}<input type="password" id="password" required autofocus placeholder="2FA password" /></div></div>
    <div class="err" id="err"></div>
    <button class="primary block" type="submit">${icon("check", { size: 16 })} Unlock</button></form>`);
  $("#pwForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/api/auth/tg/password", { method: "POST", body: JSON.stringify({ tempToken, password: $("#password").value }) });
      finishConnect();
    } catch (err) { $("#err").textContent = err.message; }
  };
}
async function finishConnect() {
  state.auth = await api("/api/auth/state");
  state.user = state.auth.user;
  state.accounts = state.auth.accounts;
  state.currentAccountId = state.auth.currentAccountId;
  boot();
}

/* ===================== App Shell ===================== */
function renderBrand() {
  const t = $("#topBrand");
  if (t) {
    t.innerHTML = `<div class="brand-badge">${brandMark(19)}</div><span class="brand-name">${brandName()}</span>`;
  }
}

function renderApp() {
  const acc = state.accounts.find((a) => a.id === state.currentAccountId) || state.accounts[0];
  const initial = (acc?.label || state.user?.username || "T").charAt(0).toUpperCase();

  $("#app").innerHTML = `
  <div class="layout" id="layout">
    <div class="scrim" onclick="toggleSidebar(false)"></div>
    <aside class="sidebar">
      <div class="brand" id="topBrand"></div>
      <button class="gd-new" id="newBtn"><span class="ic-wrap">${icon("plus", { size: 16 })}</span><span>New</span></button>
      <div class="nav" id="nav"></div>
      <div id="breakdownWrap"></div>
      <div class="side-foot">${esc(brandFootCopyright())}</div>
    </aside>
    <main class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" id="menuBtn" title="Menu">${icon("menu", { size: 20 })}</button>
        <div class="searchbox">
          ${icon("search", { size: 17, cls: "lead" })}
          <input class="search" id="search" placeholder="Search ${esc(brand.name || "Telegram Disk")}…" value="${esc(state.search)}" />
          <button class="icon-btn search-clear ${state.search ? "show" : ""}" id="searchClear" title="Clear">${icon("x", { size: 15 })}</button>
        </div>
        <div class="spacer"></div>
        <div class="top-tools">
          <button class="icon-btn" id="themeBtn" title="Toggle theme">${icon(theme.current === "dark" ? "sun" : "moon", { size: 19 })}</button>
          <button class="gd-avatar" id="avatarBtn" title="${esc(acc?.label || state.user?.username || "")}">${esc(initial)}</button>
        </div>
      </header>
      <div class="content" id="content"></div>
      <div class="alphabet-bubble" id="alphabetBubble">A</div>
      <div id="bottomDocks"></div>
    </main>
  </div>`;

  renderBrand();
  $("#menuBtn").onclick = () => toggleSidebar(!state.sidebarOpen);
  $("#search").oninput = (e) => {
    state.search = e.target.value.trim();
    $("#searchClear").classList.toggle("show", !!state.search);
    clearTimeout(window.__st);
    window.__st = setTimeout(() => {
      if (state.currentView) return;
      renderFiles();
    }, 180);
  };
  $("#searchClear").onclick = () => {
    $("#search").value = "";
    state.search = "";
    $("#searchClear").classList.remove("show");
    if (!state.currentView) renderFiles();
  };
  $("#themeBtn").onclick = () => window.setTheme(theme.current === "dark" ? "light" : "dark");
  $("#avatarBtn").onclick = (e) => {
    e.stopPropagation();
    toggleProfilePopover();
  };
  $("#newBtn").onclick = (e) => openNewMenu(e.currentTarget);

  const cEl = $("#content");
  cEl.addEventListener("scroll", onContentScroll, { passive: true });

  mountUploader();
  initServiceWorker();
  renderSidebar();
  renderBottomDocks();
}

window.toggleSidebar = (v) => {
  state.sidebarOpen = v;
  $("#layout")?.classList.toggle("open", v);
};

window.setTheme = (t) => {
  theme(t);
  const b = $("#themeBtn");
  if (b) b.innerHTML = icon(theme.current === "dark" ? "sun" : "moon", { size: 19 });
  if (state.currentView === "settings") viewSettings();
};

function openNewMenu(anchor) {
  const targetFolder = state.currentFolder && state.currentFolder !== "all" ? state.currentFolder : state.folders[0]?.id;
  openMenu(anchor, [
    { icon: icon("plus", { size: 17 }), label: "Add file, note or link", onClick: () => openAddModal("composer") },
    { icon: icon("folderPlus", { size: 17 }), label: targetFolder && state.currentFolder !== "all" ? "New subfolder" : "New folder", onClick: () => newFolder(state.currentFolder !== "all" ? state.currentFolder : null) },
    { icon: icon("inbox", { size: 17 }), label: "Import Telegram chat", onClick: () => importChatModal() },
    { divider: true },
    { icon: icon("uploadCloud", { size: 17 }), label: "Upload files", onClick: () => pickUpload(targetFolder) },
    { icon: icon("hardDriveDownload", { size: 17 }), label: "Upload folder", onClick: () => pickUploadFolder(targetFolder) },
  ]);
}

/* ===================== Profile Popover (with Expandable Account Switcher) ===================== */
function closeProfilePopover() {
  $("#profilePopover")?.remove();
  state.profileOpen = false;
  document.removeEventListener("mousedown", onProfAway, true);
}
function onProfAway(e) {
  const pop = $("#profilePopover");
  if (pop && !pop.contains(e.target) && !e.target.closest("#avatarBtn")) closeProfilePopover();
}
function toggleProfilePopover() {
  if (state.profileOpen) return closeProfilePopover();
  state.profileOpen = true;
  renderProfilePopover();
  setTimeout(() => document.addEventListener("mousedown", onProfAway, true), 0);
}
function renderProfilePopover() {
  $("#profilePopover")?.remove();
  const acc = state.accounts.find((a) => a.id === state.currentAccountId) || state.accounts[0];
  const init = (acc?.label || state.user?.username || "T").charAt(0).toUpperCase();
  const isAdmin = !!state.user?.isAdmin;

  const accRows = state.accounts
    .map(
      (a) => `<button class="prof-acc-item ${a.id === state.currentAccountId ? "active" : ""}" data-switch-acc="${a.id}">
        <span class="prof-acc-dot">${esc((a.label || "?").charAt(0).toUpperCase())}</span>
        <span class="prof-acc-info">
          <div class="prof-acc-nm">${esc(a.label)}</div>
          <div class="prof-acc-ph">${esc(a.phone || (a.username ? "@" + a.username : ""))}</div>
        </span>
        ${a.id === state.currentAccountId ? icon("check", { size: 14 }) : ""}
      </button>`
    )
    .join("");

  const pop = el(`<div class="profile-popover" id="profilePopover">
    <div class="prof-active-card">
      <div class="prof-init">${esc(init)}</div>
      <div class="prof-meta">
        <div class="prof-name">${esc(acc?.label || state.user?.username || "")} ${acc?.premium ? icon("zap", { size: 12, cls: "gold" }) : ""}</div>
        <div class="prof-sub">${esc(acc?.phone || (acc?.username ? "@" + acc.username : state.user?.username || ""))}</div>
      </div>
      <button class="prof-expand-btn ${state.accountsExpanded ? "open" : ""}" id="profExpandBtn" title="Switch account">
        ${icon("chevronDown", { size: 16 })}
      </button>
    </div>
    ${
      state.accountsExpanded
        ? `<div class="prof-acc-drawer">
            ${accRows}
            ${isAdmin ? `<button class="prof-acc-item" id="profConnectAcc">${icon("userPlus", { size: 15 })}<span>Connect Telegram account</span></button>` : ""}
          </div>`
        : ""
    }
    <div class="prof-div"></div>
    <button class="prof-action" id="profSettings">${icon("settings", { size: 16 })}<span>Settings & Preferences</span></button>
    <button class="prof-action" id="profShares">${icon("share", { size: 16 })}<span>Share links</span></button>
    <button class="prof-action danger" id="profLogout">${icon("logout", { size: 16 })}<span>Log out</span></button>
  </div>`);

  document.body.appendChild(pop);
  pop.querySelector("#profExpandBtn").onclick = (e) => {
    e.stopPropagation();
    state.accountsExpanded = !state.accountsExpanded;
    renderProfilePopover();
  };
  $$("[data-switch-acc]", pop).forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.switchAcc;
      closeProfilePopover();
      if (id !== state.currentAccountId) await window.switchAcc(id);
    };
  });
  pop.querySelector("#profConnectAcc")?.addEventListener("click", () => {
    closeProfilePopover();
    addAccount();
  });
  pop.querySelector("#profSettings").onclick = () => { closeProfilePopover(); openView("settings"); };
  pop.querySelector("#profShares").onclick = () => { closeProfilePopover(); openView("shares"); };
  pop.querySelector("#profLogout").onclick = () => { closeProfilePopover(); logout(); };
}

/* ===================== Sidebar & Content Breakdown (NO Categories) ===================== */
function renderSidebar() {
  const nav = $("#nav");
  if (!nav) return;

  const allCount = state.allAccountFiles.length;
  const allActive = !state.currentView && state.currentFolder === "all";

  const rootFolders = state.folders.filter((f) => !f.parentId);
  const renderFolderNodes = (list, depth = 0) =>
    list
      .map((f) => {
        const active = !state.currentView && state.currentFolder === f.id;
        const ic = f.kind === "saved" ? "inbox" : "folder";
        const count = countForFolder(f.id);
        const kids = state.folders.filter((k) => k.parentId === f.id);
        return `<div class="nav-item ${active ? "active" : ""}" data-folder="${f.id}" style="padding-left:${12 + depth * 16}px" title="${esc(f.title)}">
            ${depth > 0 ? `<span class="nav-sub-dot"></span>` : ""}${icon(ic, { size: 17 })}
            <span class="nm">${esc(f.title)}</span>
            ${count ? `<span class="nav-count">${count}</span>` : ""}
          </div>${kids.length ? renderFolderNodes(kids, depth + 1) : ""}`;
      })
      .join("");

  const libItem = (v, label, ic) =>
    `<div class="nav-item ${state.currentView === v ? "active" : ""}" data-view="${v}">${icon(ic, { size: 17 })}<span class="nm">${label}</span></div>`;
  const isAdmin = !!state.user?.isAdmin;

  nav.innerHTML = `
    <div class="sec">My Folders</div>
    <div class="nav-item ${allActive ? "active" : ""}" data-folder="all">
      ${icon("layers", { size: 17 })}<span class="nm">All Files</span>
      ${allCount ? `<span class="nav-count">${allCount}</span>` : ""}
    </div>
    ${renderFolderNodes(rootFolders) || `<div class="nav-muted">No folders yet</div>`}
    <div class="sec">Library</div>
    ${libItem("shares", "Share links", "share")}
    ${isAdmin ? libItem("keys", "API keys", "key") : ""}
    ${isAdmin ? libItem("users", "Users", "users") : ""}
    ${libItem("settings", "Settings", "settings")}`;

  $$(".nav-item[data-folder]", nav).forEach((n) => (n.onclick = () => openFolder(n.dataset.folder)));
  $$(".nav-item[data-view]", nav).forEach((n) => (n.onclick = () => openView(n.dataset.view)));

  renderBreakdown();
}

function countForFolder(fid) {
  if (fid === "all") return state.allAccountFiles.length;
  return state.allAccountFiles.filter((f) => f.folderId === fid).length;
}

function renderBreakdown() {
  const wrap = $("#breakdownWrap");
  if (!wrap) return;
  const items = state.allAccountFiles.length ? state.allAccountFiles : state.files;
  const totalBytes = items.reduce((s, f) => s + (f.size || 0), 0);

  let media = 0, docs = 0, links = 0, notes = 0;
  for (const f of items) {
    if (f.kind === "image" || f.kind === "video" || f.kind === "audio") media++;
    else if (f.kind === "link") links++;
    else if (f.kind === "note") notes++;
    else docs++;
  }
  const tot = Math.max(1, items.length);
  wrap.innerHTML = `<div class="breakdown-card">
    <div class="breakdown-head"><span>Content breakdown</span><span>${fmtSize(totalBytes)}</span></div>
    <div class="breakdown-bar">
      ${media ? `<div class="breakdown-seg" style="width:${(media / tot) * 100}%;background:#2e7cf6"></div>` : ""}
      ${docs ? `<div class="breakdown-seg" style="width:${(docs / tot) * 100}%;background:#f59e0b"></div>` : ""}
      ${links ? `<div class="breakdown-seg" style="width:${(links / tot) * 100}%;background:#10b981"></div>` : ""}
      ${notes ? `<div class="breakdown-seg" style="width:${(notes / tot) * 100}%;background:#eab308"></div>` : ""}
    </div>
    <div class="breakdown-legend">
      <div class="breakdown-leg"><span class="breakdown-dot" style="background:#2e7cf6"></span>Media (${media})</div>
      <div class="breakdown-leg"><span class="breakdown-dot" style="background:#f59e0b"></span>Docs (${docs})</div>
      <div class="breakdown-leg"><span class="breakdown-dot" style="background:#10b981"></span>Links (${links})</div>
      <div class="breakdown-leg"><span class="breakdown-dot" style="background:#eab308"></span>Notes (${notes})</div>
    </div>
  </div>`;
}

/* ===================== Bottom Navigation Docks ===================== */
function renderBottomDocks() {
  const wrap = $("#bottomDocks");
  if (!wrap) return;
  if (state.currentView) {
    wrap.innerHTML = "";
    return;
  }

  const tabs = [
    { k: "all", l: "All", i: "home" },
    { k: "media", l: "Media", i: "image" },
    { k: "documents", l: "Documents", i: "fileText" },
    { k: "links", l: "Links", i: "globe" },
    { k: "notes", l: "Notes", i: "stickyNote" },
  ];
  const mobOrder = [
    { k: "media", l: "Media", i: "image" },
    { k: "documents", l: "Docs", i: "fileText" },
    { k: "all", l: "Home", i: "home" },
    { k: "links", l: "Links", i: "link2" },
    { k: "notes", l: "Notes", i: "file" },
  ];

  wrap.innerHTML = `
    <div class="desktop-dock">
      ${tabs.map((t) => `<button class="dock-pill ${state.category === t.k ? "active" : ""}" data-cat="${t.k}">${icon(t.i, { size: 15 })}<span>${t.l}</span></button>`).join("")}
      <button class="dock-add-btn" id="deskAddBtn">${icon("plus", { size: 15 })}<span>Add</span></button>
    </div>
    <div class="mobile-dock-wrap">
      <button class="mob-fab" id="mobAddFab" title="Add">${icon("plus", { size: 26, stroke: 2.4 })}</button>
      <div class="mobile-dock">
        ${mobOrder.map((t) => `<button class="mob-dock-btn ${state.category === t.k ? "active" : ""}" data-cat="${t.k}" title="${t.l}">${icon(t.i, { size: 20 })}<span class="mob-dock-label">${t.l}</span></button>`).join("")}
      </div>
    </div>`;

  $$("[data-cat]", wrap).forEach((b) => {
    b.onclick = () => {
      state.category = b.dataset.cat;
      state.subFilter = "all";
      renderBottomDocks();
      renderFiles();
    };
  });
  $("#deskAddBtn").onclick = () => openAddModal("composer");
  $("#mobAddFab").onclick = () => openAddModal("composer");
}

/* ===================== Data Loading & Folder Navigation ===================== */
async function syncAccountAllFiles() {
  try {
    const r = await api("/api/files?folder=all&limit=200");
    state.allAccountFiles = r.items || [];
    renderSidebar();
  } catch {}
}

async function loadFolders() {
  try {
    const r = await api("/api/folders");
    state.folders = r.folders || [];
    await syncAccountAllFiles();
    if (!state.currentFolder || (state.currentFolder !== "all" && !state.folders.some((f) => f.id === state.currentFolder))) {
      state.currentFolder = "all";
    }
    await openFolder(state.currentFolder);
  } catch (err) {
    $("#content").innerHTML = emptyHtml(err.message, "alert");
  }
}

async function openFolder(id) {
  state.currentFolder = id || "all";
  state.currentView = null;
  state.selected.clear();
  toggleSidebar(false);
  renderSidebar();
  renderBottomDocks();
  await loadFiles(true);
}
window.openFolder = openFolder;

async function loadFiles(reset) {
  if (!state.currentFolder) return;
  if (reset) {
    state.offsetId = 0;
    state.files = [];
    $("#content").innerHTML = `<div class="center-load"><div class="spinner"></div></div>`;
  }
  state.loading = true;
  if (!reset) {
    const btn = $("#loadMoreBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-sm"></span> Loading…`;
    }
  }
  try {
    const r = await api(
      `/api/files?folder=${encodeURIComponent(state.currentFolder)}&limit=60${state.offsetId ? `&offsetId=${state.offsetId}` : ""}`
    );
    state.files = reset ? r.items : [...state.files, ...r.items];
    state.offsetId = r.nextOffset;
    if (state.currentFolder === "all" && reset && !state.offsetId) {
      state.allAccountFiles = [...state.files];
    } else if (reset) {
      syncAccountAllFiles();
    }
    renderSidebar();
    renderFiles();
  } catch (err) {
    if (reset) {
      $("#content").innerHTML = emptyHtml(err.message, "alert");
    } else {
      toast(err.message);
      renderFiles();
    }
  } finally {
    state.loading = false;
  }
}
window.loadFiles = loadFiles;

function folderChain(id) {
  if (!id || id === "all") return [];
  const chain = [];
  let cur = state.folders.find((f) => f.id === id);
  let guard = 0;
  while (cur && guard++ < 50) {
    chain.unshift(cur);
    cur = cur.parentId ? state.folders.find((f) => f.id === cur.parentId) : null;
  }
  return chain;
}

/* ===================== Filtering & Sorting ===================== */
function matchesCategory(f, cat) {
  if (cat === "all") return true;
  if (cat === "media") return f.kind === "image" || f.kind === "video" || f.kind === "audio";
  if (cat === "links") return f.kind === "link";
  if (cat === "notes") return f.kind === "note";
  if (cat === "documents") return !["image", "video", "audio", "link", "note"].includes(f.kind);
  return true;
}

function getContextualChips(baseItems) {
  if (state.category === "media") {
    return [
      { k: "all", l: "All Media" },
      { k: "image", l: "Photos" },
      { k: "video", l: "Videos" },
      { k: "audio", l: "Audio" },
    ];
  }
  if (state.category === "documents") {
    const exts = [...new Set(baseItems.map((f) => (f.ext || "file").toUpperCase()))].sort();
    return [{ k: "all", l: "All Docs" }, ...exts.map((e) => ({ k: e.toLowerCase(), l: e }))];
  }
  if (state.category === "links") {
    return [
      { k: "all", l: "All Links" },
      { k: "preview", l: "With Preview" },
      { k: "plain", l: "URL Only" },
    ];
  }
  if (state.category === "notes") {
    return [
      { k: "all", l: "All Notes" },
      { k: "long", l: "Detailed" },
      { k: "short", l: "Quick" },
    ];
  }
  return [];
}

function applySubFilter(items) {
  if (state.subFilter === "all") return items;
  if (state.category === "media") return items.filter((f) => f.kind === state.subFilter);
  if (state.category === "documents") return items.filter((f) => (f.ext || "file").toLowerCase() === state.subFilter);
  if (state.category === "links") {
    return items.filter((f) => {
      const hasPrev = !!(f.hasPreview || extractYouTubeId(f.url) || f.thumbUrl || f.hasThumb);
      return state.subFilter === "preview" ? hasPrev : !hasPrev;
    });
  }
  if (state.category === "notes") return items.filter((f) => (state.subFilter === "long" ? (f.noteContent || "").length > 120 : (f.noteContent || "").length <= 120));
  return items;
}

function getProcessedFiles() {
  let items = state.files.slice();
  if (state.search) {
    const q = state.search.toLowerCase();
    items = items.filter((f) =>
      `${f.name || ""} ${f.caption || ""} ${f.noteContent || ""} ${f.domain || ""} ${f.url || ""}`.toLowerCase().includes(q)
    );
  }
  items = items.filter((f) => matchesCategory(f, state.category));
  const afterCat = items.slice();
  items = applySubFilter(items);

  const dir = state.sortDir === "asc" ? 1 : -1;
  items.sort((a, b) => {
    if (state.sortBy === "name") {
      return dir * String(a.caption || a.name || "").localeCompare(String(b.caption || b.name || ""), undefined, { sensitivity: "base" });
    }
    if (state.sortBy === "size") {
      return dir * ((Number(a.size) || 0) - (Number(b.size) || 0));
    }
    return dir * ((Number(a.date) || 0) - (Number(b.date) || 0));
  });

  return { items, afterCat };
}

/* ===================== Folders Carousel (with Peeking Files) ===================== */
function folderGraphicHtml(fid) {
  const pool = fid === "all" ? state.allAccountFiles : state.allAccountFiles.filter((f) => f.folderId === fid);
  const peeks = pool.filter((f) => f.kind === "image" || f.kind === "video").slice(0, 3);
  const peekHtml = peeks
    .map((p) => {
      const src = authUrl(p.thumbUrl || `/api/files/${p.id}/thumb?folder=${p.folderId || fid}`);
      return `<div class="peek-sheet"><img src="${esc(src)}" alt="" onerror="this.parentNode.remove()" /></div>`;
    })
    .join("");

  const hasMedia = pool.some((p) => p.kind === "image" || p.kind === "audio");
  const hasVideo = pool.some((p) => p.kind === "video");
  const hasDoc = pool.some((p) => !["image", "video", "audio", "link", "note"].includes(p.kind));
  const hasLink = pool.some((p) => p.kind === "link");
  const badges = [];
  if (hasMedia) badges.push(`<span class="ftype-dot media">${icon("image", { size: 11 })}</span>`);
  if (hasVideo && badges.length < 3) badges.push(`<span class="ftype-dot video">${icon("film", { size: 11 })}</span>`);
  if (hasDoc && badges.length < 3) badges.push(`<span class="ftype-dot doc">${icon("fileText", { size: 11 })}</span>`);
  if (hasLink && badges.length < 3) badges.push(`<span class="ftype-dot link">${icon("globe", { size: 11 })}</span>`);
  if (!badges.length) badges.push(`<span class="ftype-dot media">${icon("folder", { size: 11 })}</span>`);

  return `<div class="folder-graphic">
    <div class="folder-back"></div>
    <div class="folder-peeks">${peekHtml}</div>
    <div class="folder-front"><div class="folder-type-badges">${badges.slice(0, 3).join("")}</div></div>
  </div>`;
}

function renderFoldersCarousel() {
  const currentSubs = state.currentFolder && state.currentFolder !== "all"
    ? state.folders.filter((f) => f.parentId === state.currentFolder)
    : [];
  const rootFolders = state.folders.filter((f) => !f.parentId);
  const displayList = currentSubs.length ? currentSubs : rootFolders;

  const allTile = !currentSubs.length
    ? `<div class="folder-tile ${state.currentFolder === "all" ? "active" : ""}" data-folder-tile="all">
        ${folderGraphicHtml("all")}
        <div class="folder-title">All Files</div>
        <div class="folder-count">${state.allAccountFiles.length} Files</div>
      </div>`
    : "";

  const tiles = displayList
    .map((f) => {
      const cnt = countForFolder(f.id);
      return `<div class="folder-tile ${state.currentFolder === f.id ? "active" : ""}" data-folder-tile="${f.id}">
        ${!f.isSaved ? `<button class="folder-del-btn" title="Delete folder" onclick="event.stopPropagation();deleteFolder('${f.id}')">${icon("trash", { size: 12 })}</button>` : ""}
        ${folderGraphicHtml(f.id)}
        <div class="folder-title" title="${esc(f.title)}">${esc(f.title)}</div>
        <div class="folder-count">${cnt} File${cnt === 1 ? "" : "s"}</div>
      </div>`;
    })
    .join("");

  const chain = folderChain(state.currentFolder);
  const heading = chain.length
    ? `<span class="crumb" onclick="openFolder('all')">Folders</span>${chain
        .map((c, idx) => `<span class="crumb-sep">${icon("chevronRight", { size: 14 })}</span>${idx === chain.length - 1 ? `<span class="crumb-current" title="${esc(c.title)}">${esc(c.title)}</span>` : `<span class="crumb" onclick="openFolder('${c.id}')" title="${esc(c.title)}">${esc(c.title)}</span>`}`)
        .join("")}`
    : `<span>Folders</span>`;

  const activeFolderObj = state.folders.find((x) => x.id === state.currentFolder);
  const shareBtn = activeFolderObj
    ? `<button class="btn-2 sm" id="shareFolderBtn">${icon("share", { size: 14 })}<span>Share folder</span></button>`
    : "";
  const importBtn = `<button class="btn-2 sm" id="importChatQuickBtn">${icon("inbox", { size: 14 })}<span>Import</span></button>`;
  const subBtn = `<button class="btn-2 sm" id="newFolderQuickBtn">${icon("folderPlus", { size: 14 })}<span>${activeFolderObj ? "Subfolder" : "New folder"}</span></button>`;

  return `
    <div class="section-heading-row">
      <div class="section-heading">${heading}</div>
      <div class="heading-actions">
        <div class="heading-actions-desktop">${shareBtn}${importBtn}${subBtn}</div>
        <div class="heading-actions-mobile">
          <button class="btn-2 sm folder-more-btn" id="folderMoreBtn" title="Folder actions">
            ${icon("moreH", { size: 16 })}
          </button>
        </div>
      </div>
    </div>
    <div class="folders-carousel">${allTile}${tiles}</div>`;
}

/* ===================== Toolbar & Grouping ===================== */
function renderToolbarHtml(afterCat) {
  const chips = getContextualChips(afterCat);
  const dirIcon = state.sortDir === "asc" ? "arrowUpNarrowWide" : "arrowDownWideNarrow";
  const collapsed = state.sortBy === "date" && !state.mobileSortExpanded;

  const sortGroup = `
    <div class="sort-group ${collapsed ? "collapsed" : ""}">
      <button class="sort-circle-btn sort-pill-mobile-btn" id="mobSortExpandBtn" title="Sort options">
        ${icon(dirIcon, { size: 15 })}
      </button>
      <div class="segmented-pill sort-pill-desktop">
        <button class="seg-btn ${state.sortBy === "date" ? "active" : ""}" data-sort="date">Date ${state.sortBy === "date" ? icon(dirIcon, { size: 13 }) : ""}</button>
        <button class="seg-btn ${state.sortBy === "name" ? "active" : ""}" data-sort="name">Name ${state.sortBy === "name" ? icon(dirIcon, { size: 13 }) : ""}</button>
        <button class="seg-btn ${state.sortBy === "size" ? "active" : ""}" data-sort="size">Size ${state.sortBy === "size" ? icon(dirIcon, { size: 13 }) : ""}</button>
      </div>
    </div>`;

  const zoomGroup = state.sortBy === "date"
    ? `<div class="segmented-pill zoom-pill">
      ${["year", "month", "day", "all"]
        .map((z) => `<button class="seg-btn ${state.dateZoom === z ? "active" : ""}" data-zoom="${z}">${z === "all" ? "All" : z[0].toUpperCase() + z.slice(1)}</button>`)
        .join("")}
    </div>`
    : "";

  const viewGroup = `
    <div class="segmented-pill">
      <button class="seg-btn ${state.view === "grid" ? "active" : ""}" data-view-mode="grid" title="Cards">${icon("layoutGrid", { size: 14 })}</button>
      <button class="seg-btn ${state.view === "list" ? "active" : ""}" data-view-mode="list" title="List">${icon("list", { size: 14 })}</button>
    </div>`;

  const chipsHtml = chips.length
    ? `<div class="filter-chips-bar">${chips.map((c) => `<button class="chip ${state.subFilter === c.k ? "active" : ""}" data-sub="${esc(c.k)}">${esc(c.l)}</button>`).join("")}</div>`
    : "";

  return `<div class="toolbar-container">
      <div class="toolbar-main">
        ${sortGroup}
        ${zoomGroup}
        <div class="spacer"></div>
        ${viewGroup}
      </div>
    </div>
    ${chipsHtml}`;
}

function getPeriodKeyAndLabel(tsSec, zoom) {
  const d = new Date((Number(tsSec) || 0) * 1000);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (zoom === "year") return { key: `${y}`, label: `${y}` };
  if (zoom === "month") {
    return {
      key: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    };
  }
  return {
    key: `${y}-${String(m + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    label: d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
  };
}

function groupItemsByDateZoom(items, zoom) {
  const map = new Map();
  for (const it of items) {
    const { key, label } = getPeriodKeyAndLabel(it.date, zoom);
    if (!map.has(key)) map.set(key, { key, label, items: [] });
    map.get(key).items.push(it);
  }
  return [...map.values()];
}

/* ===================== Card & Row Rendering ===================== */
function cardActionsHtml(f) {
  if (f.kind === "link") {
    return `<div class="card-actions">
      <button class="ca-btn" title="Copy link" onclick="event.stopPropagation();copyTxt('${esc(f.url || "")}')">${icon("copy", { size: 14 })}</button>
      <a class="ca-btn" title="Open link" href="${esc(f.url || "#")}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${icon("externalLink", { size: 14 })}</a>
      <button class="ca-btn danger" title="Delete" onclick="event.stopPropagation();deleteFileById('${f.id}')">${icon("trash", { size: 14 })}</button>
    </div>`;
  }
  return `<div class="card-actions">
    <button class="ca-btn" title="Download" onclick="event.stopPropagation();downloadFileById('${f.id}')">${icon("download", { size: 14 })}</button>
    <button class="ca-btn" title="Share" onclick="event.stopPropagation();shareById('${f.id}')">${icon("share", { size: 14 })}</button>
    <button class="ca-btn danger" title="Delete" onclick="event.stopPropagation();deleteFileById('${f.id}')">${icon("trash", { size: 14 })}</button>
  </div>`;
}

function listRowActionsHtml(f) {
  if (f.kind === "link") {
    return `<div class="row-actions">
      <button class="ca-btn" title="Copy link" onclick="event.stopPropagation();copyTxt('${esc(f.url || "")}')">${icon("copy", { size: 14 })}</button>
      <a class="ca-btn" title="Open link" href="${esc(f.url || "#")}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${icon("externalLink", { size: 14 })}</a>
      <button class="ca-btn danger" title="Delete" onclick="event.stopPropagation();deleteFileById('${f.id}')">${icon("trash", { size: 14 })}</button>
    </div>`;
  }
  return `<div class="row-actions">
    <button class="ca-btn" title="Download" onclick="event.stopPropagation();downloadFileById('${f.id}')">${icon("download", { size: 14 })}</button>
    <button class="ca-btn" title="Share" onclick="event.stopPropagation();shareById('${f.id}')">${icon("share", { size: 14 })}</button>
    <button class="ca-btn danger" title="Delete" onclick="event.stopPropagation();deleteFileById('${f.id}')">${icon("trash", { size: 14 })}</button>
  </div>`;
}

function renderCardHtml(f) {
  const sel = state.selected.has(String(f.id)) ? "selected" : "";
  const titleText = f.caption || f.name;
  const sortLetter = String(titleText || "#").trim().charAt(0).toUpperCase();
  const folderQuery = f.folderId || state.currentFolder;
  const thumbSrc = authUrl(f.thumbUrl || `/api/files/${f.id}/thumb?folder=${folderQuery}`);
  const mpTag = f.multipart ? `<span class="mp-badge">${icon("layers", { size: 10 })} ${f.partsCount}</span>` : "";
  const moreMobile = `<button class="card-more-mobile" title="Actions" onclick="event.stopPropagation();openFileMoreMenu(this,'${f.id}')">${icon("moreH", { size: 15 })}</button>`;
  const senderChip = (!f.isMine && f.sender)
    ? `<span>·</span><span class="card-sender-tag" title="${f.forwarded ? "Forwarded from" : "Sent by"} ${esc(f.sender.name || f.sender.username)}">${icon(f.forwarded ? "share" : "user", { size: 10 })} ${esc(f.sender.username || f.sender.name)}</span>`
    : "";

  if (f.kind === "note") {
    const noteText = f.noteContent || f.caption || f.name || "Note";
    return `<div class="card note-card ${sel}" data-id="${f.id}" data-letter="${esc(sortLetter)}">
      <div class="card-sel">${icon("check", { size: 12 })}</div>
      ${cardActionsHtml(f)}${moreMobile}
      <div class="card-body">
        <div class="note-preview">${esc(noteText)}</div>
        <div class="card-meta"><span>Note</span><span>·</span><span>${fmtDate(f.date)}</span>${senderChip}</div>
      </div>
    </div>`;
  }

  if (f.kind === "link") {
    const ytId = extractYouTubeId(f.url);
    const isYt = !!ytId;
    let previewMedia = "";
    if (ytId) {
      const ytThumb = `https://i.ytimg.com/vi/${esc(ytId)}/hqdefault.jpg`;
      const fallbackThumb = `https://img.youtube.com/vi/${esc(ytId)}/hqdefault.jpg`;
      previewMedia = `
        <div class="card-media-wrap yt-thumb-wrap">
          <img src="${ytThumb}" alt="${esc(f.name || "YouTube video")}" loading="lazy" onerror="if(this.src!=='${fallbackThumb}')this.src='${fallbackThumb}'" />
          <div class="yt-play-btn-card">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <span class="yt-pill-badge">${icon("play", { size: 10 })} YouTube</span>
        </div>
      `;
    } else {
      const linkThumb = f.thumbUrl || (f.hasThumb ? thumbSrc : null);
      if (linkThumb) {
        previewMedia = `<div class="card-media-wrap link-media"><img src="${esc(linkThumb)}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'" /></div>`;
      }
    }
    return `<div class="card ${sel} ${isYt ? "card-yt" : ""}" data-id="${f.id}" data-letter="${esc(sortLetter)}">
      <div class="card-sel">${icon("check", { size: 12 })}</div>
      ${cardActionsHtml(f)}${moreMobile}
      ${previewMedia}
      <div class="card-body">
        <div class="link-domain-row">${icon(isYt ? "play" : "globe", { size: 12 })}<span>${esc(f.domain || (isYt ? "youtube.com" : "link"))}</span></div>
        <div class="card-title">${esc(f.name || f.url)}</div>
        ${f.previewDescription ? `<div class="link-desc">${esc(f.previewDescription)}</div>` : ""}
        <div class="card-meta"><span>${fmtDate(f.date)}</span>${senderChip}</div>
      </div>
    </div>`;
  }

  if (f.kind === "audio") {
    const playing = String(audioMgr.id) === String(f.id) && audioMgr.playing;
    const dur = Math.floor((String(audioMgr.id) === String(f.id) && audioMgr.duration) || f.duration || 0);
    const cur = String(audioMgr.id) === String(f.id) ? Math.floor(audioMgr.currentTime) : 0;
    return `<div class="card ${sel}" data-id="${f.id}" data-letter="${esc(sortLetter)}" data-audio-dur="${dur}">
      <div class="card-sel">${icon("check", { size: 12 })}</div>
      ${cardActionsHtml(f)}${moreMobile}
      <div class="audio-card-head">
        <div class="audio-art">${f.hasThumb ? `<img src="${esc(thumbSrc)}" alt="" onerror="this.remove()" />` : icon("music", { size: 20 })}</div>
        <div style="min-width:0;flex:1">
          <div class="card-title" style="-webkit-line-clamp:1;line-clamp:1">${esc(f.name)}</div>
          <div class="card-meta" style="margin-top:2px">${esc(f.artist || fmtSize(f.size))}${senderChip}</div>
        </div>
      </div>
      <div class="audio-player-bar" onclick="event.stopPropagation()">
        <button class="audio-play-btn" data-audio-play="${f.id}" onclick="toggleAudioPlay('${f.id}')">${icon(playing ? "pause" : "play", { size: 13 })}</button>
        <input type="range" class="media-range" data-audio-range="${f.id}" min="0" max="${Math.max(1, dur)}" value="${cur}" oninput="seekAudio('${f.id}', this.value)" />
        <span class="audio-time" data-audio-time="${f.id}">${dur ? `${fmtDur(cur)} / ${fmtDur(dur)}` : fmtDur(cur)}</span>
      </div>
    </div>`;
  }

  if (f.kind === "image" || f.kind === "video") {
    const durBadge = f.kind === "video" ? `<span class="video-dur-badge">${icon("play", { size: 10 })}${f.duration ? ` ${fmtDur(f.duration)}` : ""}</span>` : "";
    return `<div class="card ${sel}" data-id="${f.id}" data-letter="${esc(sortLetter)}">
      <div class="card-sel">${icon("check", { size: 12 })}</div>
      ${cardActionsHtml(f)}${moreMobile}
      <div class="card-media-wrap">
        <img src="${esc(thumbSrc)}" alt="" loading="lazy" onerror="this.style.display='none'" />
        ${durBadge}
      </div>
      <div class="card-body">
        <div class="card-title">${esc(titleText)}</div>
        <div class="card-meta"><span>${fmtSize(f.size)}</span><span>·</span><span>${fmtDate(f.date)}</span>${senderChip}${mpTag}</div>
      </div>
    </div>`;
  }

  return `<div class="card ${sel}" data-id="${f.id}" data-letter="${esc(sortLetter)}">
    <div class="card-sel">${icon("check", { size: 12 })}</div>
    ${cardActionsHtml(f)}${moreMobile}
    <div class="doc-hero">
      ${fileIcon(f.kind, 34)}
      <span class="ext-pill">${esc((f.ext || "FILE").toUpperCase())}</span>
    </div>
    <div class="card-body">
      <div class="card-title">${esc(titleText)}</div>
      <div class="card-meta"><span>${fmtSize(f.size)}</span><span>·</span><span>${fmtDate(f.date)}</span>${senderChip}${mpTag}</div>
    </div>
  </div>`;
}

function renderListRowHtml(f) {
  const sel = state.selected.has(String(f.id)) ? "selected" : "";
  const titleText = f.caption || f.name;
  const sortLetter = String(titleText || "#").trim().charAt(0).toUpperCase();
  const folderQuery = f.folderId || state.currentFolder;
  const thumbSrc = authUrl(f.thumbUrl || `/api/files/${f.id}/thumb?folder=${folderQuery}`);
  const ytId = f.kind === "link" ? extractYouTubeId(f.url) : null;
  const ytThumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
  const linkThumb = f.kind === "link" ? (f.thumbUrl || ytThumb || (f.hasThumb ? thumbSrc : null)) : null;
  const hasImg = ((f.kind === "image" || f.kind === "video" || f.kind === "audio") && (f.hasThumb || f.thumbUrl)) || (f.kind === "link" && linkThumb);
  const thumb = hasImg
    ? `<img src="${esc(f.kind === "link" ? linkThumb : thumbSrc)}" alt="" loading="lazy" onerror="this.remove()" />`
    : fileIcon(f.kind, 20);
  const mpTag = f.multipart ? `<span class="mp-badge">${icon("layers", { size: 10 })} ${f.partsCount}</span>` : "";
  const senderTag = (!f.isMine && f.sender)
    ? ` · <span class="row-sender-tag" title="${f.forwarded ? "Forwarded from" : "Sent by"} ${esc(f.sender.name || f.sender.username)}">${icon(f.forwarded ? "share" : "user", { size: 10 })} ${esc(f.sender.username || f.sender.name)}</span>`
    : "";

  return `<div class="list-row ${sel}" data-id="${f.id}" data-letter="${esc(sortLetter)}">
    <div class="list-thumb">${thumb}</div>
    <div class="list-main">
      <div class="list-nm">${esc(titleText)} ${mpTag}</div>
      <div class="list-sub">${f.kind === "link" ? esc(f.domain || f.url) : fmtSize(f.size)} · ${fmtDate(f.date)}${senderTag}</div>
    </div>
    ${listRowActionsHtml(f)}
  </div>`;
}

function getColumnCount() {
  const w = window.innerWidth;
  if (w < 640) return 2;
  if (w < 960) return 3;
  if (w < 1320) return 4;
  return 5;
}

function estimateCardWeight(f) {
  if (f.kind === "image" || f.kind === "video") {
    const ratio = f.width && f.height ? f.height / f.width : 1;
    return Math.min(1.6, Math.max(0.6, ratio)) * 180 + 68;
  }
  if (f.kind === "link") {
    if (extractYouTubeId(f.url)) return 210;
    if (f.thumbUrl || f.hasThumb) return 220;
    return 130;
  }
  if (f.kind === "note") return 150;
  if (f.kind === "audio") return 130;
  return 165;
}

function renderMasonryHtml(items) {
  const colCount = getColumnCount();
  const cols = Array.from({ length: colCount }, () => ({ h: 0, html: [] }));
  for (const f of items) {
    let best = 0;
    for (let i = 1; i < colCount; i++) {
      if (cols[i].h < cols[best].h) best = i;
    }
    cols[best].html.push(renderCardHtml(f));
    cols[best].h += estimateCardWeight(f);
  }
  return `<div class="masonry-grid">${cols.map((c) => `<div class="masonry-col">${c.html.join("")}</div>`).join("")}</div>`;
}

let lastColCount = getColumnCount();
window.addEventListener("resize", () => {
  const c = getColumnCount();
  if (c !== lastColCount) {
    lastColCount = c;
    if (!state.currentView && state.view === "grid" && state.dateZoom === "all") renderFiles();
  }
});

/* ===================== Main Files Render ===================== */
function renderFiles() {
  const c = $("#content");
  if (!c) return;
  document.body.classList.toggle("is-selecting", state.selected.size > 0);

  const { items, afterCat } = getProcessedFiles();
  const foldersHtml = renderFoldersCarousel();
  const toolbarHtml = renderToolbarHtml(afterCat);

  const allSel = items.length && state.selected.size === items.length;
  const selBar = state.selected.size
    ? `<div class="sel-bar">
        <span class="sel-pill">${icon("check", { size: 13 })} ${state.selected.size} selected</span>
        <button class="btn-2 sm" onclick="toggleSelectAll()">${allSel ? "Clear all" : "Select all"}</button>
        <div class="spacer"></div>
        <button class="btn-2 sm" onclick="downloadSelected()">${icon("download", { size: 14 })} Download</button>
        <button class="btn-2 sm" onclick="shareSelected()">${icon("share", { size: 14 })} Share</button>
        <button class="btn-2 sm danger" onclick="deleteSelected()">${icon("trash", { size: 14 })} Delete</button>
      </div>`
    : "";

  let stageHtml = "";
  if (!items.length) {
    stageHtml = emptyHtml(
      state.search ? "No items match your search." : "No items in this view yet.",
      state.search ? "search" : "uploadCloud",
      state.search ? "" : `<button class="primary" onclick="openAddModal('composer')">${icon("plus", { size: 16 })} Add files, note or link</button>`
    );
  } else if (state.dateZoom !== "all") {
    const groups = groupItemsByDateZoom(items, state.dateZoom);
    if (state.view === "grid") {
      stageHtml = `<div class="files-stage">${groups
        .map(
          (g) => `<div class="date-horiz-group">
            <div class="date-vert-head"><span>${esc(g.label)}</span><span class="date-col-count">${g.items.length}</span></div>
            <div class="date-horiz-scroll">${g.items.map(renderCardHtml).join("")}</div>
          </div>`
        )
        .join("")}</div>`;
    } else {
      stageHtml = `<div class="files-stage">${groups
        .map(
          (g) => `<div class="date-vert-group">
            <div class="date-vert-head"><span>${esc(g.label)}</span><span class="date-col-count">${g.items.length}</span></div>
            <div class="list-panel">${g.items.map(renderListRowHtml).join("")}</div>
          </div>`
        )
        .join("")}</div>`;
    }
  } else if (state.view === "grid") {
    stageHtml = `<div class="files-stage">${renderMasonryHtml(items)}</div>`;
  } else {
    stageHtml = `<div class="files-stage"><div class="list-panel">
      <div class="list-head"><span>Name</span><span>Actions</span></div>
      ${items.map(renderListRowHtml).join("")}
    </div></div>`;
  }

  const more = state.offsetId
    ? `<div class="load-more"><button class="btn-2" id="loadMoreBtn" onclick="loadFiles(false)" ${state.loading ? "disabled" : ""}>${state.loading ? `<span class="spinner-sm"></span> Loading…` : `${icon("chevronRight", { size: 14, cls: "down" })} Load more`}</button></div>`
    : "";

  const filesHeading = items.length
    ? `<div class="section-heading-row"><div class="section-heading"><span>Files</span></div><span class="muted">${items.length} item${items.length === 1 ? "" : "s"}</span></div>`
    : "";

  c.innerHTML = toolbarHtml + foldersHtml + selBar + filesHeading + stageHtml + more;

  // Wire folder tiles & heading buttons
  $$("[data-folder-tile]", c).forEach((t) => {
    t.onclick = () => openFolder(t.dataset.folderTile);
  });
  c.querySelector("#shareFolderBtn")?.addEventListener("click", () => {
    const f = state.folders.find((x) => x.id === state.currentFolder);
    if (f) shareFolderModal(f);
  });
  c.querySelector("#importChatQuickBtn")?.addEventListener("click", () => importChatModal());
  c.querySelector("#newFolderQuickBtn")?.addEventListener("click", () => {
    newFolder(state.currentFolder !== "all" ? state.currentFolder : null);
  });
  c.querySelector("#folderMoreBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const f = state.folders.find((x) => x.id === state.currentFolder);
    const menuItems = [];
    if (f) {
      menuItems.push({
        icon: icon("share", { size: 15 }),
        label: "Share folder",
        onClick: () => shareFolderModal(f),
      });
    }
    menuItems.push({
      icon: icon("inbox", { size: 15 }),
      label: "Import chat",
      onClick: () => importChatModal(),
    });
    menuItems.push({
      icon: icon("folderPlus", { size: 15 }),
      label: f ? "Subfolder" : "New folder",
      onClick: () => newFolder(state.currentFolder !== "all" ? state.currentFolder : null),
    });
    openMenu(e.currentTarget, menuItems, { align: "right" });
  });

  // Wire toolbar controls
  c.querySelector("#mobSortExpandBtn")?.addEventListener("click", () => {
    state.mobileSortExpanded = true;
    renderFiles();
  });
  $$("[data-sort]", c).forEach((b) => {
    b.onclick = () => {
      const s = b.dataset.sort;
      if (state.sortBy === s) state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
      else {
        state.sortBy = s;
        state.sortDir = s === "name" ? "asc" : "desc";
        if (s !== "date") state.dateZoom = "all";
      }
      if (window.innerWidth < 640 && s === "date") state.mobileSortExpanded = false;
      renderFiles();
    };
  });
  $$("[data-zoom]", c).forEach((b) => {
    b.onclick = () => {
      state.dateZoom = b.dataset.zoom;
      renderFiles();
    };
  });
  $$("[data-view-mode]", c).forEach((b) => {
    b.onclick = () => {
      state.view = b.dataset.viewMode;
      localStorage.setItem("tg.view", state.view);
      renderFiles();
    };
  });
  $$("[data-sub]", c).forEach((b) => {
    b.onclick = () => {
      state.subFilter = b.dataset.sub;
      renderFiles();
    };
  });

  // Wire items
  $$(".card, .list-row", c).forEach((node) => {
    const id = node.dataset.id;
    node.onclick = (e) => {
      if (e.target.closest("button, a, input, .ca-btn, .card-more-mobile, .audio-prog, .audio-ctl")) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey || state.selected.size > 0) toggleSelect(id);
      else previewFile(id);
    };
    node.oncontextmenu = (e) => {
      e.preventDefault();
      toggleSelect(id);
    };
  });
}

function emptyHtml(msg, ic = "folder", action = "") {
  return `<div class="empty"><div class="empty-ic">${icon(ic, { size: 40 })}</div><div class="empty-msg">${msg}</div>${action}</div>`;
}

/* ===================== Mobile Floating Scroll Letter ===================== */
let alphaHideTimer = null;
function onContentScroll() {
  const bubble = $("#alphabetBubble");
  if (!bubble) return;
  if (window.innerWidth >= 640 || state.sortBy !== "name" || state.currentView) {
    bubble.classList.remove("show");
    return;
  }
  const c = $("#content");
  const nodes = $$(".card, .list-row", c);
  if (!nodes.length) return;

  const topEdge = c.getBoundingClientRect().top + 80;
  let activeNode = nodes[0];
  for (const n of nodes) {
    if (n.getBoundingClientRect().top >= topEdge - 40) {
      activeNode = n;
      break;
    }
  }
  const letter = activeNode?.dataset.letter || "A";
  bubble.textContent = letter;
  const maxScroll = Math.max(1, c.scrollHeight - c.clientHeight);
  const ratio = Math.min(1, Math.max(0, c.scrollTop / maxScroll));
  const minY = 140;
  const maxY = window.innerHeight - 140;
  bubble.style.top = `${minY + ratio * Math.max(40, maxY - minY)}px`;
  bubble.classList.add("show");
  clearTimeout(alphaHideTimer);
  alphaHideTimer = setTimeout(() => bubble.classList.remove("show"), 1100);
}

/* ===================== Selection & File Actions ===================== */
function toggleSelect(id) {
  const k = String(id);
  state.selected.has(k) ? state.selected.delete(k) : state.selected.add(k);
  renderFiles();
}
window.toggleSelect = toggleSelect;
window.clearSelection = () => { state.selected.clear(); renderFiles(); };
window.toggleSelectAll = () => {
  const { items } = getProcessedFiles();
  if (items.length && state.selected.size === items.length) state.selected.clear();
  else items.forEach((f) => state.selected.add(String(f.id)));
  renderFiles();
};
const fileById = (id) => state.files.find((f) => String(f.id) === String(id));
const folderParamFor = (f) => f?.folderId || (state.currentFolder !== "all" ? state.currentFolder : state.folders[0]?.id || "saved");

window.openFileMoreMenu = (anchor, id) => {
  const f = fileById(id);
  if (!f) return;
  const isMine = f.isMine !== false;
  const canEdit = f.canEdit !== undefined ? f.canEdit : isMine;
  const items =
    f.kind === "link"
      ? [
          { icon: icon("copy", { size: 16 }), label: "Copy link", onClick: () => copyTxt(f.url || "") },
          { icon: icon("externalLink", { size: 16 }), label: "Open link", href: f.url || "#" },
          { divider: true },
          { icon: icon("trash", { size: 16 }), label: "Delete", danger: true, onClick: () => deleteFileById(f.id) },
        ]
      : [
          { icon: icon("download", { size: 16 }), label: "Download", onClick: () => downloadFile(f) },
          { icon: icon("share", { size: 16 }), label: "Share", onClick: () => shareModal(f) },
          ...(canEdit ? [{ icon: icon("pencil", { size: 16 }), label: "Rename / Caption", onClick: () => renameModal(f) }] : []),
          { divider: true },
          { icon: icon("trash", { size: 16 }), label: "Delete", danger: true, onClick: () => deleteFileById(f.id) },
        ];
  openMenu(anchor, items, { align: "right" });
};

window.downloadFileById = (id) => { const f = fileById(id); if (f) downloadFile(f); };
window.shareById = (id) => { const f = fileById(id); if (f) shareModal(f); };
window.renameById = (id) => { const f = fileById(id); if (f) renameModal(f); };
window.deleteFileById = async (id) => {
  const f = fileById(id);
  if (!f) return;
  if (!(await uiConfirm(`“${f.name || "this item"}” will be permanently deleted.`, { title: "Delete item?", okText: "Delete", danger: true, icon: icon("trash", { size: 20 }) }))) return;
  try {
    await api(`/api/files?folder=${folderParamFor(f)}`, { method: "DELETE", body: JSON.stringify({ ids: [f.id] }) });
    state.selected.delete(String(id));
    await loadFiles(true);
    toast("Deleted");
  } catch (err) {
    uiAlert(err.message, { title: "Delete failed" });
  }
};
window.downloadSelected = () => state.files.filter((f) => state.selected.has(String(f.id)) && f.kind !== "link").forEach(downloadFile);
window.deleteSelected = async () => {
  if (!(await uiConfirm(`${state.selected.size} item(s) will be permanently deleted.`, { title: "Delete items?", okText: "Delete", danger: true, icon: icon("trash", { size: 20 }) }))) return;
  try {
    const byFolder = new Map();
    for (const f of state.files) {
      if (!state.selected.has(String(f.id))) continue;
      const fld = folderParamFor(f);
      if (!byFolder.has(fld)) byFolder.set(fld, []);
      byFolder.get(fld).push(f.id);
    }
    for (const [fld, ids] of byFolder) {
      await api(`/api/files?folder=${encodeURIComponent(fld)}`, { method: "DELETE", body: JSON.stringify({ ids }) });
    }
    state.selected.clear();
    await loadFiles(true);
    toast("Items deleted");
  } catch (err) {
    uiAlert(err.message, { title: "Delete failed" });
  }
};
window.shareSelected = () => {
  const f = state.files.find((x) => state.selected.has(String(x.id)) && x.kind !== "link");
  if (f) shareModal(f);
  else toast("Select a file to share");
};
function downloadFile(f) {
  const a = document.createElement("a");
  a.href = authUrl(`/api/files/${f.id}/download?folder=${folderParamFor(f)}`);
  a.download = f.name || "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
window.downloadFile = downloadFile;

/* ===================== Split Preview / Note / Link / Audio Modals ===================== */
function previewFile(id) {
  const f = fileById(id);
  if (!f) return;
  window.__pf = f;

  if (f.kind === "note") {
    const isMine = f.isMine !== false;
    const canEdit = f.canEdit !== undefined ? f.canEdit : isMine;
    let senderNoteHtml = "";
    if (!isMine && f.sender) {
      const s = f.sender;
      const sName = s.name || s.username || "Telegram User";
      const sUser = s.username ? (s.username.startsWith("@") ? s.username : "@" + s.username) : "";
      const sInit = (sName || sUser || "U").trim().charAt(0).toUpperCase();
      const sAvatarUrl = authUrl(`/api/files/${f.id}/sender-avatar?folder=${folderParamFor(f)}`);
      const headLabel = f.forwarded ? "Forwarded from" : "Sent by";
      senderNoteHtml = `
        <div class="split-sender-box" style="margin-bottom:12px">
          <div class="split-sender-head">${icon(f.forwarded ? "share" : "user", { size: 13 })} ${headLabel}</div>
          <div class="split-sender-card">
            <div class="split-sender-avatar">
              <span class="split-sender-init">${esc(sInit)}</span>
              ${s.hasAvatar ? `<img src="${esc(sAvatarUrl)}" alt="" onload="this.classList.add('loaded')" onerror="this.remove()" />` : ""}
            </div>
            <div class="split-sender-meta">
              <div class="split-sender-name" title="${esc(sName)}">${esc(sName)}</div>
              ${sUser ? `<div class="split-sender-user">${esc(sUser)}</div>` : ""}
            </div>
          </div>
        </div>
      `;
    }
    const modal = el(`<div class="modal-bg" id="pmodal"><div class="modal card-modal">
      <div class="head"><div class="t">${fileIcon("note", 18)} <span>${esc(f.name)}</span></div>
        <button class="icon-btn" onclick="this.closest('.modal-bg').remove()">${icon("x", { size: 18 })}</button></div>
      <div class="body">
        ${senderNoteHtml}
        <textarea id="noteEditBody" rows="9" style="line-height:1.6" ${canEdit ? "" : "readonly"}>${esc(f.noteContent || "")}</textarea>
        <div class="form-actions">
          <button class="btn-2 danger" id="noteDelBtn">${icon("trash", { size: 14 })} Delete</button>
          <div class="spacer"></div>
          <button class="btn-2" id="noteCopyBtn">${icon("copy", { size: 14 })} Copy</button>
          ${canEdit ? `<button class="primary" id="noteSaveBtn">${icon("check", { size: 14 })} Save</button>` : ""}
        </div>
      </div>
    </div></div>`);
    document.body.appendChild(modal);
    modal.querySelector("#noteCopyBtn").onclick = () => copyTxt(modal.querySelector("#noteEditBody").value);
    modal.querySelector("#noteDelBtn").onclick = () => { modal.remove(); deleteFileById(f.id); };
    const saveBtn = modal.querySelector("#noteSaveBtn");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const txt = modal.querySelector("#noteEditBody").value;
        await api(`/api/files/${f.id}?folder=${folderParamFor(f)}`, { method: "PATCH", body: JSON.stringify({ noteContent: txt }) });
        f.noteContent = txt;
        modal.remove();
        renderFiles();
        toast("Note saved");
      };
    }
    return;
  }

  if (f.kind === "link") {
    const isMine = f.isMine !== false;
    let senderLinkHtml = "";
    if (!isMine && f.sender) {
      const s = f.sender;
      const sName = s.name || s.username || "Telegram User";
      const sUser = s.username ? (s.username.startsWith("@") ? s.username : "@" + s.username) : "";
      const sInit = (sName || sUser || "U").trim().charAt(0).toUpperCase();
      const sAvatarUrl = authUrl(`/api/files/${f.id}/sender-avatar?folder=${folderParamFor(f)}`);
      senderLinkHtml = `
        <div class="split-sender-box" style="margin-bottom:12px">
          <div class="split-sender-head">${icon("user", { size: 13 })} Shared by</div>
          <div class="split-sender-card">
            <div class="split-sender-avatar">
              <span class="split-sender-init">${esc(sInit)}</span>
              ${s.hasAvatar ? `<img src="${esc(sAvatarUrl)}" alt="" onload="this.classList.add('loaded')" onerror="this.remove()" />` : ""}
            </div>
            <div class="split-sender-meta">
              <div class="split-sender-name" title="${esc(sName)}">${esc(sName)}</div>
              ${sUser ? `<div class="split-sender-user">${esc(sUser)}</div>` : ""}
            </div>
          </div>
        </div>
      `;
    }
    const ytId = extractYouTubeId(f.url);
    const linkThumb = f.thumbUrl || (f.hasThumb ? authUrl(`/api/files/${f.id}/thumb?folder=${folderParamFor(f)}`) : null);
    let mediaHtml = "";
    if (ytId) {
      const ytEmbedUrl = `https://www.youtube.com/embed/${esc(ytId)}?autoplay=1&enablejsapi=1&rel=0&playsinline=1`;
      const ytDirectUrl = f.url || `https://www.youtube.com/watch?v=${esc(ytId)}`;
      const ytThumb = `https://i.ytimg.com/vi/${esc(ytId)}/hqdefault.jpg`;
      mediaHtml = `
        <div class="modal-yt-wrap" style="background-image:url('${ytThumb}');background-size:cover;background-position:center">
          <iframe
            src="${ytEmbedUrl}"
            title="${esc(f.name || "YouTube video")}"
            loading="eager"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen>
          </iframe>
        </div>
        <div class="modal-yt-fallback">
          <span>${icon("play", { size: 13 })} Video not starting?</span>
          <a href="${esc(ytDirectUrl)}" target="_blank" rel="noopener">Watch on YouTube ↗</a>
        </div>
      `;
    } else if (linkThumb) {
      mediaHtml = `<img src="${esc(linkThumb)}" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;margin-bottom:12px" onerror="this.style.display='none'\" />`;
    }
    const modal = el(`<div class="modal-bg" id="pmodal"><div class="modal card-modal">
      <div class="head"><div class="t">${icon(ytId ? "play" : "link", { size: 18 })} <span>${esc(f.domain || (ytId ? "YouTube" : "Link"))}</span></div>
        <button class="icon-btn" onclick="this.closest('.modal-bg').remove()">${icon("x", { size: 18 })}</button></div>
      <div class="body">
        ${mediaHtml}
        ${senderLinkHtml}
        <div style="font-weight:700;font-size:16px;margin-bottom:6px">${esc(f.name)}</div>
        ${f.previewDescription ? `<p class="muted" style="margin:0 0 12px">${esc(f.previewDescription)}</p>` : ""}
        <div class="copy-row"><input readonly value="${esc(f.url || "")}" /><button class="btn-2" id="lnkCopyBtn">${icon("copy", { size: 14 })} Copy</button></div>
        <div class="form-actions">
          <button class="btn-2 danger" id="lnkDelBtn">${icon("trash", { size: 14 })} Delete</button>
          <div class="spacer"></div>
          <a class="primary" href="${esc(f.url || (ytId ? `https://www.youtube.com/watch?v=${ytId}` : "#"))}" target="_blank" rel="noopener">${icon(ytId ? "play" : "externalLink", { size: 15 })} ${ytId ? "Watch on YouTube" : "Open link"}</a>
        </div>
      </div>
    </div></div>`);
    document.body.appendChild(modal);
    modal.querySelector("#lnkCopyBtn").onclick = () => copyTxt(f.url || "");
    modal.querySelector("#lnkDelBtn").onclick = () => { modal.remove(); deleteFileById(f.id); };
    return;
  }

  const rawUrl = authUrl(`/api/files/${f.id}/raw?folder=${folderParamFor(f)}`);
  const posterUrl = authUrl(f.thumbUrl || `/api/files/${f.id}/thumb?folder=${folderParamFor(f)}`);
  let stageHtml = "";

  if (f.multipart) {
    stageHtml = `<div style="text-align:center;color:#fff;padding:30px">${fileIcon("archive", 56)}<div style="margin-top:12px;font-weight:600">Split file · ${f.partsCount} parts</div><div style="font-size:12px;opacity:.7;margin-top:4px">Reassembles automatically on download</div></div>`;
  } else if (f.kind === "image") {
    stageHtml = `<img src="${rawUrl}" onerror="this.src='${esc(posterUrl)}'" alt="" />`;
  } else if (f.kind === "video") {
    stageHtml = `
      <video id="splitVideo" src="${rawUrl}" poster="${esc(posterUrl)}" playsinline preload="metadata"></video>
      <div class="vplayer-bar" id="vplayerBar">
        <button class="vp-btn" id="vpPlay">${icon("play", { size: 15 })}</button>
        <input type="range" class="media-range" id="vpRange" min="0" max="${Math.floor(f.duration || 60)}" value="0" />
        <span class="vp-time" id="vpTime">0:00 / ${fmtDur(f.duration || 60)}</span>
        <button class="vp-btn" id="vpMute">${icon("volume2", { size: 15 })}</button>
        <button class="vp-btn" id="vpFull">${icon("maximize2", { size: 14 })}</button>
      </div>`;
  } else if (f.kind === "audio") {
    const dur = Math.floor(f.duration || 0);
    stageHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:32px;width:100%;max-width:340px;color:#fff">
      <div style="width:150px;height:150px;border-radius:20px;overflow:hidden;background:rgba(255,255,255,0.08);display:grid;place-items:center">
        ${f.hasThumb ? `<img src="${esc(posterUrl)}" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()" />` : fileIcon("audio", 54)}
      </div>
      <div style="width:100%;display:flex;align-items:center;gap:10px">
        <button class="audio-play-btn" data-audio-play="${f.id}" onclick="toggleAudioPlay('${f.id}')">${icon(String(audioMgr.id) === String(f.id) && audioMgr.playing ? "pause" : "play", { size: 14 })}</button>
        <input type="range" class="media-range" data-audio-range="${f.id}" min="0" max="${Math.max(1, dur)}" value="${String(audioMgr.id) === String(f.id) ? Math.floor(audioMgr.currentTime) : 0}" oninput="seekAudio('${f.id}', this.value)" />
        <span class="audio-time" style="color:#d1d5db" data-audio-time="${f.id}">${dur ? `${fmtDur(String(audioMgr.id) === String(f.id) ? audioMgr.currentTime : 0)} / ${fmtDur(dur)}` : fmtDur(String(audioMgr.id) === String(f.id) ? audioMgr.currentTime : 0)}</span>
      </div>
    </div>`;
  } else if (f.kind === "pdf") {
    stageHtml = `<iframe style="width:100%;height:100%;border:0;min-height:420px;background:#fff" src="${rawUrl}"></iframe>`;
  } else {
    stageHtml = `<div style="text-align:center;color:#e5e7eb;padding:30px">${fileIcon(f.kind, 56)}<div style="margin-top:12px;font-weight:600">${esc(f.name)}</div><div style="font-size:12px;opacity:.7;margin-top:4px">${fmtSize(f.size)} · No inline preview</div></div>`;
  }

  const isMine = f.isMine !== false;
  const canEdit = f.canEdit !== undefined ? f.canEdit : isMine;
  let captionOrSenderHtml = "";
  if (canEdit) {
    captionOrSenderHtml = `
      <div class="field" style="margin:0">
        <label>Caption</label>
        <textarea id="splitCaption" rows="4" placeholder="Add a caption…">${esc(f.caption || "")}</textarea>
      </div>
      <button class="btn-2" id="saveCapBtn">${icon("check", { size: 14 })} Save caption</button>
    `;
  } else {
    const s = f.sender || {};
    const sName = s.name || s.username || "Telegram User";
    const sUser = s.username ? (s.username.startsWith("@") ? s.username : "@" + s.username) : "";
    const sInit = (sName || sUser || "U").trim().charAt(0).toUpperCase();
    const sAvatarUrl = authUrl(`/api/files/${f.id}/sender-avatar?folder=${folderParamFor(f)}`);
    const headLabel = f.forwarded ? "Forwarded from" : "Sent by";
    captionOrSenderHtml = `
      <div class="split-sender-box">
        <div class="split-sender-head">${icon(f.forwarded ? "share" : "user", { size: 13 })} ${headLabel}</div>
        <div class="split-sender-card">
          <div class="split-sender-avatar">
            <span class="split-sender-init">${esc(sInit)}</span>
            ${s.hasAvatar ? `<img src="${esc(sAvatarUrl)}" alt="" onload="this.classList.add('loaded')" onerror="this.remove()" />` : ""}
          </div>
          <div class="split-sender-meta">
            <div class="split-sender-name" title="${esc(sName)}">${esc(sName)}</div>
            ${sUser ? `<div class="split-sender-user">${esc(sUser)}</div>` : ""}
          </div>
        </div>
        ${f.caption ? `
          <div class="split-sender-caption">
            <div class="split-sender-caption-lbl">Caption (read-only)</div>
            <div class="split-sender-caption-txt">${esc(f.caption)}</div>
          </div>` : ""}
        ${f.forwarded ? `<div style="margin-top:6px;font-size:11px;color:var(--text-muted)">Telegram does not allow editing captions of forwarded messages.</div>` : ""}
      </div>
    `;
  }

  const modal = el(`<div class="modal-bg" id="pmodal"><div class="modal split-modal">
    <div class="head">
      <div class="t">${fileIcon(f.kind, 18)} <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span></div>
      <button class="icon-btn" onclick="this.closest('.modal-bg').remove()">${icon("x", { size: 18 })}</button>
    </div>
    <div class="split-layout">
      <div class="split-stage">${stageHtml}</div>
      <div class="split-side">
        <div>
          <div style="font-weight:700;font-size:15px;word-break:break-word">${esc(f.name)}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">${fmtSize(f.size)} · ${esc((f.ext || "").toUpperCase())} · ${fmtDate(f.date)}</div>
        </div>
        ${captionOrSenderHtml}
        <div class="spacer"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-2" style="flex:1" onclick="shareModal(window.__pf)">${icon("share", { size: 15 })} Share</button>
          <button class="primary" style="flex:1" onclick="downloadFile(window.__pf)">${icon("download", { size: 15 })} Download</button>
        </div>
        <button class="btn-2 danger block" id="splitDelBtn">${icon("trash", { size: 15 })} Delete file</button>
      </div>
    </div>
  </div></div>`);
  document.body.appendChild(modal);

  const saveCapBtn = modal.querySelector("#saveCapBtn");
  if (saveCapBtn) {
    saveCapBtn.onclick = async () => {
      const cap = modal.querySelector("#splitCaption")?.value || "";
      await api(`/api/files/${f.id}?folder=${folderParamFor(f)}`, {
        method: "PATCH",
        body: JSON.stringify(f.multipart ? { name: cap } : { caption: cap }),
      });
      if (f.multipart) f.name = cap;
      else f.caption = cap;
      renderFiles();
      toast("Updated");
    };
  }
  modal.querySelector("#splitDelBtn").onclick = () => { modal.remove(); deleteFileById(f.id); };

  // Wire Video Player Controls
  const vid = modal.querySelector("#splitVideo");
  if (vid) {
    const vpPlay = modal.querySelector("#vpPlay");
    const vpRange = modal.querySelector("#vpRange");
    const vpTime = modal.querySelector("#vpTime");
    const vpMute = modal.querySelector("#vpMute");
    const vpFull = modal.querySelector("#vpFull");
    let vPlaying = false, vCur = 0, vDur = Number(f.duration || 0);

    const paintV = () => {
      vpPlay.innerHTML = icon(vPlaying ? "pause" : "play", { size: 15 });
      vpRange.max = String(Math.max(1, Math.floor(vDur || 1)));
      vpRange.value = String(Math.floor(vCur));
      vpTime.textContent = vDur ? `${fmtDur(vCur)} / ${fmtDur(vDur)}` : fmtDur(vCur);
    };

    vid.addEventListener("loadedmetadata", () => { if (isFinite(vid.duration) && vid.duration > 0) { vDur = vid.duration; paintV(); } });
    vid.addEventListener("timeupdate", () => { vCur = vid.currentTime; paintV(); });
    vid.addEventListener("play", () => { vPlaying = true; paintV(); });
    vid.addEventListener("pause", () => { vPlaying = false; paintV(); });
    vid.addEventListener("error", () => {
      vPlaying = false;
      paintV();
      toast("Cannot play video inline — try downloading");
    });

    vpPlay.onclick = () => {
      if (vid.paused) vid.play().catch(() => toast("Video playback unavailable"));
      else vid.pause();
    };
    vpRange.oninput = () => {
      vCur = Number(vpRange.value) || 0;
      if (isFinite(vid.duration)) vid.currentTime = vCur;
      paintV();
    };
    vpMute.onclick = () => {
      vid.muted = !vid.muted;
      vpMute.innerHTML = icon(vid.muted ? "volumeX" : "volume2", { size: 15 });
    };
    vpFull.onclick = () => {
      const stage = modal.querySelector(".split-stage");
      if (document.fullscreenElement) document.exitFullscreen?.();
      else stage.requestFullscreen?.();
    };
  }
}
window.previewFile = previewFile;

function renameModal(f) {
  $("#pmodal")?.remove();
  const isMp = !!f.multipart;
  const modal = el(`<div class="modal-bg"><form class="modal card-modal">
    <div class="head"><div class="t">${icon("pencil", { size: 16 })} ${isMp ? "Rename file" : "Edit caption"}</div><button type="button" class="icon-btn" onclick="this.closest('.modal-bg').remove()">${icon("x", { size: 18 })}</button></div>
    <div class="body">
      <div class="field"><label>${isMp ? "File name" : "Caption"}</label>
        <div class="input-wrap">${icon("pencil", { size: 16, cls: "lead" })}<input id="cap" value="${esc(isMp ? f.name : f.caption || "")}" autofocus /></div></div>
      <div class="err" id="err"></div>
      <div class="form-actions"><button type="button" class="btn-2 ghost" onclick="this.closest('.modal-bg').remove()">Cancel</button><button class="primary" type="submit">${icon("check", { size: 15 })} Save</button></div>
    </div></form></div>`);
  modal.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const val = modal.querySelector("#cap").value;
    try {
      await api(`/api/files/${f.id}?folder=${folderParamFor(f)}`, { method: "PATCH", body: JSON.stringify(isMp ? { name: val } : { caption: val }) });
      if (isMp) f.name = val;
      else f.caption = val;
      modal.remove();
      renderFiles();
    } catch (err) { modal.querySelector("#err").textContent = err.message; }
  };
  document.body.appendChild(modal);
}
window.renameModal = renameModal;

/* ===================== Unified Add Composer Modal ===================== */
function openAddModal() {
  const defaultFolder = state.currentFolder !== "all" ? state.currentFolder : state.folders[0]?.id || "saved";
  let tab = "mixed"; // mixed (File & Text) | link
  let attached = [];

  const folderOpts = state.folders
    .map((f) => `<option value="${esc(f.id)}" ${f.id === defaultFolder ? "selected" : ""}>${esc(f.title)}</option>`)
    .join("");

  const modal = el(`<div class="modal-bg"><div class="modal card-modal">
    <div class="head"><div class="t">${icon("plus", { size: 17 })} Add to Disk</div><button type="button" class="icon-btn" onclick="this.closest('.modal-bg').remove()">${icon("x", { size: 18 })}</button></div>
    <div class="body">
      <div class="composer-tabs">
        <button type="button" class="composer-tab active" data-ctab="mixed">${icon("paperclip", { size: 14 })} File &amp; Text</button>
        <button type="button" class="composer-tab" data-ctab="link">${icon("globe", { size: 14 })} Link</button>
      </div>
      <div class="field"><label>Folder</label><select id="compFolder">${folderOpts}</select></div>
      <div id="compMixedPanel">
        <div class="field"><label>Text / Note / File Caption</label>
          <textarea id="compText" rows="4" placeholder="Write text, a note, or a caption for your attached files…"></textarea>
        </div>
        <div class="attach-zone" id="compAttachZone">
          ${icon("uploadCloud", { size: 22 })}
          <div style="font-weight:600;margin-top:4px">Attach files (optional)</div>
          <div class="muted" style="font-size:11.5px">Send files + text together, or leave empty to save a Note</div>
          <input type="file" id="compFilesInput" multiple hidden />
        </div>
        <div class="attach-chips" id="compAttachChips"></div>
      </div>
      <div id="compLinkPanel" style="display:none">
        <div class="field"><label>URL</label><input id="compUrl" type="url" placeholder="https://example.com" /></div>
        <div class="field"><label>Title (optional)</label><input id="compLinkTitle" placeholder="Article or resource title" /></div>
        <div class="field"><label>Description (optional)</label><textarea id="compLinkDesc" rows="2" placeholder="Short description…"></textarea></div>
      </div>
      <div class="err" id="compErr"></div>
      <div class="form-actions">
        <button type="button" class="btn-2 ghost" onclick="this.closest('.modal-bg').remove()">Cancel</button>
        <button type="button" class="primary" id="compSubmit">${icon("send", { size: 15 })} Send</button>
      </div>
    </div>
  </div></div>`);
  document.body.appendChild(modal);

  const renderChips = () => {
    const wrap = modal.querySelector("#compAttachChips");
    wrap.innerHTML = attached
      .map((f, idx) => `<span class="attach-chip">${esc(f.name)} (${fmtSize(f.size)}) <button type="button" style="padding:0 3px;border:none" data-rm="${idx}">${icon("x", { size: 12 })}</button></span>`)
      .join("");
    $$("[data-rm]", wrap).forEach((b) => {
      b.onclick = () => {
        attached.splice(Number(b.dataset.rm), 1);
        renderChips();
      };
    });
  };

  $$("[data-ctab]", modal).forEach((b) => {
    b.onclick = () => {
      tab = b.dataset.ctab;
      $$("[data-ctab]", modal).forEach((x) => x.classList.toggle("active", x === b));
      modal.querySelector("#compMixedPanel").style.display = tab === "mixed" ? "" : "none";
      modal.querySelector("#compLinkPanel").style.display = tab === "link" ? "" : "none";
    };
  });

  const fileInp = modal.querySelector("#compFilesInput");
  modal.querySelector("#compAttachZone").onclick = () => fileInp.click();
  fileInp.onchange = () => {
    attached.push(...fileInp.files);
    renderChips();
  };

  modal.querySelector("#compSubmit").onclick = async () => {
    const err = modal.querySelector("#compErr");
    err.textContent = "";
    const targetFolder = modal.querySelector("#compFolder").value;

    if (tab === "link") {
      const url = modal.querySelector("#compUrl").value.trim();
      const title = modal.querySelector("#compLinkTitle").value.trim();
      const text = modal.querySelector("#compLinkDesc").value.trim();
      if (!url) return (err.textContent = "Please enter a valid URL");
      try {
        await api("/api/files/item", { method: "POST", body: JSON.stringify({ folder: targetFolder, kind: "link", url, title, text }) });
        modal.remove();
        await loadFiles(true);
        toast("Link saved");
      } catch (e) { err.textContent = e.message; }
      return;
    }

    const text = modal.querySelector("#compText").value.trim();
    if (!attached.length && !text) {
      return (err.textContent = "Enter text or attach at least one file");
    }

    if (attached.length) {
      for (const file of attached) {
        addUploadTask({ file, name: file.name, folderId: targetFolder, caption: text });
      }
      modal.remove();
      toast(`Uploading ${attached.length} file${attached.length > 1 ? "s" : ""}`);
      return;
    }

    try {
      await api("/api/files/item", { method: "POST", body: JSON.stringify({ folder: targetFolder, kind: "note", text }) });
      modal.remove();
      await loadFiles(true);
      toast("Note created");
    } catch (e) { err.textContent = e.message; }
  };
}
window.openAddModal = openAddModal;

/* ===================== Share Modals ===================== */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}
window.copyText = copyText;
window.copyTxt = async (t) => toast((await copyText(t)) ? "Copied" : "Press Ctrl+C to copy");

function shareModal(f) {
  const modal = el(`<div class="modal-bg"><div class="modal card-modal">
    <div class="head"><div class="t">${icon("share", { size: 16 })} Share link</div><button type="button" class="icon-btn" onclick="this.closest('.modal-bg').remove()">${icon("x", { size: 18 })}</button></div>
    <div class="body" id="shareBody"></div>
  </div></div>`);
  document.body.appendChild(modal);
  const bodyEl = () => modal.querySelector("#shareBody");
  const fldId = folderParamFor(f);

  function showLink(rawUrl, meta) {
    const url = fullUrl(rawUrl);
    bodyEl().innerHTML = `
      <div class="share-file">${fileIcon(f.kind, 22)}<div><div style="font-weight:600">${esc(f.name)}</div><div class="muted" style="font-size:12px">${fmtSize(f.size)}</div></div></div>
      <div class="field"><label>${icon("link", { size: 13 })} Link</label>
        <div class="copy-row"><input id="shareUrl" readonly value="${esc(url)}" /><button class="btn-2" id="copyShareBtn">${icon("copy", { size: 15 })} Copy</button></div>
      </div>
      <div class="share-meta">${meta.password ? "Password protected" : "Public"} · ${meta.downloads || 0} downloads${meta.expiresAt ? " · expires " + new Date(meta.expiresAt).toLocaleString() : ""}</div>
      <div class="form-actions">
        <button class="btn-2 danger" id="delShareBtn">${icon("trash", { size: 14 })} Delete</button>
        <div class="spacer"></div>
        <button class="btn-2" id="newShareBtn">${icon("refresh", { size: 14 })} New link</button>
        <a class="primary" href="${esc(url)}" target="_blank" rel="noopener">${icon("externalLink", { size: 14 })} Open</a>
      </div>`;
    modal.querySelector("#shareUrl").onclick = (e) => e.target.select();
    modal.querySelector("#copyShareBtn").onclick = () => copyTxt(url);
    modal.querySelector("#delShareBtn").onclick = async () => {
      if (!(await uiConfirm("This share link will stop working immediately.", { title: "Delete share link?", okText: "Delete", danger: true }))) return;
      await api("/api/shares/" + meta.id, { method: "DELETE" });
      modal.remove();
      toast("Link deleted");
    };
    modal.querySelector("#newShareBtn").onclick = () => showCreate();
  }

  function showCreate() {
    bodyEl().innerHTML = `<form id="shareCreate">
      <div class="share-file">${fileIcon(f.kind, 22)}<div><div style="font-weight:600">${esc(f.name)}</div><div class="muted" style="font-size:12px">${fmtSize(f.size)}</div></div></div>
      <div class="field"><label>Password (optional)</label><div class="input-wrap">${icon("lock", { size: 16, cls: "lead" })}<input id="spw" type="password" placeholder="Leave blank for public" /></div></div>
      <div class="field"><label>Expires</label><select id="exp"><option value="">Never</option><option value="1">1 hour</option><option value="24">1 day</option><option value="168">1 week</option></select></div>
      <div class="err" id="err"></div>
      <div class="form-actions"><button type="button" class="btn-2 ghost" onclick="this.closest('.modal-bg').remove()">Cancel</button><button class="primary" type="submit">${icon("link", { size: 15 })} Create link</button></div>
    </form>`;
    modal.querySelector("#shareCreate").onsubmit = async (e) => {
      e.preventDefault();
      const pw = modal.querySelector("#spw").value;
      const exp = modal.querySelector("#exp").value || null;
      try {
        const payload = { folder: fldId, name: f.name, mime: f.mime, size: f.size, password: pw, expiresInHours: exp };
        if (f.multipart) payload.multipartId = f.id;
        else payload.msgId = f.id;
        const r = await api("/api/shares", { method: "POST", body: JSON.stringify(payload) });
        showLink(r.url, { id: r.id, password: !!pw, downloads: 0, expiresAt: r.expiresAt });
      } catch (err) { modal.querySelector("#err").textContent = err.message; }
    };
  }

  bodyEl().innerHTML = `<div class="center-load" style="min-height:110px"><div class="spinner"></div></div>`;
  (async () => {
    try {
      const idParam = f.multipart ? `multipartId=${encodeURIComponent(f.id)}` : `msgId=${f.id}`;
      const r = await api(`/api/shares/for?folder=${encodeURIComponent(fldId)}&${idParam}`);
      if (r.none) showCreate();
      else showLink(r.share.url, { id: r.share.id, password: r.share.needsPassword, downloads: r.share.downloads, expiresAt: r.share.expiresAt });
    } catch { showCreate(); }
  })();
}
window.shareModal = shareModal;

function shareFolderModal(folder) {
  const folderId = folder.id;
  const title = folder.title || "Folder";
  const modal = el(`<div class="modal-bg"><div class="modal card-modal">
    <div class="head"><div class="t">${icon("share", { size: 16 })} Share folder</div><button type="button" class="icon-btn" onclick="this.closest('.modal-bg').remove()">${icon("x", { size: 18 })}</button></div>
    <div class="body" id="fshareBody"></div>
  </div></div>`);
  document.body.appendChild(modal);
  const bodyEl = () => modal.querySelector("#fshareBody");

  function showLink(rawUrl, meta) {
    const url = fullUrl(rawUrl);
    bodyEl().innerHTML = `
      <div class="share-file">${icon("folder", { size: 22 })}<div><div style="font-weight:600">${esc(title)}</div><div class="muted" style="font-size:12px">Folder share · all files</div></div></div>
      <div class="field"><label>${icon("link", { size: 13 })} Link</label><div class="copy-row"><input id="fshareUrl" readonly value="${esc(url)}" /><button class="btn-2" id="fCopyBtn">${icon("copy", { size: 14 })} Copy</button></div></div>
      <div class="share-meta">${meta.password ? "Password protected" : "Public"}${meta.expiresAt ? " · expires " + new Date(meta.expiresAt).toLocaleString() : ""}</div>
      <div class="form-actions"><button class="btn-2 danger" id="fDelBtn">${icon("trash", { size: 14 })} Delete</button><div class="spacer"></div><button class="btn-2" id="fNewBtn">${icon("refresh", { size: 14 })} New link</button><a class="primary" href="${esc(url)}" target="_blank" rel="noopener">${icon("externalLink", { size: 14 })} Open</a></div>`;
    modal.querySelector("#fCopyBtn").onclick = () => copyTxt(url);
    modal.querySelector("#fDelBtn").onclick = async () => {
      await api("/api/shares/" + meta.id, { method: "DELETE" });
      modal.remove();
      toast("Link deleted");
    };
    modal.querySelector("#fNewBtn").onclick = () => showCreate();
  }

  function showCreate() {
    bodyEl().innerHTML = `<form id="fShareCreate">
      <div class="share-file">${icon("folder", { size: 22 })}<div><div style="font-weight:600">${esc(title)}</div><div class="muted" style="font-size:12px">Shares every file in this folder</div></div></div>
      <div class="field"><label>Password (optional)</label><div class="input-wrap">${icon("lock", { size: 16, cls: "lead" })}<input id="fspw" type="password" placeholder="Leave blank for public" /></div></div>
      <div class="field"><label>Expires</label><select id="fexp"><option value="">Never</option><option value="1">1 hour</option><option value="24">1 day</option><option value="168">1 week</option></select></div>
      <div class="err" id="ferr"></div>
      <div class="form-actions"><button type="button" class="btn-2 ghost" onclick="this.closest('.modal-bg').remove()">Cancel</button><button class="primary" type="submit">${icon("link", { size: 15 })} Create link</button></div>
    </form>`;
    modal.querySelector("#fShareCreate").onsubmit = async (e) => {
      e.preventDefault();
      const pw = modal.querySelector("#fspw").value;
      const exp = modal.querySelector("#fexp").value || null;
      const r = await api("/api/shares", { method: "POST", body: JSON.stringify({ kind: "folder", folder: folderId, title, password: pw, expiresInHours: exp }) });
      showLink(r.url, { id: r.id, password: !!pw, expiresAt: r.expiresAt });
    };
  }

  bodyEl().innerHTML = `<div class="center-load" style="min-height:110px"><div class="spinner"></div></div>`;
  (async () => {
    try {
      const r = await api(`/api/shares/forFolder?folder=${encodeURIComponent(folderId)}`);
      if (r.none) showCreate();
      else showLink(r.share.url, { id: r.share.id, password: r.share.needsPassword, expiresAt: r.share.expiresAt });
    } catch { showCreate(); }
  })();
}
window.shareFolderModal = shareFolderModal;

function toast(msg) {
  const t = el(`<div class="toast">${icon("check", { size: 15, cls: "ok-ic" })} ${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 220); }, 2500);
}
window.toast = toast;

/* ===================== Persistent Uploader + Service Worker + Drop ===================== */
const up = { queue: [], active: 0, concurrency: 2, expanded: true, dock: null, ctrl: new Map() };
let upRenderQueued = false;
const subCache = new Map();

function mountUploader() {
  if (up.dock && document.body.contains(up.dock)) return;
  up.dock = el(`<div id="upDock" class="up-dock" style="display:none"></div>`);
  up.dock.addEventListener("click", (e) => {
    const t = e.target.closest("[data-up-action]");
    if (!t) return;
    const a = t.dataset.upAction;
    if (a === "toggle") up.expanded = !up.expanded;
    else if (a === "clear") up.queue = up.queue.filter((i) => i.phase === "queued" || i.phase === "uploading");
    else if (a === "cancel") cancelUpload(t.dataset.id);
    else if (a === "cancel-all") cancelAllUploads();
    else if (a === "retry") retryUpload(t.dataset.id);
    renderUploader();
  });
  document.body.appendChild(up.dock);
}
function scheduleUpRender() {
  if (upRenderQueued) return;
  upRenderQueued = true;
  requestAnimationFrame(() => { upRenderQueued = false; renderUploader(); });
}
function folderTitle(id) { return (state.folders.find((f) => f.id === id) || {}).title || "folder"; }
let upStructureKey = "";
function upKey() { return up.queue.map((i) => `${i.id}:${i.phase}:${i.stage || ""}:${i.part || ""}`).join("|") + `|e${up.expanded ? 1 : 0}`; }
function renderUploader() {
  if (!up.dock) return;
  if (!up.queue.length) { up.dock.style.display = "none"; up.dock.innerHTML = ""; upStructureKey = ""; return; }
  if (upKey() !== upStructureKey) { upStructureKey = upKey(); buildUploader(); }
  paintUploader();
}
function buildUploader() {
  const items = up.queue;
  up.dock.style.display = "flex";
  const active = items.filter((i) => i.phase === "uploading").length;
  const queued = items.filter((i) => i.phase === "queued").length;
  const done = items.filter((i) => i.phase === "done").length;
  const failed = items.filter((i) => i.phase === "error").length;
  const busy = active + queued;
  const title = busy ? `Uploading ${items.length} item${items.length > 1 ? "s" : ""}` : failed ? `${done} uploaded · ${failed} failed` : "Upload complete";
  const head = `<div class="upd-head" data-up-action="toggle">
    <div class="upd-title">${busy ? `<span class="upd-spinner"></span>` : icon("check", { size: 15, cls: "ok-ic" })}<span>${esc(title)}</span></div>
    <div class="upd-overall"><div class="upd-bar"><div id="updOverallFill"></div></div><span class="upd-pct" id="updOverallPct">0%</span></div>
    <div class="upd-btns">${busy ? `<button class="upd-cancelall" data-up-action="cancel-all">${icon("x", { size: 14 })}</button>` : `<button class="upd-x" data-up-action="clear">${icon("x", { size: 14 })}</button>`}<button class="upd-chev" data-up-action="toggle">${icon("chevronRight", { size: 15, cls: up.expanded ? "down" : "" })}</button></div>
  </div>`;
  const body = up.expanded ? `<div class="upd-body">${items.map((i) => {
    const pct = taskDisplayPct(i);
    return `<div class="upd-item ${i.phase}">
      <div class="upd-imain">
        <div class="upd-inm">${esc(i.name)} <span class="muted" style="font-size:11px;font-weight:400">· ${esc(folderTitle(i.folderId))}</span></div>
        <div class="upd-isub" data-up-sub="${i.id}">${esc(itemSub(i, pct))}</div>
        <div class="upd-bar"><div data-up-fill="${i.id}" style="width:${pct}%"></div></div>
      </div>
    </div>`;
  }).join("")}</div>` : "";
  up.dock.innerHTML = head + body;
}
function paintUploader() {
  const items = up.queue;
  const totalBytes = items.reduce((n, i) => n + (i.size || 0), 0);
  const weighted = items.reduce((n, i) => n + (taskDisplayPct(i) / 100) * (i.size || 0), 0);
  const pct = totalBytes ? Math.min(100, Math.round((weighted / totalBytes) * 100)) : 0;
  const fill = $("#updOverallFill"); if (fill) fill.style.width = pct + "%";
  const pctEl = $("#updOverallPct"); if (pctEl) pctEl.textContent = pct + "%";
  for (const i of items) {
    const p = taskDisplayPct(i);
    const f = up.dock.querySelector(`[data-up-fill="${i.id}"]`); if (f) f.style.width = p + "%";
    const s = up.dock.querySelector(`[data-up-sub="${i.id}"]`); if (s) s.textContent = itemSub(i, p);
  }
}
function taskRaw(i) {
  const total = i.total || i.size || 1;
  const f = Math.max(0, Math.min(1, (i.uploaded || 0) / total));
  return i.stage === "sending" ? 0.5 + f * 0.5 : f * 0.5;
}
function taskDisplayPct(i) {
  if (i.phase === "done") return 100;
  if (i.phase !== "uploading") return 0;
  const raw = taskRaw(i);
  const eased = raw <= 0.6 ? (raw / 0.6) * 0.75 : 0.75 + ((raw - 0.6) / 0.4) * 0.25;
  return Math.min(100, Math.round(eased * 100));
}
function itemSub(i, pct) {
  if (i.phase === "queued") return `Queued · ${fmtSize(i.size)}`;
  if (i.phase === "uploading") return i.stage === "sending" ? `Sending · ${pct}%` : `Uploading · ${pct}%`;
  if (i.phase === "done") return `Done · ${fmtSize(i.size)}`;
  return `Failed: ${i.error || "error"}`;
}
function cancelUpload(id) {
  const it = up.queue.find((i) => i.id === id);
  if (!it) return;
  if (it.phase === "queued") { it.phase = "error"; it.error = "Cancelled"; }
  else if (it.phase === "uploading") up.ctrl.get(id)?.abort();
}
function cancelAllUploads() { up.queue.forEach((i) => cancelUpload(i.id)); }
function retryUpload(id) {
  const it = up.queue.find((i) => i.id === id);
  if (it && it.phase === "error") { it.phase = "queued"; it.error = null; it.uploaded = 0; kickUploader(); }
}
function addUploadTask({ file, name, folderId, caption = "" }) {
  const t = { id: crypto.randomUUID(), name, file, folderId, caption, size: file.size, uploaded: 0, total: file.size, phase: "queued", error: null, part: null };
  up.queue.push(t);
  mountUploader();
  scheduleUpRender();
  kickUploader();
  return t;
}
function enqueueFiles(fileList, folderId) {
  for (const file of fileList) addUploadTask({ file, name: file.name, folderId });
}
function kickUploader() {
  while (up.active < up.concurrency) {
    const t = up.queue.find((i) => i.phase === "queued");
    if (!t) break;
    runTask(t);
  }
}
async function runTask(t) {
  t.phase = "uploading"; up.active++; scheduleUpRender();
  const ctrl = new AbortController(); up.ctrl.set(t.id, ctrl);
  try { await uploadTask(t, ctrl.signal); t.phase = "done"; t.uploaded = t.total; }
  catch (e) { if (t.phase !== "error") { t.phase = "error"; t.error = e.name === "AbortError" ? "Cancelled" : e?.message || "Failed"; } }
  finally {
    up.ctrl.delete(t.id); up.active--; scheduleUpRender();
    maybeRefreshCurrentFolder(t.folderId); kickUploader();
  }
}
function uploadTask(t, signal) {
  return new Promise((resolve, reject) => {
    const job = crypto.randomUUID();
    let settled = false;
    const finish = (err) => {
      if (settled) return; settled = true;
      try { t._es && t._es.close(); } catch {}
      signal?.removeEventListener("abort", onAbort);
      err ? reject(err) : resolve();
    };
    t._finish = finish; t.jobId = job;
    const onAbort = () => {
      if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: "abort", id: t.id });
      finish(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort);

    const es = new EventSource(authUrl(`/api/files/upload/progress?job=${job}`));
    t._es = es;
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.error) return finish(new Error(d.error));
        if (d.phase === "receiving") { t.stage = "receiving"; t.uploaded = Number(d.received) || t.uploaded; t.total = Number(d.size) || t.total; scheduleUpRender(); }
        else if (d.phase === "sending") { t.stage = "sending"; t.uploaded = Number(d.uploaded) || 0; t.total = Number(d.total) || t.total; scheduleUpRender(); }
      } catch {}
    };

    const headers = {
      "X-Job": job,
      "X-Filename": encodeURIComponent(t.name),
      "X-Filesize": t.size,
      "X-Force-Document": "1",
      "Content-Type": "application/octet-stream",
    };
    const sid = getSessionToken();
    if (sid) headers["X-Session"] = sid;
    if (t.caption) headers["X-Caption"] = encodeURIComponent(t.caption);

    if (swActive && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "upload", id: t.id, url: `/api/files/upload?folder=${t.folderId}`, file: t.file, headers, name: t.name, folderId: t.folderId, size: t.size, jobId: job });
    } else {
      fetch(`/api/files/upload?folder=${t.folderId}`, { method: "POST", credentials: "include", signal, headers, body: t.file })
        .then(async (r) => {
          if (!r.ok) { const j = await r.json().catch(() => ({})); finish(new Error(j.error || "Upload failed")); }
          else finish();
        })
        .catch(finish);
    }
  });
}
let upRefreshTimer = null;
function maybeRefreshCurrentFolder(folderId) {
  if (state.currentView) return;
  if (state.currentFolder !== "all" && state.currentFolder !== folderId) return;
  clearTimeout(upRefreshTimer);
  upRefreshTimer = setTimeout(() => loadFiles(true), 450);
}

let swActive = false;
function initServiceWorker() {
  if (!("serviceWorker" in navigator) || initServiceWorker._done) return;
  initServiceWorker._done = true;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => {
    const j = e.data && e.data.job;
    if (!j) return;
    const t = up.queue.find((i) => i.id === j.id);
    if (!t) return;
    if (j.status === "done") { t.phase = "done"; t.uploaded = t.total; t._finish && t._finish(); scheduleUpRender(); maybeRefreshCurrentFolder(t.folderId); }
    else if (j.status === "error" || j.status === "aborted") { t.phase = "error"; t.error = j.error || "Failed"; t._finish && t._finish(new Error(t.error)); scheduleUpRender(); }
  });
  navigator.serviceWorker.ready.then(() => {
    swActive = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    if (swActive) navigator.serviceWorker.controller.postMessage({ type: "sync" });
  });
}

async function ensureSubfolder(title, parentId) {
  const key = parentId + "|" + title;
  if (subCache.has(key)) return subCache.get(key);
  const existing = state.folders.find((f) => f.parentId === parentId && f.title === title);
  if (existing) { subCache.set(key, existing.id); return existing.id; }
  try {
    const r = await api("/api/folders", { method: "POST", body: JSON.stringify({ title, parentId }) });
    subCache.set(key, r.id);
    return r.id;
  } catch { return parentId; }
}
async function ensureFolderPath(parts, rootId) {
  let parentId = rootId;
  for (const part of parts) parentId = await ensureSubfolder(part, parentId);
  return parentId;
}

function pickUpload(folderId) {
  const target = folderId && folderId !== "all" ? folderId : state.currentFolder !== "all" ? state.currentFolder : state.folders[0]?.id;
  if (!target) return toast("Create a folder first");
  const inp = el(`<input type="file" multiple hidden />`);
  document.body.appendChild(inp);
  inp.onchange = () => { if (inp.files.length) enqueueFiles([...inp.files], target); inp.remove(); };
  inp.click();
}
window.pickUpload = pickUpload;

function pickUploadFolder(folderId) {
  const target = folderId && folderId !== "all" ? folderId : state.currentFolder !== "all" ? state.currentFolder : state.folders[0]?.id;
  if (!target) return toast("Create a folder first");
  const inp = el(`<input type="file" webkitdirectory directory multiple hidden />`);
  document.body.appendChild(inp);
  inp.onchange = async () => {
    const files = [...inp.files]; inp.remove();
    if (!files.length) return;
    for (const file of files) {
      const parts = (file.webkitRelativePath || file.name).split("/").slice(0, -1).filter(Boolean);
      const fid = await ensureFolderPath(parts, target);
      addUploadTask({ file, name: file.name, folderId: fid });
    }
    await refreshFolders();
  };
  inp.click();
}
window.pickUploadFolder = pickUploadFolder;

let dropOverlay = null, dragDepth = 0;
function showDropOverlay() {
  if (!dropOverlay) {
    dropOverlay = el(`<div class="drop-overlay"><div class="drop-card">${icon("uploadCloud", { size: 38 })}<div style="font-weight:700;margin-top:8px">Drop files or folders to upload</div></div></div>`);
    document.body.appendChild(dropOverlay);
  }
  dropOverlay.classList.add("show");
}
function hideDropOverlay() { dropOverlay?.classList.remove("show"); dragDepth = 0; }
document.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files") || !state.user) return;
  e.preventDefault(); dragDepth++; showDropOverlay();
});
document.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
document.addEventListener("dragleave", () => { if (--dragDepth <= 0) hideDropOverlay(); });
document.addEventListener("drop", async (e) => {
  if (!e.dataTransfer || (![...e.dataTransfer.types].includes("Files") && !e.dataTransfer.files?.length)) return;
  e.preventDefault(); hideDropOverlay();
  const target = state.currentFolder !== "all" ? state.currentFolder : state.folders[0]?.id;
  if (target && e.dataTransfer.files?.length) enqueueFiles([...e.dataTransfer.files], target);
});

/* ===================== Folders CRUD ===================== */
async function refreshFolders() {
  try {
    const r = await api("/api/folders");
    state.folders = r.folders || [];
    renderSidebar();
    if (!state.currentView) renderFiles();
  } catch {}
}
async function newFolder(parentId) {
  const title = await uiPrompt({
    title: parentId ? "New subfolder" : "New folder",
    label: parentId ? "Creates a subfolder inside the current folder." : "Creates a Telegram channel used as a folder.",
    placeholder: "Folder name",
    value: "",
    okText: "Create",
    validate: (v) => (!v || !v.trim() ? "Name cannot be empty" : null),
  });
  if (!title) return;
  const body = { title: title.trim() };
  if (parentId) body.parentId = parentId;
  await api("/api/folders", { method: "POST", body: JSON.stringify(body) });
  await refreshFolders();
  toast(parentId ? "Subfolder created" : "Folder created");
}
window.newFolder = newFolder;

async function importChatModal() {
  const modal = el(`<div class="modal-bg"><div class="modal card-modal">
    <div class="head"><div class="t">${icon("inbox", { size: 17 })} Import Telegram chat</div><button type="button" class="icon-btn" onclick="this.closest('.modal-bg').remove()">${icon("x", { size: 18 })}</button></div>
    <div class="body">
      <div class="field"><div class="input-wrap">${icon("search", { size: 15, cls: "lead" })}<input id="impSearch" placeholder="Filter channels or groups…" /></div></div>
      <div id="impList" style="max-height:320px;overflow-y:auto"><div class="center-load" style="min-height:110px"><div class="spinner"></div></div></div>
    </div>
  </div></div>`);
  document.body.appendChild(modal);
  let chats = [];
  const renderList = (q = "") => {
    const wrap = modal.querySelector("#impList");
    const filtered = q ? chats.filter((c) => (c.title || "").toLowerCase().includes(q.toLowerCase())) : chats;
    if (!filtered.length) {
      wrap.innerHTML = `<div class="muted center" style="padding:24px 0">No Telegram channels or groups found</div>`;
      return;
    }
    wrap.innerHTML = `<div class="kv-list">${filtered
      .map(
        (c, i) => `<div class="kv-row" style="cursor:pointer" data-imp-idx="${i}">
          <div class="kv-ic">${icon(c.type === "channel" ? "folder" : "users", { size: 16 })}</div>
          <div class="info">
            <div class="t">${esc(c.title)}</div>
            <div class="s">${esc(c.type)}${c.username ? " · @" + esc(c.username) : ""}</div>
          </div>
          <button type="button" class="btn-2 sm">Import</button>
        </div>`
      )
      .join("")}</div>`;
    $$("[data-imp-idx]", wrap).forEach((row) => {
      row.onclick = async () => {
        const c = filtered[Number(row.dataset.impIdx)];
        try {
          const r = await api("/api/folders/import", {
            method: "POST",
            body: JSON.stringify({ channelId: c.id, accessHash: c.accessHash, title: c.title, type: c.type }),
          });
          modal.remove();
          await loadFolders();
          if (r.id) openFolder(r.id);
          toast(`Imported “${c.title}”`);
        } catch (err) {
          toast(err.message);
        }
      };
    });
  };
  modal.querySelector("#impSearch").oninput = (e) => renderList(e.target.value.trim());
  try {
    const r = await api("/api/chats");
    chats = r.chats || [];
    renderList();
  } catch (err) {
    modal.querySelector("#impList").innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}
window.importChatModal = importChatModal;

async function deleteFolder(id) {
  const f = state.folders.find((x) => x.id === id);
  if (!f) return;
  if (!(await uiConfirm(`“${f.title}” will be removed from your drive.`, { title: "Delete folder?", okText: "Delete", danger: true }))) return;
  await api("/api/folders/" + id, { method: "DELETE" });
  if (state.currentFolder === id) state.currentFolder = "all";
  await loadFolders();
  toast("Folder deleted");
}
window.deleteFolder = deleteFolder;

/* ===================== Accounts & Library Views ===================== */
window.addAccount = () => {
  if (!state.user?.isAdmin) return toast("Only admins can connect accounts");
  renderConnect();
};
window.logout = async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    setSessionToken("");
    location.reload();
  }
};
window.switchAcc = async (id) => {
  await api("/api/accounts/switch/" + id, { method: "POST" });
  state.currentAccountId = id;
  state.currentFolder = "all";
  state.currentView = null;
  renderApp();
  await loadFolders();
};
window.delAcc = async (id) => {
  if (!(await uiConfirm("Remove this Telegram account from Telegram Disk?", { title: "Remove account?", okText: "Remove", danger: true }))) return;
  await api("/api/accounts/" + id, { method: "DELETE" });
  state.auth = await api("/api/auth/state");
  state.accounts = state.auth.accounts;
  if (!state.accounts.length) return location.reload();
  if (state.currentAccountId === id) return window.switchAcc(state.accounts[0].id);
  viewSettings();
};

async function openView(v) {
  state.currentView = v;
  toggleSidebar(false);
  renderSidebar();
  renderBottomDocks();
  if (v === "shares") return viewShares();
  if (v === "keys") return viewKeys();
  if (v === "users") return viewUsers();
  if (v === "settings") return viewSettings();
}

function viewHeaderHtml(ic, title, rightHtml = "") {
  return `<div class="section-heading-row" style="padding-top:18px;padding-bottom:14px">
    <div class="section-heading">${icon(ic, { size: 19 })} <span>${esc(title)}</span></div>
    <div class="heading-actions">${rightHtml}</div>
  </div>`;
}

async function viewShares() {
  const c = $("#content");
  c.innerHTML = viewHeaderHtml("share", "Share links") + `<div class="center-load"><div class="spinner"></div></div>`;
  try {
    const r = await api("/api/shares");
    const rows = r.shares
      .map((s) => {
        const url = fullUrl(s.url);
        return `<div class="kv-row">
          <div class="kv-ic">${s.needsPassword ? icon("lock", { size: 16 }) : icon(s.kind === "folder" ? "folder" : "file", { size: 16 })}</div>
          <div class="info">
            <div class="t">${esc(s.name || "file")} ${s.kind === "folder" ? '<span class="tag">folder</span>' : ""} ${s.expired ? '<span class="tag bad">expired</span>' : ""}</div>
            <div class="s">${fmtSize(s.size)} · ${s.downloads} dl${s.expiresAt ? " · exp " + new Date(s.expiresAt).toLocaleDateString() : ""}</div>
            <div class="s mono">${esc(url)}</div>
          </div>
          <button class="icon-btn" title="Copy" onclick="copyTxt('${esc(url)}')">${icon("copy", { size: 16 })}</button>
          <button class="icon-btn danger" title="Delete" onclick="delShare('${s.id}')">${icon("trash", { size: 16 })}</button>
        </div>`;
      })
      .join("");
    c.innerHTML = viewHeaderHtml("share", "Share links") + `<div class="page-wrap">${rows ? `<div class="kv-list">${rows}</div>` : emptyHtml("No share links yet", "share")}</div>`;
  } catch (err) {
    c.innerHTML = viewHeaderHtml("share", "Share links") + emptyHtml(err.message, "alert");
  }
}
window.delShare = async (id) => {
  if (!(await uiConfirm("This share link will stop working immediately.", { title: "Delete share link?", okText: "Delete", danger: true }))) return;
  await api("/api/shares/" + id, { method: "DELETE" });
  viewShares();
};

async function viewKeys() {
  const c = $("#content");
  const btn = `<button class="primary sm" onclick="newKey()">${icon("plus", { size: 15 })} New key</button>`;
  c.innerHTML = viewHeaderHtml("key", "API keys", btn) + `<div class="center-load"><div class="spinner"></div></div>`;
  try {
    const r = await api("/api/keys");
    const rows = r.keys
      .map(
        (k) => `<div class="kv-row">
        <div class="kv-ic">${icon("key", { size: 16 })}</div>
        <div class="info"><div class="t">${esc(k.label)}</div><div class="s">${esc(state.accounts.find((a) => a.id === k.account_id)?.label || k.account_id)} · ${new Date(k.created_at).toLocaleDateString()}</div></div>
        <button class="icon-btn danger" title="Revoke" onclick="delKey('${k.id}')">${icon("trash", { size: 16 })}</button>
      </div>`
      )
      .join("");
    c.innerHTML = viewHeaderHtml("key", "API keys", btn) + `<div class="page-wrap">${rows ? `<div class="kv-list">${rows}</div>` : emptyHtml("No API keys yet", "key", btn)}</div>`;
  } catch (err) {
    c.innerHTML = viewHeaderHtml("key", "API keys", btn) + emptyHtml(err.message, "alert");
  }
}
window.newKey = async () => {
  const acc = state.currentAccountId;
  const label = await uiPrompt({ title: "New API key", label: "A label to remember what this key is for.", placeholder: "My app", value: "My app", okText: "Create" });
  if (!label) return;
  const r = await api("/api/keys", { method: "POST", body: JSON.stringify({ label, account: acc }) });
  const ok = await copyText(r.key);
  uiAlert(`Key: ${r.key}`, { title: ok ? "API key created & copied" : "API key created", okText: "Done" });
  viewKeys();
};
window.delKey = async (id) => {
  if (!(await uiConfirm("Apps using this key will lose access immediately.", { title: "Revoke API key?", okText: "Revoke", danger: true }))) return;
  await api("/api/keys/" + id, { method: "DELETE" });
  viewKeys();
};

async function viewUsers() {
  const c = $("#content");
  const btn = `<button class="primary sm" onclick="newUser()">${icon("userPlus", { size: 15 })} Add user</button>`;
  c.innerHTML = viewHeaderHtml("users", "Users", btn) + `<div class="center-load"><div class="spinner"></div></div>`;
  try {
    const r = await api("/api/users");
    const rows = r.users
      .map(
        (u) => `<div class="kv-row">
        <div class="kv-ic">${icon(u.role === "admin" ? "shield" : "user", { size: 16 })}</div>
        <div class="info"><div class="t">${esc(u.username)} <span class="tag">${u.role}</span>${u.id === r.currentUserId ? ' <span class="tag">you</span>' : ""}</div><div class="s">Created ${new Date(u.createdAt || u.created_at).toLocaleDateString()}</div></div>
        <button class="btn-2 sm" onclick="resetUserPw('${u.id}','${esc(u.username)}')">Password</button>
        <button class="btn-2 sm" onclick="toggleUserRole('${u.id}','${u.role}')">${u.role === "admin" ? "Make user" : "Make admin"}</button>
        ${u.id !== r.currentUserId ? `<button class="icon-btn danger" onclick="delUser('${u.id}','${esc(u.username)}')">${icon("trash", { size: 16 })}</button>` : ""}
      </div>`
      )
      .join("");
    c.innerHTML = viewHeaderHtml("users", "Users", btn) + `<div class="page-wrap"><div class="kv-list">${rows}</div></div>`;
  } catch (err) {
    c.innerHTML = viewHeaderHtml("users", "Users", btn) + emptyHtml(err.message, "alert");
  }
}
window.newUser = async () => {
  const card = el(`<div class="modal card-modal gd-dialog">
    <div class="gd-dialog-body">
      <div class="gd-dlg-title">New user</div>
      <div class="gd-dlg-field"><input id="ufU" placeholder="Username" autofocus /></div>
      <div class="gd-dlg-field"><input id="ufP" type="password" placeholder="Password" /></div>
      <label class="gd-check"><input type="checkbox" id="ufA" /><span>Make this user an admin</span></label>
      <div class="err" id="ufE"></div>
    </div>
    <div class="gd-dialog-actions"><button class="btn-2 ghost" id="ufNo">Cancel</button><button class="primary" id="ufYes">Create</button></div>
  </div>`);
  const bg = modalOverlay(card);
  card.querySelector("#ufNo").onclick = () => bg._close();
  card.querySelector("#ufYes").onclick = async () => {
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify({ username: card.querySelector("#ufU").value.trim(), password: card.querySelector("#ufP").value, role: card.querySelector("#ufA").checked ? "admin" : "user" }) });
      bg._close(); viewUsers(); toast("User created");
    } catch (e) { card.querySelector("#ufE").textContent = e.message; }
  };
};
window.resetUserPw = async (id, name) => {
  const password = await uiPrompt({ title: "Reset password", label: `New password for ${name}`, placeholder: "New password", okText: "Update" });
  if (!password) return;
  await api("/api/users/" + id, { method: "PATCH", body: JSON.stringify({ password }) });
  toast("Password updated");
};
window.toggleUserRole = async (id, role) => {
  await api("/api/users/" + id, { method: "PATCH", body: JSON.stringify({ role: role === "admin" ? "user" : "admin" }) });
  viewUsers();
};
window.delUser = async (id, name) => {
  if (!(await uiConfirm(`Delete user “${name}”?`, { title: "Delete user?", okText: "Delete", danger: true }))) return;
  await api("/api/users/" + id, { method: "DELETE" });
  viewUsers();
};

function viewSettings() {
  const c = $("#content");
  const isAdmin = !!state.user?.isAdmin;
  const prefs = brand.preferences || { chunkSize: "2mb", wifiAutoDownload: true, hdThumbnails: true };

  const accs = state.accounts
    .map(
      (a) => `<div class="kv-row">
        <div class="kv-ic">${a.premium ? icon("zap", { size: 16, cls: "gold" }) : icon("user", { size: 16 })}</div>
        <div class="info"><div class="t">${esc(a.label)} ${a.id === state.currentAccountId ? '<span class="tag">active</span>' : ""}</div><div class="s">${esc(a.phone || a.username || "")}</div></div>
        ${a.id !== state.currentAccountId ? `<button class="btn-2 sm" onclick="switchAcc('${a.id}')">Switch</button>` : ""}
        ${isAdmin ? `<button class="icon-btn danger" onclick="delAcc('${a.id}')">${icon("trash", { size: 16 })}</button>` : ""}
      </div>`
    )
    .join("");

  const brandLogoPreview = brand.logo ? `<img src="${esc(brand.logo)}" alt="" />` : brandMark(26);
  const brandCard = isAdmin
    ? `<div class="set-card" style="grid-column:1/-1">
        <div class="set-head">${icon("sparkles", { size: 16 })} Instance Branding</div>
        <div class="field"><label>Logo</label>
          <div class="brand-logo-pick">
            <div class="brand-logo-box" id="brandLogoBox">${brandLogoPreview}</div>
            <label class="btn-2">${icon("upload", { size: 14 })} Upload<input type="file" id="logoFile" accept="image/*" hidden /></label>
            ${brand.logo ? `<button class="btn-2 danger" id="logoRemove">${icon("trash", { size: 14 })} Remove</button>` : ""}
            <span class="muted" id="logoMsg" style="font-size:12px">PNG / SVG / WebP, max 2 MB</span>
          </div>
        </div>
        <div class="row">
          <div class="field"><label>App name</label><input id="brName" value="${esc(brand.name)}" maxlength="40" /></div>
          <div class="field"><label>Share tagline</label><input id="brTagline" value="${esc(brand.tagline)}" maxlength="80" /></div>
        </div>
        <div class="field"><label>Accent color</label>
          <div class="brand-color-row">
            <input type="color" id="brAccentColor" value="${esc(brand.accent)}" />
            <input type="text" id="brAccentHex" value="${esc(brand.accent)}" maxlength="7" />
            <div class="brand-swatches">
              ${["#2e7cf6", "#22c55e", "#f43f5e", "#f59e0b", "#8b5cf6", "#06b6d4"].map((col) => `<button type="button" class="swatch" data-c="${col}" style="background:${col}"></button>`).join("")}
            </div>
          </div>
        </div>
        <div class="field"><label>Copyright line</label><input id="brCopy" value="${esc(brand.copyright)}" maxlength="80" placeholder="© ${new Date().getFullYear()} Telegram Disk" /></div>
        <div style="display:flex;align-items:center;gap:12px"><button class="primary" id="brSave">${icon("check", { size: 15 })} Save branding</button><span class="err" id="brErr"></span></div>
      </div>`
    : "";

  c.innerHTML =
    viewHeaderHtml("settings", "Settings") +
    `<div class="page-wrap"><div class="settings-grid">
      <div class="set-card">
        <div class="set-head">${icon("user", { size: 16 })} Profile</div>
        <div class="kv-row" style="margin-bottom:14px"><div class="kv-ic">${icon("shield", { size: 16 })}</div>
          <div class="info"><div class="t">${esc(state.user?.username || "")} <span class="tag">${state.user?.isAdmin ? "admin" : "user"}</span></div></div>
        </div>
        <form id="pwForm">
          <div class="field"><label>Change password</label><input type="password" id="curPw" placeholder="Current password" required /></div>
          <div class="row">
            <input type="password" id="newPw" placeholder="New password" required minlength="4" />
            <button class="primary" style="flex:none" type="submit">${icon("check", { size: 15 })} Update</button>
          </div>
          <div class="err" id="pwErr"></div>
        </form>
      </div>
      <div class="set-card">
        <div class="set-head">${icon("sun", { size: 16 })} Appearance &amp; Preferences</div>
        <div class="theme-row" style="margin-bottom:14px">
          <button class="seg ${theme.current === "dark" ? "on" : ""}" onclick="setTheme('dark')">${icon("moon", { size: 15 })} Dark</button>
          <button class="seg ${theme.current === "light" ? "on" : ""}" onclick="setTheme('light')">${icon("sun", { size: 15 })} Light</button>
        </div>
        <div class="pref-row">
          <div><div style="font-weight:600;font-size:13px">Upload chunk size</div><div class="muted" style="font-size:11.5px">Parallel transfer buffer</div></div>
          <select id="prefChunk" style="width:auto">
            <option value="512kb" ${prefs.chunkSize === "512kb" ? "selected" : ""}>512 KB</option>
            <option value="2mb" ${prefs.chunkSize === "2mb" ? "selected" : ""}>2 MB</option>
            <option value="4mb" ${prefs.chunkSize === "4mb" ? "selected" : ""}>4 MB</option>
          </select>
        </div>
        <div class="pref-row">
          <div><div style="font-weight:600;font-size:13px">Wi-Fi Auto Download</div><div class="muted" style="font-size:11.5px">Prefetch recent media previews</div></div>
          <button type="button" class="pref-switch ${prefs.wifiAutoDownload ? "on" : ""}" id="prefWifi"><span class="pref-knob"></span></button>
        </div>
        <div class="pref-row">
          <div><div style="font-weight:600;font-size:13px">HD Thumbnails</div><div class="muted" style="font-size:11.5px">High-resolution masonry cards</div></div>
          <button type="button" class="pref-switch ${prefs.hdThumbnails ? "on" : ""}" id="prefHd"><span class="pref-knob"></span></button>
        </div>
      </div>
      <div class="set-card" style="grid-column:1/-1">
        <div class="set-head">${icon("users", { size: 16 })} Telegram accounts</div>
        <div class="kv-list">${accs}</div>
        ${isAdmin ? `<button class="btn-2" style="margin-top:12px" onclick="addAccount()">${icon("userPlus", { size: 15 })} Connect another account</button>` : ""}
      </div>
      ${brandCard}
    </div></div>`;

  c.querySelector("#pwForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/api/auth/password", { method: "POST", body: JSON.stringify({ current: $("#curPw").value, next: $("#newPw").value }) });
      $("#curPw").value = $("#newPw").value = "";
      toast("Password updated");
    } catch (err) { $("#pwErr").textContent = err.message; }
  };

  const savePrefs = async (patch) => {
    const nextPrefs = { ...(brand.preferences || {}), ...patch };
    const r = await api("/api/branding", { method: "PUT", body: JSON.stringify({ preferences: nextPrefs }) });
    brand = { ...brand, ...r.branding };
    viewSettings();
    toast("Preferences saved");
  };
  c.querySelector("#prefChunk").onchange = (e) => savePrefs({ chunkSize: e.target.value });
  c.querySelector("#prefWifi").onclick = () => savePrefs({ wifiAutoDownload: !prefs.wifiAutoDownload });
  c.querySelector("#prefHd").onclick = () => savePrefs({ hdThumbnails: !prefs.hdThumbnails });

  if (isAdmin) {
    const color = $("#brAccentColor"), hex = $("#brAccentHex");
    color.oninput = () => (hex.value = color.value);
    hex.oninput = () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) color.value = hex.value; };
    $$(".swatch", c).forEach((s) => (s.onclick = () => { hex.value = color.value = s.dataset.c; }));
    $("#brSave").onclick = async () => {
      const r = await api("/api/branding", {
        method: "PUT",
        body: JSON.stringify({ name: $("#brName").value.trim(), accent: hex.value.trim(), tagline: $("#brTagline").value, copyright: $("#brCopy").value }),
      });
      brand = { ...brand, ...r.branding };
      applyBranding();
      renderSidebar();
      toast("Branding saved");
    };
    const lf = $("#logoFile");
    if (lf) lf.onchange = async () => {
      const f = lf.files?.[0];
      if (!f) return;
      const buf = await f.arrayBuffer();
      const r = await api("/api/branding/logo", { method: "POST", headers: { "Content-Type": f.type }, body: buf });
      brand.logo = r.logo;
      applyBranding();
      viewSettings();
    };
    $("#logoRemove")?.addEventListener("click", async () => {
      await api("/api/branding/logo", { method: "DELETE" });
      brand.logo = "";
      applyBranding();
      viewSettings();
    });
  }
}

/* ===================== Public Share Viewer ===================== */
async function renderPublicShare(id) {
  $("#app").innerHTML = `<div class="center-load"><div class="spinner"></div></div>`;
  let s;
  try { s = await api(`/api/public/share/${id}`); }
  catch (err) { return renderError(err.data?.error || err.message || "Share not available."); }
  if (s.expired) return renderError("This share link has expired.");
  document.title = s.name || "Shared";

  const tParam = (tok) => (tok ? `?token=${encodeURIComponent(tok)}` : "");
  const shell = (inner) => `<div class="pub-wrap">
    <header class="pub-head"><div class="pub-brand">${brandMark(22)}<span>${brandName()}</span></div></header>
    <main class="pub-main">${inner}</main>
    <footer class="pub-foot"><span>${esc(brand.tagline || "")}</span><span>${esc(brandFootCopyright())}</span></footer>
  </div>`;

  function showGate() {
    $("#app").innerHTML = shell(`<div class="pub-card">
      <h2>${esc(s.kind === "folder" ? "Shared folder" : "Shared file")}</h2>
      <p class="muted">This link is password protected.</p>
      <form id="pwForm" style="margin-top:14px">
        <div class="input-wrap" style="margin-bottom:10px">${icon("lock", { size: 16, cls: "lead" })}<input type="password" id="spw" required autofocus placeholder="Password" /></div>
        <button class="primary block" type="submit">${icon("shield", { size: 15 })} Unlock</button>
        <div class="err" id="err"></div>
      </form>
    </div>`);
    $("#pwForm").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api(`/api/public/share/${id}/access`, { method: "POST", body: JSON.stringify({ password: $("#spw").value }) });
        renderContent(r.token);
      } catch (err) { $("#err").textContent = err.message; }
    };
  }
  async function renderContent(tok) { return s.kind === "folder" ? renderPubFolder(tok) : renderPubFile(tok); }
  const withDl = (url) => url + (url.includes("?") ? "&" : "?") + "dl=1";

  function renderPubFile(tok) {
    const raw = `/s/${id}/raw${tParam(tok)}`, thumb = `/s/${id}/thumb${tParam(tok)}`;
    const kind = s.mime?.startsWith("image/") ? "image" : s.mime?.startsWith("video/") ? "video" : s.mime?.startsWith("audio/") ? "audio" : s.mime === "application/pdf" ? "pdf" : "file";
    let prev = "";
    if (kind === "image") prev = `<div class="pub-preview"><img src="${raw}" alt="${esc(s.name)}" /></div>`;
    else if (kind === "video") prev = `<div class="pub-preview"><video src="${raw}" controls playsinline poster="${thumb}"></video></div>`;
    else if (kind === "audio") prev = `<div class="pub-preview audio">${fileIcon("audio", 44)}<audio src="${raw}" controls></audio></div>`;
    else if (kind === "pdf") prev = `<iframe class="pub-pdf" src="${raw}"></iframe>`;
    else prev = `<div class="pub-preview icon">${fileIcon(kind, 64)}<div class="muted">No preview available</div></div>`;
    $("#app").innerHTML = shell(`<div class="pub-card file">
      ${prev}
      <div class="pub-info">
        <div class="pub-meta">${fileIcon(kind, 22)}<div><div class="pub-name">${esc(s.name)}</div><div class="pub-stats">${fmtSize(s.size)} · ${s.downloads} downloads</div></div></div>
        <a class="primary block" href="${withDl(raw)}" download>${icon("download", { size: 16 })} Download</a>
      </div>
    </div>`);
  }

  async function renderPubFolder(tok) {
    const zipUrl = `/s/${id}/zip${tParam(tok)}`;
    $("#app").innerHTML = shell(`<div class="pub-card wide">
      <div class="pub-folder-head">${icon("folder", { size: 28 })}<div class="pub-fh-info"><div class="pub-name">${esc(s.name)}</div><div class="pub-stats" id="fcount">Loading…</div></div><a class="btn-2" href="${zipUrl}" download>${icon("download", { size: 15 })} Download all</a></div>
      <div class="pub-grid" id="fgrid"></div>
    </div>`);
    const r = await api(`/api/public/share/${id}/files${tParam(tok)}`);
    const items = r.items || [];
    $("#fcount").textContent = `${items.length} file${items.length === 1 ? "" : "s"}`;
    $("#fgrid").innerHTML = items.map((f) => `<a class="pub-item" href="${withDl(f.rawUrl)}" target="_blank" rel="noopener">
      <div class="thumb">${f.kind === "image" || f.kind === "video" ? `<img src="${esc(f.thumbUrl)}" onerror="this.remove()" />` : fileIcon(f.kind, 34)}</div>
      <div class="pub-iname">${esc(f.name)}</div><div class="pub-isize">${fmtSize(f.size)}</div>
    </a>`).join("");
  }

  s.needsPassword ? showGate() : renderContent(null);
}

boot();
