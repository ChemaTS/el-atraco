// (Firestore no admite arrays dentro de arrays: luz y tinta van como objetos {0:[],1:[],2:[]})
// ======================================================
// MOTOR DE PUZZLES SINCRONIZADO POR BANDA
// Contenido y lógica fieles al prototipo 13. El estado compartido
// de cada puzzle vive en games/{code}/bands/{band}/pz/{pid}:
//   st      → estado del puzzle (lo que tocan los roles)
//   alarms, nAl, nHint, err, blk, guided, solved, lockUntil, hints{rol:n}
// ======================================================
import { DB } from "./db.js";
import { MONEY } from "./config.js";
import { esc, eu, T, gpath, bpath, addMoney, remaining, SEAT } from "./core.js";
import { avName } from "./avatars.js";

const pzpath = (code, band, pid) => `games/${code}/bands/${band}/pz/${pid}`;
const norm = (v) => String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const table = (h, rows, hl) => '<div class="tw"><table><tr>' + h.map((x) => "<th>" + x + "</th>").join("") + "</tr>" + rows.map((r, i) => "<tr" + (hl === i ? ' class="hl"' : "") + ">" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</table></div>";
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- contexto del montaje actual ---------- */
let X = null; // {root, code, band, pid, G, B, Z (doc pz), st (local), role, ksel, fb:{}}
const st = () => X.st;
const Z = () => X.Z || {};
const solved = () => !!Z().solved;
const blocked = () => !!Z().blk;
const guided = () => !!Z().guided;
const locked = () => (Z().lockUntil || 0) > Date.now();
const timeUp = () => X.G.stage !== "play" || (X.G.endsAt && remaining(X.G) === 0);
const off = () => (solved() || timeUp());               // controles bloqueados
const dis = () => (off() ? " disabled" : "");

/* ---------- escritura: sólo las claves cambiadas ---------- */
function diff(a, b, base, out) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  keys.forEach((k) => {
    const va = a?.[k], vb = b?.[k], p = base + "." + k;
    if (vb && typeof vb === "object" && !Array.isArray(vb) && va && typeof va === "object" && !Array.isArray(va)) diff(va, vb, p, out);
    else if (JSON.stringify(va) !== JSON.stringify(vb)) out[p] = vb === undefined ? null : vb;
  });
  return out;
}
function commit(mut) {
  if (off()) return;
  const before = clone(X.st); mut(X.st);
  const d = diff(before, X.st, "st", {});
  if (Object.keys(d).length) DB.update(pzpath(X.code, X.band, X.pid), d).catch(console.error);
  draw();
}
function commitForce(mut) { const before = clone(X.st); mut(X.st); const d = diff(before, X.st, "st", {}); if (Object.keys(d).length) DB.update(pzpath(X.code, X.band, X.pid), d).catch(console.error); }
const upd = (d) => DB.update(pzpath(X.code, X.band, X.pid), d).catch(console.error);
const money = (d, why) => addMoney(X.code, X.band, d, why, X.pid).catch(console.error);

/* ---------- reglas comunes ---------- */
function say(id, cls, txt) { X.fb[id] = { cls, txt }; const el = X.root.querySelector("#" + id); if (el) { el.className = "fb " + cls; el.textContent = txt; } }
function shake() { const b = X.root.querySelector(".lockbox"); if (b) { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); } }
function alarm(fbId, msg) {
  const a = (Z().alarms || 0) + 1, d = { alarms: a, nAl: DB.inc(1) };
  if (a >= 5) { d.alarms = 2; d.lockUntil = Date.now() + 15000; }
  upd(d); money(MONEY.alarm, "alarma"); say(fbId, "bad", a >= 5 ? "BLOQUEO DE SEGURIDAD · 15 s" : msg); shake();
}
async function win() {
  await upd({ solved: true, solvedAt: Date.now() });
  if (guided()) return;
  await money(MONEY.solve, "puzzle resuelto");
  const g = await DB.get(gpath(X.code));
  if (!g?.first?.[X.pid]) { await DB.update(gpath(X.code), { ["first." + X.pid]: X.band }); await money(MONEY.firstBonus, "primera banda"); }
}
// candado de un solo error: el 2.º error bloquea y pasa a modo guiado
function oneShotFail(fbId) {
  if (guided()) return alarm(fbId, "No es correcto. La alarma sube.");
  const e = (Z().err || 0) + 1;
  if (e >= 2) { upd({ err: e, blk: true, guided: true, nAl: DB.inc(1) }); money(MONEY.block, "bloqueo"); }
  else { upd({ err: e }); alarm(fbId, "No es correcto. Primer aviso: un error más y se bloquea."); }
}
function opened(txt) { return `<div class="opened"><h2>Candado abierto</h2><p>${txt}</p>${guided() ? '<p style="margin:0;color:var(--muted)">Resuelto en modo guiado: sin recompensa.</p>' : ""}</div>`; }
function guideBox() {
  if (!guided() || solved()) return "";
  return `<div class="lockbox" style="border-color:var(--amber);background:#241a0a"><h3 style="color:var(--amber)">Sistema bloqueado · modo guiado</h3><p style="margin:0 0 8px">Dos errores: habéis perdido 250.000 €. Podéis seguir hasta abrirlo, pero este puzzle ya no da recompensa.</p><div class="hint"><b>Pista del profe:</b> ${PZ[X.pid].guide}</div></div>`;
}
function textLock(label, ph) {
  if (solved()) return opened("Combinación correcta: <b class=\"mono\">" + esc(PZ[X.pid].answer) + "</b>");
  return `<div class="lockbox"><h3>${label}</h3><form class="lock" data-lock autocomplete="off"><input id="in-lock" type="text" placeholder="${ph}" aria-label="Combinación"${dis()}><button class="btn red" type="submit"${locked() || off() ? " disabled" : ""}>Abrir</button></form><p class="fb" id="fb-lock" role="status"></p></div>`;
}
function oneShotLock(title, btn, okTxt) {
  if (solved()) return opened(okTxt);
  return guideBox() + `<div class="lockbox"><h3>${title}</h3><div class="lock"><button class="btn red" data-act="oshot" type="button"${locked() || off() ? " disabled" : ""}>${btn}</button></div><p class="fb" id="fb-lock" role="status"></p></div>`;
}

/* ======================================================
   T2 · LA FUGA DE LA IMPRENTA DIGITAL (texto)
   ====================================================== */
