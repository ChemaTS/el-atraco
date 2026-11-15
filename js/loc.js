// ======================================================
// GIRO · EL LOCALIZADOR (patata caliente entre bandas)
// Estado en games/{code}.loc. Un "anfitrión" (proyector o profe)
// hace avanzar el juego; los alumnos solo escriben loc.answer y loc.passTo.
// ======================================================
import { DB } from "./db.js";
import { esc, eu, gpath, bpath, addMoney, active, SEAT } from "./core.js";
import { avatarSVG, avName } from "./avatars.js";
import { aud, beep, playBuf, siren, ping, siren2, chime, buzz, noise, thump } from "./sfx.js";

export const PENALTY = 250000, ROUNDS = 3, QTIME = 10000;

/* ---------------- banco de preguntas ---------------- */
export const LQ = [
  { m: "aud8k", q: "Este audio está muestreado a 8 kHz. ¿Hasta qué frecuencia puede llegar?", o: ["4 kHz", "8 kHz", "16 kHz", "2 kHz"] },
  { m: "audbits", q: "Suena áspero y la onda va a escalones. ¿Qué le han reducido?", o: ["La profundidad de bits", "La frecuencia de muestreo", "El número de canales", "La duración"] },
  { m: "audoct", q: "La segunda nota tiene el doble de frecuencia que la primera. ¿Qué se oye?", o: ["La misma nota una octava más aguda", "La misma nota más fuerte", "La misma nota más grave", "Una nota idéntica"] },
  { m: "audclip", q: "La onda está recortada arriba y abajo. ¿Qué defecto es?", o: ["Saturación (clipping)", "Aliasing", "Ruido de fondo", "Falta de graves"] },
  { m: null, q: "Frecuencia de muestreo del CD de audio:", o: ["44,1 kHz", "48 kHz", "22 kHz", "96 kHz"] },
  { m: null, q: "Frecuencia de muestreo estándar en vídeo profesional:", o: ["48 kHz", "44,1 kHz", "32 kHz", "8 kHz"] },
  { m: null, q: "Para grabar sonidos de hasta 20 kHz hay que muestrear, como mínimo, a:", o: ["40 kHz", "20 kHz", "10 kHz", "80 kHz"] },
  { m: "imgband", q: "¿Qué defecto tiene esta imagen?", o: ["Bandas por poca profundidad de color", "Bloques de compresión", "Peine de entrelazado", "Pixelado por ampliación"] },
  { m: "imgblock", q: "¿Qué defecto tiene esta imagen?", o: ["Bloques de compresión", "Bandas por poca profundidad de color", "Peine de entrelazado", "Imagen vectorial"] },
  { m: "imgcomb", q: "El coche se mueve y se ve así. ¿Qué pasa?", o: ["Material entrelazado visto en progresivo", "Poca profundidad de color", "Bitrate demasiado alto", "Submuestreo 4:4:4"] },
  { m: "imgpix", q: "Este círculo se ve a escalones al ampliarlo. ¿Qué tipo de imagen es?", o: ["Mapa de bits", "Vectorial", "Una tipografía", "Un vídeo entrelazado"] },
  { m: "hex", q: "¿Qué código HEX tiene este color?", o: "HEX" },
  { m: null, q: "Luz roja + luz verde, en síntesis aditiva:", o: ["Amarillo", "Marrón", "Cian", "Blanco"] },
  { m: null, q: "En RGB, el complementario del azul es:", o: ["Amarillo", "Naranja", "Rojo", "Verde"] },
  { m: null, q: "FFFFFF en HEX es:", o: ["Blanco", "Negro", "Rojo", "Gris medio"] },
  { m: "fserif", q: "¿Qué tipo de letra es?", o: ["Romana (con serifa)", "Palo seco", "Monoespaciada", "Manuscrita"] },
  { m: "fsans", q: "¿Qué tipo de letra es?", o: ["Palo seco", "Romana (con serifa)", "Monoespaciada", "Manuscrita"] },
  { m: "fmono", q: "¿Qué tipo de letra es?", o: ["Monoespaciada", "Palo seco", "Romana (con serifa)", "Gótica"] },
  { m: null, q: "¿Cuántos puntos tiene una pica?", o: ["12", "10", "72", "6"] },
  { m: "vidfps", q: "La barra de abajo avanza a saltos. ¿Qué le falta?", o: ["Fotogramas por segundo", "Resolución", "Profundidad de color", "Bitrate de audio"] },
  { m: null, q: "Fotogramas por segundo del sistema PAL:", o: ["25", "24", "30", "60"] },
  { m: null, q: "Fotogramas por segundo del cine tradicional:", o: ["24", "25", "30", "50"] },
  { m: null, q: "En 4:2:0, ¿qué se reduce?", o: ["El color (crominancia)", "La luminancia", "El audio", "Los fotogramas"] },
  { m: null, q: "MP4 y MXF son…", o: ["Contenedores", "Códecs", "Resoluciones", "Muestreos"] },
  { m: null, q: "H.264 es…", o: ["Un códec", "Un contenedor", "Un espacio de color", "Una resolución"] },
  { m: null, q: "¿Qué compresión pesa más, a igual calidad?", o: ["Intraframe", "Interframe (GOP)", "Las dos igual", "Ninguna, no comprimen"] },
  // —— ampliación: tipografía ——
  { m: "fkern", q: "¿Qué falla en esta palabra?", o: ["El kerning de un par de letras", "El tracking de toda la palabra", "El interlineado", "El cuerpo"] },
  { m: "ftrack", q: "¿Qué se ha modificado en esta palabra?", o: ["El tracking (toda la palabra)", "El kerning de un par", "La familia", "El interlineado"] },
  { m: null, q: "¿Qué familia tiene remates en los extremos de los trazos?", o: ["Romana (con serifa)", "Palo seco", "Monoespaciada", "Display"] },
  { m: null, q: "Ajustar el espacio entre UN par concreto de letras se llama…", o: ["Kerning", "Tracking", "Interlineado", "Sangría"] },
  { m: null, q: "Ajustar por igual el espacio de toda una palabra o línea se llama…", o: ["Tracking", "Kerning", "Interlineado", "Justificación"] },
  { m: null, q: "La distancia entre las líneas de base de un párrafo se llama…", o: ["Interlineado", "Kerning", "Tracking", "Cuerpo"] },
  { m: null, q: "Para texto corrido en pantalla se recomienda una letra…", o: ["De palo seco", "Display", "Manuscrita", "Gótica"] },
  { m: null, q: "Un punto tipográfico equivale a…", o: ["1/72 de pulgada", "1/12 de pulgada", "1 milímetro", "1/6 de pulgada"] },
  { m: null, q: "¿Cuántas picas son 36 puntos?", o: ["3", "6", "4", "12"] },
  { m: null, q: "En una fuente monoespaciada…", o: ["Todas las letras ocupan el mismo ancho", "Solo hay mayúsculas", "No hay remates", "Cada letra tiene un color"] },
  // —— sonido ——
  { m: null, q: "Si duplicas la frecuencia de muestreo, la frecuencia más alta que puedes grabar…", o: ["Se duplica", "Se reduce a la mitad", "No cambia", "Se multiplica por cuatro"] },
  { m: null, q: "¿Cuántos dB de rango dinámico aporta, aproximadamente, cada bit?", o: ["6 dB", "3 dB", "10 dB", "1 dB"] },
  { m: null, q: "Rango dinámico aproximado de un audio de 24 bits:", o: ["144 dB", "96 dB", "48 dB", "192 dB"] },
  { m: null, q: "Audio sin compresión que además guarda timecode (broadcast):", o: ["BWF", "MP3", "AAC", "FLAC"] },
  { m: null, q: "FLAC es un formato de audio…", o: ["Comprimido sin pérdidas", "Comprimido con pérdidas", "Sin compresión", "De vídeo"] },
  { m: null, q: "MP3 y AAC son formatos…", o: ["Con pérdidas", "Sin pérdidas", "Sin compresión", "De vídeo"] },
  { m: null, q: "Un sistema de sonido 5.1 tiene…", o: ["5 altavoces y 1 subwoofer", "5 subwoofers y 1 altavoz", "6 altavoces iguales", "5 parejas estéreo"] },
  { m: null, q: "El nivel digital máximo antes de saturar es…", o: ["0 dBFS", "−6 dBFS", "+6 dBFS", "−20 dBFS"] },
  { m: null, q: "El oído humano percibe, aproximadamente, de…", o: ["20 Hz a 20 kHz", "2 Hz a 2 kHz", "200 Hz a 200 kHz", "20 kHz a 40 kHz"] },
  // —— imagen ——
  { m: null, q: "Modelo de color que se usa para imprimir:", o: ["CMYK", "RGB", "HEX", "Rec. 709"] },
  { m: null, q: "Modelo de color que usan las pantallas:", o: ["RGB", "CMYK", "Pantone", "CMY"] },
  { m: null, q: "Cian + magenta + amarillo al 100 % sobre papel dan, en teoría…", o: ["Negro", "Blanco", "Gris claro", "Rojo"] },
  { m: null, q: "Luz roja + verde + azul al máximo dan…", o: ["Blanco", "Negro", "Gris", "Marrón"] },
  { m: null, q: "¿Cuál de estos formatos NO admite transparencia?", o: ["JPG", "PNG", "GIF", "WebP"] },
  { m: null, q: "JPG comprime la imagen…", o: ["Con pérdidas", "Sin pérdidas", "Sin comprimir", "Solo si es vectorial"] },
  { m: null, q: "Una imagen vectorial, al ampliarla…", o: ["No pierde calidad", "Se pixela", "Pierde color", "Se convierte en JPG"] },
  { m: null, q: "SVG es un formato de imagen…", o: ["Vectorial", "De mapa de bits", "De audio", "De vídeo"] },
  { m: null, q: "00FF00 en HEX es…", o: ["Verde", "Rojo", "Azul", "Amarillo"] },
  { m: null, q: "En RGB, el complementario del rojo es:", o: ["Cian", "Verde", "Azul", "Magenta"] },
  { m: null, q: "Resolución habitual para imprimir con calidad:", o: ["300 ppp", "72 ppp", "30 ppp", "3 ppp"] },
  { m: null, q: "Una imagen de 1920 px de ancho impresa a 300 ppp mide…", o: ["6,4 pulgadas", "19,2 pulgadas", "3 pulgadas", "64 pulgadas"] },
  // —— vídeo ——
  { m: null, q: "Cada campo de un vídeo entrelazado contiene…", o: ["Media imagen: solo las líneas pares o las impares", "Una imagen completa", "Dos imágenes", "Solo el color"] },
  { m: null, q: "El submuestreo 4:4:4 significa que…", o: ["No se reduce el color", "El color se reduce a la mitad", "Solo hay luminancia", "Hay 4 canales de audio"] },
  { m: null, q: "Un GOP es…", o: ["Un grupo de fotogramas comprimidos juntos", "Un contenedor de vídeo", "Un tipo de cable", "Un formato de audio"] },
  { m: null, q: "La señal profesional SDI viaja por un cable…", o: ["Coaxial con conector BNC", "HDMI", "USB", "Jack"] },
  { m: null, q: "Resolución Full HD:", o: ["1920 × 1080", "1280 × 720", "3840 × 2160", "720 × 576"] },
  { m: null, q: "Resolución HD 720p:", o: ["1280 × 720", "1920 × 1080", "640 × 480", "2560 × 1440"] },
  { m: null, q: "Resolución del vídeo SD en PAL:", o: ["720 × 576", "640 × 480", "1280 × 720", "1920 × 1080"] },
  { m: null, q: "Con todo lo demás igual, más bitrate significa…", o: ["Más calidad y archivos más pesados", "Menos calidad", "Más fotogramas por segundo", "Menos color"] },
  { m: null, q: "Contenedor estandarizado por la SMPTE para televisión:", o: ["MXF", "MP4", "MKV", "AVI"] },
  { m: null, q: "Códec típico de las cámaras réflex y los móviles:", o: ["H.264", "DV", "ProRes", "Sin compresión"] },
];
const HEXS = [["FF0000", "#ff0000"], ["00FF00", "#00ff00"], ["0000FF", "#0000ff"], ["FFFF00", "#ffff00"], ["00FFFF", "#00ffff"], ["FF00FF", "#ff00ff"]];
const shuf = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rid = () => Math.random().toString(36).slice(2, 9);

