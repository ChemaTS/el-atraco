// ======================================================
// MODO PROFESOR
// ======================================================
import { DB } from "./db.js";
import { BANDS, PHASES, TEACHER_PASSWORD, MONEY, BAND_NAMES } from "./config.js";
import { PUZZLES, PZPATH } from "./puzzles.js";
import { avName } from "./avatars.js";
import * as LOC from "./loc.js";
import * as FUR from "./fur.js";
import * as REC from "./recuento.js";
import * as BOTS from "./bots.js";
import { active, $, esc, eu, T, bandInfo, phase, gpath, bpath, createGame, addMoney, remaining, fmt, startPlay, showErr } from "./core.js";

let solOpen = false;
document.addEventListener("toggle", (e) => { if (e.target.id === "soldet") solOpen = e.target.open; }, true);
let app, unsub = [], tick = null, G = null, BS = {}, PZS = {}, pzSub = [], pzKey = null;
const stop = () => { unsub.forEach((f) => f()); unsub = []; clearInterval(tick); pzSub.forEach((f) => f()); pzSub = []; pzKey = null; PZS = {}; };

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
    <div class="row" style="margin:0 0 14px">🤖 <span>Bandas bot (juegan solas, para probar):</span>
      <select id="nbots" aria-label="Número de bandas bot" style="background:var(--bg);color:var(--fg);border:1px solid var(--line);padding:6px"><option value="0">ninguna</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select>
      <span>nivel</span><select id="lbots" aria-label="Nivel de los bots" style="background:var(--bg);color:var(--fg);border:1px solid var(--line);padding:6px">${Object.entries(BOTS.LEVELS).map(([k, v]) => `<option value="${k}"${k === "medio" ? " selected" : ""}>${v.label}</option>`).join("")}</select>
      <span style="color:var(--muted);font-size:13px">Las últimas bandas marcadas serán bots.</span></div>
    <button class="btn red" id="new">Generar código y crear partida</button>`)}
  ${T("Abrir partida existente", `<form id="op" class="row"><input class="inp code" maxlength="5" placeholder="CÓDIGO" aria-label="Código de partida" value="${esc(last || "")}"><button class="btn">Abrir</button></form>`)}`;
  $("#new").onclick = async () => {
    const ids = [...document.querySelectorAll("#bsel input:checked")].map((i) => i.value);
    if (ids.length < 2) return showErr("Elige al menos 2 bandas.");
    $("#new").disabled = true;
    const nb = Math.min(+$("#nbots").value, ids.length - 1), lvl = $("#lbots").value;
    try {
      const code = await createGame(ids, $("#test").checked);
      if (nb > 0) { const g = await DB.get(gpath(code)), bs = {}; for (const id of ids) bs[id] = await DB.get(bpath(code, id)); await BOTS.addBots({ ...g, bands: ids.slice(-nb) }, bs, lvl); }
      location.hash = "#/profe/" + code;
    } catch (e) { showErr(e); $("#new").disabled = false; }
  };
  $("#op").onsubmit = (e) => { e.preventDefault(); const c = $("#op input").value.trim().toUpperCase(); if (c) location.hash = "#/profe/" + c; };
}

function open(code) {
  stop(); localStorage.setItem("profeLast", code);
  app.innerHTML = `<p class="lead">Abriendo ${esc(code)}…</p>`;
  unsub.push(DB.onDoc(gpath(code), (g) => { G = g; if (!g) { app.innerHTML = `<div class="err">No existe la partida ${esc(code)}.</div><p><a class="btn" href="#/profe">Volver</a></p>`; return; } draw(); }));
  unsub.push(DB.onCol(`games/${code}/bands`, (b) => { BS = b || {}; G && draw(); }));
  let furWas = null;
  tick = setInterval(() => { if (G && phase(G.phase).key === "loc" && G.stage === "play") LOC.hostTick(G, BS);
    if (G) BOTS.tick(G, BS);
    if (G && phase(G.phase).key === "fur") FUR.autoAdvance(G, BS);
    if (G && G.fur && G.fur.phase === "reveal") { const d = FUR.revealDone(G.fur, G); if (d !== furWas) { furWas = d; draw(); } } const el = $("#ptime"); const r = remaining(G); if (el) el.textContent = r == null ? "—" : fmt(r); }, 500);
}

const STAGE = { ready: "Preparada", video: "Vídeo", play: "En juego", paused: "Pausa" };