const KCARDS = [
  { id: 1, html: '<span style="letter-spacing:.32em">CÁMARA</span>', L: "X" },
  { id: 2, html: 'A<span style="margin-left:.42em">VIÓN</span>', L: "C", k: 1 },
  { id: 3, html: '<span style="letter-spacing:-.09em">botín</span>', L: "Q" },
  { id: 4, html: 'T<span style="margin-left:.38em">orre</span>', L: "I", k: 1 },
  { id: 5, html: 'LLA<span style="margin-left:.42em">VE</span>', L: "N", k: 1 },
  { id: 6, html: '<span style="letter-spacing:.3em">PLANO</span>', L: "Z" },
  { id: 7, html: '<span style="letter-spacing:-.08em">guarda</span>', L: "K" },
  { id: 8, html: 'Y<span style="margin-left:.36em">ate</span>', L: "C", k: 1 },
  { id: 9, html: 'W<span style="margin-left:.4em">ATIO</span>', L: "O", k: 1 },
  { id: 10, html: '<span style="letter-spacing:.28em">máster</span>', L: "J" },
];
const kcard = (c) => `<button type="button" class="kcard${X.ksel === c.id ? " sel" : ""}" draggable="true" data-kc="${c.id}"${dis()}><span class="num">#${c.id}</span><span class="w">${c.html}</span><canvas width="128" height="80" data-seal="${c.id}"></canvas></button>`;
function drawSeals() {
  X.root.querySelectorAll("canvas[data-seal]").forEach((cv) => {
    const c = KCARDS.find((k) => k.id == cv.dataset.seal), x = cv.getContext("2d");
    let seed = c.id * 9973; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    x.fillStyle = "#fff"; x.fillRect(0, 0, 128, 80);
    x.fillStyle = "#4fb6d8"; x.font = '700 60px "Libre Baskerville", Georgia, serif'; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(c.L, 64, 44);
    for (let i = 0; i < 260; i++) { x.strokeStyle = "rgba(230," + Math.floor(40 + rnd() * 70) + "," + Math.floor(40 + rnd() * 60) + "," + (0.55 + rnd() * 0.4) + ")"; x.lineWidth = 1 + rnd() * 3; x.beginPath(); const a = rnd() * 128, b = rnd() * 80; x.moveTo(a, b); x.lineTo(a + (rnd() - 0.5) * 40, b + (rnd() - 0.5) * 30); x.stroke(); }
    x.fillStyle = "rgba(120,200,225,.55)"; for (let i = 0; i < 70; i++) x.fillRect(rnd() * 128, rnd() * 80, 2, 2);
  });
}
function bindCalc() {
  const mn = X.root.querySelector("#m-n"), mu = X.root.querySelector("#m-u"), mo = X.root.querySelector("#m-out");
  if (mn) { const f = () => { const n = parseFloat(mn.value) || 0; mo.textContent = (Math.round(n * 12 * 100) / 100).toLocaleString("es-ES") + (mu.value === "pica" ? " pt" : " pt Didot"); }; mn.oninput = f; mu.onchange = f; f(); }
}
const PZ = {};
PZ.t2 = {
  answer: "185", fuse: ["maq", "met"], init: () => ({ k: {}, kfilter: false }),
  brief: "La productora publica esta noche en su web el comunicado del estreno. Si preparáis bien el archivo, el sistema os abre la imprenta digital. Cada uno ve solo una parte de la mesa de trabajo.",
  guide: "La caja mide 3 picas (36 pt) y el comunicado se publica en pantalla. Las tarjetas de kerning, con la lámina roja, dan una palabra que es un número.",
  roles: {
    maq: { name: "Maquetador", short: "Ve la caja de texto en InDesign.", goal: "Averiguar cuánto mide de ancho la caja de texto.",
      have: () => { let r = ""; for (let i = 0; i <= 6; i++) r += `<span style="left:${(i / 6) * 100}%"><b>${i}p</b></span>`;
        return `<div class="paper"><h3 style="color:#6b6460">comunicado.indd · regla en picas</h3><div class="ruler">${r}</div><div style="width:50%"><div class="frame">La entrega del archivo es esta noche a las 23:00. El máster sale de la sala de montaje por el ascensor de servicio y el guardia de turno firma la salida antes de que</div></div></div>`; },
      hints: ["Mira la regla de arriba: está en picas (p).", "La caja empieza en 0p. Fíjate dónde termina."] },
    met: { name: "Especialista en Métricas", short: "Conversiones y calculadora.", goal: "Pasar a puntos las medidas que te lleguen.",
      have: () => T("Conversiones", table(["Unidad", "Equivale a"], [["1 punto (pt)", "1/72 de pulgada · 0,353 mm"], ["1 pica", "12 puntos · 1/6 de pulgada"], ["1 cícero", "12 puntos Didot"]])) + T("Calculadora", '<div class="calc"><input id="m-n" type="number" step="0.5" value="1" aria-label="Cantidad"><select id="m-u" aria-label="Unidad"><option value="pica">picas</option><option value="cicero">cíceros</option></select><span>=</span><output id="m-out">12 pt</output></div>'),
      hints: ["Una pica son 12 puntos.", "Multiplica las picas por 12."] },
    tip: { name: "Tipógrafo", short: "Tiene la tabla de familia y cuerpo.", goal: "Decir qué familia y qué cuerpo toca a la caja de texto, según su ancho y el soporte donde se publica.",
      have: () => T("Familia y cuerpo según ancho de la caja y soporte", table(["Ancho de la caja", "En papel", "En pantalla"], [['<span class="mono">24 pt</span>', "Serif · <b>10</b> pt", "Palo seco · <b>16</b> px"], ['<span class="mono">36 pt</span>', "Serif · <b>12</b> pt", "Palo seco · <b>18</b> px"], ['<span class="mono">48 pt</span>', "Palo seco · <b>12</b> pt", "Palo seco · <b>20</b> px"], ['<span class="mono">72 pt</span>', "Display · <b>24</b> pt", "Display · <b>24</b> px"]])) + '<p class="lead" style="margin:8px 0 0">Para texto corrido, el cuerpo crece con el ancho de la caja.</p>',
      hints: ["Tu tabla está en puntos. Te hace falta el ancho de la caja en puntos.", "Tu tabla tiene dos columnas. Necesitas saber dónde se publica."] },
    cor: { name: "Corrector de espaciado", short: "Tarjetas de kerning y tracking.", goal: "Separar las tarjetas en kerning y tracking. Con la lámina roja sobre las de kerning aparece una palabra: es un número y será la última cifra del candado.",
      have: () => { const where = (id) => st().k[id] || "mesa"; const col = (b) => KCARDS.filter((c) => where(c.id) === b).map(kcard).join("");
        return `<p class="lead" style="margin:0">Kerning: falla el espacio entre <b>dos letras concretas</b>. Tracking: <b>toda la palabra</b> está igual de abierta o de apretada. Arrastra cada tarjeta, o tócala y luego toca la caja.</p><div class="bin" data-bin="mesa"><h3>Mesa</h3><div class="cards">${col("mesa") || '<span class="lead">Mesa vacía</span>'}</div></div><div class="bins"><div class="bin" data-bin="K"><h3>Kerning (un par)</h3><div class="cards">${col("K")}</div>${st().kfilter ? '<div class="redfilter"></div>' : ""}</div><div class="bin" data-bin="T"><h3>Tracking (toda la palabra)</h3><div class="cards">${col("T")}</div></div></div><div class="lock" style="margin-top:10px"><button class="btn${st().kfilter ? " on" : ""}" data-act="kfilter" type="button"${dis()}>${st().kfilter ? "Quitar la lámina roja" : "Poner la lámina roja sobre kerning"}</button></div>`; },
      hints: ["Mira si el hueco raro está en un solo sitio o en toda la palabra.", "Con la lámina roja puesta, lee las letras por orden de número (#)."] },
    dir: { name: "Director de Arte", short: "Sabe dónde se publica. Tiene el candado.", lockRole: true, goal: "Abrir el candado de 3 cifras.",
      have: () => T("Orden de producción", '<p style="font-size:18px;margin:0">El comunicado es un <b>párrafo de texto corrido</b> y se publica en la <b>web</b> (pantalla).</p>') + T("Cómo se forma la combinación", '<p style="margin:0">Las <b>dos primeras cifras</b> son el <b>cuerpo</b> que lleva el texto en su soporte. La <b>tercera cifra</b> es un número que no está en esta pantalla.</p>'),
      lock: () => textLock("Candado de la imprenta", "3 cifras"),
      hints: ["Mira la orden: ¿papel o pantalla?", "El cuerpo no lo tienes tú: hay que saber qué cuerpo lleva el texto en ese soporte.", "Para la tercera cifra, preguntad si alguien ha encontrado un número."] },
  },
};

/* ======================================================
   F · EL ARCHIVO FALSO (sonido)
   ====================================================== */
const FILES = [
  ["estreno_v1.wav", "WAV", "48 kHz", "24 bits", "5.1"], ["estreno_v2.bwf", "BWF", "44,1 kHz", "24 bits", "5.1"],
  ["estreno_v3.bwf", "BWF", "48 kHz", "16 bits", "5.1"], ["estreno_v4.flac", "FLAC", "48 kHz", "24 bits", "5.1"],
  ["estreno_v5.bwf", "BWF", "48 kHz", "24 bits", "Estéreo"], ["estreno_v6.bwf", "BWF", "48 kHz", "24 bits", "5.1"],
  ["estreno_v7.aac", "AAC", "48 kHz", "—", "5.1"], ["estreno_v8.bwf", "BWF", "96 kHz", "24 bits", "5.1"],
];
PZ.f = {
  answer: "estreno_v6.bwf", fuse: ["sal", "ser"], init: () => ({ f: null }),
  brief: "Vais a cambiar el audio del máster por una copia vuestra. El servidor solo la acepta si cumple la ficha técnica del original. Cada uno ve solo una parte de la ficha.",
  guide: "Cada archivo falla en una sola cosa menos uno. Comprobad: muestreo de más del doble de 23 kHz, ≤ 1.200 kbps por canal, 120 dB de rango (6 dB por bit), 5.1 y formato sin pérdidas con timecode.",
  roles: {
    sal: { name: "Ingeniero de sala", short: "Ve el espectro del original.", goal: "Averiguar hasta qué frecuencia llega el sonido del máster. La copia tiene que poder recogerlo entero.",
      have: () => T("Espectro del máster original", '<div class="spec"><div class="specbar"><i style="width:' + (23 / 30) * 100 + '%"></i>' + Array.from({ length: 29 }, (_, k) => '<u style="left:' + ((k + 1) / 30) * 100 + '%"></u>').join("") + '</div><div class="specax">' + [0, 5, 10, 15, 20, 25, 30].map((v) => '<span style="left:' + (v / 30) * 100 + '%">' + v + "</span>").join("") + '</div><p class="lead" style="margin:18px 0 0">Eje en kHz. La barra marca hasta dónde hay señal.</p></div>'),
      hints: ["Lee en el eje hasta dónde llega la barra.", "Para recoger una frecuencia hace falta muestrear a más del doble."] },
    ser: { name: "Técnico del servidor", short: "Tiene los límites del servidor.", goal: "Averiguar qué límites impone el servidor al archivo.",
      have: () => T("Límites del servidor", '<p style="margin:0">Cada canal puede transportar como máximo <b class="mono">1.200 kbps</b>.</p>') + T("Tasa de bits de un canal", '<p style="margin:0">Se calcula multiplicando la frecuencia de muestreo (en Hz) por la profundidad de bits. Los formatos con compresión con pérdidas no tienen profundidad fija.</p>'),
      hints: ["Pasa la frecuencia de kHz a Hz antes de multiplicar.", "Prueba con los valores de cada archivo: ¿cuáles se pasan de 1.200 kbps?"] },
    post: { name: "Postproductor", short: "Ve la dinámica del original.", goal: "Averiguar qué profundidad de bits necesita la copia.",
      have: () => T("Rango dinámico del máster", '<p style="font-size:18px;margin:0">El original tiene un rango dinámico de <b class="mono">120 dB</b>. La copia debe poder recogerlo entero.</p>'),
      hints: ["Cada bit aporta unos 6 dB de rango dinámico.", "¿Cuántos dB da 16 bits? ¿Y 24?"] },
    dis: { name: "Distribuidor", short: "Ve los requisitos de entrega.", goal: "Averiguar qué formato y cuántos canales exige la sala.",
      have: () => T("Requisitos de la sala", '<ul style="margin:0;padding-left:18px"><li>Cinco altavoces alrededor de la sala y un subwoofer.</li><li>El archivo debe ser <b>sin pérdidas</b>.</li><li>Debe llevar <b>timecode</b> para sincronizarse con la imagen.</li></ul>') + T("Formatos de audio", table(["Formato", "Compresión", "Timecode"], [["WAV", "Sin compresión", "No"], ["BWF", "Sin compresión", "Sí"], ["FLAC", "Comprimido sin pérdidas", "No"], ["AAC", "Comprimido con pérdidas", "No"]])),
      hints: ["Cinco altavoces más un subwoofer tiene un nombre con dos números.", "Mira qué formatos cumplen las dos condiciones a la vez."] },
    mon: { name: "Montador", short: "Ve los archivos. Tiene el candado.", lockRole: true, goal: "Cambiar el máster por el único archivo que pasa el control.",
      have: () => T("Archivos preparados", '<div class="tw"><table><tr><th></th><th>Archivo</th><th>Formato</th><th>Frecuencia</th><th>Profundidad</th><th>Canales</th></tr>' + FILES.map((f, i) => `<tr${st().f === i ? ' class="hl"' : ""}><td><input type="radio" name="ff" id="ff${i}" data-ffile="${i}"${st().f === i ? " checked" : ""} aria-label="${f[0]}"${dis()}></td><td class="mono"><label for="ff${i}">${f[0]}</label></td><td>${f[1]}</td><td class="mono">${f[2]}</td><td class="mono">${f[3]}</td><td>${f[4]}</td></tr>`).join("") + "</table></div>"),
      lock: () => oneShotLock("Servidor del máster", "Sustituir el máster", 'Máster sustituido por <b class="mono">estreno_v6.bwf</b>. El servidor no ha notado nada.'),
      check: () => st().f === 5, req: () => st().f != null, reqMsg: "Elige un archivo primero.",
      hints: ["Cada archivo falla en una sola cosa, menos uno.", "Necesitas que las cuatro pantallas cuadren antes de elegir."] },
  },
};