/* ---------------- medios de las preguntas ---------------- */
const quant = (v, bits) => { const n = Math.pow(2, bits - 1); return Math.round(v * n) / n; };
export function playMedia(m) {
  const bright = (t) => { let v = 0; [440, 1320, 2640, 5280, 7040].forEach((f, k) => (v += Math.sin(2 * Math.PI * f * t) / (k + 1.5))); return v * 0.5 * (1 - ((t * 4) % 1) * 0.6); };
  if (m === "aud8k") playBuf(8000, 1.6, (t) => bright(t));
  if (m === "audbits") playBuf(44100, 1.4, (t) => quant(Math.sin(2 * Math.PI * 330 * t) * 0.8, 3));
  if (m === "audoct") playBuf(44100, 1.6, (t) => Math.sin(2 * Math.PI * (t < 0.8 ? 330 : 660) * t) * 0.6 * (1 - ((t % 0.8) / 0.8) * 0.5));
  if (m === "audclip") playBuf(44100, 1.4, (t) => Math.max(-0.35, Math.min(0.35, Math.sin(2 * Math.PI * 220 * t) * 1.4)));
}
export const mediaBox = (m) => !m ? "" : m.startsWith("aud") ? '<div class="lmedia"><canvas id="l-cv" width="360" height="140"></canvas><span class="lead" style="margin:0;font-size:14px">🔊 Suena por los altavoces del aula.</span></div>' : '<div class="lmedia"><canvas id="l-cv" width="360" height="180"></canvas></div>';
let raf = 0;
export function drawMedia(c, m, hex) {
  cancelAnimationFrame(raf); if (!c || !m) return;
  const x = c.getContext("2d"), W = c.width, H = c.height; x.fillStyle = "#151212"; x.fillRect(0, 0, W, H);
  const wave = (f) => { x.strokeStyle = "#5fb3d9"; x.lineWidth = 2; x.beginPath(); for (let i = 0; i <= W; i++) { const y = H / 2 - f(i / W) * H * 0.4; i ? x.lineTo(i, y) : x.moveTo(i, y); } x.stroke(); x.strokeStyle = "#3a2c2c"; x.lineWidth = 1; x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke(); };
  if (m === "aud8k") { x.fillStyle = "#a39390"; x.font = '600 13px "IBM Plex Mono",monospace'; x.fillText("Muestreo: 8 kHz", 14, 24); for (let i = 0; i < 60; i++) { const h = 8 + Math.abs(Math.sin(i * 1.7)) * 70; x.fillStyle = "#5fb3d9"; x.fillRect(14 + i * 5.6, H - 16 - h, 3, h); } }
  if (m === "audbits") wave((p) => quant(Math.sin(p * Math.PI * 6) * 0.9, 3));
  if (m === "audoct") wave((p) => (p < 0.5 ? Math.sin(p * Math.PI * 12) : Math.sin(p * Math.PI * 24)));
  if (m === "audclip") wave((p) => Math.max(-0.55, Math.min(0.55, Math.sin(p * Math.PI * 6) * 1.4)));
  if (m === "imgband") { const n = 7; for (let i = 0; i < n; i++) { const v = Math.round(30 + i * (200 / (n - 1))); x.fillStyle = "rgb(" + Math.round(v * 0.45) + "," + Math.round(v * 0.6) + "," + v + ")"; x.fillRect((i * W) / n, 0, W / n + 1, H); } }
  if (m === "imgblock") { for (let by = 0; by < H; by += 20) for (let bx = 0; bx < W; bx += 20) { const cx = bx - W / 2, cy = by - H / 2, d = Math.sqrt(cx * cx + cy * cy); const v = Math.max(0, 220 - d * 1.4) + ((bx * 7 + by * 3) % 23); x.fillStyle = "rgb(" + Math.round(v) + "," + Math.round(v * 0.7) + "," + Math.round(v * 0.45) + ")"; x.fillRect(bx, by, 20, 20); } }
  if (m === "imgcomb") { x.fillStyle = "#2a2a35"; x.fillRect(0, 0, W, H); for (let y = 40; y < 140; y += 2) { const off = (y / 2) % 2 ? 18 : 0; x.fillStyle = "#f2a93b"; x.fillRect(110 + off, y, 130, 1); } x.fillStyle = "#111"; x.beginPath(); x.arc(150, 142, 14, 0, 7); x.arc(215, 142, 14, 0, 7); x.fill(); }
  if (m === "imgpix") { const s = 12; for (let y = 0; y < H; y += s) for (let xx = 0; xx < W; xx += s) { const dx = xx + s / 2 - W / 2, dy = y + s / 2 - H / 2; x.fillStyle = dx * dx + dy * dy < 70 * 70 ? "#d7261e" : "#ece9e2"; x.fillRect(xx, y, s, s); } }
  if (m === "hex") { x.fillStyle = hex || "#000"; x.fillRect(0, 0, W, H); }
  if (m === "fkern" || m === "ftrack") { x.fillStyle = "#ece9e2"; x.fillRect(0, 0, W, H); x.fillStyle = "#1d1a19"; x.font = '600 58px Arial,Helvetica,sans-serif'; x.textBaseline = "middle";
    const word = m === "fkern" ? "AVIÓN" : "PLANO", gaps = m === "fkern" ? [34, 0, 0, 0] : [22, 22, 22, 22]; let px = 40;
    [...word].forEach((ch, k) => { x.fillText(ch, px, H / 2); px += x.measureText(ch).width + (k < gaps.length ? gaps[k] : 0) - (m === "fkern" ? 2 : 0); }); x.textBaseline = "alphabetic"; return; }
  if (m[0] === "f") { x.fillStyle = "#ece9e2"; x.fillRect(0, 0, W, H); x.fillStyle = "#1d1a19"; x.textAlign = "center"; x.textBaseline = "middle"; x.font = m === "fserif" ? '64px Georgia,"Times New Roman",serif' : m === "fsans" ? "600 64px Arial,Helvetica,sans-serif" : '64px "Courier New",Courier,monospace'; x.fillText("Atraco", W / 2, H / 2); x.textAlign = "left"; x.textBaseline = "alphabetic"; }
  if (m === "vidfps") { const t0 = performance.now(); const f = () => { if (!c.isConnected) return; const t = (performance.now() - t0) / 1000; x.fillStyle = "#151212"; x.fillRect(0, 0, W, H); const p1 = (t * 120) % (W - 40), p2 = ((Math.floor(t * 4) / 4) * 120) % (W - 40); x.fillStyle = "#47c27f"; x.fillRect(p1, 40, 40, 30); x.fillStyle = "#d7261e"; x.fillRect(p2, 110, 40, 30); raf = requestAnimationFrame(f); }; f(); }
}

