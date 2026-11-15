// ======================================================
// RECUENTO FINAL: botín fase a fase, ranking y nota (0–10)
// La nota solo usa lo que depende de saber (no el botín):
//   Puzzles 70 % · Localizador 15 % · Furgón 15 %
// ======================================================
import { DB } from "./db.js";
import { MONEY } from "./config.js";
import { esc, eu } from "./core.js";
import { PZPATH } from "./puzzles.js";

export const STEPS = [["ini", "Inicio"], ["t2", "Texto"], ["f", "Sonido"], ["loc", "Giro"], ["p", "Imagen"], ["v2", "Vídeo 1"], ["v3", "Vídeo 2"], ["fur", "Fuga"]];
const PIDS = ["t2", "f", "p", "v2", "v3"];

export function series(B) {
  const led = (B.ledger || []).slice().sort((a, b) => a.t - b.t);
  let v = MONEY.start; const out = [v];
  STEPS.slice(1).forEach(([k]) => { led.filter((e) => e.ph === k).forEach((e) => { v = Math.max(0, v + e.d); }); out.push(v); });
  // ajustes en fases sin puzzle (portada, final) se suman al final
  led.filter((e) => !STEPS.some(([k]) => k === e.ph)).forEach((e) => { v = Math.max(0, v + e.d); });
  out[out.length - 1] = v;
  return out;
}
export function puzzleScore(z) {
  if (!z || !z.solved) return 0;
  let s = 1 - 0.15 * ((z.nAl || 0) + (z.nHint || 0));
  if (z.guided) s = Math.min(s, 0.4);
  return Math.max(0, s);
}
export async function compute(G, BS) {
  const rows = [];
  for (const id of G.bands) {
    const B = BS[id]; if (!B) continue;
    const zs = await Promise.all(PIDS.map((p) => DB.get(PZPATH(G.code, id, p)).catch(() => null)));
    const pz = zs.map(puzzleScore), P = pz.reduce((a, b) => a + b, 0) / PIDS.length;
    const ls = (G.loc?.stats || {})[id] || {}, L = ls.n ? (ls.ok || 0) / ls.n : null;
    const fs = (G.fur?.stats || {})[id] || {}, F = fs.n ? (fs.pts || 0) / fs.n : 0;
    const wP = L == null ? 0.85 : 0.7, nota = Math.round(10 * (wP * P + (L == null ? 0 : 0.15 * L) + 0.15 * F) * 10) / 10;
    const members = Object.values(B.members || {}).filter((m) => m && !m.left).map((m) => m.name);
    rows.push({ id, name: B.name, color: B.color, botin: Math.max(0, B.botin), serie: series(B), pz, P, L, F, nota, members, zs });
  }
  return rows;
}

const pct = (x) => (x == null ? "—" : Math.round(x * 100) + " %");
export function chart(rows) {
  const W = 960, H = 380, pl = 90, pr = 20, pt = 20, pb = 40, max = Math.max(MONEY.start, ...rows.flatMap((r) => r.serie)) * 1.08;
  const X = (i) => pl + (i * (W - pl - pr)) / (STEPS.length - 1), Y = (v) => pt + (1 - v / max) * (H - pt - pb);
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = (max / 4) * k, y = Y(v); g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="#3a2c2c"/><text x="${pl - 8}" y="${y + 4}" text-anchor="end" fill="#a39390" font-size="12" font-family="IBM Plex Mono">${(v / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M</text>`; }
  STEPS.forEach(([, n], i) => (g += `<text x="${X(i)}" y="${H - 14}" text-anchor="middle" fill="#a39390" font-size="13" font-family="IBM Plex Sans">${n}</text>`));
  rows.forEach((r, j) => {
    const d = r.serie.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1)).join(" ");
    g += `<path d="${d}" fill="none" stroke="${r.color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" class="rline" style="animation-delay:${j * 0.25}s"/>`;
    r.serie.forEach((v, i) => (g += `<circle cx="${X(i)}" cy="${Y(v)}" r="5" fill="${r.color}" class="rdot" style="animation-delay:${0.3 * i + j * 0.25}s"><title>${esc(r.name)} · ${STEPS[i][1]}: ${eu(v)}</title></circle>`));
    const lx = X(STEPS.length - 1), ly = Y(r.serie[r.serie.length - 1]);
    g += `<text x="${lx - 8}" y="${ly - 10}" text-anchor="end" fill="${r.color}" font-size="13" font-weight="700" font-family="IBM Plex Sans" class="rdot" style="animation-delay:${2.6 + j * 0.25}s">${esc(r.name)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="rchart" role="img" aria-label="Botín de cada banda fase a fase">${g}</svg>`;
}
export function ledgerTable(rows) {
  return `<div class="tw"><table class="tbl"><thead><tr><th>Banda</th>${STEPS.slice(1).map(([, n]) => `<th>${n}</th>`).join("")}<th>Final</th></tr></thead><tbody>${rows.map((r) => `<tr><td><span class="dot" style="--bc:${r.color}"></span>${esc(r.name)}</td>${r.serie.slice(1).map((v, i) => { const d = v - r.serie[i]; return `<td class="mono" style="color:${d > 0 ? "var(--ok)" : d < 0 ? "var(--red2)" : "var(--muted)"}">${d > 0 ? "+" : ""}${d ? (d / 1000).toLocaleString("es-ES") + " k" : "0"}</td>`; }).join("")}<td class="mono"><b>${eu(r.botin)}</b></td></tr>`).join("")}</tbody></table></div>`;
}
export function ranking(rows) {
  const r = rows.slice().sort((a, b) => b.botin - a.botin), med = ["🥇", "🥈", "🥉"];
  return `<ol class="rrank">${r.map((x, i) => `<li style="--bc:${x.color}"><span>${med[i] || i + 1 + "."}</span><b>${esc(x.name)}</b><em>${eu(x.botin)}</em></li>`).join("")}</ol>`;
}
export function notes(rows, detail = true) {
  return `<div class="tw"><table class="tbl"><thead><tr><th>Banda</th>${detail ? "<th>Texto</th><th>Sonido</th><th>Imagen</th><th>Vídeo 1</th><th>Vídeo 2</th><th>Puzzles (70 %)</th><th>Localizador (15 %)</th><th>Furgón (15 %)</th>" : ""}<th>Nota</th></tr></thead><tbody>${rows.map((r) => `<tr><td><span class="dot" style="--bc:${r.color}"></span>${esc(r.name)}</td>${detail ? r.pz.map((s) => `<td class="mono">${s.toFixed(2)}</td>`).join("") + `<td class="mono">${pct(r.P)}</td><td class="mono">${pct(r.L)}</td><td class="mono">${pct(r.F)}</td>` : ""}<td class="mono" style="font-size:20px"><b>${r.nota.toLocaleString("es-ES", { minimumFractionDigits: 1 })}</b></td></tr>`).join("")}</tbody></table></div>`;
}
export function csv(rows, G) {
  const head = ["Banda", "Alumnos", ...STEPS.map(([, n]) => "Botín " + n), "Texto", "Sonido", "Imagen", "Vídeo 1", "Vídeo 2", "Puzzles", "Localizador", "Furgón", "Nota"];
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [head.map(q).join(";")].concat(rows.map((r) => [r.name, r.members.join(", "), ...r.serie, ...r.pz.map((x) => x.toFixed(2).replace(".", ",")), r.P.toFixed(2).replace(".", ","), r.L == null ? "" : r.L.toFixed(2).replace(".", ","), r.F.toFixed(2).replace(".", ","), String(r.nota).replace(".", ",")].map(q).join(";")));
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `el-atraco-${G.code}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