/* ======================================================
   P · EL ANILLO DE COLOR (imagen)
   ====================================================== */
const PCOL = [[1, 1, 0], [0, 1, 0], [1, 0, 1]], PSLOT = [2, 4, 10];
const PCLUE = ["Complementario del azul.", "Tríada con el rojo y el azul.", "Complementario del verde."];
const PNAME = { dir: "Director de arte", fis: "Físico de la luz", imp: "Impresor", pro: "Programador web" }, PR = ["dir", "fis", "imp", "pro"];
const hueCol = (s) => "hsl(" + s * 30 + ",100%,50%)";
const bitsCss = (b) => "rgb(" + b.map((v) => v * 255).join(",") + ")";
const inkCss = (t) => "rgb(" + t.map((v) => (1 - v) * 255).join(",") + ")";
const hexCss = (h) => (/^[0-9A-F]{6}$/.test(h) ? "#" + h : null);
const sw = (css, label) => '<div class="psw"><i style="background:' + (css || "#3a3030") + '"></i><small>' + label + "</small></div>";
const pCf = (r, i) => st().conf[r][i];
const pTplSet = () => { const a = X.ui.anchor, t = X.ui.tpl; if (a == null || !t) return []; const m = (n) => ((n % 12) + 12) % 12; return t === "comp" ? [a, m(a + 6)] : t === "tri" ? [a, m(a + 4), m(a + 8)] : [m(a - 1), a, m(a + 1)]; };
function pWheel() {
  const P = (r, a) => (130 + r * Math.cos(a)).toFixed(1) + "," + (130 + r * Math.sin(a)).toFixed(1), set = pTplSet(), edit = !off();
  let h = '<svg viewBox="0 0 260 260" class="wheel" role="img" aria-label="Rueda de color RGB de 12 sectores">';
  for (let s = 0; s < 12; s++) { const a0 = ((s * 30 - 15 - 90) * Math.PI) / 180, a1 = ((s * 30 + 15 - 90) * Math.PI) / 180, hl = set.includes(s);
    h += `<path d="M${P(46, a0)} L${P(118, a0)} A118,118 0 0 1 ${P(118, a1)} L${P(46, a1)} A46,46 0 0 0 ${P(46, a0)} Z" fill="${hueCol(s)}" stroke="${hl ? "#fff" : "#0d0b0b"}" stroke-width="${hl ? 5 : 2}"${edit ? ` data-pw="${s}" style="cursor:pointer"` : ""}/>`; }
  st().dir.forEach((s, i) => { if (s == null) return; const a = ((s * 30 - 90) * Math.PI) / 180, c = P([62, 88, 110][i], a).split(",");
    h += `<circle cx="${c[0]}" cy="${c[1]}" r="9" fill="#0d0b0b" stroke="${i === X.ui.sel && X.ui.mode === "mark" ? "#f2a93b" : "#fff"}" stroke-width="2" pointer-events="none"/><text x="${c[0]}" y="${+c[1] + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="IBM Plex Mono, monospace" pointer-events="none">${i + 1}</text>`; });
  return h + "</svg>";
}
const diagAdd = () => '<svg viewBox="0 0 220 200" class="diag" role="img" aria-label="Tres focos de luz que se solapan sobre fondo negro" style="background:#000"><circle cx="85" cy="78" r="52" fill="#f00" style="mix-blend-mode:screen"/><circle cx="135" cy="78" r="52" fill="#0f0" style="mix-blend-mode:screen"/><circle cx="110" cy="122" r="52" fill="#00f" style="mix-blend-mode:screen"/></svg>';
const diagSub = () => '<svg viewBox="0 0 220 200" class="diag" role="img" aria-label="Tres tintas que se solapan sobre papel blanco" style="background:#fff"><circle cx="85" cy="78" r="52" fill="#0ff" style="mix-blend-mode:multiply"/><circle cx="135" cy="78" r="52" fill="#f0f" style="mix-blend-mode:multiply"/><circle cx="110" cy="122" r="52" fill="#ff0" style="mix-blend-mode:multiply"/></svg>';
function inkDemo() {
  const d = X.ui.demo, ABS = { c: 0, m: 1, y: 2 };
  const btn = (k, n) => `<button class="btn${d === k ? " on" : ""}" data-pdemo="${k}" type="button">Tinta ${n}</button>`;
  let body = '<p class="lead" style="margin:0 0 8px">Pulsa una tinta para ver qué le pasa a la luz blanca que llega al papel.</p><div class="lock">' + btn("c", "cian") + btn("m", "magenta") + btn("y", "amarilla") + "</div>";
  if (d) body += '<div class="demo">' + ["rojo", "verde", "azul"].map((n, c) => `<div class="dl"><span class="lampdot" style="background:${["#ff2a2a", "#27e05a", "#3a6bff"][c]};opacity:${ABS[d] === c ? 0.14 : 1}"></span><b>luz ${n}</b><em>${ABS[d] === c ? "absorbida" : "pasa y se refleja"}</em></div>`).join("") + "</div>";
  return T("Cómo trabaja cada tinta", body);
}
const pConfBtn = (r, i) => (pCf(r, i) ? '<span class="tag" style="color:var(--ok);border-color:var(--ok)">confirmado</span>' : `<button class="btn red" data-act="pconf" data-r="${r}" data-i="${i}" type="button"${dis()}>Confirmar</button><span class="fb warn" id="fb-pc-${r}${i}" style="margin-left:8px"></span>`);
const pWaitRow = (i, who) => `<div class="prow"><b>Piloto ${i + 1}</b><span class="lead" style="margin:0">Esperando a que ${who} confirme este piloto.</span></div>`;
const lampRow = (b, names, cols) => '<div class="lampset">' + names.map((n, c) => `<span class="lampdot" style="background:${cols[c]};opacity:${b[c] ? 1 : 0.14}"></span><small>${n}</small>`).join("") + "</div>";
function pDir() {
  const d = st().dir, tpl = X.ui.mode === "tpl", tb = (k, n) => `<button class="btn${X.ui.tpl === k ? " on" : ""}" data-ptpl="${k}" type="button">${n}</button>`;
  return T("Briefing de la caja", '<p class="lead" style="margin-top:0">Cada piloto de la caja debe encenderse en un color. Cada uno se define por una relación entre colores.</p><ol class="steps"><li>Pulsa un piloto.</li><li>Pulsa en la rueda el color que cumple su pista.</li><li>Cuando lo tengas, confirma ese piloto.</li></ol>' + [0, 1, 2].map((i) => `<div class="prow"><button class="btn${X.ui.sel === i && !tpl ? " on" : ""}" data-psel="${i}" type="button">Piloto ${i + 1}</button><span>${PCLUE[i]}</span>${sw(d[i] == null ? null : hueCol(d[i]), "marcado")}${pConfBtn("dir", i)}</div>`).join(""))
    + T("Rueda de color", `<div class="lock" style="margin-bottom:10px"><button class="btn${!tpl ? " on" : ""}" data-pmode="mark" type="button">Marcar el piloto ${X.ui.sel + 1}</button><button class="btn${tpl ? " on" : ""}" data-pmode="tpl" type="button">Probar una plantilla</button></div><div class="wheelbox">${pWheel()}</div>` + (tpl ? '<p class="lead" style="margin:10px 0 6px;font-size:14px">Elige una plantilla y pulsa un color de la rueda: se marcan los sectores de esa armonía a partir de él.</p><div class="lock">' + tb("comp", "Complementario") + tb("tri", "Tríada") + tb("ana", "Análogos") + "</div>" : '<p class="lead" style="margin:8px 0 0;font-size:14px">Tus marcas llevan el número del piloto.</p>'));
}
function pFis() {
  const rows = [0, 1, 2].map((i) => (!pCf("dir", i) ? pWaitRow(i, "el Director de arte") : `<div class="prow"><b>Piloto ${i + 1}</b>${sw(hueCol(st().dir[i]), "debe verse así")}<span class="chks">${["rojo", "verde", "azul"].map((n, c) => `<label><input type="checkbox" data-pl="${i}.${c}"${st().luz[i][c] ? " checked" : ""}${pCf("fis", i) || off() ? " disabled" : ""}> foco ${n}</label>`).join("")}</span>${pConfBtn("fis", i)}</div>`)).join("");
  return T("Tus tres focos de luz", '<p class="lead" style="margin-top:0">Enciende los focos necesarios para proyectar cada color. Cada foco va al máximo o apagado.</p>' + rows)
    + T("Referencia: luz sobre fondo negro", '<div class="wheelbox">' + diagAdd() + '</div><p class="lead" style="margin:8px 0 0;font-size:14px">Tres focos solapados. Mira qué se ve donde se cruzan.</p>');
}
function pImp() {
  const rows = [0, 1, 2].map((i) => (!pCf("fis", i) ? pWaitRow(i, "el Físico de la luz") : `<div class="prow"><b>Piloto ${i + 1}</b><div><small class="mono">Focos del color proyectado</small>${lampRow(st().luz[i], ["rojo", "verde", "azul"], ["#ff2a2a", "#27e05a", "#3a6bff"])}</div><span class="chks">${["cian", "magenta", "amarilla"].map((n, c) => `<label><input type="checkbox" data-pt="${i}.${c}"${st().tinta[i][c] ? " checked" : ""}${pCf("imp", i) || off() ? " disabled" : ""}> tinta ${n}</label>`).join("")}</span>${pConfBtn("imp", i)}</div>`)).join("");
  return T("Tus tintas", '<p class="lead" style="margin-top:0">Elige las tintas que imprimen, sobre papel blanco, el mismo color que proyectan esos focos. Cada tinta va al 100 % o no va.</p>' + rows) + inkDemo()
    + T("Referencia: tintas sobre papel blanco", '<div class="wheelbox">' + diagSub() + '</div><p class="lead" style="margin:8px 0 0;font-size:14px">Tres tintas solapadas. El nombre de cada tinta es el color que se ve cuando se imprime sola.</p>');
}
function pPro() {
  const rows = [0, 1, 2].map((i) => (!pCf("imp", i) ? pWaitRow(i, "el Impresor") : `<div class="prow"><b>Piloto ${i + 1}</b><div><small class="mono">Tintas de la imprenta</small>${lampRow(st().tinta[i], ["cian", "magenta", "amarilla"], ["#00aeef", "#ec008c", "#ffe600"])}</div><label class="hexin">#<input type="text" maxlength="6" data-ph="${i}" value="${esc(st().hex[i])}" placeholder="RRGGBB" autocomplete="off"${pCf("pro", i) || off() ? " disabled" : ""}></label>${pConfBtn("pro", i)}</div>`)).join("");
  return T("Tus códigos", '<p class="lead" style="margin-top:0">Escribe el código hexadecimal del color que imprimen esas tintas.</p>' + rows)
    + T("Referencia: cómo se escribe un color", '<div class="hexref"><div><b>RR</b><small>canal rojo</small></div><div><b>GG</b><small>canal verde</small></div><div><b>BB</b><small>canal azul</small></div></div><p class="lead" style="margin:8px 0 0;font-size:14px">Cada canal ocupa dos dígitos, de 00 a FF. <b>00</b> es luz apagada y <b>FF</b> es luz al máximo. Ejemplo: el blanco, con los tres canales al máximo, es FFFFFF.</p>');
}
const pReady = (i) => PR.every((r) => pCf(r, i));
function pMon() {
  const rows = [0, 1, 2].map((i) => (pReady(i) ? `<div class="prow"><b>Piloto ${i + 1}</b>${sw(hueCol(st().dir[i]), "objetivo")}${sw(bitsCss(st().luz[i]), "luz")}${sw(inkCss(st().tinta[i]), "tinta")}${sw(hexCss(st().hex[i]), "código")}<button class="btn" data-act="pret" data-i="${i}" type="button"${dis()}>Devolver (−50.000 €)</button></div>`
    : `<div class="prow"><b>Piloto ${i + 1}</b><span class="lead" style="margin:0">Pendiente de: ${PR.filter((r) => !pCf(r, i)).map((r) => PNAME[r]).join(", ")}.</span></div>`)).join("");
  return T("Muestras de cada piloto", '<p class="lead" style="margin-top:0">Objetivo de la caja, luz proyectada, tinta impresa y color del código. Si una muestra no coincide, puedes devolver ese piloto a los demás.</p>' + rows + '<p class="fb" id="fb-pret" role="status"></p>');
}
PZ.p = {
  fuse: ["imp", "pro"],
  init: () => ({ dir: [null, null, null], luz: { 0: [0, 0, 0], 1: [0, 0, 0], 2: [0, 0, 0] }, tinta: { 0: [0, 0, 0], 1: [0, 0, 0], 2: [0, 0, 0] }, hex: ["", "", ""], conf: { dir: [0, 0, 0], fis: [0, 0, 0], imp: [0, 0, 0], pro: [0, 0, 0] } }),
  brief: "La caja tiene tres pilotos y cada uno debe encenderse en un color. El color viaja por un anillo: se define en la rueda, se proyecta con luz, se imprime con tinta y se escribe en código. Cada eslabón recibe lo que deja el anterior, piloto a piloto.",
  guide: "Piloto 1 es el complementario del azul; piloto 2, el tercer vértice de la tríada rojo-azul; piloto 3, el complementario del verde. Revisad que luz, tinta y código digan el mismo color.",
  roles: {
    dir: { name: "Director de arte", short: "Define los colores en la rueda.", goal: "Colocar en la rueda el color de cada piloto, según su pista.", have: pDir, hints: ["Complementarios: colores opuestos en la rueda.", "Prueba la plantilla de tríada con el rojo como punto de partida."] },
    fis: { name: "Físico de la luz", short: "Proyecta el color con focos.", goal: "Proyectar con luz el color que marca el Director para cada piloto.", have: pFis, hints: ["Los focos suman luz: mira en la referencia qué pasa donde se cruzan.", "Para un color puro basta con encender los focos que lo forman."] },
    imp: { name: "Impresor", short: "Imprime el color con tintas.", goal: "Imprimir sobre papel blanco el mismo color que proyectan los focos.", have: pImp, hints: ["Cada tinta se come una de las tres luces: pruébalo en la demostración.", "Para reflejar un color hay que absorber las luces que no lo forman."] },
    pro: { name: "Programador web", short: "Escribe el código del color.", goal: "Escribir el código hexadecimal del color que imprimen las tintas.", have: pPro, hints: ["Primero averigua qué color imprimen esas tintas.", "Cada canal ocupa dos dígitos: 00 apagado, FF al máximo."] },
    mon: { name: "Montador", short: "Compara las muestras. Tiene el candado.", lockRole: true, goal: "Comprobar que luz, tinta y código coinciden con el objetivo, y abrir la caja.", have: pMon,
      lock: () => ([0, 1, 2].every(pReady) || solved() ? oneShotLock("Abrir la caja", "Abrir caja", "La caja se abre: los tres pilotos coinciden.") : guideBox()),
      check: () => { const s = st(); return [0, 1, 2].every((i) => s.dir[i] === PSLOT[i] && PCOL[i].every((v, c) => s.luz[i][c] === v && s.tinta[i][c] === 1 - v) && s.hex[i] === PCOL[i].map((v) => (v ? "FF" : "00")).join("")); },
      hints: ["Si una muestra no coincide, algún eslabón ha traducido mal.", "Mira cuál de las cuatro se separa de las demás y devuelve ese piloto."] },
  },
};