/* ---------------- lógica del anfitrión ---------------- */
const members = (B) => Object.entries(B?.members || {}).filter(([, m]) => active(m)).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
function question(L, BS, band, G) {
  // si la banda no tiene a nadie conectado, el localizador salta a otra al azar
  let b = band;
  if (!members(BS[b]).length) { const others = G.bands.filter((x) => x !== band && members(BS[x]).length); if (others.length) b = others[Math.floor(Math.random() * others.length)]; }
  const ms = members(BS[b]), ptr = ((L.ptr || {})[b] || 0) + 1, who = ms.length ? ms[ptr % ms.length] : [null, { name: "—", av: 0 }];
  let bag = (L.bag || []).slice(); if (!bag.length) bag = shuf(LQ.map((_, i) => i));
  const qi = bag.pop(), q = LQ[qi];
  let opts = q.o, ans = q.o[0], hex = null;
  if (q.o === "HEX") { const c = shuf(HEXS); hex = c[0][1]; ans = c[0][0]; opts = c.slice(0, 4).map((h) => h[0]); }
  return { holder: b, bag, ["ptr." + b]: ptr, phase: "q", answer: null, passTo: null, pick: null,
    turn: { id: rid(), band: b, seat: who[0], name: who[1].name, av: who[1].av ?? 0, qi, opts: shuf(opts), ans, hex, at: Date.now() } };
}
const upLoc = (code, o) => { const d = {}; Object.entries(o).forEach(([k, v]) => (d["loc." + k] = v)); return DB.update(gpath(code), d); };