function watchPz() {
  const pid = phase(G.phase).key, key = G.code + ":" + pid;
  if (key === pzKey) return; pzSub.forEach((f) => f()); pzSub = []; PZS = {}; pzKey = key;
  if (!PUZZLES[pid]) return;
  G.bands.forEach((b) => pzSub.push(DB.onDoc(PZPATH(G.code, b, pid), (z) => { PZS[b] = z; draw(); })));
}
function pzPanel() {
  const pid = phase(G.phase).key, P = PUZZLES[pid]; if (!P) return "";
  const rows = G.bands.map((id) => { const b = BS[id], z = PZS[id]; if (!b) return "";
    const est = !z ? '<span style="color:var(--muted)">sin empezar</span>' : z.solved ? `<b style="color:var(--ok)">resuelto${z.guided ? " (guiado)" : ""}</b>` : z.guided ? '<b style="color:var(--amber)">bloqueado · guiado</b>' : "en juego";
    return `<tr><td><span class="dot" style="--bc:${b.color}"></span>${esc(b.name)}</td><td>${est}</td><td>${z ? z.nAl || 0 : 0}</td><td>${z ? z.nHint || 0 : 0}</td><td>${z && z.claim ? Object.entries(z.claim).filter(([, c]) => c).map(([r, c]) => `<div style="font-size:13px"><b>${esc(r.split("+").map((x) => P.roles[x]?.name || x).join(" + "))}:</b> ${avName(c, 18)}</div>`).join("") || '<span style="color:var(--muted)">—</span>' : "—"}</td><td><div class="row" style="gap:6px"><button class="btn" data-free="${id}"${z ? "" : " disabled"}>Liberar roles</button><button class="btn" data-reset="${id}"${z ? "" : " disabled"}>Reiniciar puzzle</button></div></td></tr>`; }).join("");
  return T("Puzzle en juego · " + esc(P.title), `<table class="tbl"><thead><tr><th>Banda</th><th>Estado</th><th>Alarmas</th><th>Pistas</th><th>Roles</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <details id="soldet" style="margin-top:12px"${solOpen ? " open" : ""}><summary style="cursor:pointer;color:var(--amber)">Ver solución</summary><div class="sol">${P.teacher}</div></details>`);
}
function locPanel() {
  if (phase(G.phase).key !== "loc") return "";
  const L = G.loc || {}, play = G.stage === "play";
  let btn = "";
  if (!L.phase) btn = `<button class="btn red" data-loc="start"${play ? "" : " disabled"}>Empezar ronda 1</button>${play ? "" : ' <span style="color:var(--muted)">Primero lanza el vídeo o pulsa «Saltar vídeo / iniciar fase».</span>'}`;
  else if (L.phase === "boom" && L.round < LOC.ROUNDS) btn = `<button class="btn red" data-loc="next">Ronda ${L.round + 1}: empieza ${esc(BS[L.caught]?.name || "")}</button>`;
  else if (L.phase === "boom") btn = `<button class="btn red" data-loc="end">Terminar el localizador</button>`;
  const host = L.host && Date.now() - L.host.beat < 7000;
  const stats = G.bands.map((id) => { const s = (L.stats || {})[id] || {}; return `<tr><td><span class="dot" style="--bc:${BS[id]?.color}"></span>${esc(BS[id]?.name || id)}</td><td>${s.ok || 0} / ${s.n || 0}</td></tr>`; }).join("");
  return T("Localizador", `<p style="margin:0 0 10px">${L.phase ? `Ronda ${L.round} de ${LOC.ROUNDS} · fase: <b>${esc(L.phase)}</b> · pases: ${L.passes || 0}` : "Sin empezar."} ${G.test ? "· policía en 40–70 s (modo prueba)" : "· policía en 3–5 min"}</p>
    <div class="row">${btn}</div>${L.phase && !host ? '<p class="fb warn" style="margin-top:10px">Nadie hace de anfitrión: deja abierto el proyector o esta pantalla.</p>' : ""}
    <table class="tbl" style="margin-top:12px"><thead><tr><th>Banda</th><th>Aciertos / preguntas</th></tr></thead><tbody>${stats}</tbody></table>
    ${(L.log || []).length ? `<ul style="margin:10px 0 0">${L.log.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`);
}
let recRows = null;
function recPanel() {
  if (phase(G.phase).key !== "final") return "";
  REC.compute(G, BS).then((rows) => { recRows = rows; const el = $("#recp"); if (el) el.innerHTML = REC.notes(rows) + REC.ledgerTable(rows); }).catch(showErr);
  return T("Recuento y nota", `<div id="recp"><p class="lead">Calculando…</p></div><p style="margin:12px 0 0"><button class="btn red" data-csv>Exportar resultados (CSV)</button> <span style="color:var(--muted);font-size:14px">Se abre en Excel o Google Sheets.</span></p>`);
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-csv]") && G) REC.compute(G, BS).then((rows) => REC.csv(rows, G)).catch(showErr); });
function furPanel() {
  if (phase(G.phase).key !== "fur") return "";
  const F = G.fur || {}, play = G.stage === "play", now = Date.now();
  const nb = G.bands.filter((b) => F.bids?.[b] != null).length, dr = F.phase && F.phase !== "ask" ? FUR.drivers(F, G) : [];
  const need = G.bands.filter((b) => !dr.includes(b) && F.bids?.[b] != null), nc = need.filter((b) => F.ch?.[b]).length;
  let btn = "";
  if (!F.phase) btn = `<button class="btn red" data-fur="start"${play ? "" : " disabled"}>Sacar el primer furgón</button>${play ? "" : ' <span style="color:var(--muted)">Primero lanza el vídeo o pulsa «Saltar vídeo / iniciar fase».</span>'}`;
  else if (F.phase === "ask") btn = `<button class="btn" data-fur="reveal"${nb ? "" : " disabled"}>Destapar ya (${nb}/${G.bands.length})</button> <span style="color:var(--muted);font-size:13px">Se destapan solas cuando todas las bandas hayan enviado.</span>`;
  else if (F.phase === "reveal") btn = FUR.revealDone(F, G, now) ? `<button class="btn" data-fur="roll">Revelar ya (${nc}/${need.length} han decidido)</button> <span style="color:var(--muted);font-size:13px">Se revela sola cuando todas hayan decidido.</span>` : '<span style="color:var(--muted)">Destapando cifras…</span>';
  else if (F.phase === "roll" && F.round < FUR.ROUNDS) btn = `<button class="btn red" data-fur="next">Siguiente furgón (${F.round + 1}/${FUR.ROUNDS})</button>`;
  else if (F.phase === "roll") btn = `<button class="btn red" data-fur="end">Terminar la huida</button>`;
  const q = F.qi != null ? FUR.FQ[F.qi] : null;
  const rows = G.bands.map((b) => { const s = (F.stats || {})[b] || {}; return `<tr><td><span class="dot" style="--bc:${BS[b]?.color}"></span>${esc(BS[b]?.name || b)}</td><td>${F.bids?.[b] != null ? F.bids[b].v.toLocaleString("es-ES") : "—"}</td><td>${F.ch?.[b] ? (F.ch[b].v === "sube" ? "sube" : "abajo") : "—"}</td><td>${(s.pts || 0).toFixed(1)} / ${s.n || 0}</td></tr>`; }).join("");
  return T("El furgón", `<p style="margin:0 0 10px">${F.phase ? `Ronda ${F.round} de ${FUR.ROUNDS} · fase: <b>${esc(F.phase)}</b>${q ? ` · respuesta: <b>${q.a.toLocaleString("es-ES")}</b>` : ""}` : "Sin empezar."}</p>
    <div class="row">${btn}</div>${q ? `<p style="margin:10px 0 0;color:var(--muted)">${esc(q.q)}</p>` : ""}
    <table class="tbl" style="margin-top:12px"><thead><tr><th>Banda</th><th>Cifra</th><th>Decisión</th><th>Precisión (nota)</th></tr></thead><tbody>${rows}</tbody></table>
    ${(F.log || []).length ? `<ul style="margin:10px 0 0">${F.log.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`);
}
function draw() {
  watchPz();
  const g = G, p = phase(g.phase), r = remaining(g);
  const stg = g.stage === "play" && r === 0 ? "over" : g.stage;
  const bands = g.bands.map((id) => BS[id]).filter(Boolean);
  const focusId = document.activeElement?.id, focusVal = document.activeElement?.value;
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
  ${pzPanel()}${locPanel()}${furPanel()}${recPanel()}
  ${T("Hilo de la partida", `<div class="phases">${PHASES.map((q, i) => `<div class="ph${i === g.phase ? " cur" : ""}"><b>${i}. ${esc(q.area)}</b><span>${esc(q.title)}</span>${q.minutes ? `<label class="row" style="gap:4px;font-size:13px;color:var(--muted)"><input class="inp" style="width:4.5em;font-size:14px;padding:4px 6px" type="number" min="1" max="60" data-min="${q.key}" value="${g.minutes?.[q.key] ?? q.minutes}" aria-label="Minutos de ${esc(q.title)}"> min</label>` : ""}<button class="btn" data-go="${i}"${i === g.phase ? " disabled" : ""}>Ir</button></div>`).join("")}</div>`)}
  ${T("Bandas", `<div class="row" style="margin-bottom:12px">🤖 <span>Bandas bot para probar:</span><select id="botlvl" aria-label="Nivel de los bots" style="background:var(--bg);color:var(--fg);border:1px solid var(--line);padding:6px">${Object.entries(BOTS.LEVELS).map(([k, v]) => `<option value="${k}"${k === "medio" ? " selected" : ""}>${v.label}</option>`).join("")}</select><button class="btn" data-bots="add">Rellenar con bots las bandas vacías</button>${bands.some((b) => b.bot) ? '<button class="btn" data-bots="del">Quitar bots</button>' : ""}<span style="color:var(--muted);font-size:13px">Juegan solos mientras esta pantalla esté abierta.</span></div>
  <table class="tbl"><thead><tr><th>Banda</th><th>Botín</th><th>Alumnos</th><th>Ajustar dinero</th></tr></thead><tbody>
    ${bands.map((b) => { const ms = Object.values(b.members || {}).filter(active); return `<tr><td><form class="row" data-name="${b.id}" style="gap:6px"><span class="dot" style="--bc:${b.color}"></span><input class="inp" id="nm-${b.id}" style="width:14em;font-size:14px;padding:6px" maxlength="32" value="${esc(b.name)}" aria-label="Nombre de la banda ${esc(bandInfo(b.id).name)}"><button class="btn" type="button" data-dice="${b.id}" title="Nombre aleatorio" aria-label="Nombre aleatorio">🎲</button><button class="btn">Guardar</button></form>${b.bot ? `<span class="tag" style="color:var(--blue);border-color:var(--blue)">🤖 bot ${esc(BOTS.LEVELS[b.bot]?.label || "")}</span> ` : ""}<small style="color:var(--muted)">color ${esc(bandInfo(b.id).name).toLowerCase()} · grupo de <select data-size="${b.id}" aria-label="Tamaño del grupo ${esc(b.name)}" style="background:var(--bg);color:var(--fg);border:1px solid var(--line)"><option${b.size === 4 ? " selected" : ""}>4</option><option${b.size === 5 ? " selected" : ""}>5</option></select>${g.phase === 0 ? " (se fija solo al empezar)" : ""}</small></td><td>${eu(Math.max(0, b.botin))}</td><td>${ms.length ? ms.map((m) => avName(m, 22)).join("") : '<span style="color:var(--muted)">nadie aún</span>'}</td>
      <td><form class="row" data-money="${b.id}"><input class="inp" style="width:9em;font-size:14px;padding:6px" type="number" step="50000" placeholder="±50000" aria-label="Cantidad para ${esc(b.name)}"><button class="btn">Aplicar</button></form></td></tr>`; }).join("")}
  </tbody></table>`)}`;
  const fe = focusId && document.getElementById(focusId);
  if (fe) { if (focusVal != null && "value" in fe) fe.value = focusVal; fe.focus(); }
}

document.addEventListener("click", async (e) => {
  if (!location.hash.startsWith("#/profe/") || !G) return;
  const t = e.target.closest("[data-a],[data-go]"); if (!t) return;
  const g = G, path = gpath(g.code);
  // al arrancar la partida, cada banda queda fijada en 4 o 5 según los conectados
  const freeze = () => g.phase === 0 ? Promise.all(g.bands.map((id) => { const n = Object.values(BS[id]?.members || {}).filter(active).length; return DB.update(bpath(g.code, id), { size: n >= 5 ? 5 : 4 }); })) : null;
  try {
    if (t.dataset.a === "video" || t.dataset.a === "skip" || t.dataset.a === "next" || (t.dataset.go && +t.dataset.go !== 0)) await freeze();
    if (t.dataset.go) return DB.update(path, { phase: +t.dataset.go, stage: "ready", endsAt: null, remaining: null });
    const a = t.dataset.a;
    if (a === "video") await DB.update(path, { stage: "video", videoAt: Date.now(), endsAt: null, remaining: null });
    if (a === "skip") await startPlay(g);
    if (a === "pause") { if (g.stage === "paused") await DB.update(path, { stage: "play", endsAt: g.remaining != null ? Date.now() + g.remaining : null, remaining: null }); else await DB.update(path, { stage: "paused", remaining: remaining(g), endsAt: null }); }
    if (a === "plus") await DB.update(path, { endsAt: g.endsAt + 120000 });
    if (a === "next") await DB.update(path, { phase: g.phase + 1, stage: "ready", endsAt: null, remaining: null });
  } catch (err) { showErr(err); }
});
document.addEventListener("click", (e) => {
  const d = e.target.closest("[data-dice]"); if (!d || !G) return;
  const used = new Set(Object.values(BS).map((b) => b.name)), inp = document.getElementById("nm-" + d.dataset.dice);
  const pool = BAND_NAMES.filter((n) => !used.has(n) && n !== inp.value);
  inp.value = pool[Math.floor(Math.random() * pool.length)] || inp.value; inp.focus();
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-bots]"); if (!b || !G || !location.hash.startsWith("#/profe")) return;
  b.disabled = true;
  (b.dataset.bots === "add" ? BOTS.addBots(G, BS, $("#botlvl").value) : BOTS.removeBots(G, BS)).catch(showErr);
});
document.addEventListener("click", (e) => {
  const f = e.target.closest("[data-fur]"); if (!f || !G || !location.hash.startsWith("#/profe")) return;
  const a = f.dataset.fur; f.disabled = true;
  if (a === "start") FUR.startRound(G, 1).catch(showErr);
  if (a === "reveal") FUR.reveal(G).catch(showErr);
  if (a === "roll") FUR.roll(G, BS).catch(showErr);
  if (a === "next") FUR.startRound(G, G.fur.round + 1).catch(showErr);
  if (a === "end") FUR.endFur(G).catch(showErr);
});
document.addEventListener("click", (e) => {
  const l = e.target.closest("[data-loc]"); if (!l || !G || !location.hash.startsWith("#/profe")) return;
  const a = l.dataset.loc; l.disabled = true;
  if (a === "start") LOC.startRound(G, BS, 1).catch(showErr);
  if (a === "next") LOC.startRound(G, BS, G.loc.round + 1, G.loc.caught).catch(showErr);
  if (a === "end") LOC.endLoc(G).catch(showErr);
});
document.addEventListener("click", (e) => {
  const f = e.target.closest("[data-free]"); if (!f || !G) return;
  DB.update(PZPATH(G.code, f.dataset.free, phase(G.phase).key), { claim: {} }).catch(showErr);
});
document.addEventListener("click", (e) => {
  const r = e.target.closest("[data-reset]"); if (!r || !G) return;
  if (!r.dataset.sure) { r.dataset.sure = 1; r.textContent = "¿Seguro? Pulsa otra vez"; return; }
  const pid = phase(G.phase).key;
  DB.set(PZPATH(G.code, r.dataset.reset, pid), { st: PUZZLES[pid].init(), alarms: 0, nAl: 0, nHint: 0, err: 0, hints: {}, claim: {}, solved: false, blk: false, guided: false }).catch(showErr);
});
document.addEventListener("submit", async (e) => {
  const f = e.target.closest("form[data-name]"); if (!f || !G) return; e.preventDefault();
  const v = f.querySelector("input").value.trim().slice(0, 32); if (!v) return;
  try { await DB.update(bpath(G.code, f.dataset.name), { name: v }); } catch (err) { showErr(err); }
});
document.addEventListener("submit", async (e) => {
  const f = e.target.closest("form[data-money]"); if (!f || !G) return; e.preventDefault();
  const v = parseInt(f.querySelector("input").value, 10); if (!v) return;
  try { await addMoney(G.code, f.dataset.money, v, "ajuste del profe", phase(G.phase).key); } catch (err) { showErr(err); }
});
document.addEventListener("change", (e) => {
  const sz = e.target.dataset?.size; if (sz && G) { DB.update(bpath(G.code, sz), { size: +e.target.value }).catch(showErr); return; }
  const k = e.target.dataset?.min; if (!k || !G) return;
  const v = Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1));
  DB.update(gpath(G.code), { ["minutes." + k]: v }).catch(showErr);
});
