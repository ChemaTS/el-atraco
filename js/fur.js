// ======================================================
// FUGA · EL FURGÓN (estimación y apuesta entre bandas)
// Estado en games/{code}.fur. El profe lo dirige; cada banda
// manda su cifra y su decisión desde cualquiera de sus PCs.
// ======================================================
import { DB } from "./db.js";
import { esc, eu, gpath, addMoney, active, SEAT } from "./core.js";
import { avName } from "./avatars.js";
import { beep, noise, siren, engine, thump, tensionOn, tensionOff, aud } from "./sfx.js";

export const ROUNDS = 6, STAKE = 100000, PREC = 200000, EXACT = 300000, CRASH = 100000;
const REVEAL_STEP = 750, ROLL = 3000;

export const FQ = [
  { q: "¿Cuántos fotogramas tiene un clip PAL de 10 segundos?", a: 250, why: "PAL = 25 fps → 25 × 10 = 250." },
  { q: "¿Cuántos niveles distintos puede tomar una muestra de 4 bits?", a: 16, why: "2⁴ = 16." },
  { q: "¿Cuántos puntos tipográficos son 3 picas?", a: 36, why: "1 pica = 12 pt → 3 × 12 = 36." },
  { q: "Para grabar sonidos de hasta 22 kHz, ¿cuál es el muestreo mínimo en kHz?", a: 44, why: "Nyquist: el doble de la frecuencia más alta → 44 kHz." },
  { q: "¿Cuántos campos por segundo tiene el vídeo entrelazado PAL?", a: 50, why: "25 imágenes/s × 2 campos = 50." },
  { q: "¿Cuántos niveles por canal tiene una imagen de 8 bits?", a: 256, why: "2⁸ = 256 (de 00 a FF)." },
  { q: "¿Cuántos fotogramas hay en 2 segundos de cine tradicional?", a: 48, why: "Cine = 24 fps → 24 × 2 = 48." },
  { q: "1 minuto de audio a 48 kHz: ¿cuántos miles de muestras por canal?", a: 2880, why: "48.000 × 60 = 2.880.000 → 2.880 miles." },
  { q: "¿Cuántos píxeles de ancho tiene un vídeo Full HD?", a: 1920, why: "Full HD = 1920 × 1080." },
  { q: "Bitrate recomendado para 1080p a 50 fps, en Mbps (tabla de streaming):", a: 12, why: "1080p a 50–60 fps → 12 Mbps." },
  { q: "¿Cuántos fotogramas tiene 1 minuto de vídeo a 25 fps?", a: 1500, why: "25 × 60 = 1.500." },
  { q: "¿Cuántos puntos tipográficos tiene una pulgada?", a: 72, why: "1 punto = 1/72 de pulgada." },
  { q: "Rango dinámico aproximado de un audio de 16 bits, en dB:", a: 96, why: "Unos 6 dB por bit → 16 × 6 = 96 dB." },
  { q: "¿Cuántos píxeles de alto tiene un vídeo 4K UHD?", a: 2160, why: "4K UHD = 3840 × 2160." },
  { q: "Muestreo mínimo, en kHz, para recoger sonidos de hasta 24 kHz:", a: 48, why: "Nyquist: 2 × 24 = 48 kHz." },
];
const shuf = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const up = (code, o) => { const d = {}; Object.entries(o).forEach(([k, v]) => (d["fur." + k] = v)); return DB.update(gpath(code), d); };
const nf = (n) => Number(n).toLocaleString("es-ES");

