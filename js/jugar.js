// ======================================================
// PANTALLA DEL ALUMNO
// ======================================================
import { DB } from "./db.js";
import { active, $, esc, eu, T, bandInfo, phase, gpath, bpath, remaining, fmt, header, SEAT, ME, showErr } from "./core.js";
import { PHASES } from "./config.js";
import { avatarSVG, avName, AVATARS, AV_NAMES } from "./avatars.js";
import * as LOC from "./loc.js";
import * as FUR from "./fur.js";
import * as REC from "./recuento.js";
import { mountPuzzle, updatePuzzle, unmountPuzzle, isPuzzle } from "./puzzles.js";

let app, unsub = [], tick = null, G = null, B = null, me = null, BS = {};
const stop = () => { unsub.forEach((f) => f()); unsub = []; clearInterval(tick); unmountPuzzle(); mode = null; };

export function enter(el) {
  app = el; stop(); G = null; B = null;
  me = ME.get();
  if (me && me.code && me.band && me.name) return join(me);
  askCode();
}
export function leave() { stop(); }

function askCode(msg) {
  app.innerHTML = `<h1>Entrar en la partida</h1>${msg ? `<div class="err">${esc(msg)}</div>` : ""}
  ${(() => { const l = ME.last(); return l && !msg ? T("¿Eres tú?", `<p style="margin:0 0 10px">Este ordenador estaba en la partida <b>${esc(l.code)}</b> como <b>${esc(l.name)}</b> (banda ${esc(bandInfo(l.band).name)}).</p><button class="btn red" id="back" type="button">Volver como ${esc(l.name)}</button>`) : ""; })()}
  ${T("Código de partida", `<form id="jc" class="row"><input class="inp code" maxlength="5" placeholder="CÓDIGO" aria-label="Código de partida" autofocus><button class="btn red">Entrar</button></form><p style="margin:10px 0 0;color:var(--muted)">Lo tienes en el proyector.</p>`)}`;
  const bk = $("#back"); if (bk) bk.onclick = () => { const l = ME.last(); if (l.seat) sessionStorage.setItem("seat", l.seat); sessionStorage.setItem("me", JSON.stringify(l)); location.reload(); };
  $("#jc").onsubmit = async (e) => {
    e.preventDefault(); const code = $("#jc input").value.trim().toUpperCase(); if (!code) return;
    const g = await DB.get(gpath(code)).catch(showErr);
    if (!g) return askCode(`No existe la partida ${code}. Revisa el código.`);
    pickBand(g);
  };
}

function pickBand(g) {
  stop();
  app.innerHTML = `<p><button class="btn" type="button" id="backc">← Cambiar código</button></p><h1>¿De qué banda eres?</h1><div class="bandpick" id="bp"></div>
  <form id="jn" class="panel" hidden style="margin-top:16px"><h3>Elige tu avatar</h3><div class="avgrid" id="avg"></div><h3>Tu nombre</h3><div class="row"><input class="inp" maxlength="28" placeholder="Nombre y apellido" aria-label="Tu nombre" required style="min-width:min(100%,22em)"><button class="btn red">Unirme</button></div><p id="jnw" class="fb warn" hidden></p></form>`;
  $("#backc").onclick = () => { stop(); askCode(); };
  let band = null, BD = {}, av = Math.floor(Math.random() * AVATARS.length);
  const paintAv = () => { $("#avg").innerHTML = AVATARS.map((_, i) => `<button type="button" data-av="${i}" class="${i === av ? "on" : ""}" aria-label="${AV_NAMES[i]}" aria-pressed="${i === av}">${avatarSVG(i, 56)}<span>${AV_NAMES[i]}</span></button>`).join(""); };
  paintAv();
  $("#avg").onclick = (e) => { const b = e.target.closest("[data-av]"); if (b) { av = +b.dataset.av; paintAv(); } };
  const paint = () => {
    $("#bp").innerHTML = g.bands.map((id) => { const b = bandInfo(id), d = BD[id] || {}, ms = Object.values(d.members || {}).filter(active);
      return `<button type="button" data-b="${id}" style="--bc:${b.color}${band === id ? ";outline:3px solid #fff" : ""}">${esc(d.name || b.name)}<small>banda ${esc(b.name).toLowerCase()} · ${ms.length} dentro</small>${ms.length ? `<small style="color:var(--fg)">${ms.map((m) => avName(m, 20)).join("")}</small>` : ""}</button>`; }).join("");
  };
  unsub.push(DB.onCol(`games/${g.code}/bands`, (all) => { BD = all || {}; paint(); }));
  $("#bp").onclick = (e) => { const bt = e.target.closest("[data-b]"); if (!bt) return; band = bt.dataset.b; paint(); $("#jn").hidden = false; $("#jn input").focus(); };
  $("#jn").onsubmit = (e) => {
    e.preventDefault(); const name = $("#jn input").value.trim().replace(/\s+/g, " "); if (!name || !band) return;
    const same = Object.entries(BD[band]?.members || {}).find(([, m]) => m && m.name.toLowerCase() === name.toLowerCase());
    if (same && active(same[1]) && !$("#jnw").dataset.ok) { $("#jnw").hidden = false; $("#jnw").dataset.ok = 1; $("#jnw").textContent = "Ya hay alguien conectado con ese nombre en esta banda. Si eres tú (te saliste o cambiaste de ordenador), pulsa Unirme otra vez y recuperas tu sitio y tu rol. Si no, añade tu apellido."; return; }
    if (same) { // recuperar el puesto anterior: mismo asiento → mismo rol
      const prev = same[1]; sessionStorage.setItem("seat", same[0]);
      sessionStorage.setItem("me", JSON.stringify({ code: g.code, band, name: prev.name, av: prev.av ?? av, seat: same[0] })); stop(); location.reload(); return; }
    stop(); me = { code: g.code, band, name, av, seat: SEAT }; ME.set(me); join(me);
  };
}