export async function startRound(G, BS, n, holder) {
  const span = G.test ? [40, 70] : [180, 300], now = Date.now();
  const base = { round: n, from: null, passes: 0, t0: now, police: now + 1000 * (span[0] + Math.random() * (span[1] - span[0])), bag: G.loc?.bag || [], ptr: G.loc?.ptr || {}, stats: G.loc?.stats || {}, log: G.loc?.log || [], host: G.loc?.host || null };
  const h = holder || G.bands[Math.floor(Math.random() * G.bands.length)];
  const q = question(base, BS, h, G); delete q["ptr." + q.holder];
  base.ptr = { ...base.ptr, [q.holder]: ((base.ptr || {})[q.holder] || 0) + 1 };
  await DB.update(gpath(G.code), { loc: { ...base, ...q } });
}
export const endLoc = (G) => upLoc(G.code, { phase: "end" });

// el anfitrión: un solo cliente a la vez (latido cada 3 s)
const ME_HOST = rid();
let busy = false, lastTurnSound = null, beepAt = 0;
export function hostTick(G, BS, { sound = false } = {}) {
  const L = G?.loc; if (!L || G.stage !== "play") return;
  const now = Date.now(), h = L.host;
  if (!h || h.id === ME_HOST || now - (h.beat || 0) > 6000) { if (!h || h.id !== ME_HOST || now - (h.beat || 0) > 3000) upLoc(G.code, { host: { id: ME_HOST, beat: now } }).catch(() => { }); }
  else return; // otro cliente hace de anfitrión (el sonido va aparte, ver sounds())
  if (busy) return;
  const run = (p) => { busy = true; p.catch(console.error).finally(() => setTimeout(() => (busy = false), 250)); };
  const live = ["q", "pick", "wrong"].includes(L.phase);
  if (live && now >= L.police) {
    const b = L.holder;
    return run((async () => {
      await upLoc(G.code, { phase: "boom", caught: b, log: [...(L.log || []), `Ronda ${L.round}: pillada ${BS[b]?.name || b} tras ${L.passes} pases.`] });
      await addMoney(G.code, b, -PENALTY, "localizador", "loc");
    })());
  }
  const t = L.turn;
  if (L.phase === "q" && t) {
    const st = (ok) => ({ ["stats." + t.band + ".n"]: DB.inc(1), ...(ok ? { ["stats." + t.band + ".ok"]: DB.inc(1) } : {}) });
    const sOK = (o) => { const d = {}; Object.entries(o).forEach(([k, v]) => (d["loc." + k] = v)); return d; };
    if (L.answer && L.answer.id === t.id) { const ok = t.opts[L.answer.i] === t.ans; return run(DB.update(gpath(G.code), sOK({ phase: ok ? "pick" : "wrong", pick: L.answer.i, wrongAt: now, ...st(ok) }))); }
    if (now > t.at + QTIME + 1000) return run(DB.update(gpath(G.code), sOK({ phase: "wrong", pick: -1, wrongAt: now, ...st(false) })));
  }
  if (L.phase === "wrong" && now > (L.wrongAt || 0) + 1800) return run(upLoc(G.code, question(L, BS, L.holder, G)));
  if (L.phase === "pick" && L.passTo && L.passTo.id === t.id && L.passTo.band !== L.holder && (L.passTo.band !== L.from || G.bands.length < 3)) {
    const q = question(L, BS, L.passTo.band, G);
    return run(upLoc(G.code, { ...q, from: L.holder, passes: (L.passes || 0) + 1 }));
  }
}
let lastPhaseSound = null;
// el sonido lo pone SIEMPRE el proyector, sea quien sea el anfitrión
export function sounds(G) { const L = G?.loc; if (!L || G.stage !== "play") return; hostSound(L, Date.now()); }
function hostSound(L, now) {
  aud();
  if (["q", "pick", "wrong"].includes(L.phase)) {
    // el ping del localizador se acelera y sube de tono según pasa el tiempo
    const frac = Math.min(1, (now - L.t0) / Math.max(30000, L.police - L.t0 - 15000)), iv = 1100 - frac * 850;
    if (now - beepAt > iv) { beepAt = now; ping(1050 + frac * 500, 0.05 + frac * 0.03); if (frac > 0.75) setTimeout(thump, 60); }
  }
  const t = L.turn, key = (t?.id || "") + L.phase;
  if (key !== lastPhaseSound) { lastPhaseSound = key; if (L.phase === "pick") chime(); if (L.phase === "wrong") buzz(); }
  if (t && t.id !== lastTurnSound && L.phase === "q") { lastTurnSound = t.id; const m = LQ[t.qi]?.m; if (m && m.startsWith("aud")) setTimeout(() => playMedia(m), 400); }
  if (L.phase === "boom" && lastTurnSound !== "boom" + L.round) { lastTurnSound = "boom" + L.round; noise(0.7, 0.35, 1500); thump(); setTimeout(() => siren2(3), 250); }
}