PZ.t2.teacher = "<ul><li>Maquetador: la caja va de 0p a 3p → <b>3 picas</b>. Métricas: 3 × 12 = <b>36 pt</b>.</li><li>Director: se publica en <b>pantalla</b> (se lo tiene que decir al Tipógrafo).</li><li>Tipógrafo: 36 pt en pantalla → Palo seco, <b>18 px</b>.</li><li>Corrector: kerning = #2, #4, #5, #8, #9 → <b>C-I-N-C-O</b> → <b>5</b>.</li><li>Candado: <b>185</b>. Trampas: ancho mal convertido (por ejemplo 3 pt → fila de 24 pt) → 165; columna de papel → 125.</li><li>Con 4 personas se fusionan Maquetador y Métricas.</li></ul>";
PZ.f.teacher = "<ul><li>Sala: el espectro llega a <b>23 kHz</b> → Nyquist: muestreo &gt; 46 kHz → vale 48 o 96 kHz (falla 44,1: v2).</li><li>Servidor: 1.200 kbps por canal → 48 kHz × 24 bits = 1.152 ✓; 96 kHz × 24 bits = 2.304 ✗ (falla v8).</li><li>Postproductor: 120 dB → 16 bits da 96 dB ✗ (v3), 24 bits da 144 dB ✓.</li><li>Distribuidor: <b>5.1</b> (falla v5, estéreo), sin pérdidas con timecode → <b>BWF</b> (fallan WAV v1, FLAC v4, AAC v7).</li><li>Solución: <b>estreno_v6.bwf</b>.</li><li>Con 4 personas se fusionan Ingeniero de sala y Técnico del servidor.</li><li>El Montador solo puede equivocarse <b>una vez</b>: el segundo error bloquea el servidor (−250.000 €).</li></ul>";
PZ.p.teacher = "<ul><li>Piloto 1: complementario del azul → <b>amarillo</b>. Luz: rojo + verde. Tinta: solo amarilla (absorbe el azul). Código <b>FFFF00</b>.</li><li>Piloto 2: tríada con rojo y azul → <b>verde</b>. Luz: solo verde. Tintas: cian + amarilla (absorben rojo y azul). Código <b>00FF00</b>.</li><li>Piloto 3: complementario del verde → <b>magenta</b>. Luz: rojo + azul. Tinta: solo magenta. Código <b>FF00FF</b>.</li><li>Todos los colores son puros: no hay cálculos, todo es 100 % / 0 % y FF / 00.</li><li>Cada piloto avanza por separado por el anillo. El Montador compara las cuatro muestras de cada uno y puede devolver un piloto (−50.000 €).</li><li>Apoyos visuales: plantillas de armonía (Director), tres focos solapados (Físico), demostración de una tinta y tres tintas solapadas (Impresor), referencia de canales (Programador).</li><li>Un solo error permitido al abrir. Con 4 personas se fusionan Impresor y Programador web.</li></ul>";
PZ.t2.title = "Texto · La Fuga de la Imprenta Digital"; PZ.f.title = "Sonido · El archivo falso"; PZ.p.title = "Imagen · El anillo de color";