async function join(m) {
  try {
    const g = await DB.get(gpath(m.code));
    if (!g || !g.bands.includes(m.band)) { ME.clear(); return askCode("Esa partida ya no existe."); }
    await DB.update(bpath(m.code, m.band), { ["members." + SEAT]: { name: m.name, av: m.av ?? 0, at: Date.now() } });
  } catch (e) { return showErr(e); }
  unsub.push(DB.onDoc(gpath(m.code), (g) => { G = g; draw(); }));
  unsub.push(DB.onDoc(bpath(m.code, m.band), (b) => { B = b; draw(); }));
  unsub.push(DB.onCol(`games/${m.code}/bands`, (all) => { BS = all || {}; if (G && ["loc", "fur"].includes(phase(G.phase).key)) draw(); }));
  tick = setInterval(() => { if (G && phase(G.phase).key === "loc") LOC.barTick(app, G); if (G && phase(G.phase).key === "fur" && G.stage === "play" && $("#fmain")) renderFur(); const el = $("#jt"); if (el && G) { const r = remaining(G); el.textContent = r == null ? "" : fmt(r); el.classList.toggle("low", r != null && r < 60000); } }, 150);
}

let mode = null;
function renderFur() {
  const k = "fur:" + FUR.studentKey(G, me);
  if (mode !== k) { mode = k; if (!$("#fmain")) $("#jbody").innerHTML = header(phase(G.phase)) + '<div id="fmain"></div><div id="fbd"></div>'; $("#fmain").innerHTML = FUR.student(G, BS, me); }
  const bd = $("#fbd"); if (bd) { const h = FUR.board(G, BS); if (bd.dataset.h !== h) { bd.dataset.h = h; bd.innerHTML = h; } }
}
document.addEventListener("click", (e) => { if (G && location.hash.startsWith("#/jugar") && phase(G.phase).key === "loc") LOC.studentClick(e, G); });
["click", "submit", "change"].forEach((ev) => document.addEventListener(ev, (e) => { if (G && me && location.hash.startsWith("#/jugar") && phase(G.phase).key === "fur") FUR.studentEvent(e, G, me); }));
function draw() {
  if (!G || !B) return;
  const p = phase(G.phase), mem = Object.entries(B.members || {}).filter(([, x]) => active(x));
  if (!$("#jtop")) { app.innerHTML = '<div id="jtop"></div><div id="jbody"></div>'; mode = null; }
  $("#jtop").innerHTML = `<div class="pjrow" style="margin-bottom:14px"><div><span class="dot" style="--bc:${B.color}"></span><b>${esc(B.name)}</b> · ${avName(me, 26)} <span style="color:var(--muted)">· botín ${eu(Math.max(0, B.botin))}</span></div><div class="row"><div class="timer" id="jt" style="font-size:28px"></div>${G.phase === 0 && G.stage !== "video" ? '<button class="btn" id="chb" type="button">Cambiar de banda</button>' : ""}<button class="btn" id="out" type="button">Salir</button></div></div>`;
  $("#out").onclick = async (e) => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "¿Salir? Pulsa otra vez"; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = "Salir"; } }, 3000); return; } await quit(); askCode(); };
  const cb = $("#chb"); if (cb) cb.onclick = async () => { const g = G; await quit(); pickBand(g); };
  if (p.key === "loc" && G.stage === "play") {
    unmountPuzzle(); const html = header(p) + LOC.studentView(G, BS, B, me.band);
    if (mode !== "loc:" + html) { mode = "loc:" + html; $("#jbody").innerHTML = html; LOC.studentAfter($("#jbody"), G); }
    return;
  }
  if (p.key === "fur" && G.stage === "play") { unmountPuzzle(); return renderFur(); }
  if (p.key === "final" && G.stage === "play") {
    unmountPuzzle(); if (mode === "final") return; mode = "final";
    $("#jbody").innerHTML = header(p) + '<div id="rmine"><p class="lead">Calculando…</p></div>';
    REC.compute(G, BS).then((rows) => { const r = rows.find((x) => x.id === me.band), pos = rows.slice().sort((a, b) => b.botin - a.botin).findIndex((x) => x.id === me.band) + 1; const el = $("#rmine"); if (!el || !r) return;
      el.innerHTML = `<div class="watch" style="padding:20px"><b>${esc(r.name)}</b><p class="lead">Escapáis con <b>${eu(r.botin)}</b> · puesto ${pos} de ${rows.length}</p><p style="font:700 64px var(--f-mono);margin:10px 0">${r.nota.toLocaleString("es-ES", { minimumFractionDigits: 1 })}</p><p class="lead">Nota de la banda. Mirad el proyector para ver el recuento completo.</p></div>` + REC.notes([r]); }).catch(console.error);
    return;
  }
  const isPz = isPuzzle(p.key) && (G.stage === "play" || G.stage === "paused");
  const m = isPz ? "pz:" + p.key : JSON.stringify([G.phase, G.stage, B.size, mem.map(([, x]) => x.name)]);
  if (m === mode) { if (isPz) updatePuzzle(G, B); return; }
  mode = m; unmountPuzzle();
  const body = $("#jbody");
  if (isPz) { body.innerHTML = header(p) + '<div id="pzroot"></div>'; mountPuzzle($("#pzroot"), { code: me.code, band: me.band, pid: p.key, G, B, me }); return; }
  if (G.stage === "video") body.innerHTML = `<div class="watch"><b>Mirad al proyector</b><p class="lead">La Directora tiene algo que contaros.</p></div>`;
  else if (G.phase === 0) body.innerHTML = header(p) + T("Tu banda", `<p style="margin:0">Conectados (${mem.length}):</p><div style="margin-top:6px">${mem.map(([, x]) => avName(x, 34)).join("")}</div><p style="margin:8px 0 0;color:var(--muted)">${mem.length >= 5 ? "Grupo de 5: cada uno tendrá su rol." : "Si empezáis siendo 4 o menos, dos roles irán juntos en una pantalla."}</p>`)
      + `<div class="watch"><b>Esperando al resto…</b><p class="lead">La partida empieza cuando el profe lance la intro.</p></div>`;
  else if (G.stage === "ready") body.innerHTML = header(p) + `<div class="watch"><b>Preparados</b><p class="lead">Atentos al proyector.</p></div>`;
  else if (G.stage === "paused") body.innerHTML = header(p) + `<div class="watch"><b>Pausa</b></div>`;
  else body.innerHTML = header(p) + `<div class="panel"><h3>${esc(p.area)}</h3><p style="margin:0">Aquí aparecerá «${esc(p.title)}» (siguientes partes del montaje).</p></div>`;
}
async function quit() { stop(); try { await DB.update(bpath(me.code, me.band), { ["members." + SEAT + ".left"]: true }); } catch (e) { console.error(e); } sessionStorage.removeItem("me"); }
