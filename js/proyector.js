// ======================================================
// PROYECTOR (pantalla grande del aula, sin interacción de juego)
// ======================================================
import { DB } from "./db.js";
import { MEDIA } from "./config.js";
import { avatarSVG } from "./avatars.js";
import * as LOC from "./loc.js";
import * as FUR from "./fur.js";
import * as REC from "./recuento.js";
import { beep } from "./sfx.js";
import { active, $, esc, eu, phase, gpath, remaining, fmt, startPlay, header } from "./core.js";

let app, unsub = [], tick = null, G = null, BS = {}, armed = false, playingKey = null;
const stop = () => { unsub.forEach((f) => f()); unsub = []; clearInterval(tick); };

export function enter(el, args) {
  app = el; G = null; BS = {};
  const code = (args[0] || "").toUpperCase();
  if (!code) {
    app.innerHTML = `<h1>Proyector</h1><form id="pc" class="row"><input class="inp code" maxlength="5" placeholder="CÓDIGO" aria-label="Código de partida"><button class="btn red">Abrir</button></form>`;
    $("#pc").onsubmit = (e) => { e.preventDefault(); const c = $("#pc input").value.trim().toUpperCase(); if (c) location.hash = "#/proyector/" + c; };
    return;
  }
  unsub.push(DB.onDoc(gpath(code), (g) => { G = g; draw(); }));
  unsub.push(DB.onCol(`games/${code}/bands`, (b) => { BS = b || {}; events(); drawBoard(); }));
  tick = setInterval(() => {
    const el = $("#pjt"); if (!el || !G) return;
    const r = remaining(G); el.textContent = r == null ? "" : fmt(r); el.classList.toggle("low", r != null && r < 60000);
    if (isLoc()) { LOC.hostTick(G, BS, { sound: armed }); LOC.barTick(app, G); }
    if (isFur() && $("#board")) FUR.projector($("#board"), G, BS);
  }, 200);
}
export function leave() { stop(); music(false); document.querySelector(".feed")?.remove(); document.querySelector(".mus")?.remove(); document.querySelector(".vidwrap")?.remove(); document.querySelector(".gate")?.remove(); }

function gate() {
  if (armed || document.querySelector(".gate")) return;
  const d = document.createElement("div"); d.className = "gate";
  d.innerHTML = `<button class="btn red">Pulsa para activar el proyector y el sonido</button>`;
  d.onclick = () => { armed = true; d.remove(); draw(); };
  document.body.appendChild(d);
}

/* avisos en pantalla cuando una banda abre un candado o se bloquea */
let seen = null;
const NOTE = { "puzzle resuelto": ["ha abierto el candado", true], "primera banda": ["¡ha sido la primera! +100.000 €", true], bloqueo: ["ha bloqueado el sistema", false] };
function events() {
  const now = {}; Object.values(BS).forEach((b) => (b.ledger || []).forEach((e) => (now[b.id + e.t + e.r] = [b, e])));
  if (!seen) { seen = new Set(Object.keys(now)); return; }
  Object.entries(now).forEach(([k, [b, e]]) => {
    if (seen.has(k)) return; seen.add(k);
    const n = NOTE[e.why]; if (!n) return;
    let f = document.querySelector(".feed"); if (!f) { f = document.createElement("div"); f.className = "feed"; document.body.appendChild(f); }
    const d = document.createElement("div"); d.style.setProperty("--bc", b.color); d.innerHTML = `<b>${esc(b.name)}</b> ${n[0]}`; f.appendChild(d); setTimeout(() => d.remove(), 6200);
    if (armed) n[1] ? [523, 659, 784].forEach((fq, i) => setTimeout(() => beep(fq, 0.25, 0.07, "triangle"), i * 110)) : beep(160, 0.5, 0.09, "sawtooth");
  });
}
/* música de ambiente en el proyector (fases de puzzle y espera) */
let mus = null, musOn = localStorage.getItem("musica") !== "no";
function music(want) {
  if (!mus) { mus = new Audio("media/audio/musica.mp3"); mus.loop = true; mus.volume = 0.18; }
  if (want && musOn && armed) { if (mus.paused) mus.play().catch(() => { }); } else if (!mus.paused) mus.pause();
  let b = document.querySelector(".mus"); if (!b) { b = document.createElement("button"); b.className = "btn mus"; b.type = "button"; b.onclick = () => { musOn = !musOn; localStorage.setItem("musica", musOn ? "si" : "no"); draw(); }; document.body.appendChild(b); }
  b.textContent = musOn ? "♪ Música: sí" : "♪ Música: no";
}
function draw() {
  if (!G) { app.innerHTML = `<p class="lead">Esperando partida…</p>`; return; }
  gate();
  const p = phase(G.phase);
  const msg = G.stage === "ready" ? (G.phase === 0 ? "Esperando a las bandas…" : "Preparados…") : G.stage === "paused" ? "PAUSA" : G.stage === "play" && remaining(G) === 0 ? "¡TIEMPO!" : "";
  app.innerHTML = `<div class="pj">${header(p)}
    <div class="pjrow"><div><span class="stage">Código</span> <span class="codebig">${esc(G.code)}</span><div style="color:var(--muted);margin-top:6px">Entrad en <b>${esc(location.origin + location.pathname)}#/jugar</b></div></div>
      <div style="text-align:right"><div class="timer" id="pjt"></div><div style="font:700 28px var(--f-display);color:var(--amber)">${msg}</div></div></div>
    <div class="pjboard" id="board"></div></div>`;
  drawBoard(); video();
  const k = phase(G.phase).key; music(G.stage !== "video" && !["loc", "fur", "final"].includes(k));
}