/* ======================================================
   V2 · EL MONITOR DE AVERÍAS (vídeo, fase 1)
   ====================================================== */
const MAXMOVES = 14, V2CAP = 16;
const li = (a) => '<ul style="margin:0;padding-left:18px">' + a.map((x) => "<li>" + x + "</li>").join("") + "</ul>";
const vsel = (k, label, opts) => `<div class="vf"><label for="vs-${k}">${label}</label><select id="vs-${k}" data-vs="${k}"${dis()}>${opts.map((o) => `<option value="${o[0]}"${st()[k] === o[0] ? " selected" : ""}>${esc(o[1])}</option>`).join("")}</select></div>`;
const meter = (label, val, max, bad) => `<div class="mtr"><div class="mtrh"><span>${label}</span><b class="mono">${val} / ${max} Mbps</b></div><div class="mtrb"><i style="width:${Math.min(100, (val / max) * 100)}%;background:${bad ? "var(--red2)" : "var(--ok)"}"></i></div></div>`;
function v2Req(s) { const base = +s.fps > 30 ? 12 : 8, sub = { 444: 2, 422: 1.5, 420: 1 }[s.sub]; return base * sub * (s.bits === "10" ? 1.25 : 1) * (s.tipo === "intra" ? 1.5 : 1); }
function v2Def(s) { return { peine: s.bar === "prog", orden: s.bar === "sup", saltos: ![25, 50].includes(+s.fps), bloques: +s.br < v2Req(s), bandas: s.bits === "8" && s.sub === "420" }; }
let clipRaf = 0, clipTmp = null;
function clipStart() {
  cancelAnimationFrame(clipRaf);
  const c = X && X.root.querySelector("#clip"); if (!c) return;
  const x = c.getContext("2d"); if (!clipTmp) clipTmp = document.createElement("canvas");
  const W = c.width, H = c.height;
  const loop = (now) => {
    if (!c.isConnected || !X || X.pid !== "v2") return;
    const s = st(), d = v2Def(s), fps = +s.fps, T0 = now / 1000, td = Math.floor(T0 * fps) / fps, tq = Math.floor(td * 25 + 1e-6) / 25;
    x.imageSmoothingEnabled = true; x.clearRect(0, 0, W, H);
    if (d.bandas) { const n = 7; for (let i = 0; i < n; i++) { const t = i / (n - 1); x.fillStyle = "rgb(" + Math.round(20 + t * 220) + "," + Math.round(35 + t * 105) + "," + Math.round(80 - t * 10) + ")"; x.fillRect(0, (i * H * 0.62) / n, W, (H * 0.62) / n + 1); } }
    else { const g = x.createLinearGradient(0, 0, 0, H * 0.62); g.addColorStop(0, "#142350"); g.addColorStop(1, "#f08a4b"); x.fillStyle = g; x.fillRect(0, 0, W, H * 0.62); }
    x.fillStyle = "#1b1722"; x.fillRect(0, H * 0.62, W, H * 0.38);
    x.fillStyle = "#f6c96a"; x.beginPath(); x.arc(250, 48, 18, 0, 7); x.fill();
    x.fillStyle = "#efe6e3"; x.font = "700 15px Impact, sans-serif"; x.fillText("EL ATRACO", 14, 170);
    const sp = 260, pos = (t) => ((t * sp) % (W + 60)) - 30;
    if (d.peine || d.orden) { const dt = d.peine ? -1 / 50 : 1 / 50; x.globalAlpha = d.orden ? 0.55 + 0.45 * (Math.floor(T0 * fps) % 2) : 1; for (let y = 0; y < 90; y++) { const t = y % 2 ? tq + dt : tq; x.fillStyle = "#fff3c4"; x.fillRect(pos(t), 60 + y, 26, 1); } x.globalAlpha = 1; }
    else { x.fillStyle = "#fff3c4"; x.fillRect(pos(tq), 60, 26, 90); }
    if (d.bloques) { clipTmp.width = W / 9; clipTmp.height = H / 9; const t2 = clipTmp.getContext("2d"); t2.imageSmoothingEnabled = true; t2.drawImage(c, 0, 0, W / 9, H / 9); x.imageSmoothingEnabled = false; x.drawImage(clipTmp, 0, 0, W, H); }
    clipRaf = requestAnimationFrame(loop);
  };
  clipRaf = requestAnimationFrame(loop);
}
const v2Msg = () => (st().msg ? `<div class="jmsg"><b>Jefe de control</b>${esc(st().msg)}</div>` : "");
const clipOff = () => v2Msg() + T("Monitor", '<p style="margin:0">Tu monitor está apagado: tu pantalla no recibe imagen del clip. Decide con lo que sabes del material.</p>');
const clipBox = () => v2Msg() + T("Clip en el monitor", '<canvas id="clip" class="cv" width="320" height="180" aria-label="Clip de vídeo con defectos"></canvas>');
const v2Moves = () => `<p class="lead" style="margin:0">Ajustes realizados: ${st().moves || 0} de ${MAXMOVES}. Cada ajuste de más sube la alarma.</p>`;
const V2NAME = { peine: "dientes de sierra en el movimiento", orden: "parpadeo y retroceso en el movimiento", saltos: "movimiento a saltos", bloques: "bloques en la imagen", bandas: "bandas en los degradados" };
PZ.v2 = {
  fuse: ["bar", "rit"], init: () => ({ esp: "709", per: "std", bar: "prog", fps: "12", tipo: "inter", br: "4", sub: "420", bits: "8", moves: 0, msg: "" }),
  brief: "El clip de la cinta se ve mal por varios motivos a la vez y cada uno depende de un mando distinto. Cada rol maneja los suyos y todos ven el mismo clip. El Jefe de control vigila el ancho de banda del canal, que nadie más ve, y puede devolver el trabajo.",
  guide: "El original es PAL a 25 imágenes/s, entrelazado con las líneas pares (campo inferior) primero. Quitad las bandas con más información de color y subid el bitrate justo hasta que desaparezcan los bloques, sin pasar de 16 Mbps.",
  roles: {
    bar: { name: "Técnico de barrido", short: "Maneja cómo se leen los campos.", goal: "Dejar el clip sin los defectos que dependan de tu mando, sin crear otros.",
      have: () => clipOff() + T("Tus mandos", vsel("bar", "Lectura de las líneas", [["prog", "Progresivo"], ["sup", "Entrelazado · campo superior primero"], ["inf", "Entrelazado · campo inferior primero"]]) + vsel("esp", "Espacio de color", [["709", "Rec. 709"], ["601", "Rec. 601"], ["srgb", "sRGB"]]) + vsel("per", "Perfil de exportación", [["std", "Estándar"], ["hq", "Alta calidad"], ["arc", "Archivo"]])) + v2Moves(),
      hints: ["Tu monitor está apagado: la respuesta está en el material de origen, no en probar.", "El espacio de color y el perfil de exportación no cambian ni la calidad ni el bitrate.", "Si no respetas el orden de los campos, el movimiento parpadea y retrocede."] },
    rit: { name: "Técnico de ritmo", short: "Maneja los fotogramas por segundo y conoce el origen.", goal: "Dejar el clip sin los defectos que dependan de tu mando, sin crear otros.",
      have: () => ((X.role || "").split("+").includes("bar") ? "" : clipBox()) + T("Ficha del material de origen", li(["Cinta de cámara DV, norma PAL.", "Imágenes por segundo del original: <b>25</b>.", "Barrido: <b>entrelazado</b>, se capta primero el campo de las líneas <b>pares</b> (2, 4, 6, 8…)."])) + T("Tu mando", vsel("fps", "Imágenes por segundo", [["12", "12"], ["25", "25"], ["30", "30"], ["50", "50"]])) + v2Moves(),
      hints: ["Un ritmo que no encaja con el original obliga a repetir imágenes de forma irregular.", "Un múltiplo exacto del ritmo original se repite de forma regular."] },
    com: { name: "Ingeniero de compresión", short: "Maneja la compresión y el bitrate.", goal: "Dejar el clip sin los defectos que dependan de tus mandos, sin crear otros.",
      have: () => clipBox() + T("Tus mandos", vsel("tipo", "Tipo de compresión", [["inter", "Interframe (GOP)"], ["intra", "Intraframe"]]) + vsel("br", "Bitrate", [["4", "4 Mbps"], ["8", "8 Mbps"], ["12", "12 Mbps"], ["16", "16 Mbps"], ["24", "24 Mbps"]])) + v2Moves(),
      hints: ["Si el bitrate no alcanza, la imagen se rompe en bloques.", "Comprimir cada fotograma por separado cuesta más datos que apoyarse en los vecinos."] },
    col: { name: "Colorista", short: "Maneja el color.", goal: "Dejar el clip sin los defectos que dependan de tus mandos, sin crear otros.",
      have: () => clipBox() + T("Tus mandos", vsel("sub", "Submuestreo", [["444", "4:4:4"], ["422", "4:2:2"], ["420", "4:2:0"]]) + vsel("bits", "Profundidad", [["8", "8 bits"], ["10", "10 bits"]])) + v2Moves(),
      hints: ["Los degradados en bandas delatan poca información de color.", "Más información de color pide más bitrate."] },
    mon: { name: "Jefe de control", short: "Vigila el canal. Tiene el candado.", lockRole: true, goal: "Dar el visto bueno cuando el clip esté limpio y el canal aguante.",
      have: () => { const d = v2Def(st()), act = Object.keys(d).filter((k) => d[k]), over = +st().br > V2CAP;
        return clipBox() + T("Control de calidad", (act.length ? `<p style="margin:0 0 8px">Defectos activos: <b>${act.map((k) => V2NAME[k]).join(", ")}</b>.</p>` : '<p style="margin:0 0 8px;color:var(--ok)"><b>Sin defectos en el clip.</b></p>') + meter("Bitrate elegido (solo lo ves tú)", +st().br, V2CAP, over) + `<div class="lock" style="margin-top:12px"><button class="btn" type="button" data-act="vdev" data-k="br"${dis()}>Devolver: te has pasado de bitrate</button><button class="btn" type="button" data-act="vdev" data-k="cal"${dis()}>Devolver: la calidad no llega</button></div><p class="fb" id="fb-vdev" role="status"></p>`) + v2Moves(); },
      lock: () => oneShotLock("Visto bueno", "Dar el visto bueno", "Clip limpio y dentro del canal. Fase 1 superada."),
      check: () => { const d = v2Def(st()); return !Object.values(d).some(Boolean) && +st().br <= V2CAP; },
      hints: ["Los demás no ven el límite del canal: avísales tú.", "No des el visto bueno mientras queden defectos."] },
  },
};

