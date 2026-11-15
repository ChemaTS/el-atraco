// ======================================================
// MODO PROFESOR
// ======================================================
import { DB } from "./db.js";
import { BANDS, PHASES, TEACHER_PASSWORD, MONEY } from "./config.js";
import { $, esc, eu, T, bandInfo, phase, gpath, bpath, createGame, addMoney, remaining, fmt, startPlay, showErr } from "./core.js";

let app, unsub = [], tick = null, G = null, BS = {};
const stop = () => { unsub.forEach((f) => f()); unsub = []; clearInterval(tick); };

export function enter(el, args) { app = el; G = null; BS = {}; if (sessionStorage.getItem("profe") !== "ok") return login(); args[0] ? open(args[0].toUpperCase()) : home(); }
export function leave() { stop(); }

function login() {
  app.innerHTML = `<h1>Modo profesor</h1>${T("Acceso", `<form id="pw" class="row"><input class="inp" type="password" placeholder="Contraseña" autocomplete="current-password" aria-label="Contraseña"><button class="btn red">Entrar</button></form><p id="pwe" class="fb err" hidden>Contraseña incorrecta.</p>`)}`;
  $("#pw").onsubmit = (e) => { e.preventDefault(); if ($("#pw input").value === TEACHER_PASSWORD) { sessionStorage.setItem("profe", "ok"); enter(app, []); } else $("#pwe").hidden = false; };
}

function home() {
  const last = localStorage.getItem("profeLast");
  app.innerHTML = `<h1>Modo profesor</h1><div id="err" class="err" hidden></div>
  ${T("Crear nueva partida", `<p style="margin:0 0 8px">Bandas participantes (4–6):</p>
    <div class="row" id="bsel">${BANDS.map((b, i) => `<label class="chk" style="border-color:${b.color}"><input type="checkbox" value="${b.id}"${i < 5 ? " checked" : ""}> <span style="color:${b.color};font-weight:600">${b.name}</span></label>`).join("")}</div>
    <p><label class="chk"><input type="checkbox" id="test"> Modo prueba (fases de 2 min, policía en 40–70 s)</label></p>
    <button class="btn red" id="new">Generar código y crear partida</button>`)}
  ${T("Abrir partida existente", `<form id="op" class="row"><input class="inp code" maxlength="5" placeholder="CÓDIGO" aria-label="Código de partida" value="${esc(last || "")}"><button class="btn">Abrir</button></form>`)}`;
  $("#new").onclick = async () => {
    const ids = [...document.querySelectorAll("#bsel input:checked")].map((i) => i.value);
    if (ids.length < 2) return showErr("Elige al menos 2 bandas.");
    $("#new").disabled = true;
    try { const code = await createGame(ids, $("#test").checked); location.hash = "#/profe/" + code; } catch (e) { showErr(e); $("#new").disabled = false; }
  };
  $("#op").onsubmit = (e) => { e.preventDefault(); const c = $("#op input").value.trim().toUpperCase(); if (c) location.hash = "#/profe/" + c; };
}

function open(code) {
  stop(); localStorage.setItem("profeLast", code);
  app.innerHTML = `<p class="lead">Abriendo ${esc(code)}…</p>`;
  unsub.push(DB.onDoc(gpath(code), (g) => { G = g; if (!g) { app.innerHTML = `<div class="err">No existe la partida ${esc(code)}.</div><p><a class="btn" href="#/profe">Volver</a></p>`; return; } draw(); }));
  unsub.push(DB.onCol(`games/${code}/bands`, (b) => { BS = b || {}; G && draw(); }));
  tick = setInterval(() => { const el = $("#ptime"); const r = remaining(G); if (el) el.textContent = r == null ? "—" : fmt(r); }, 500);
}

const STAGE = { ready: "Preparada", video: "Vídeo", play: "En juego", paused: "Pausa" };

