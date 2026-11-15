// ======================================================
// Utilidades y operaciones de partida compartidas
// ======================================================
import { DB } from "./db.js";
import { BANDS, PHASES, MONEY, MEDIA } from "./config.js";

export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const eu = (v) => Math.round(v).toLocaleString("es-ES") + " €";
export const T = (head, body) => `<div class="panel"><h3>${head}</h3>${body}</div>`;
export const bandInfo = (id) => BANDS.find((b) => b.id === id) || { id, name: id, color: "#888" };
export const phase = (i) => PHASES[Math.max(0, Math.min(PHASES.length - 1, i | 0))];
export const now = () => Date.now();

// identidad del puesto (pestaña): sobrevive a recargas
export const SEAT = sessionStorage.getItem("seat") || "s" + Math.random().toString(36).slice(2, 10);
sessionStorage.setItem("seat", SEAT);

// recordar partida del alumno (para volver tras recargar o cerrar)
export const ME = {
  get() { try { return JSON.parse(sessionStorage.getItem("me") || "null"); } catch { return null; } },
  last() { try { return JSON.parse(localStorage.getItem("me") || "null"); } catch { return null; } },
  set(v) { const s = JSON.stringify(v); sessionStorage.setItem("me", s); localStorage.setItem("me", s); },
  clear() { sessionStorage.removeItem("me"); localStorage.removeItem("me"); },
};

export const gpath = (code) => `games/${code}`;
export const bpath = (code, b) => `games/${code}/bands/${b}`;

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export async function createGame(bandIds, test) {
  let code;
  for (let i = 0; i < 20; i++) {
    code = Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join("");
    if (!(await DB.get(gpath(code)))) break;
  }
  const minutes = {}; PHASES.forEach((p) => (minutes[p.key] = p.minutes));
  await DB.set(gpath(code), {
    code, created: now(), teacher: DB.uid, bands: bandIds, test: !!test,
    phase: 0, stage: "ready", endsAt: null, remaining: null, minutes,
  });
  for (const id of bandIds) {
    const b = bandInfo(id);
    await DB.set(bpath(code, id), { id, name: b.name, color: b.color, botin: MONEY.start, size: 5, members: {}, ledger: [] });
  }
  return code;
}

// dinero: suma al botín y deja rastro en el libro (para la gráfica final)
export async function addMoney(code, bandId, delta, why, phKey) {
  if (!delta) return;
  await DB.update(bpath(code, bandId), {
    botin: DB.inc(delta),
    ledger: DB.union({ ph: phKey, d: delta, why, t: now(), r: Math.random().toString(36).slice(2, 7) }),
  });
}

// tiempo restante de la fase (ms) o null si no tiene límite
export function remaining(g) {
  if (!g) return null;
  if (g.stage === "paused") return g.remaining;
  if (g.stage === "play" && g.endsAt) return Math.max(0, g.endsAt - now());
  return null;
}
export const fmt = (ms) => { const s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

// arrancar la fase tras el vídeo
export function startPlay(g) {
  const p = phase(g.phase), min = g.test && p.minutes ? 2 : (g.minutes?.[p.key] ?? p.minutes);
  return DB.update(gpath(g.code), { stage: "play", endsAt: min ? now() + min * 60000 : null, remaining: null });
}

export function header(p) {
  return `<div class="hcard" style="background-image:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.05)),url('${MEDIA.img(p.header)}')"><div class="t"><small>${esc(p.area)}</small><h1>${esc(p.title)}</h1></div></div>`;
}
export const showErr = (e) => { const el = $("#err"); if (el) { el.hidden = false; el.textContent = "Error: " + (e?.message || e); } console.error(e); };