/* ======================================================
   V3 · LA CADENA DE EMISIÓN (vídeo, fase 2)
   ====================================================== */
function connSVG(k, l) {
  const g = "#8a8580"; let b = "";
  if (k === "bnc") b = `<circle cx="50" cy="40" r="26" fill="#24201f" stroke="#c9c4bc" stroke-width="4"/><circle cx="50" cy="40" r="14" fill="none" stroke="${g}" stroke-width="2"/><circle cx="50" cy="40" r="4" fill="#c9c4bc"/><rect x="21" y="38" width="6" height="4" fill="#c9c4bc"/><rect x="73" y="38" width="6" height="4" fill="#c9c4bc"/>`;
  if (k === "hdmi") b = '<path d="M16 28h68v14l-6 8H22l-6-8z" fill="#24201f" stroke="#c9c4bc" stroke-width="2"/>' + Array.from({ length: 10 }, (_, i) => `<rect x="${26 + i * 5.6}" y="31" width="2.5" height="6" fill="#c9c4bc"/>`).join("") + Array.from({ length: 9 }, (_, i) => `<rect x="${29 + i * 5.6}" y="40" width="2.5" height="5" fill="#c9c4bc"/>`).join("");
  if (k === "fw") b = '<path d="M26 30h48v14l-5 8H31l-5-8z" fill="#24201f" stroke="#c9c4bc" stroke-width="2"/><rect x="44" y="26" width="12" height="5" fill="#c9c4bc"/>' + Array.from({ length: 6 }, (_, i) => `<rect x="${33 + i * 7}" y="40" width="3" height="6" fill="#c9c4bc"/>`).join("");
  if (k === "usb") b = '<rect x="22" y="26" width="56" height="28" rx="2" fill="#24201f" stroke="#c9c4bc" stroke-width="2"/><rect x="28" y="36" width="44" height="10" fill="#3b6fd6"/><rect x="34" y="31" width="5" height="4" fill="#c9c4bc"/><rect x="61" y="31" width="5" height="4" fill="#c9c4bc"/>';
  return `<svg viewBox="0 0 100 70" class="diag" style="max-width:120px;background:#0d0b0b" role="img" aria-label="Conector ${l}">${b}</svg>`;
}
const V3CAM = [["EFP", "Cámara de estudio", "Solo capta la señal de vídeo. No graba: la entrega por cable a la sala técnica."], ["ENG", "Cámara de reportero", "Graba en cinta DV y la saca al ordenador por un cable de ingesta."], ["DSLR", "Cámara réflex", "Graba en tarjeta. Saca la imagen por un conector doméstico."], ["WEB", "Cámara web", "Pequeña, para videollamadas. Se enchufa al ordenador."]];
const V3CON = [["SDI", "Coaxial BNC", "bnc"], ["FW", "FireWire (IEEE 1394)", "fw"], ["HDMI", "HDMI", "hdmi"], ["USB", "USB", "usb"]];
const V3COD = [["none", "Sin compresión", "Cada fotograma tal cual, sin perder nada."], ["DV", "DV", "Códec de las cintas de cámara de reportero."], ["H264", "H.264", "Muy extendido; típico de cámaras réflex."], ["H265", "H.265 (HEVC)", "Sucesor de H.264, comprime más."], ["PRORES", "Apple ProRes", "Pensado para edición en Final Cut."]];
const V3CTN = [["MXF", "MXF", "Estándar de la SMPTE."], ["MOV", "MOV", "QuickTime de Apple."], ["MP4", "MP4", "Basado en QuickTime; muy usado en distribución."], ["MKV", "MKV", "Matroska, contenedor abierto."], ["AVI", "AVI", "De Microsoft."]];
const V3L1 = { EFP: "SDI", ENG: "FW", DSLR: "HDMI", WEB: "USB" };
const V3L2 = { SDI: ["none"], FW: ["DV"], HDMI: ["H264", "H265"], USB: ["H264"] };
const V3L3 = { none: ["MXF", "AVI"], DV: ["MOV", "AVI"], H264: ["MP4", "MKV", "MOV"], H265: ["MP4", "MKV"], PRORES: ["MOV"] };
const v2sub = () => (X.v2z?.st?.sub) || "420";
const v3Mode = () => (v2sub() === "420" ? "web" : "tv");
const v3Links = (s) => [V3L1[s.cam] === s.con, (V3L2[s.con] || []).includes(s.cod), (V3L3[s.cod] || []).includes(s.ctn), v3Mode() === "tv" ? s.ctn === "MXF" : s.ctn === "MP4"];
function v3Strip() {
  const s = st(), lk = s.broken;
  const slot = (k, l) => `<div class="cslot${s[k] ? " full" : ""}"><small>${l}</small><b>${s[k] ? esc(({ cam: V3CAM, con: V3CON, cod: V3COD, ctn: V3CTN }[k].find((p) => p[0] === s[k]) || [0, s[k]])[1]) : "—"}</b></div>`;
  const arr = (i) => `<div class="carr${lk ? (lk[i] ? " ok" : " bad") : ""}">→</div>`;
  return T("Cadena de emisión", '<div class="cchain">' + slot("cam", "Cámara") + arr(0) + slot("con", "Conexión") + arr(1) + slot("cod", "Códec") + arr(2) + slot("ctn", "Contenedor") + arr(3) + `<div class="cslot dest"><small>Destino</small><b>${v3Mode() === "tv" ? "Sala de control de TV" : "Plataforma de streaming"}</b></div></div>` + (lk ? '<p class="lead" style="margin:10px 0 0">Última prueba: las uniones en rojo no son compatibles.</p>' : ""));
}
const v3Pick = (slot, items, render) => T("Tus piezas", '<div class="pieces">' + items.map((p) => `<button type="button" class="piece${st()[slot] === p[0] ? " sel" : ""}" data-vp="${slot}.${p[0]}"${dis()}>${render(p)}</button>`).join("") + "</div>");
PZ.v3 = {
  fuse: ["cod", "ctn"], init: () => ({ cam: "", con: "", cod: "", ctn: "", broken: null }),
  brief: "Hay que montar la cadena que lleva la señal hasta el destino del clip que habéis arreglado en la fase 1. El destino depende de cómo quedó su color. Cada rol solo tiene un tipo de pieza. Todos ven la cadena entera y las uniones que no encajan se ponen en rojo cuando se prueba.",
  guide: "Cada pieza tiene que encajar con la siguiente: la cámara con su conector, el conector con lo que transporta (sin comprimir o un códec) y el códec con su contenedor. El último eslabón lo marca el destino.",
  roles: {
    cam: { name: "Responsable de cámaras", short: "Elige la cámara.", goal: "Colocar la cámara adecuada en la cadena.", have: () => v3Strip() + v3Pick("cam", V3CAM, (p) => `<b>${esc(p[1])}</b><span>${esc(p[2])}</span>`), hints: ["La cámara debe poder entregar la señal en la conexión que se use.", "Mira qué pide el destino."] },
    con: { name: "Técnico de conexiones", short: "Elige el conector.", goal: "Colocar el conector adecuado en la cadena.", have: () => v3Strip() + v3Pick("con", V3CON, (p) => connSVG(p[2], p[1]) + `<b>${esc(p[1])}</b>`), hints: ["El conector debe encajar con la cámara y con lo que se transporta.", "Unos son domésticos y otros profesionales."] },
    cod: { name: "Ingeniero de códecs", short: "Elige el códec.", goal: "Colocar el códec adecuado en la cadena.", have: () => v3Strip() + v3Pick("cod", V3COD, (p) => `<b>${esc(p[1])}</b><span>${esc(p[2])}</span>`), hints: ["El códec depende de lo que viaja por la conexión.", "Si la señal llega sin comprimir, no hace falta códec."] },
    ctn: { name: "Archivista", short: "Elige el contenedor.", goal: "Colocar el contenedor adecuado en la cadena.", have: () => v3Strip() + v3Pick("ctn", V3CTN, (p) => `<b>${esc(p[1])}</b><span>${esc(p[2])}</span>`), hints: ["El contenedor debe aceptar el códec elegido.", "El destino pide un estándar concreto."] },
    mon: { name: "Jefe de sala técnica", short: "Conoce el destino. Tiene el candado.", lockRole: true, goal: "Probar la cadena cuando todos hayan colocado su pieza.",
      have: () => v3Strip() + T("Destino", (v3Mode() === "tv" ? '<p style="margin:0">Sala de control de una cadena de televisión. Recibe vídeo profesional de estudio, <b>sin comprimir</b>, y lo archiva en el contenedor estandarizado por la <b>SMPTE</b>.</p>' : '<p style="margin:0">Plataforma de streaming. Recibe vídeo <b>comprimido</b> y lo guarda en el contenedor basado en QuickTime que más se usa en distribución.</p>') + `<p class="lead" style="margin:10px 0 0">Color del clip de la fase 1: ${{ 444: "4:4:4", 422: "4:2:2", 420: "4:2:0" }[v2sub()]}${X.v2z?.solved ? "" : " (fase 1 sin superar)"}.</p>`),
      lock: () => oneShotLock("Probar la cadena", "Probar cadena", v3Mode() === "tv" ? "La cadena funciona: señal profesional de estudio hasta la sala de control." : "La cadena funciona: el clip llega comprimido a la plataforma de streaming."),
      req: () => ["cam", "con", "cod", "ctn"].every((k) => st()[k]), reqMsg: "Completad las cuatro piezas antes de probar.",
      check: () => { const s = st(); return s.cam && s.con && s.cod && s.ctn && v3Links(s).every(Boolean); },
      onFail: () => commitForce((s) => { s.broken = v3Links(s); }),
      hints: ["Si una unión falla, hay dos piezas que no encajan entre sí.", "Cada prueba fallida sube la alarma."] },
  },
};
PZ.v2.teacher = "<ul><li>Origen: cinta DV PAL, 25 fps, entrelazado con las líneas pares primero (= <b>campo inferior primero</b>).</li><li>El Técnico de barrido no ve el clip: decide con la ficha del Técnico de ritmo. Espacio de color y perfil de exportación son distractores puros (no cambian nada).</li><li>Barrido: progresivo → dientes de sierra; campo superior primero → parpadeo y retroceso; correcto: <b>inferior primero</b>.</li><li>Ritmo: vale <b>25</b> (original) o <b>50</b> (múltiplo exacto). 12 y 30 dan saltos.</li><li>Bandas: 8 bits con 4:2:0 → <b>4:2:2 o 10 bits</b>.</li><li>Bloques: necesario = 8 Mbps (hasta 30 fps) o 12 (50) × 1,5 si 4:2:2 × 1,25 si 10 bits × 1,5 si intraframe.</li><li>Tope del canal: <b>16 Mbps</b>, solo visible para el Jefe, que puede devolver el trabajo con un mensaje que ven todos.</li><li>Ocho configuraciones válidas, por ejemplo: inferior primero, 25 fps, interframe, 4:2:2 a 8 bits, 12 Mbps.</li><li>El submuestreo elegido decide el destino de la fase 2: 4:2:2 o 4:4:4 → televisión; 4:2:0 → streaming.</li><li>Máximo 14 ajustes antes de que suba la alarma. Candado de un solo intento.</li></ul>";
PZ.v3.teacher = "<ul><li>El destino depende del submuestreo que quedó en la fase 1: 4:2:2 o 4:4:4 → <b>televisión</b>; 4:2:0 → <b>streaming</b>.</li><li>Televisión: vídeo de estudio sin comprimir + contenedor SMPTE. Solución única: <b>Cámara de estudio (EFP) → SDI (BNC) → sin compresión → MXF</b>.</li><li>Streaming: vídeo comprimido en MP4. Valen, por ejemplo, <b>Cámara réflex → HDMI → H.264 o H.265 → MP4</b> o <b>Cámara web → USB → H.264 → MP4</b>.</li><li>Un intento fallido enseña qué uniones están rotas; el segundo error bloquea.</li></ul>";
PZ.v2.title = "Vídeo · El monitor de averías"; PZ.v3.title = "Vídeo · La cadena de emisión";

