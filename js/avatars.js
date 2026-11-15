// ======================================================
// Avatares originales de la banda (SVG). Cada avatar combina
// fondo, piel, pelo/sombrero, ojos y boca. Todos de creación propia.
// ======================================================
const SKIN = ["#f2c7a5", "#e0a77f", "#c68a5e", "#8d5a3b", "#5c3a26"];
const BG = ["#d7261e", "#4c8fe0", "#3fb56e", "#f2a93b", "#a46be0", "#2bb3b1", "#e05a9a", "#7a8a99"];

// piezas (coordenadas para un lienzo de 64×64)
const HAIR = {
  none: () => "",
  corto: (c) => `<path d="M16 28c0-11 7-18 16-18s16 7 16 18c-3-6-9-9-16-9s-13 3-16 9z" fill="${c}"/>`,
  cresta: (c) => `<path d="M27 6l5 10 5-10 0 14h-10z" fill="${c}"/><path d="M17 27c1-9 7-14 15-14s14 5 15 14c-4-4-9-6-15-6s-11 2-15 6z" fill="${c}"/>`,
  melena: (c) => `<path d="M13 40c-2-18 6-30 19-30s21 12 19 30c-2-6-3-12-4-16-4 3-10 4-15 4s-11-1-15-4c-1 4-2 10-4 16z" fill="${c}"/>`,
  rizos: (c) => `<g fill="${c}">${[[18, 20], [24, 14], [32, 12], [40, 14], [46, 20], [15, 28], [49, 28]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6"/>`).join("")}</g>`,
  moño: (c) => `<circle cx="32" cy="9" r="6" fill="${c}"/><path d="M16 28c0-11 7-17 16-17s16 6 16 17c-3-5-9-8-16-8s-13 3-16 8z" fill="${c}"/>`,
};
const HAT = {
  none: () => "",
  gorra: (c) => `<path d="M15 25c0-10 8-15 17-15s17 5 17 15z" fill="${c}"/><path d="M30 24h26c0 3-3 5-6 5H30z" fill="${c}" opacity=".85"/><circle cx="32" cy="10" r="2" fill="#111"/>`,
  boina: (c) => `<ellipse cx="30" cy="18" rx="19" ry="8" fill="${c}"/><rect x="29" y="7" width="3" height="5" rx="1" fill="${c}"/>`,
  gorro: (c) => `<path d="M15 26c0-12 8-19 17-19s17 7 17 19z" fill="${c}"/><rect x="14" y="22" width="36" height="6" rx="3" fill="#fff" opacity=".85"/><circle cx="32" cy="7" r="4" fill="#fff"/>`,
  cascos: () => `<path d="M12 34c0-14 9-23 20-23s20 9 20 23" fill="none" stroke="#1d1a19" stroke-width="4"/><rect x="8" y="30" width="9" height="14" rx="4" fill="#1d1a19"/><rect x="47" y="30" width="9" height="14" rx="4" fill="#1d1a19"/><rect x="10" y="33" width="5" height="8" rx="2" fill="#d7261e"/>`,
  sombrero: (c) => `<ellipse cx="32" cy="22" rx="24" ry="5" fill="#1d1a19"/><path d="M20 22c0-9 4-14 12-14s12 5 12 14z" fill="#1d1a19"/><rect x="20" y="17" width="24" height="3" fill="${c}"/>`,
};
const EYES = {
  normal: () => `<circle cx="25" cy="35" r="2.6" fill="#1d1a19"/><circle cx="39" cy="35" r="2.6" fill="#1d1a19"/>`,
  antifaz: () => `<path d="M14 31c6-4 12-4 18 0 6-4 12-4 18 0v6c-6 4-12 4-18 0-6 4-12 4-18 0z" fill="#1d1a19"/><circle cx="25" cy="34" r="2.3" fill="#fff"/><circle cx="39" cy="34" r="2.3" fill="#fff"/>`,
  gafasSol: () => `<rect x="17" y="30" width="13" height="9" rx="3" fill="#1d1a19"/><rect x="34" y="30" width="13" height="9" rx="3" fill="#1d1a19"/><rect x="30" y="33" width="4" height="2" fill="#1d1a19"/><rect x="19" y="31" width="4" height="2" fill="#fff" opacity=".5"/>`,
  redondas: () => `<circle cx="25" cy="35" r="6" fill="none" stroke="#1d1a19" stroke-width="2"/><circle cx="39" cy="35" r="6" fill="none" stroke="#1d1a19" stroke-width="2"/><path d="M31 35h2" stroke="#1d1a19" stroke-width="2"/><circle cx="25" cy="35" r="1.8" fill="#1d1a19"/><circle cx="39" cy="35" r="1.8" fill="#1d1a19"/>`,
  guiño: () => `<circle cx="25" cy="35" r="2.6" fill="#1d1a19"/><path d="M36 35q3 -3 6 0" fill="none" stroke="#1d1a19" stroke-width="2.4" stroke-linecap="round"/>`,
  visor: () => `<rect x="15" y="30" width="34" height="9" rx="4.5" fill="#2bb3b1"/><rect x="18" y="32" width="10" height="2" fill="#fff" opacity=".7"/>`,
};
const MOUTH = {
  sonrisa: () => `<path d="M26 45q6 5 12 0" fill="none" stroke="#1d1a19" stroke-width="2.4" stroke-linecap="round"/>`,
  bigote: (c) => `<path d="M22 44q5-4 10 0q5-4 10 0q-5 3-10 1q-5 2-10-1z" fill="${c}"/>`,
  oh: () => `<ellipse cx="32" cy="46" rx="3" ry="3.6" fill="#1d1a19"/>`,
  picara: () => `<path d="M26 45q7 3 12-2" fill="none" stroke="#1d1a19" stroke-width="2.4" stroke-linecap="round"/>`,
  dientes: () => `<path d="M25 43h14q-2 7-7 7t-7-7z" fill="#fff" stroke="#1d1a19" stroke-width="2"/>`,
  pañuelo: (c) => `<path d="M14 42q18 10 36 0v12q-18 8-36 0z" fill="${c}"/><g fill="#fff" opacity=".8"><circle cx="22" cy="49" r="1.2"/><circle cx="32" cy="51" r="1.2"/><circle cx="42" cy="49" r="1.2"/></g>`,
};

// 16 personajes preparados (más vistosos que combinar al azar)
export const AVATARS = [
  { bg: 0, skin: 1, hair: ["corto", "#2b1d14"], hat: ["gorra", "#1d1a19"], eyes: "antifaz", mouth: ["sonrisa"] },
  { bg: 1, skin: 0, hair: ["melena", "#e8b04a"], hat: ["none"], eyes: "gafasSol", mouth: ["picara"] },
  { bg: 2, skin: 3, hair: ["rizos", "#1d1a19"], hat: ["cascos"], eyes: "normal", mouth: ["dientes"] },
  { bg: 3, skin: 2, hair: ["corto", "#3b2a1e"], hat: ["boina", "#d7261e"], eyes: "redondas", mouth: ["bigote", "#3b2a1e"] },
  { bg: 4, skin: 0, hair: ["moño", "#8a3b1e"], hat: ["none"], eyes: "guiño", mouth: ["sonrisa"] },
  { bg: 5, skin: 4, hair: ["cresta", "#f2a93b"], hat: ["none"], eyes: "visor", mouth: ["oh"] },
  { bg: 6, skin: 1, hair: ["corto", "#111"], hat: ["sombrero", "#d7261e"], eyes: "normal", mouth: ["pañuelo", "#d7261e"] },
  { bg: 7, skin: 2, hair: ["melena", "#1d1a19"], hat: ["gorro", "#4c8fe0"], eyes: "normal", mouth: ["picara"] },
  { bg: 1, skin: 3, hair: ["corto", "#111"], hat: ["gorra", "#f2a93b"], eyes: "gafasSol", mouth: ["sonrisa"] },
  { bg: 2, skin: 0, hair: ["rizos", "#b5541f"], hat: ["none"], eyes: "redondas", mouth: ["dientes"] },
  { bg: 3, skin: 4, hair: ["moño", "#111"], hat: ["cascos"], eyes: "guiño", mouth: ["picara"] },
  { bg: 0, skin: 2, hair: ["none"], hat: ["gorro", "#1d1a19"], eyes: "antifaz", mouth: ["pañuelo", "#1d1a19"] },
  { bg: 4, skin: 1, hair: ["corto", "#6b4a2a"], hat: ["none"], eyes: "visor", mouth: ["bigote", "#6b4a2a"] },
  { bg: 5, skin: 0, hair: ["melena", "#a46be0"], hat: ["boina", "#1d1a19"], eyes: "normal", mouth: ["oh"] },
  { bg: 6, skin: 3, hair: ["cresta", "#e5483b"], hat: ["none"], eyes: "antifaz", mouth: ["dientes"] },
  { bg: 7, skin: 1, hair: ["none"], hat: ["sombrero", "#f2a93b"], eyes: "gafasSol", mouth: ["bigote", "#1d1a19"] },
];
export const AV_NAMES = ["El Encapuchado", "La Estrella", "El Sonidista", "El Director", "La Pícara", "El Cíber", "El Forajido", "La Montañera", "El Chófer", "La Química", "La Técnica", "La Sombra", "El Robot", "La Artista", "El Punki", "El Jefe"];

export function avatarSVG(i, size = 48) {
  const a = AVATARS[((i | 0) % AVATARS.length + AVATARS.length) % AVATARS.length];
  const skin = SKIN[a.skin], hc = a.hair[1] || "#222";
  return `<svg class="av" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="${BG[a.bg]}"/>`
    + (a.hair[0] === "melena" ? HAIR.melena(hc) : "")
    + `<ellipse cx="32" cy="37" rx="15" ry="17" fill="${skin}"/><ellipse cx="17" cy="38" rx="2.5" ry="4" fill="${skin}"/><ellipse cx="47" cy="38" rx="2.5" ry="4" fill="${skin}"/>`
    + (a.hair[0] !== "melena" ? HAIR[a.hair[0]](hc) : "")
    + EYES[a.eyes]() + MOUTH[a.mouth[0]](a.mouth[1]) + HAT[a.hat[0]](a.hat[1])
    + `</svg>`;
}

// fila de avatares con nombre (para listas)
export const avName = (m, size = 22) => `<span class="avn">${avatarSVG(m.av ?? 0, size)}<span>${String(m.name).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}</span></span>`;