function draw() {
  const g = G, p = phase(g.phase), r = remaining(g);
  const stg = g.stage === "play" && r === 0 ? "over" : g.stage;
  const bands = g.bands.map((id) => BS[id]).filter(Boolean);
  const focusId = document.activeElement?.id;
  app.innerHTML = `<div id="err" class="err" hidden></div>
  <div class="pjrow"><div><small class="stage">Partida</small> <span class="codebig">${esc(g.code)}</span>${g.test ? ' <span class="stage paused">modo prueba</span>' : ""}</div>
    <div class="row"><a class="btn" href="#/proyector/${g.code}" target="_blank" rel="noopener">Abrir proyector ↗</a><a class="btn" href="#/profe">Otra partida</a></div></div>
  ${T("Fase actual", `<div class="pjrow"><div><b style="font-size:20px">${esc(p.area)} · ${esc(p.title)}</b><br><span class="stage ${stg}">${stg === "over" ? "Tiempo agotado" : STAGE[g.stage] || g.stage}</span></div><div class="timer" id="ptime">${r == null ? "—" : fmt(r)}</div></div>
    <div class="row" style="margin-top:14px">
      <button class="btn red" data-a="video"${g.stage === "video" ? " disabled" : ""}>▶ Lanzar vídeo</button>
      <button class="btn" data-a="skip"${g.stage === "video" || g.stage === "ready" ? "" : " disabled"}>Saltar vídeo / iniciar fase</button>
      <button class="btn" data-a="pause"${g.stage === "play" || g.stage === "paused" ? "" : " disabled"}>${g.stage === "paused" ? "Reanudar" : "Pausar"}</button>
      <button class="btn" data-a="plus"${g.stage === "play" && g.endsAt ? "" : " disabled"}>+2 min</button>
      <button class="btn red" data-a="next"${g.phase >= PHASES.length - 1 ? " disabled" : ""}>Siguiente fase →</button>
    </div>`)}
  ${T("Hilo de la partida", `<div class="phases">${PHASES.map((q, i) => `<div class="ph${i === g.phase ? " cur" : ""}"><b>${i}. ${esc(q.area)}</b><span>${esc(q.title)}</span>${q.minutes ? `<label class="row" style="gap:4px;font-size:13px;color:var(--muted)"><input class="inp" style="width:4.5em;font-size:14px;padding:4px 6px" type="number" min="1" max="60" data-min="${q.key}" value="${g.minutes?.[q.key] ?? q.minutes}" aria-label="Minutos de ${esc(q.title)}"> min</label>` : ""}<button class="btn" data-go="${i}"${i === g.phase ? " disabled" : ""}>Ir</button></div>`).join("")}</div>`)}
  ${T("Bandas", `<table class="tbl"><thead><tr><th>Banda</th><th>Botín</th><th>Alumnos</th><th>Ajustar dinero</th></tr></thead><tbody>
    ${bands.map((b) => { const ms = Object.values(b.members || {}).filter(Boolean); return `<tr><td><span class="dot" style="--bc:${b.color}"></span><b>${esc(b.name)}</b><br><small style="color:var(--muted)">grupo de ${b.size}</small></td><td>${eu(Math.max(0, b.botin))}</td><td>${ms.length ? ms.map((m) => esc(m.name)).join(", ") : '<span style="color:var(--muted)">nadie aún</span>'}</td>
      <td><form class="row" data-money="${b.id}"><input class="inp" style="width:9em;font-size:14px;padding:6px" type="number" step="50000" placeholder="±50000" aria-label="Cantidad para ${esc(b.name)}"><button class="btn">Aplicar</button></form></td></tr>`; }).join("")}
  </tbody></table>`)}`;
  if (focusId && $("#" + focusId)) $("#" + focusId).focus();
}

document.addEventListener("click", async (e) => {
  if (!location.hash.startsWith("#/profe/") || !G) return;
  const t = e.target.closest("[data-a],[data-go]"); if (!t) return;
  const g = G, path = gpath(g.code);
  try {
    if (t.dataset.go) return DB.update(path, { phase: +t.dataset.go, stage: "ready", endsAt: null, remaining: null });
    const a = t.dataset.a;
    if (a === "video") await DB.update(path, { stage: "video", videoAt: Date.now(), endsAt: null, remaining: null });
    if (a === "skip") await startPlay(g);
    if (a === "pause") { if (g.stage === "paused") await DB.update(path, { stage: "play", endsAt: g.remaining != null ? Date.now() + g.remaining : null, remaining: null }); else await DB.update(path, { stage: "paused", remaining: remaining(g), endsAt: null }); }
    if (a === "plus") await DB.update(path, { endsAt: g.endsAt + 120000 });
    if (a === "next") await DB.update(path, { phase: g.phase + 1, stage: "ready", endsAt: null, remaining: null });
  } catch (err) { showErr(err); }
});
document.addEventListener("submit", async (e) => {
  const f = e.target.closest("form[data-money]"); if (!f || !G) return; e.preventDefault();
  const v = parseInt(f.querySelector("input").value, 10); if (!v) return;
  try { await addMoney(G.code, f.dataset.money, v, "ajuste del profe", phase(G.phase).key); } catch (err) { showErr(err); }
});
document.addEventListener("change", (e) => {
  const k = e.target.dataset?.min; if (!k || !G) return;
  const v = Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1));
  DB.update(gpath(G.code), { ["minutes." + k]: v }).catch(showErr);
});