export const PUZZLES = PZ;
export const isPuzzle = (pid) => !!PZ[pid];

/* ======================================================
   Montaje en la pantalla del alumno
   ====================================================== */
function roleList() {
  const p = PZ[X.pid], ids = Object.keys(p.roles), four = (X.B.size || 5) === 4;
  if (!four || !p.fuse) return ids.map((id) => ({ id, parts: [id] }));
  const out = []; ids.forEach((id) => { if (id === p.fuse[1]) return; if (id === p.fuse[0]) out.push({ id: p.fuse.join("+"), parts: p.fuse.slice() }); else out.push({ id, parts: [id] }); });
  return out;
}
const roleName = (rid) => rid.split("+").map((r) => PZ[X.pid].roles[r]?.name || r).join(" + ");
function head() {
  const a = Z().alarms || 0; let al = `<div class="alarm${a >= 4 ? " hot" : ""}"><small>ALARMA</small>`; for (let i = 0; i < 5; i++) al += `<i class="${i < a ? "on" : ""}"></i>`; al += "</div>";
  return `<div class="phead" style="margin:0 0 10px"><div>${X.role ? `<span class="tag">${esc(roleName(X.role))}</span>` : ""}${solved() ? ' <span class="tag" style="color:var(--ok);border-color:var(--ok)">resuelto</span>' : ""}${guided() && !solved() ? ' <span class="tag" style="color:var(--amber);border-color:var(--amber)">modo guiado</span>' : ""}</div><div class="meters">${al}</div></div>`;
}
function picker() {
  const p = PZ[X.pid], claim = Z().claim || {};
  const btn = (r) => { const c = claim[r.id], mine = c && c.seat === SEAT, taken = c && !mine;
    return `<button class="role${mine ? " mine" : ""}" type="button" data-role="${r.id}"${taken || off() ? " disabled" : ""}><b>${r.parts.map((x) => esc(p.roles[x].name)).join(" + ")}${r.parts.some((x) => p.roles[x].lockRole) ? " 🔒" : ""}</b><small>${r.parts.map((x) => esc(p.roles[x].short)).join(" ")}</small>${taken ? `<small style="color:var(--amber)">${avName(c, 20)}</small>` : ""}</button>`; };
  return head() + `<p class="brief">${p.brief}</p><h3>Elige tu rol</h3><p class="lead" style="margin:0 0 10px;font-size:14px">Cada rol es de una sola persona y, una vez elegido, no se cambia. ${(X.B.size || 5) === 4 ? "Sois 4: dos roles van juntos en una pantalla." : ""}</p><div class="roles">${roleList().map(btn).join("")}</div><p class="fb" id="fb-role" role="status"></p>`;
}
function screen() {
  const p = PZ[X.pid], parts = X.role.split("+").filter((r) => p.roles[r]), multi = parts.length > 1;
  let h = head();
  if (timeUp() && !solved()) h += `<div class="lockbox"><h3>${X.G.stage === "paused" ? "Pausa" : "Tiempo agotado"}</h3><p style="margin:0">${X.G.stage === "paused" ? "El profe ha parado el juego." : "Se acabó el tiempo de esta fase. Atentos al proyector."}</p></div>`;
  h += '<div class="screen">';
  parts.forEach((r) => { const R = p.roles[r]; if (multi) h += `<div class="sub">${esc(R.name)}</div>`; h += `<div class="goal"><b>Tu objetivo</b>${R.goal}</div>` + R.have(); });
  parts.forEach((r) => { const R = p.roles[r]; if (R.lock) h += R.lock(); });
  const used = (Z().hints || {})[X.role] || 0, all = parts.flatMap((r) => p.roles[r].hints);
  h += `<div class="hints"><div class="lock"><button class="btn" data-act="hint" type="button"${used >= all.length || off() ? " disabled" : ""}>${used >= all.length ? "No quedan pistas" : "Pedir pista (−100.000 €)"}</button></div>${all.slice(0, used).map((t, i) => `<div class="hint">Pista ${i + 1}: ${t}</div>`).join("")}</div>`;
  return h + "</div>";
}
const myRole = () => (Object.entries(Z().claim || {}).find(([, c]) => c && c.seat === SEAT) || [null])[0];
function draw() {
  if (!X || !X.Z) return;
  X.role = myRole();
  const focus = document.activeElement, fid = focus && X.root.contains(focus) ? (focus.id || focus.dataset.ph) : null, fval = focus?.value;
  X.root.innerHTML = X.role ? screen() : picker();
  Object.entries(X.fb).forEach(([id, v]) => { const el = X.root.querySelector("#" + id); if (el) { el.className = "fb " + v.cls; el.textContent = v.txt; } });
  if (X.pid === "t2" && X.role?.includes("cor")) drawSeals();
  if (X.pid === "v2") clipStart();
  bindCalc();
  if (fid) { const el = X.root.querySelector("#" + CSS.escape(fid)) || X.root.querySelector(`[data-ph="${fid}"]`); if (el) { if (fval != null && el.value !== undefined && el.type === "text") el.value = fval; el.focus(); } }
}

