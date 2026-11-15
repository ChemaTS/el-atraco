// ======================================================
// CEREMONIA FINAL en el proyector (estilo concurso):
// menciones especiales de broma → podio 3.º, 2.º y 1.º → recuento completo.
// Las menciones no dan dinero ni nota: son solo para reírse.
// ======================================================
import { esc, eu } from "./core.js";
import { avatarSVG } from "./avatars.js";
import { beep, noise, thump, chime } from "./sfx.js";

const T_INTRO = 3500, T_MENTION = 5500, T_PODIUM = 4500, T_FIRST = 7000;

// menciones: título gracioso, icono, cómo se calcula y frase
const count = (B, re) => (B.ledger || []).filter((e) => re.test(e.why || "")).length;
const lost = (B) => -(B.ledger || []).filter((e) => e.d < 0).reduce((s, e) => s + e.d, 0);
const MENTIONS = [
  { id: "sirena", icon: "🚨", title: "Sirena de Oro", sub: "La banda que más alarmas hizo saltar", val: (B) => count(B, /^alarma$/), fmt: (v) => `${v} alarma${v === 1 ? "" : "s"}` },
  { id: "pozo", icon: "🕳️", title: "Pozo sin Fondo", sub: "La banda que más dinero se dejó por el camino", val: (B) => lost(B), fmt: (v) => `−${eu(v)}` },
  { id: "pistas", icon: "🔦", title: "Linterna Humana", sub: "La banda que más pistas pidió", val: (B) => count(B, /^pista$/), fmt: (v) => `${v} pista${v === 1 ? "" : "s"}` },
  { id: "kami", icon: "💥", title: "Kamikaze del Volante", sub: "La banda que más veces estrelló el furgón", val: (B) => count(B, /estrelló/), fmt: (v) => `${v} choque${v === 1 ? "" : "s"}` },
  { id: "iman", icon: "🧲", title: "Imán de Policías", sub: "La banda pillada más veces con el localizador", val: (B) => count(B, /^localizador$/), fmt: (v) => `${v} vez${v === 1 ? "" : "es"} pillada` },
  { id: "rayo", icon: "⚡", title: "Velocidad de la Luz", sub: "La banda que más veces abrió un candado la primera", val: (B) => count(B, /^primera banda$/), fmt: (v) => `${v} candado${v === 1 ? "" : "s"} los primeros` },
  { id: "ojo", icon: "🎯", title: "Ojo de Halcón", sub: "La banda que más afinó las cifras del furgón", val: (B, G) => { const s = (G.fur?.stats || {})[B.id]; return s?.n ? Math.round((s.pts / s.n) * 100) : 0; }, fmt: (v) => `${v} % de precisión` },
  { id: "bloq", icon: "🧱", title: "Muro de Ladrillo", sub: "La banda que más sistemas bloqueó", val: (B) => count(B, /^bloqueo$/), fmt: (v) => `${v} bloqueo${v === 1 ? "" : "s"}` },
];
export function mentions(G, BS) {
  const bands = G.bands.map((id) => BS[id]).filter(Boolean), out = [];
  MENTIONS.forEach((m) => {
    const vals = bands.map((B) => [B, m.val(B, G)]).filter(([, v]) => v > 0); if (!vals.length) return;
    const top = Math.max(...vals.map(([, v]) => v)), win = vals.filter(([, v]) => v === top).map(([B]) => B);
    if (win.length === bands.length && bands.length > 1) return; // empate de todas: no tiene gracia
    out.push({ ...m, bands: win, v: top });
  });
  return out.slice(0, 5);
}

const confetti = () => `<div class="confetti">${Array.from({ length: 70 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${["#ff4b3e", "#f2a93b", "#47c27f", "#4c8fe0", "#a46be0", "#fff"][i % 6]};animation-delay:${((i * 13) % 20) / 10}s;animation-duration:${2.5 + ((i * 7) % 10) / 5}s"></i>`).join("")}</div>`;
const bandAv = (B) => Object.values(B.members || {}).filter((m) => m && !m.left).slice(0, 5).map((m) => avatarSVG(m.av ?? 0, 46)).join("");

// devuelve la escena según el tiempo transcurrido; null = ceremonia terminada
export function scene(G, BS, rows, t) {
  const M = mentions(G, BS), rank = rows.slice().sort((a, b) => b.botin - a.botin);
  let at = 0;
  if (t < (at += T_INTRO)) return { key: "intro", html: `<div class="cer"><div class="cer-t">🏆 Menciones especiales</div><p class="cer-s">Antes del podio, los premios que nadie quiere ganar…</p></div>`, sfx: "intro" };
  for (let i = 0; i < M.length; i++) if (t < (at += T_MENTION)) { const m = M[i];
    return { key: "m" + i, sfx: "mention", html: `<div class="cer"><div class="cer-icon">${m.icon}</div><div class="cer-t">${esc(m.title)}</div><p class="cer-s">${esc(m.sub)}</p><div class="cer-bands">${m.bands.map((B) => `<div class="cer-b" style="--bc:${B.color}"><div class="avs">${bandAv(B)}</div><b>${esc(B.name)}</b></div>`).join("")}</div><div class="cer-v">${esc(m.fmt(m.v))}</div></div>` }; }
  const pod = [2, 1, 0].filter((k) => rank[k]);
  for (let j = 0; j < pod.length; j++) { const dur = pod[j] === 0 ? T_FIRST : T_PODIUM; if (t < (at += dur)) {
    const shown = pod.slice(0, j + 1), h = { 0: 260, 1: 190, 2: 140 }, med = ["🥇", "🥈", "🥉"];
    const col = (k) => { const r = rank[k]; if (!r) return '<div class="pod"></div>'; const on = shown.includes(k);
      return `<div class="pod${on ? " on" : ""}${k === 0 && on ? " gold" : ""}" style="--bc:${r.color}">${on ? `<div class="pod-who"><div class="avs">${bandAv(BS[r.id] || {})}</div><b>${esc(r.name)}</b><span>${eu(r.botin)}</span></div>` : '<div class="pod-who"><b>?</b></div>'}<div class="pod-base" style="height:${h[k]}px">${med[k]}<em>${k + 1}.º</em></div></div>`; };
    return { key: "p" + pod[j], sfx: pod[j] === 0 ? "first" : "podium", html: `<div class="cer"><div class="cer-t">🏆 Podio del botín</div><div class="podium">${col(1)}${col(0)}${col(2)}</div>${pod[j] === 0 ? confetti() : ""}</div>` }; } }
  return null;
}
export function sound(kind) {
  if (kind === "intro") { let t = 0; for (let i = 0; i < 20; i++) { t += Math.max(40, 150 - i * 6); setTimeout(() => noise(0.05, 0.1, 900), t); } }
  if (kind === "mention") { thump(); setTimeout(chime, 120); }
  if (kind === "podium") { noise(0.4, 0.25, 3000); setTimeout(() => beep(392, 0.4, 0.07, "triangle"), 150); }
  if (kind === "first") { let t = 0; for (let i = 0; i < 24; i++) { t += Math.max(35, 130 - i * 4); setTimeout(() => noise(0.05, 0.12, 900), t); } setTimeout(() => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.6, 0.08, "triangle"), i * 130)), t + 100); }
}