/* ---------------- cálculo ---------------- */
const bidders = (F, G) => G.bands.filter((b) => F.bids && F.bids[b] != null);
export function drivers(F, G) { const ids = bidders(F, G); if (!ids.length) return []; const mx = Math.max(...ids.map((b) => F.bids[b].v)); return ids.filter((b) => F.bids[b].v === mx); }
const last = (F) => F.round === ROUNDS;
const stakeOf = (F, b, bot) => (last(F) ? Math.round((Math.max(0, bot) * ((F.amt || {})[b] ?? 50)) / 100 / 1000) * 1000 : STAKE);
export function resolve(F, G, BS) {
  const q = FQ[F.qi], dr = drivers(F, G), mx = dr.length ? F.bids[dr[0]].v : null, over = mx != null && mx > q.a;
  const under = bidders(F, G).filter((b) => F.bids[b].v <= q.a), best = under.length ? Math.max(...under.map((b) => F.bids[b].v)) : null;
  const delta = {}, why = {}, pts = {};
  G.bands.forEach((b) => {
    let d = 0; const w = []; const bid = F.bids?.[b]?.v;
    if (bid != null && best != null && bid === best) { const v = bid === q.a ? EXACT : PREC; d += v; w.push(bid === q.a ? "¡clavada!" : "la más cercana sin pasarse"); }
    if (dr.includes(b)) { if (over) { d -= CRASH; w.push("estrelló el furgón"); } }
    else if (F.ch?.[b]) { const c = F.ch[b].v, st = stakeOf(F, b, BS[b]?.botin || 0), win = (c === "sube") === !over; d += win ? st : -st; w.push((c === "sube" ? "se subió" : "se quedó abajo") + (win ? " y acertó" : " y falló")); }
    delta[b] = d; why[b] = w.join(" · ");
    // nota: precisión absoluta, sin importar el resto de bandas
    if (bid != null) { const e = Math.abs(bid - q.a) / q.a; pts[b] = e === 0 ? 1 : e <= 0.1 ? 0.6 : e <= 0.25 ? 0.3 : 0; } else pts[b] = 0;
  });
  return { ok: !over, drivers: dr, mx, delta, why, pts };
}

/* ---------------- acciones del profe ---------------- */
export async function startRound(G, n) {
  let bag = (G.fur?.bag || []).slice(); if (!bag.length) bag = shuf(FQ.map((_, i) => i));
  const qi = bag.pop();
  await DB.update(gpath(G.code), { fur: { round: n, qi, bag, phase: "ask", bids: {}, ch: {}, amt: {}, res: null, log: G.fur?.log || [], stats: G.fur?.stats || {} } });
}
export const reveal = (G) => up(G.code, { phase: "reveal", revealAt: Date.now() });
export async function roll(G, BS) {
  const F = G.fur, r = resolve(F, G, BS), q = FQ[F.qi];
  const stats = {}; G.bands.forEach((b) => { stats["fur.stats." + b + ".pts"] = DB.inc(r.pts[b]); stats["fur.stats." + b + ".n"] = DB.inc(1); });
  await DB.update(gpath(G.code), { "fur.phase": "roll", "fur.rollAt": Date.now(), "fur.res": r, ...stats,
    "fur.log": [...(F.log || []), `Ronda ${F.round}: conducía ${r.drivers.map((b) => BS[b]?.name || b).join(" y ") || "nadie"} con ${r.mx != null ? nf(r.mx) : "—"} · respuesta ${nf(q.a)} → ${r.ok ? "llegó" : "chocó"}.`] });
  // el dinero se aplica cuando termina el redoble, para no destripar el resultado
  setTimeout(() => G.bands.forEach((b) => r.delta[b] && addMoney(G.code, b, r.delta[b], "furgón · " + r.why[b], "fur").catch(console.error)), ROLL + 200);
}
export const endFur = (G) => up(G.code, { phase: "end" });

