// ======================================================
// PANTALLA DEL ALUMNO
// ======================================================
import { DB } from "./db.js";
import { $, esc, eu, T, bandInfo, phase, gpath, bpath, remaining, fmt, header, SEAT, ME, showErr } from "./core.js";
import { PHASES } from "./config.js";
import { mountPuzzle, updatePuzzle, unmountPuzzle, isPuzzle } from "./puzzles.js";

let app, unsub = [], tick = null, G = null, B = null, me = null;
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
  const bk = $("#back"); if (bk) bk.onclick = () => { me = ME.last(); ME.set(me); join(me); };
  $("#jc").onsubmit = async (e) => {
    e.preventDefault(); const code = $("#jc input").value.trim().toUpperCase(); if (!code) return;
    const g = await DB.get(gpath(code)).catch(showErr);
    if (!g) return askCode(`No existe la partida ${code}. Revisa el código.`);
    pickBand(g);
  };
}

async function pickBand(g) {
  const names = {};
  await Promise.all(g.bands.map(async (id) => { const b = await DB.get(bpath(g.code, id)).catch(() => null); names[id] = b?.name || bandInfo(id).name; }));
  app.innerHTML = `<p><button class="btn" type="button" id="backc">← Cambiar código</button></p><h1>¿De qué banda eres?</h1><div class="bandpick">${g.bands.map((id) => { const b = bandInfo(id); return `<button type="button" data-b="${id}" style="--bc:${b.color}">${esc(names[id])}<small>banda ${esc(b.name).toLowerCase()}</small></button>`; }).join("")}</div>
  <form id="jn" class="panel" hidden style="margin-top:16px"><h3>Tu nombre</h3><div class="row"><input class="inp" maxlength="20" placeholder="Nombre" aria-label="Tu nombre" required><button class="btn red">Unirme</button></div></form>`;
  $("#backc").onclick = () => askCode();
  let band = null;
  app.querySelectorAll("[data-b]").forEach((bt) => bt.onclick = () => { band = bt.dataset.b; app.querySelectorAll("[data-b]").forEach((x) => x.style.outline = x === bt ? "3px solid #fff" : ""); $("#jn").hidden = false; $("#jn input").focus(); });
  $("#jn").onsubmit = (e) => { e.preventDefault(); const name = $("#jn input").value.trim(); if (!name || !band) return; me = { code: g.code, band, name }; ME.set(me); join(me); };
}

async function join(m) {
  try {
    const g = await DB.get(gpath(m.code));
    if (!g || !g.bands.includes(m.band)) { ME.clear(); return askCode("Esa partida ya no existe."); }
    await DB.update(bpath(m.code, m.band), { ["members." + SEAT]: { name: m.name, at: Date.now() } });
  } catch (e) { return showErr(e); }
  unsub.push(DB.onDoc(gpath(m.code), (g) => { G = g; draw(); }));
  unsub.push(DB.onDoc(bpath(m.code, m.band), (b) => { B = b; draw(); }));
  tick = setInterval(() => { const el = $("#jt"); if (el && G) { const r = remaining(G); el.textContent = r == null ? "" : fmt(r); el.classList.toggle("low", r != null && r < 60000); } }, 500);
}

let mode = null;
function draw() {
  if (!G || !B) return;
  const p = phase(G.phase), mem = Object.entries(B.members || {}).filter(([, x]) => x);
  if (!$("#jtop")) { app.innerHTML = '<div id="jtop"></div><div id="jbody"></div>'; mode = null; }
  $("#jtop").innerHTML = `<div class="pjrow" style="margin-bottom:14px"><div><span class="dot" style="--bc:${B.color}"></span><b>${esc(B.name)}</b> · ${esc(me.name)} <span style="color:var(--muted)">· botín ${eu(Math.max(0, B.botin))}</span></div><div class="row"><div class="timer" id="jt" style="font-size:28px"></div>${G.phase === 0 && G.stage !== "video" ? '<button class="btn" id="chb" type="button">Cambiar de banda</button>' : ""}<button class="btn" id="out" type="button">Salir</button></div></div>`;
  $("#out").onclick = async () => { await quit(); askCode(); };
  const cb = $("#chb"); if (cb) cb.onclick = async () => { const g = G; await quit(); pickBand(g); };
  const isPz = isPuzzle(p.key) && (G.stage === "play" || G.stage === "paused");
  const m = isPz ? "pz:" + p.key : JSON.stringify([G.phase, G.stage, B.size, mem.map(([, x]) => x.name)]);
  if (m === mode) { if (isPz) updatePuzzle(G, B); return; }
  mode = m; unmountPuzzle();
  const body = $("#jbody");
  if (isPz) { body.innerHTML = header(p) + '<div id="pzroot"></div>'; mountPuzzle($("#pzroot"), { code: me.code, band: me.band, pid: p.key, G, B }); return; }
  if (G.stage === "video") body.innerHTML = `<div class="watch"><b>Mirad al proyector</b><p class="lead">La Directora tiene algo que contaros.</p></div>`;
  else if (G.phase === 0) body.innerHTML = header(p) + T("Tu banda", `<p style="margin:0 0 10px">Conectados: ${mem.map(([, x]) => esc(x.name)).join(", ")}</p>
      <div class="row"><span>Somos</span><button class="btn${B.size === 4 ? " on" : ""}" data-size="4">4</button><button class="btn${B.size === 5 ? " on" : ""}" data-size="5">5</button><span style="color:var(--muted)">(con 4, dos roles se juntan en una pantalla)</span></div>`)
      + `<div class="watch"><b>Esperando al resto…</b><p class="lead">La partida empieza cuando el profe lance la intro.</p></div>`;
  else if (G.stage === "ready") body.innerHTML = header(p) + `<div class="watch"><b>Preparados</b><p class="lead">Atentos al proyector.</p></div>`;
  else if (G.stage === "paused") body.innerHTML = header(p) + `<div class="watch"><b>Pausa</b></div>`;
  else body.innerHTML = header(p) + `<div class="panel"><h3>${esc(p.area)}</h3><p style="margin:0">Aquí aparecerá «${esc(p.title)}» (siguientes partes del montaje).</p></div>`;
  body.querySelectorAll("[data-size]").forEach((b) => b.onclick = () => DB.update(bpath(me.code, me.band), { size: +b.dataset.size }).catch(showErr));
}
async function quit() { stop(); try { await DB.update(bpath(me.code, me.band), { ["members." + SEAT]: null }); } catch (e) { console.error(e); } ME.clear(); }
