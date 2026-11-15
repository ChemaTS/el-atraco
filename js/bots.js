// ======================================================
// BANDAS BOT para probar la partida (las controla la pantalla del profe)
// Juegan los puzzles "en diferido" (resuelven, fallan, piden pistas, se bloquean),
// responden en el localizador y apuestan en el furgón.
// ======================================================
import { DB } from "./db.js";
import { MONEY } from "./config.js";
import { gpath, bpath, addMoney, phase, remaining, active } from "./core.js";
import { PUZZLES, PZPATH } from "./puzzles.js";
import { FQ, drivers, revealDone } from "./fur.js";

const NAMES = ["Botijo", "R2-Pérez", "Chispas", "Tuerca", "Bitly", "Clonk", "Píxel", "Ruidito", "Fotón", "Kernel", "Sprite", "Glitch", "Bucle", "Nodo", "Vector", "Frame"];
export const LEVELS = { facil: { ok: 0.5, err: 0.45, hint: 0.5, block: 0.2, fur: 0.45, label: "fácil" }, medio: { ok: 0.72, err: 0.3, hint: 0.3, block: 0.1, fur: 0.22, label: "medio" }, dificil: { ok: 0.88, err: 0.15, hint: 0.12, block: 0.04, fur: 0.1, label: "difícil" } };
const PIDS = ["t2", "f", "p", "v2", "v3"];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export async function addBots(G, BS, lvl) {
  for (const id of G.bands) {
    const B = BS[id]; if (!B || Object.values(B.members || {}).some((m) => active(m) && !m.bot)) continue;
    const n = Math.random() < 0.5 ? 4 : 5, used = new Set(), avs = [...Array(16).keys()].sort(() => Math.random() - 0.5), members = {};
    for (let i = 0; i < n; i++) { let nm; do nm = pick(NAMES); while (used.has(nm)); used.add(nm); members["bot_" + id + i] = { name: nm, av: avs[i], at: Date.now() + i, bot: true }; }
    await DB.update(bpath(G.code, id), { members, bot: lvl, size: n });
  }
}
export async function removeBots(G, BS) {
  for (const id of G.bands) { const B = BS[id]; if (!B?.bot) continue; await DB.update(bpath(G.code, id), { members: {}, bot: null }); }
}
const isBotBand = (B) => !!B?.bot;
const botSeat = (seat) => typeof seat === "string" && seat.startsWith("bot_");

/* ---------------- motor ---------------- */
const plans = {}, pending = new Set();
const once = (key, fn) => { if (pending.has(key)) return; pending.add(key); Promise.resolve(fn()).catch(console.error); };

export function tick(G, BS) {
  if (!G || G.stage !== "play") return;
  const pid = phase(G.phase).key;
  if (PIDS.includes(pid)) return puzzles(G, BS, pid);
  if (pid === "loc") return loc(G, BS);
  if (pid === "fur") return fur(G, BS);
}

function puzzles(G, BS, pid) {
  const total = G.endsAt ? remaining(G) : null; if (total == null) return;
  G.bands.forEach((id) => {
    const B = BS[id]; if (!isBotBand(B)) return; const L = { ...LEVELS[B.bot] || LEVELS.medio };
    const key = `${G.code}:${id}:${pid}:${G.phase}`;
    if (!plans[key]) {
      const span = total, now = Date.now();
      const solveAt = Math.random() < L.ok + 0.2 ? now + rnd(0.25, 0.9) * span : null; // algunos no lo resuelven a tiempo
      const ev = [];
      if (Math.random() < L.err) ev.push({ t: now + rnd(0.1, 0.6) * span, k: "alarm" });
      if (Math.random() < L.err / 2) ev.push({ t: now + rnd(0.2, 0.7) * span, k: "alarm" });
      if (Math.random() < L.hint) ev.push({ t: now + rnd(0.15, 0.6) * span, k: "hint" });
      if (Math.random() < L.block && pid !== "t2") ev.push({ t: now + rnd(0.2, 0.5) * span, k: "block" });
      plans[key] = { solveAt, ev, done: new Set() };
      once(key + ":doc", async () => { const p = PZPATH(G.code, id, pid); if (!(await DB.get(p))) await DB.set(p, { st: PUZZLES[pid].init(), alarms: 0, nAl: 0, nHint: 0, err: 0, hints: {}, claim: {}, solved: false, blk: false, guided: false, bot: true }); });
    }
    const P = plans[key], now = Date.now(), path = PZPATH(G.code, id, pid);
    P.ev.forEach((e, i) => {
      if (now < e.t || P.done.has(i)) return; P.done.add(i);
      if (e.k === "alarm") { DB.update(path, { nAl: DB.inc(1), alarms: DB.inc(1) }).catch(console.error); addMoney(G.code, id, MONEY.alarm, "alarma", pid); }
      if (e.k === "hint") { DB.update(path, { nHint: DB.inc(1) }).catch(console.error); addMoney(G.code, id, MONEY.hint, "pista", pid); }
      if (e.k === "block") { P.guided = true; DB.update(path, { err: 2, blk: true, guided: true, nAl: DB.inc(1) }).catch(console.error); addMoney(G.code, id, MONEY.block, "bloqueo", pid); }
    });
    if (P.solveAt && now >= P.solveAt && !P.solved) {
      P.solved = true;
      once(key + ":win", async () => {
        const st = pid === "v2" ? { "st.sub": Math.random() < 0.6 ? "422" : "420" } : {};
        await DB.update(path, { solved: true, solvedAt: Date.now(), ...st });
        if (P.guided) return;
        await addMoney(G.code, id, MONEY.solve, "puzzle resuelto", pid);
        const g = await DB.get(gpath(G.code));
        if (!g?.first?.[pid]) { await DB.update(gpath(G.code), { ["first." + pid]: id }); await addMoney(G.code, id, MONEY.firstBonus, "primera banda", pid); }
      });
    }
  });
}

