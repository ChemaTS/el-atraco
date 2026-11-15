// ======================================================
// Sonidos sintetizados (sin archivos): pitidos, ruido, sirena…
// ======================================================
let AC = null;
export function aud() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { } } if (AC && AC.state === "suspended") AC.resume(); return AC; }
export function beep(f, d, v = 0.05, type = "square") {
  const ac = aud(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
}
export function playBuf(sr, dur, fn, vol = 0.35) {
  const ac = aud(); if (!ac) return; const b = ac.createBuffer(1, Math.floor(sr * dur), sr), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = fn(i / sr, i);
  const s = ac.createBufferSource(); s.buffer = b; const g = ac.createGain(); g.gain.value = vol; s.connect(g); g.connect(ac.destination); s.start();
}
export function noise(dur, vol = 0.2, lp = 2000) {
  const ac = aud(); if (!ac) return; const b = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; const g = ac.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(ac.destination); s.start();
}
export function thump() {
  const ac = aud(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = "sine"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.22);
}
export function siren(dur = 2.2) {
  const ac = aud(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = "square";
  for (let k = 0; k < Math.ceil(dur / 0.35); k++) o.frequency.setValueAtTime(k % 2 ? 620 : 880, t + k * 0.35);
  g.gain.setValueAtTime(0.05, t); g.gain.setValueAtTime(0.05, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
}
export function engine() {
  const ac = aud(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = "sawtooth";
  o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(220, t + 1.4); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; o.connect(lp); lp.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 1.65);
}
// latido + dron de tensión
let TEN = null;
export function tensionOn() {
  tensionOff(); const ac = aud(); if (!ac) return; const g = ac.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(0.05, ac.currentTime + 1.5);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320;
  const os = [55, 55.6, 82.4].map((f) => { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(lp); o.start(); return o; });
  lp.connect(g); g.connect(ac.destination);
  const hb = setInterval(() => { thump(); setTimeout(thump, 180); }, 950); TEN = { os, g, hb };
}
export function tensionOff() { if (!TEN) return; const ac = aud(); try { TEN.g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.3); TEN.os.forEach((o) => o.stop(ac.currentTime + 0.35)); } catch { } clearInterval(TEN.hb); TEN = null; }