const isFinal = () => G && phase(G.phase).key === "final" && G.stage === "play";
let recKey = null;
async function recuento(el) {
  const rows = await REC.compute(G, BS), key = JSON.stringify(rows.map((r) => [r.botin, r.nota, r.serie]));
  if (key === recKey && el.querySelector(".rchart")) return; recKey = key;
  el.innerHTML = `<div class="panel"><h3>El botín, fase a fase</h3>${REC.chart(rows)}</div><div class="rgrid"><div class="panel"><h3>Lo que ganó y perdió cada banda</h3>${REC.ledgerTable(rows)}</div><div class="panel"><h3>Quién escapa más rico</h3>${REC.ranking(rows)}</div></div><div class="panel"><h3>Nota del atraco (solo cuenta lo que depende de saber)</h3>${REC.notes(rows)}</div>`;
}
const isFur = () => G && phase(G.phase).key === "fur" && G.stage === "play";
const isLoc = () => G && phase(G.phase).key === "loc" && G.stage === "play";
function drawBoard() {
  const el = $("#board"); if (!el || !G) return;
  if (isLoc()) { el.style.display = "block"; el.innerHTML = LOC.projectorView(G, BS); return; }
  if (isFur()) { el.style.display = "block"; FUR.projector(el, G, BS); return; }
  if (isFinal()) { el.style.display = "block"; recuento(el); return; }
  el.style.display = "";
  el.innerHTML = G.bands.map((id) => BS[id]).filter(Boolean).map((b) => {
    const ms = Object.values(b.members || {}).filter(active);
    return `<div class="pjband" style="--bc:${b.color}"><b>${esc(b.name)}</b><span>${eu(Math.max(0, b.botin))}</span><div class="avs">${ms.map((m) => avatarSVG(m.av ?? 0, 40)).join("") || "<small>nadie aún</small>"}</div></div>`;
  }).join("");
}

function video() {
  const key = G.stage === "video" ? G.phase + ":" + G.videoAt : null;
  const wrap = document.querySelector(".vidwrap");
  if (!key) { wrap?.remove(); playingKey = null; return; }
  if (!armed || key === playingKey) return;
  playingKey = key; wrap?.remove();
  const p = phase(G.phase), d = document.createElement("div"); d.className = "vidwrap";
  d.innerHTML = `<video src="${MEDIA.video(p.video)}" autoplay playsinline></video>`;
  document.body.appendChild(d);
  const v = d.querySelector("video");
  v.onended = async () => {
    d.remove();
    const g = await DB.get(gpath(G.code));
    if (g && g.stage === "video" && g.phase === G.phase && g.videoAt === G.videoAt) { if (p.key === "final") await DB.update(gpath(G.code), { stage: "play", endsAt: null }); else await startPlay(g); }
  };
  v.play().catch(() => { armed = false; playingKey = null; d.remove(); gate(); });
}