function loc(G, BS) {
  const L = G.loc; if (!L || !L.turn) return;
  const t = L.turn, B = BS[t.band]; if (!botSeat(t.seat) || !isBotBand(B)) return;
  const lv = LEVELS[B.bot] || LEVELS.medio;
  if (L.phase === "q" && !L.answer) once("la:" + t.id, () => new Promise((res) => setTimeout(() => {
    const ok = Math.random() < lv.ok, i = ok ? t.opts.indexOf(t.ans) : pick(t.opts.map((o, k) => k).filter((k) => t.opts[k] !== t.ans));
    DB.update(gpath(G.code), { "loc.answer": { id: t.id, i } }).then(res, res);
  }, rnd(2000, 7000))));
  if (L.phase === "pick" && !L.passTo) once("lp:" + t.id, () => new Promise((res) => setTimeout(() => {
    const opts = G.bands.filter((b) => b !== L.holder && (b !== L.from || G.bands.length < 3) && Object.values(BS[b]?.members || {}).some(active));
    if (!opts.length) return res();
    // a veces van a por la banda más rica
    const rich = opts.slice().sort((a, b) => (BS[b]?.botin || 0) - (BS[a]?.botin || 0))[0];
    DB.update(gpath(G.code), { "loc.passTo": { id: t.id, band: Math.random() < 0.5 ? rich : pick(opts) } }).then(res, res);
  }, rnd(1500, 4000))));
}

function fur(G, BS) {
  const F = G.fur; if (!F || !F.phase) return; const q = FQ[F.qi];
  G.bands.forEach((id) => {
    const B = BS[id]; if (!isBotBand(B)) return; const lv = LEVELS[B.bot] || LEVELS.medio;
    const by = { name: Object.values(B.members || {})[0]?.name || "Bot", av: Object.values(B.members || {})[0]?.av || 0, seat: "bot" };
    if (F.phase === "ask" && !F.bids?.[id]) once(`fb:${F.round}:${id}`, () => new Promise((res) => setTimeout(() => {
      const exact = Math.random() < lv.ok * 0.35, v = exact ? q.a : Math.max(0, Math.round(q.a * (1 + (Math.random() * 2 - 1) * lv.fur * 2)));
      DB.update(gpath(G.code), { ["fur.bids." + id]: { v, by } }).then(res, res);
    }, rnd(3000, 9000))));
    if (F.phase === "reveal" && revealDone(F, G) && !F.ch?.[id] && !drivers(F, G).includes(id) && F.bids?.[id]) once(`fc:${F.round}:${id}`, () => new Promise((res) => setTimeout(() => {
      const dr = drivers(F, G), over = dr.length && F.bids[dr[0]].v > q.a, knows = Math.random() < lv.ok;
      const v = (knows ? !over : over) ? "sube" : "baja";
      const extra = F.round === 6 ? { ["fur.amt." + id]: Math.round(rnd(3, 8)) * 10 } : {};
      DB.update(gpath(G.code), { ["fur.ch." + id]: { v, by }, ...extra }).then(res, res);
    }, rnd(2000, 6000))));
  });
}