/* ---------- eventos (delegados en la raíz del puzzle) ---------- */
function onClick(e) {
  const t = e.target.closest("[data-act],[data-role],[data-kc],[data-bin],[data-pw],[data-psel],[data-pmode],[data-ptpl],[data-pdemo],[data-vp]"); if (!t || !X) return;
  const D = t.dataset;
  if (D.vp !== undefined) { const [slot, val] = D.vp.split("."); return commit((s) => { s[slot] = val; s.broken = null; }); }
  if (D.role) {
    const c = (Z().claim || {})[D.role]; if (c && c.seat !== SEAT) return say("fb-role", "warn", "Ese rol ya lo tiene otra persona.");
    if (myRole()) return;
    upd({ ["claim." + D.role]: { seat: SEAT, name: X.me?.name || "?", av: X.me?.av ?? 0, at: Date.now() } }); window.scrollTo(0, 0); return; }
  if (D.pdemo) { X.ui.demo = D.pdemo; return draw(); }
  if (D.pmode) { X.ui.mode = D.pmode; return draw(); }
  if (D.ptpl) { X.ui.tpl = D.ptpl; return draw(); }
  if (D.psel !== undefined) { X.ui.sel = +D.psel; return draw(); }
  if (D.pw !== undefined) { const sl = +D.pw; if (X.ui.mode === "tpl") { X.ui.anchor = sl; return draw(); } if (pCf("dir", X.ui.sel)) return; commit((s) => { s.dir[X.ui.sel] = sl; }); const nx = st().dir.findIndex((v, i) => v == null && !pCf("dir", i)); if (nx >= 0) X.ui.sel = nx; return draw(); }
  if (D.kc) { if (off()) return; const id = +D.kc, where = (k) => st().k[k] || "mesa";
    // con una tarjeta elegida, tocar otra tarjeta de otra caja la mueve a esa caja
    if (X.ksel != null && X.ksel !== id && where(X.ksel) !== where(id)) { const m = X.ksel, to = where(id); X.ksel = null; return commit((s) => { s.k[m] = to; }); }
    X.ksel = X.ksel === id ? null : id; return draw(); }
  if (D.bin) { if (X.ksel != null) { const id = X.ksel; X.ksel = null; commit((s) => { s.k[id] = D.bin; }); } return; }
  const a = D.act;
  if (a === "hint") { if (off()) return; upd({ ["hints." + X.role]: DB.inc(1), nHint: DB.inc(1) }); money(MONEY.hint, "pista"); return; }
  if (a === "kfilter") return commit((s) => { s.kfilter = !s.kfilter; });
  if (a === "oshot") {
    if (locked() || off()) return;
    const R = PZ[X.pid].roles[X.role.split("+").find((r) => PZ[X.pid].roles[r].check)];
    if (R.req && !R.req()) return say("fb-lock", "warn", R.reqMsg);
    if (R.check()) return win();
    if (R.onFail) R.onFail();
    return oneShotFail("fb-lock");
  }
  if (a === "pconf") { const r = D.r, i = +D.i;
    if (r === "dir" && st().dir[i] == null) return say("fb-pc-" + r + i, "warn", "Marca antes el color de este piloto.");
    if (r === "pro" && !/^[0-9A-F]{6}$/.test(st().hex[i])) return say("fb-pc-" + r + i, "warn", "Escribe el código completo (6 caracteres).");
    return commit((s) => { s.conf[r][i] = 1; }); }
  if (a === "vdev") { const d = v2Def(st()), bad = Object.values(d).some(Boolean);
    if (D.k === "br" && +st().br > V2CAP) return commit((s) => { s.msg = "Te has pasado de bitrate: el canal no aguanta. Bajad algo."; });
    if (D.k === "cal" && bad) return commit((s) => { s.msg = "La calidad no llega: aún hay defectos en el clip."; });
    return say("fb-vdev", "warn", "No hay motivo para devolver por eso."); }
  if (a === "pret") { const i = +D.i; commit((s) => PR.forEach((r) => (s.conf[r][i] = 0))); alarm("fb-pret", "Piloto devuelto."); return; }
}
function onChange(e) {
  if (!X) return; const D = e.target.dataset;
  if (D.vs !== undefined) { const k = D.vs, v = e.target.value; let over = false;
    commit((s) => { s[k] = v; if (X.pid === "v2") { s.msg = ""; s.moves = (s.moves || 0) + 1; over = s.moves > MAXMOVES; } });
    if (over) alarm("fb-vdev", "Demasiados ajustes: la alarma sube.");
    return; }
  if (D.ffile !== undefined) return commit((s) => { s.f = +D.ffile; });
  if (D.pl !== undefined) { const [i, c] = D.pl.split(".").map(Number); return commit((s) => { s.luz[i][c] = e.target.checked ? 1 : 0; }); }
  if (D.pt !== undefined) { const [i, c] = D.pt.split(".").map(Number); return commit((s) => { s.tinta[i][c] = e.target.checked ? 1 : 0; }); }
  if (D.ph !== undefined) { const v = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 6); return commit((s) => { s.hex[+D.ph] = v; }); }
}
function onSubmit(e) {
  const f = e.target.closest("form[data-lock]"); if (!f || !X) return; e.preventDefault();
  if (locked() || off()) return;
  const v = norm(X.root.querySelector("#in-lock").value);
  if (!v) return say("fb-lock", "warn", "Escribid la combinación antes de abrir.");
  if (v === norm(PZ[X.pid].answer)) win(); else alarm("fb-lock", "Incorrecto. La alarma sube.");
}
let dragId = null;
function onDragStart(e) { const c = e.target.closest("[data-kc]"); if (c && !off()) { dragId = +c.dataset.kc; e.dataTransfer.setData("text/plain", c.dataset.kc); } }
function onDragOver(e) { const b = e.target.closest("[data-bin]"); if (b) { e.preventDefault(); b.classList.add("over"); } }
function onDragLeave(e) { const b = e.target.closest("[data-bin]"); if (b) b.classList.remove("over"); }
function onDrop(e) { const b = e.target.closest("[data-bin]"); if (!b) return; e.preventDefault(); const id = +(e.dataTransfer.getData("text/plain") || dragId); if (id) { X.ksel = null; commit((s) => { s.k[id] = b.dataset.bin; }); } }

let unsub = null, lockTimer = null;
export function mountPuzzle(root, { code, band, pid, G, B, me }) {
  unmountPuzzle();
  X = { root, code, band, pid, G, B, Z: null, st: null, me, role: null, ksel: null, fb: {}, ui: { sel: 0, mode: "mark", tpl: "comp", anchor: null, demo: null } };
  const path = pzpath(code, band, pid);
  DB.get(path).then((z) => { if (!z) return DB.set(path, { st: PZ[pid].init(), alarms: 0, nAl: 0, nHint: 0, err: 0, hints: {}, claim: {}, solved: false, blk: false, guided: false }); }).catch(console.error);
  unsub = DB.onDoc(path, (z) => { if (!z || !X) return; X.Z = z; X.st = clone(z.st || PZ[pid].init()); draw(); });
  if (pid === "v3") { const u1 = unsub, u2 = DB.onDoc(pzpath(code, band, "v2"), (z) => { if (!X) return; X.v2z = z; if (X.Z) draw(); }); unsub = () => { u1(); u2(); }; }
  ["click", "change", "submit", "dragstart", "dragover", "dragleave", "drop"].forEach((ev) => root.addEventListener(ev, H[ev]));
  lockTimer = setInterval(() => { if (X && X.Z && X.Z.lockUntil && Math.abs(X.Z.lockUntil - Date.now()) < 600) draw(); }, 500);
}
const H = { click: onClick, change: onChange, submit: onSubmit, dragstart: onDragStart, dragover: onDragOver, dragleave: onDragLeave, drop: onDrop };
export function updatePuzzle(G, B) { if (!X) return; const was = timeUp(); X.G = G; X.B = B; if (was !== timeUp() || !X.role) draw(); }
export function unmountPuzzle() {
  if (unsub) unsub(); unsub = null; clearInterval(lockTimer); cancelAnimationFrame(clipRaf);
  if (X) ["click", "change", "submit", "dragstart", "dragover", "dragleave", "drop"].forEach((ev) => X.root.removeEventListener(ev, H[ev]));
  X = null;
}
export const PZPATH = pzpath;