/* ---------------- vistas ---------------- */
export function board(G, BS, big) {
  const L = G.loc || {};
  return `<div class="lboard">${G.bands.map((id) => { const b = BS[id]; if (!b) return ""; const hot = L.holder === id && L.phase !== "end";
    return `<div class="lband${hot ? " hot" : ""}${L.phase === "boom" && L.caught === id ? " caught" : ""}" style="--bc:${b.color}"><b${big ? ' style="font-size:24px"' : ""}>${esc(b.name)}</b><span${big ? ' style="font-size:20px"' : ""}>${eu(Math.max(0, b.botin))}</span>${hot ? '<i class="ldot ping">◉ LOCALIZADOR</i>' : L.from === id && L.phase !== "boom" ? '<i class="lfrom">acaba de pasarlo</i>' : ""}</div>`; }).join("")}</div>`;
}
export function projectorView(G, BS) {
  const L = G.loc;
  if (!L || !L.phase) return `<div class="watch"><b>El localizador</b><p class="lead">Esperando a que el profe empiece la ronda 1.</p></div>` + board(G, BS, true);
  if (L.phase === "end") return `<div class="watch"><b>Localizador desactivado</b></div>` + board(G, BS, true);
  const b = BS[L.holder], t = L.turn || {};
  let mid = "";
  if (L.phase === "boom") mid = `<div class="lboom"><b>¡POLICÍA!</b><span>Han pillado a ${esc(BS[L.caught]?.name || "")} con el localizador: −${eu(PENALTY)}</span></div>`;
  else mid = `<div class="pjrow" style="align-items:center"><div class="lwho" style="--bc:${b?.color};font-size:22px">Responde ${avatarSVG(t.av, 48)} <b style="font-size:30px">${esc(t.name)}</b> · ${esc(b?.name || "")}</div><div style="font:700 28px var(--f-mono);color:var(--amber)">${L.phase === "pick" ? "¡Acierto! Eligiendo víctima…" : L.phase === "wrong" ? "Fallo · otro compañero" : ""}</div></div>${L.phase === "q" ? '<div class="ltime" style="height:14px"><div id="l-bar"></div></div>' : ""}`;
  return `<p class="lead" style="margin:0">Ronda ${L.round} de ${ROUNDS} · pases: ${L.passes || 0}</p>${mid}${board(G, BS, true)}`;
}

