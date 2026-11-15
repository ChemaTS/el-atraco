// ======================================================
// Sonidos sintetizados (sin archivos): pitidos, ruido, sirena…
// ======================================================
let AC = null;
let BUS = null;
export function aud() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { }
    if (AC) {
      // bus maestro: limitador suave para que nada sature ni "bombee" el volumen
      const comp = AC.createDynamicsCompressor(); comp.threshold.value = -6; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.15;
      const g = AC.createGain(); g.gain.value = 1; g.connect(comp); comp.connect(AC.destination); BUS = g;
      // mantener vivo el contexto: tono inaudible continuo + reanudar si el navegador lo suspende
      try { const k = AC.createConstantSource ? AC.createConstantSource() : AC.createOscillator(), z = AC.createGain(); z.gain.value = 0.00001; if (k.offset) k.offset.value = 0; k.connect(z); z.connect(AC.destination); k.start(); } catch { }
      AC.onstatechange = () => { if (AC.state !== "running" && AC.state !== "closed") AC.resume().catch(() => { }); };
      setInterval(() => { if (AC.state !== "running") AC.resume().catch(() => { }); }, 1500);
      const wake = () => { if (AC.state !== "running") AC.resume().catch(() => { }); };
      ["pointerdown", "keydown", "visibilitychange", "focus"].forEach((e) => window.addEventListener(e, wake, { passive: true }));
    }
  }
  if (AC && AC.state !== "running" && AC.state !== "closed") AC.resume().catch(() => { });
  return AC;
}
const OUT = () => BUS || AC.destination;
export function beep(f, d, v = 0.05, type = "square") {
  const ac = aud(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(OUT()); o.start(t); o.stop(t + d);
}
export function playBuf(sr, dur, fn, vol = 0.35) {
  const ac = aud(); if (!ac) return; const b = ac.createBuffer(1, Math.floor(sr * dur), sr), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = fn(i / sr, i);
  const s = ac.createBufferSource(); s.buffer = b; const g = ac.createGain(); g.gain.value = vol; s.connect(g); g.connect(OUT()); s.start();
}
export function noise(dur, vol = 0.2, lp = 2000) {
  const ac = aud(); if (!ac) return; const b = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; const g = ac.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(OUT()); s.start();
}
export function thump() {
  const ac = aud(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = "sine"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(OUT()); o.start(t); o.stop(t + 0.22);
}
export function siren(dur = 2.2) {
  const ac = aud(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = "square";
  for (let k = 0; k < Math.ceil(dur / 0.35); k++) o.frequency.setValueAtTime(k % 2 ? 620 : 880, t + k * 0.35);
  g.gain.setValueAtTime(0.05, t); g.gain.setValueAtTime(0.05, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(OUT()); o.start(t); o.stop(t + dur + 0.05);
}
export function engine() {
  const ac = aud(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = "sawtooth";
  o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(220, t + 1.4); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; o.connect(lp); lp.connect(g); g.connect(OUT()); o.start(t); o.stop(t + 1.65);
}
// latido + dron de tensión
let TEN = null;
export function tensionOn() {
  tensionOff(); const ac = aud(); if (!ac) return; const g = ac.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(0.05, ac.currentTime + 1.5);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320;
  const os = [55, 55.6, 82.4].map((f) => { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(lp); o.start(); return o; });
  lp.connect(g); g.connect(OUT());
  const hb = setInterval(() => { thump(); setTimeout(thump, 180); }, 950); TEN = { os, g, hb };
}
export function tensionOff() { if (!TEN) return; const ac = aud(); try { TEN.g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.3); TEN.os.forEach((o) => o.stop(ac.currentTime + 0.35)); } catch { } clearInterval(TEN.hb); TEN = null; }

// "ping" de localizador: seno con eco corto (suena a radar, no a 8 bits)
export function ping(f = 1250, v = 0.06) {
  const ac = aud(); if (!ac) return; const t = ac.currentTime;
  const tone = (fr, vol, at) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.setValueAtTime(fr, at); o.frequency.exponentialRampToValueAtTime(fr * 0.985, at + 0.4);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45); o.connect(g); g.connect(OUT()); o.start(at); o.stop(at + 0.5); };
  tone(f, v, t); tone(f * 2, v * 0.25, t); tone(f, v * 0.35, t + 0.11); tone(f, v * 0.15, t + 0.22);
}
// sirena europea (dos tonos suaves) con algo de vibrato
export function siren2(dur = 2.8) {
  const ac = aud(); if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
  o.type = "triangle"; o2.type = "sine"; lfo.frequency.value = 6; lg.gain.value = 6; lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  for (let k = 0; k < Math.ceil(dur / 0.45); k++) { const f = k % 2 ? 440 : 587; o.frequency.setValueAtTime(f, t + k * 0.45); o2.frequency.setValueAtTime(f * 2, t + k * 0.45); }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.1); g.gain.setValueAtTime(0.08, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const g2 = ac.createGain(); g2.gain.value = 0.3; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(OUT());
  [o, o2, lfo].forEach((x) => { x.start(t); x.stop(t + dur + 0.05); });
}
// acorde suave (acierto)
export function chime() { const ac = aud(); if (!ac) return; [523.25, 659.25, 783.99].forEach((f, i) => setTimeout(() => { const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); o.connect(g); g.connect(OUT()); o.start(t); o.stop(t + 1); }, i * 90)); }
// zumbido grave (fallo)
export function buzz() { const ac = aud(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(), t = ac.currentTime; o.type = "sawtooth"; o.frequency.value = 110; f.type = "lowpass"; f.frequency.value = 600; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(f); f.connect(g); g.connect(OUT()); o.start(t); o.stop(t + 0.55); }
