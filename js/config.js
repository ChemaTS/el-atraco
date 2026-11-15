// ======================================================
// EL ATRACO · configuración (lo único que se toca a mano)
// ======================================================

// Firebase (proyecto creado por AI Studio)
export const FIREBASE = {
  apiKey: "AIzaSyBgpW6V-4TUTjCvMHPs8cEsoBeFzEZ3sds",
  authDomain: "sunny-mission-607pf.firebaseapp.com",
  projectId: "sunny-mission-607pf",
  storageBucket: "sunny-mission-607pf.firebasestorage.app",
  messagingSenderId: "517581223105",
  appId: "1:517581223105:web:2c86c990505f00d7865040",
};
// Base de datos con nombre (no la "(default)")
export const FIRESTORE_DB = "ai-studio-3072d144-ed0a-42a6-b759-3e9417d95eff";

// Contraseña del modo profesor
export const TEACHER_PASSWORD = "atraco2026";

// Bandas posibles
export const BANDS = [
  { id: "roja",    name: "Roja",    color: "#e5483b" },
  { id: "azul",    name: "Azul",    color: "#4c8fe0" },
  { id: "verde",   name: "Verde",   color: "#3fb56e" },
  { id: "ambar",   name: "Ámbar",   color: "#f2a93b" },
  { id: "violeta", name: "Violeta", color: "#a46be0" },
  { id: "blanca",  name: "Blanca",  color: "#d8d2cf" },
];

// Recursos audiovisuales
export const MEDIA = {
  video: (f) => `media/video/${f}`,
  img: (f) => `media/img/${f}`,
};

// Hilo de la partida. minutes = tiempo máximo por defecto (modo prueba: 2 min)
export const PHASES = [
  { key: "portada", title: "El encargo",            area: "Intro",  video: "intro.mp4",           header: "cabecera_portada.jpg", minutes: 0 },
  { key: "t2",      title: "Imprenta digital",       area: "Texto",  video: "trans_02_texto.mp4",  header: "cabecera_texto.jpg",   minutes: 15 },
  { key: "f",       title: "El archivo falso",       area: "Sonido", video: "trans_03_sonido.mp4", header: "cabecera_sonido.jpg",  minutes: 15 },
  { key: "loc",     title: "El localizador",         area: "Giro",   video: "trans_04_giro.mp4",   header: "cabecera_giro.jpg",    minutes: 0 },
  { key: "p",       title: "El anillo de color",     area: "Imagen", video: "trans_05_imagen.mp4", header: "cabecera_imagen.jpg",  minutes: 15 },
  { key: "v2",      title: "Monitor de averías",     area: "Vídeo · fase 1", video: "trans_06_video1.mp4", header: "cabecera_video.jpg", minutes: 15 },
  { key: "v3",      title: "Cadena de emisión",      area: "Vídeo · fase 2", video: "trans_07_video2.mp4", header: "cabecera_video.jpg", minutes: 10 },
  { key: "fur",     title: "El furgón",              area: "Fuga",   video: "trans_08_fuga.mp4",   header: "cabecera_fuga.jpg",    minutes: 0 },
  { key: "final",   title: "Recuento",               area: "Final",  video: "trans_09_final.mp4",  header: "cabecera_portada.jpg", minutes: 0 },
];

// Economía
export const MONEY = {
  start: 1000000,
  solve: 500000,
  firstBonus: 100000,
  hint: -100000,
  alarm: -50000,
  block: -250000,
};

// Nombres de banda para el dado del profe (atraco + ciclo de Animación 3D)
export const BAND_NAMES = [
  "Los Renderizados", "La Banda del Keyframe", "Los Sin Pérdida", "Los del 4:2:0", "Los Hijos de Nyquist",
  "La Banda del Kerning", "Los Low Poly", "Los Píxeles Muertos", "Los Bitrateros", "La Banda del Croma",
  "Los Sin Rigging", "Los Interpolados", "Los del Frame Perdido", "Las Curvas de Bézier", "La Banda del Clipping",
  "Los Entrelazados", "Los del Canal Alfa", "Los Huérfanos del Render", "Los Vectoriales", "La Mafia del CMYK",
  "Los Fuera de Campo", "Los del Último Render", "La Banda del Motion Blur", "Los Normal Map", "Los Ruido Rosa",
  "Los Sin Texturas", "La Banda del Timecode", "Los del Plano Secuencia", "Los Polígonos Rotos", "Los Sobreexpuestos",
  "Los del Ctrl+Z", "La Banda del Ojo de Pez", "Los Saturados", "Los del Fondo Verde", "Los Huesos del Rig",
];