// sin devolución inmediata (salvo que solo haya dos bandas)
const noBack = (G, L, id) => id === L.from && G.bands.length >= 3;
// alumno
let seenTurn = null, seenAt = 0;
export function studentView(G, BS, B, myBand) {
  const L = G.loc;
  if (!L || !L.phase) return `<div class="watch"><b>El localizador</b><p class="lead">Mirad al proyector: el profe va a empezar.</p></div>`;
  if (L.phase === "end") return `<div class="watch"><b>Localizador desactivado</b><p class="lead">Atentos al proyector.</p></div>` + board(G, BS);
  const t = L.turn || {}, mine = t.seat === SEAT, hold = BS[L.holder];
  if (t.id !== seenTurn) { seenTurn = t.id; seenAt = Date.now(); }
  let h = `<p class="lead" style="margin:0 0 10px">Ronda ${L.round} de ${ROUNDS} · pases: ${L.passes || 0}</p>`;
  if (L.phase === "boom") return h + `<div class="lboom"><b>¡POLICÍA!</b><span>Han pillado a ${esc(BS[L.caught]?.name || "")}: −${eu(PENALTY)}</span></div>` + board(G, BS);
  if (mine && L.phase === "q") {
    const q = LQ[t.qi], sh = ["▲", "◆", "●", "■"];
    return h + `<div class="lwho" style="--bc:${hold?.color}">¡Te toca, ${esc(t.name)}! Responde tú solo/a.</div><div class="ltime"><div id="l-bar"></div></div><p class="lq">${esc(q.q)}</p>${mediaBox(q.m)}<div class="lans">${t.opts.map((o, i) => `<button class="la a${i}" type="button" data-lans="${i}"${L.answer?.id === t.id ? " disabled" : ""}><span>${sh[i]}</span>${esc(o)}</button>`).join("")}</div>`;
  }
  if (mine && L.phase === "wrong") {
    const q = LQ[t.qi], sh = ["▲", "◆", "●", "■"];
    return h + `<p class="lq">${esc(q.q)}</p><div class="lans">${t.opts.map((o, i) => `<button class="la a${i} ${o === t.ans ? "right" : i === L.pick ? "bad" : "dim"}" type="button" disabled><span>${sh[i]}</span>${esc(o)}</button>`).join("")}</div><p class="lbad">${L.pick === -1 ? "Tiempo agotado." : "Fallo."} El localizador sigue en tu banda: le toca a otro compañero.</p>`;
  }
  if (mine && L.phase === "pick") return h + `<p class="lok">¡Correcto! ¿A qué banda le coláis el localizador?</p><div class="lpick">${G.bands.filter((id) => id !== L.holder && members(BS[id]).length).map((id) => { const o = BS[id]; return `<button class="btn" type="button" data-lpass="${id}"${noBack(G, L, id) ? ' disabled title="Os lo acaba de pasar"' : ""} style="border-color:${o?.color}">${esc(o?.name || id)}${noBack(G, L, id) ? " · no se puede" : ""}</button>`; }).join("")}</div>` + board(G, BS);
  const ours = L.holder === myBand;
  return h + `<div class="lwho" style="--bc:${hold?.color}">${ours ? "<b>¡Tenéis el localizador!</b> " : `Lo tiene <b>${esc(hold?.name || "")}</b>. `}Responde ${avName({ name: t.name, av: t.av }, 24)}${L.phase === "pick" ? " · ha acertado y está eligiendo víctima…" : L.phase === "wrong" ? " · ha fallado" : ""}</div>` + board(G, BS);
}
export function studentAfter(root, G) {
  const L = G.loc; if (!L || !L.turn) return;
  const t = L.turn;
  if (t.seat === SEAT && L.phase === "q") drawMedia(root.querySelector("#l-cv"), LQ[t.qi].m, t.hex);
}
export function barTick(root, G) {
  const L = G?.loc, el = root.querySelector("#l-bar"); if (!el || !L?.turn) return;
  const start = L.turn.seat === SEAT ? seenAt : L.turn.at;
  el.style.width = Math.max(0, 100 - ((Date.now() - start) / QTIME) * 100) + "%";
}
export function studentClick(e, G) {
  const L = G?.loc; if (!L) return false;
  const a = e.target.closest("[data-lans]"), p = e.target.closest("[data-lpass]");
  if (a && L.phase === "q" && L.turn?.seat === SEAT && !L.answer) { a.disabled = true; upLoc(G.code, { answer: { id: L.turn.id, i: +a.dataset.lans } }).catch(console.error); return true; }
  if (p && L.phase === "pick" && L.turn?.seat === SEAT) { upLoc(G.code, { passTo: { id: L.turn.id, band: p.dataset.lpass } }).catch(console.error); return true; }
  return false;
}