/* ---------------- escena ---------------- */
const shownCount = (F, G, now) => (F.phase === "reveal" ? Math.min(bidders(F, G).length, Math.floor((now - F.revealAt) / REVEAL_STEP)) : F.phase === "ask" ? 0 : 99);
export const revealDone = (F, G, now = Date.now()) => F.phase !== "ask" && (F.phase !== "reveal" || now - F.revealAt > bidders(F, G).length * REVEAL_STEP + 1200);
const view = (F, G, now) => { if (F.phase === "roll" && now - F.rollAt >= ROLL) return "res"; return F.phase; };
function scene(F, G, BS, now) {
  const ph = view(F, G, now), dr = revealDone(F, G, now) ? drivers(F, G) : [], col = dr.length ? BS[dr[0]]?.color : "#6b5e5b";
  const res = ph === "res" ? (F.res?.ok ? "go" : "crash") : "";
  let bld = ""; for (let i = 0; i < 14; i++) { const h = 40 + ((i * 37) % 70), w = 34 + ((i * 13) % 22); bld += `<rect x="${i * 52}" y="${120 - h}" width="${w}" height="${h}" fill="#1c1617"/>`; for (let y = 124 - h; y < 112; y += 12) for (let x = i * 52 + 5; x < i * 52 + w - 6; x += 10) if ((x * 7 + y * 3 + i) % 5 === 0) bld += `<rect x="${x}" y="${y}" width="4" height="5" fill="#f2c95a" opacity=".55"/>`; }
  const van = `<g class="fvan ${res}" transform="translate(280,118)"><rect x="0" y="0" width="92" height="38" rx="5" fill="${col}"/><path d="M92 8h22l18 18v12H92z" fill="${col}"/><rect x="98" y="12" width="15" height="12" fill="#0d0b0b"/><path d="M132 30 L240 18 L240 44 Z" fill="#fff6c8" opacity="${dr.length ? ".18" : "0"}"/><circle cx="24" cy="42" r="10" fill="#0d0b0b" stroke="#777" stroke-width="3"/><circle cx="112" cy="42" r="10" fill="#0d0b0b" stroke="#777" stroke-width="3"/>${dr.length ? `<text x="46" y="25" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="13" font-weight="700" fill="#0d0b0b">${nf(F.bids[dr[0]].v)}</text>` : ""}</g>`;
  const pol = res === "crash" ? '<g class="fpol" transform="translate(470,128)"><rect x="0" y="0" width="100" height="30" rx="5" fill="#e9e6e1"/><rect x="18" y="-12" width="56" height="14" rx="3" fill="#e9e6e1"/><rect class="lr" x="30" y="-20" width="14" height="9" fill="#ff2a2a"/><rect class="lb" x="46" y="-20" width="14" height="9" fill="#2a6bff"/><text x="50" y="21" text-anchor="middle" font-family="IBM Plex Sans,Arial" font-size="11" font-weight="700" fill="#14213d">POLICÍA</text><circle cx="22" cy="32" r="9" fill="#0d0b0b"/><circle cx="80" cy="32" r="9" fill="#0d0b0b"/></g><rect class="fflash" x="0" y="0" width="720" height="200" fill="#ff2a2a"/>' : "";
  const cd = ph === "roll" ? `<text x="360" y="92" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="70" font-weight="700" fill="#ff4b3e" class="fcd">${Math.max(1, 3 - Math.floor((now - F.rollAt) / 1000))}</text>` : "";
  return `<svg class="fscene" viewBox="0 0 720 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Escena del furgón"><defs><linearGradient id="fsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07060a"/><stop offset="1" stop-color="#241a22"/></linearGradient></defs><rect width="720" height="200" fill="url(#fsky)"/><circle cx="630" cy="34" r="14" fill="#e9e3d0" opacity=".8"/>${bld}<rect y="150" width="720" height="50" fill="#141112"/><g class="froadl${ph === "roll" ? " run" : ""}">${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 60}" y="173" width="32" height="4" fill="#d8c25a"/>`).join("")}</g>${van}${pol}${cd}</svg>`;
}
function boardHTML(F, G, BS, now) {
  const ph = view(F, G, now), order = bidders(F, G).sort((a, b) => F.bids[a].v - F.bids[b].v), n = shownCount(F, G, now), done = revealDone(F, G, now), dr = done ? drivers(F, G) : [];
  return `<div class="lboard">${G.bands.map((b) => { const B = BS[b]; if (!B) return ""; const bid = F.bids?.[b];
    let tag;
    const chip = (ok, a, b2) => `<i class="fchip ${ok ? "ok" : "wait"}">${ok ? "✅ " + a : "⏳ " + b2}</i>`;
    if (F.phase === "ask") tag = chip(!!bid, "Cifra enviada", "Pensando la cifra…");
    else { const vis = !bid || order.indexOf(b) < n; tag = `<i class="fbid">${!bid ? "—" : vis ? nf(bid.v) : "?"}</i>` + (dr.includes(b) ? '<i class="ldot">🚐 CONDUCE</i>' : !bid ? "" : ph === "res" ? (F.ch?.[b] ? `<i class="lfrom">${F.ch[b].v === "sube" ? "se subió" : "se quedó abajo"}</i>` : '<i class="lfrom">no decidió</i>') : done ? chip(!!F.ch?.[b], "Ha decidido", "Decidiendo…") : "");
      if (ph === "res" && F.res?.delta?.[b]) tag += `<i class="${F.res.delta[b] > 0 ? "fwin" : "flose"}">${F.res.delta[b] > 0 ? "+" : ""}${eu(F.res.delta[b])}</i>`; }
    return `<div class="lband${dr.includes(b) ? " hot" : ""}" style="--bc:${B.color}"><b>${esc(B.name)}</b><span>${eu(Math.max(0, B.botin))}</span>${tag}</div>`; }).join("")}</div>`;
}
function answerHTML(F, G, BS, now) {
  if (view(F, G, now) !== "res") return "";
  const q = FQ[F.qi], r = F.res;
  return `<div class="fans ${r.ok ? "ok" : "bad"}"><b>Respuesta: ${nf(q.a)}</b> · ${esc(q.why)}<br>${r.ok ? "El conductor no se pasó: el furgón llega. Ganan los que se subieron." : "El conductor se pasó: ¡el furgón choca! Ganan los que se quedaron abajo."} La banda más cercana sin pasarse se lleva el premio de precisión.</div>`;
}
function head(F, G, BS, now) {
  const q = FQ[F.qi], dr = revealDone(F, G, now) ? drivers(F, G) : [], ph = view(F, G, now);
  return `<p class="lead" style="margin:0 0 6px">Ronda ${F.round} de ${ROUNDS}${last(F) ? ' · <b style="color:var(--red2)">TODO O NADA</b>' : ` · cada decisión: ${eu(STAKE)}`}</p><p class="lq">${esc(q.q)}</p>`
    + (dr.length && ph !== "ask" ? `<p class="fdrv">Conduce${dr.length > 1 ? "n" : ""} <b>${dr.map((b) => esc(BS[b]?.name || b)).join(" y ")}</b> con <b>${nf(F.bids[dr[0]].v)}</b>${ph === "roll" ? ' · <span style="color:var(--red2)">¿se ha pasado?</span>' : ""}</p>` : F.phase === "reveal" ? '<p class="fdrv">Destapando cifras…</p>' : "");
}

/* ---------------- proyector ---------------- */
let pKey = null, pSound = { reveal: null, roll: null, res: null, shown: -1 };
export function projector(root, G, BS) {
  const F = G.fur, now = Date.now();
  if (!F || !F.phase) { root.innerHTML = `<div class="watch"><b>El furgón</b><p class="lead">Esperando a que el profe saque el primer furgón.</p></div>`; pKey = null; return; }
  if (F.phase === "end") { if (pKey !== "end") { pKey = "end"; tensionOff(); root.innerHTML = `<div class="watch"><b>Fin de la huida</b><p class="lead">Atentos al recuento.</p></div>`; } return; }
  const ph = view(F, G, now), key = [F.round, ph, shownCount(F, G, now), revealDone(F, G, now)].join("|");
  if (key !== pKey) { pKey = key; root.innerHTML = head(F, G, BS, now) + `<div id="fsc">${scene(F, G, BS, now)}</div>` + answerHTML(F, G, BS, now) + `<div id="fbd"></div>`; }
  else if (ph === "roll") { const s = root.querySelector("#fsc"); if (s) s.innerHTML = scene(F, G, BS, now); }
  const bd = root.querySelector("#fbd"); if (bd) { const h = progress(F, G, now) + boardHTML(F, G, BS, now); if (bd.dataset.h !== h) { bd.dataset.h = h; bd.innerHTML = h; } }
  // sonido
  aud();
  const n = shownCount(F, G, now);
  if (F.phase === "reveal" && n !== pSound.shown && n >= 0 && n <= bidders(F, G).length) { const tot = bidders(F, G).length; if (n > pSound.shown && n > 0) { n === tot ? (thump(), beep(220, 0.5, 0.08, "sawtooth")) : beep(400 + n * 90, 0.08, 0.06); } pSound.shown = n; }
  if (F.phase === "reveal" && revealDone(F, G, now) && pSound.reveal !== F.round) { pSound.reveal = F.round; tensionOn(); }
  if (F.phase === "roll" && pSound.roll !== F.round) { pSound.roll = F.round; pSound.shown = -1; tensionOff(); let t = 0; for (let i = 0; i < 28; i++) { t += Math.max(35, 140 - i * 4); setTimeout(() => noise(0.06, 0.12, 900), t); } }
  if (ph === "res" && pSound.res !== F.round) { pSound.res = F.round; noise(0.5, 0.35, 4000); if (F.res?.ok) { engine(); [600, 750, 900].forEach((d, k) => setTimeout(() => beep(523 * [1, 1.26, 1.5][k], 0.5, 0.06, "triangle"), d)); } else { noise(0.9, 0.5, 1200); beep(70, 0.6, 0.12, "sawtooth"); setTimeout(() => siren(2), 300); } }
  if (F.phase === "ask") { tensionOff(); pSound.shown = -1; }
}

/* ---------------- alumno ---------------- */
export function student(G, BS, me) {
  const F = G.fur, now = Date.now();
  if (!F || !F.phase) return `<div class="watch"><b>El furgón</b><p class="lead">Mirad al proyector: el profe va a sacar el primer furgón.</p></div>`;
  if (F.phase === "end") return `<div class="watch"><b>Fin de la huida</b><p class="lead">Atentos al recuento.</p></div>`;
  const q = FQ[F.qi], my = me.band, bid = F.bids?.[my], ph = view(F, G, now), dr = revealDone(F, G, now) ? drivers(F, G) : [];
  let h = head(F, G, BS, now);
  if (F.phase === "ask") h += bid
    ? `<div class="panel"><h3>Vuestra cifra</h3><p style="margin:0;font:700 28px var(--f-mono)">${nf(bid.v)}</p><p class="lead" style="margin:6px 0 0;font-size:14px">Enviada por ${avName(bid.by, 20)}. Podéis cambiarla hasta que el profe destape las cifras.</p><form class="row" data-fbid style="margin-top:10px"><input class="inp" type="number" min="0" step="any" inputmode="decimal" aria-label="Nueva cifra" placeholder="Cambiar cifra"><button class="btn">Cambiar</button></form></div>`
    : `<div class="panel"><h3>Cifra secreta de vuestra banda</h3><p class="lead" style="margin:0 0 10px;font-size:14px">Hablad entre vosotros y que uno la envíe. Si la cifra más alta es la vuestra, conducís el furgón.</p><form class="row" data-fbid><input class="inp" type="number" min="0" step="any" inputmode="decimal" aria-label="Vuestra cifra" placeholder="Cifra" required><button class="btn red">Enviar</button></form></div>`;
  else if (F.phase === "reveal" && !revealDone(F, G, now)) h += `<div class="watch"><b>Destapando cifras…</b><p class="lead">Mirad al proyector.</p></div>`;
  else if (F.phase === "reveal") {
    if (dr.includes(my)) h += `<div class="panel"><h3>Conducís el furgón</h3><p style="margin:0">Si no os habéis pasado, os lleváis el premio de precisión. Si os habéis pasado, el furgón choca (−${eu(CRASH)}).</p></div>`;
    else { const c = F.ch?.[my];
      h += `<div class="panel"><h3>¿Os subís al furgón?</h3><p class="lead" style="margin:0 0 10px;font-size:14px">Subiros es apostar a que el conductor <b>no</b> se ha pasado. Quedarse abajo, a que sí. Podéis cambiar de idea hasta que el profe revele la respuesta.</p><div class="fch"><button class="btn${c?.v === "sube" ? " on" : ""}" type="button" data-fch="sube">Subirse</button><button class="btn${c?.v === "baja" ? " on" : ""}" type="button" data-fch="baja">Quedarse abajo</button></div>${c ? `<p class="lead" style="margin:8px 0 0;font-size:14px">Decidido por ${avName(c.by, 18)}.</p>` : ""}</div>`; }
    if (last(F)) { const a = (F.amt || {})[my] ?? 50; h += `<div class="panel"><h3>Todo o nada</h3><label class="famt">Os jugáis <input type="range" min="0" max="100" step="10" value="${a}" data-famt aria-label="Porcentaje del botín"> <span>${a}% · ${eu(stakeOf(F, my, BS[my]?.botin || 0))}</span></label></div>`; }
  }
  else if (ph === "roll") h += `<div class="watch"><b>¿Llegará?</b><p class="lead">Mirad al proyector.</p></div>`;
  else if (ph === "res") { const d = F.res?.delta?.[my] || 0; h += `<div class="panel" style="border-color:${d >= 0 ? "var(--ok)" : "var(--red2)"}"><h3>Vuestra ronda</h3><p style="margin:0;font:700 26px var(--f-mono);color:${d >= 0 ? "var(--ok)" : "var(--red2)"}">${d > 0 ? "+" : ""}${eu(d)}</p><p class="lead" style="margin:6px 0 0">${esc(F.res?.why?.[my] || "Sin apuesta esta ronda.")}</p></div>` + answerHTML(F, G, BS, now); }
  return h;
}
function progress(F, G, now) {
  if (F.phase === "ask") { const n = bidders(F, G).length; return `<div class="fprog"><b>${n} / ${G.bands.length}</b> bandas han enviado su cifra</div>`; }
  if (F.phase === "reveal" && revealDone(F, G, now)) { const dr = drivers(F, G), need = bidders(F, G).filter((b) => !dr.includes(b)), n = need.filter((b) => F.ch?.[b]).length; return `<div class="fprog"><b>${n} / ${need.length}</b> bandas han decidido si se suben</div>`; }
  return "";
}
export const board = (G, BS) => (G.fur && G.fur.phase && G.fur.phase !== "end" ? boardHTML(G.fur, G, BS, Date.now()) : "");
// el hash de la vista sirve para no repintar si no cambia nada
export const studentKey = (G, me) => { const F = G.fur || {}, now = Date.now(); return JSON.stringify([F.round, F.phase, F.bids?.[me.band], F.ch?.[me.band], (F.amt || {})[me.band], revealDone(F, G, now), view(F, G, now), F.res?.ok]); };
export function studentEvent(e, G, me) {
  const F = G?.fur; if (!F) return;
  const by = { name: me.name, av: me.av ?? 0, seat: SEAT };
  if (e.type === "submit") { const f = e.target.closest("form[data-fbid]"); if (!f || F.phase !== "ask") return; e.preventDefault(); const v = parseFloat(String(f.querySelector("input").value).replace(",", ".")); if (isNaN(v) || v < 0) return; up(G.code, { ["bids." + me.band]: { v, by } }).catch(console.error); return; }
  if (e.type === "click") { const c = e.target.closest("[data-fch]"); if (c && F.phase === "reveal" && revealDone(F, G) && !drivers(F, G).includes(me.band)) up(G.code, { ["ch." + me.band]: { v: c.dataset.fch, by } }).catch(console.error); return; }
  if (e.type === "change") { const r = e.target.closest("[data-famt]"); if (r && F.phase === "reveal") up(G.code, { ["amt." + me.band]: +r.value }).catch(console.error); }
}
